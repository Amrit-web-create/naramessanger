import { Env, now, uuid } from "./util";

export function hubStub(env: Env) {
  return env.HUB.get(env.HUB.idFromName("global"));
}

/** Push an event to connected users. Returns the ids that were online. */
export async function pushTo(env: Env, userIds: string[], event: unknown): Promise<string[]> {
  if (!userIds.length) return [];
  try {
    const res = await hubStub(env).fetch("https://hub/push", {
      method: "POST",
      body: JSON.stringify({ userIds, event }),
    });
    const { delivered } = (await res.json()) as { delivered: string[] };
    return delivered;
  } catch (e) {
    console.error("push failed", e);
    return [];
  }
}

export async function addNotification(
  env: Env,
  userId: string,
  type: string,
  data: Record<string, unknown>,
) {
  const n = { id: uuid(), type, data, createdAt: now(), readAt: null };
  await env.DB.prepare(
    "INSERT INTO notifications (id, user_id, type, data, created_at) VALUES (?,?,?,?,?)",
  )
    .bind(n.id, userId, type, JSON.stringify(data), n.createdAt)
    .run();
  await pushTo(env, [userId], { t: "notification", notification: n });
  return n;
}
