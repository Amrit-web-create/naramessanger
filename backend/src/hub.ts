import { Env, now } from "./util";

/**
 * One global Durable Object that holds every user's WebSocket (hibernation API).
 * It handles: presence (online / last seen), typing indicators, and pushing events
 * that the HTTP API wants delivered in real time.
 *
 * Client -> server frames (JSON):  {t:"typing", chatId, typing:boolean}
 *                                  "ping" (answered with "pong" automatically)
 * Server -> client frames (JSON):  presence, presence_snapshot, typing, message,
 *                                  msg_status, chat, story, notification
 */
export class Hub implements DurableObject {
  constructor(
    private state: DurableObjectState,
    private env: Env,
  ) {
    this.state.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
  }

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);

    if (url.pathname === "/ws") {
      const userId = req.headers.get("x-user-id");
      if (!userId || req.headers.get("upgrade") !== "websocket") {
        return new Response("Expected websocket", { status: 400 });
      }
      const pair = new WebSocketPair();
      const [client, server] = [pair[0], pair[1]];
      this.state.acceptWebSocket(server, [userId]);
      server.serializeAttachment({ userId });
      await this.onOpen(userId, server);
      return new Response(null, {
        status: 101,
        webSocket: client,
        headers: { "sec-websocket-protocol": "nara.v1" },
      });
    }

    if (url.pathname === "/push" && req.method === "POST") {
      const { userIds, event } = (await req.json()) as { userIds: string[]; event: unknown };
      const delivered: string[] = [];
      for (const id of userIds) {
        if (this.send(id, event)) delivered.push(id);
      }
      return Response.json({ delivered });
    }

    if (url.pathname === "/online" && req.method === "POST") {
      const { userIds } = (await req.json()) as { userIds: string[] };
      return Response.json({ online: userIds.filter((id) => this.isOnline(id)) });
    }

    return new Response("Not found", { status: 404 });
  }

  /* ---------- helpers ---------- */

  private openSockets(userId: string, except?: WebSocket): WebSocket[] {
    return this.state
      .getWebSockets(userId)
      .filter((ws) => ws !== except && ws.readyState === 1);
  }

  private isOnline(userId: string): boolean {
    return this.openSockets(userId).length > 0;
  }

  private send(userId: string, event: unknown, except?: WebSocket): boolean {
    const sockets = this.openSockets(userId, except);
    if (!sockets.length) return false;
    const data = JSON.stringify(event);
    for (const ws of sockets) {
      try {
        ws.send(data);
      } catch {
        /* socket is closing */
      }
    }
    return true;
  }

  private async peersOf(userId: string): Promise<string[]> {
    const rows = await this.env.DB.prepare(
      `SELECT DISTINCT pm.user_id AS id FROM chat_members cm
       JOIN chat_members pm ON pm.chat_id = cm.chat_id AND pm.user_id != cm.user_id
       WHERE cm.user_id = ?`,
    )
      .bind(userId)
      .all<{ id: string }>();
    return rows.results.map((r) => r.id);
  }

  /* ---------- lifecycle ---------- */

  private async onOpen(userId: string, ws: WebSocket) {
    const firstConnection = this.openSockets(userId, ws).length === 0;
    const peers = await this.peersOf(userId);
    ws.send(
      JSON.stringify({
        t: "presence_snapshot",
        online: peers.filter((id) => this.isOnline(id)),
      }),
    );
    if (!firstConnection) return;

    // Everything sent while this user was offline is now "delivered".
    const t = now();
    const rows = await this.env.DB.prepare(
      `UPDATE messages SET delivered_at = ?
       WHERE delivered_at IS NULL AND sender_id != ?
         AND chat_id IN (SELECT chat_id FROM chat_members WHERE user_id = ?)
       RETURNING id, chat_id, sender_id`,
    )
      .bind(t, userId, userId)
      .all<{ id: string; chat_id: string; sender_id: string }>();
    const grouped = new Map<string, { chatId: string; ids: string[] }>();
    for (const r of rows.results) {
      const key = `${r.sender_id}:${r.chat_id}`;
      const g = grouped.get(key) ?? { chatId: r.chat_id, ids: [] };
      g.ids.push(r.id);
      grouped.set(key, g);
    }
    for (const [key, g] of grouped) {
      this.send(key.split(":")[0]!, { t: "msg_status", chatId: g.chatId, ids: g.ids, status: "delivered" });
    }

    for (const id of peers) this.send(id, { t: "presence", userId, online: true, lastSeen: t });
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer) {
    if (typeof raw !== "string" || raw.length > 2000) return;
    const att = ws.deserializeAttachment() as { userId: string } | null;
    if (!att) return;
    let msg: { t?: string; chatId?: string; typing?: boolean };
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    if (msg.t === "typing" && typeof msg.chatId === "string") {
      const members = await this.env.DB.prepare(
        "SELECT user_id FROM chat_members WHERE chat_id = ?",
      )
        .bind(msg.chatId)
        .all<{ user_id: string }>();
      const ids = members.results.map((m) => m.user_id);
      if (!ids.includes(att.userId)) return; // not a member
      for (const id of ids) {
        if (id !== att.userId) {
          this.send(id, { t: "typing", chatId: msg.chatId, userId: att.userId, typing: Boolean(msg.typing) });
        }
      }
    }
  }

  private async onGone(ws: WebSocket) {
    const att = ws.deserializeAttachment() as { userId: string } | null;
    if (!att) return;
    if (this.openSockets(att.userId, ws).length > 0) return; // still online elsewhere
    const t = now();
    await this.env.DB.prepare("UPDATE users SET last_seen = ? WHERE id = ?").bind(t, att.userId).run();
    for (const id of await this.peersOf(att.userId)) {
      this.send(id, { t: "presence", userId: att.userId, online: false, lastSeen: t });
    }
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string) {
    try {
      ws.close(code, reason);
    } catch {
      /* already closed */
    }
    await this.onGone(ws);
  }

  async webSocketError(ws: WebSocket) {
    await this.onGone(ws);
  }
}
