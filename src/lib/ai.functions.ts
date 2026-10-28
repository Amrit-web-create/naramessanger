import { createServerFn } from "@tanstack/react-start";

export type GuideTurn = { role: "user" | "assistant"; content: string };

const SYSTEM = `You are Nara Guide, a calm assistant inside Nara, a private messenger.
Reply like a person texting: usually one to four sentences, plain text, no markdown headings.
Do not claim messages are cryptographically end-to-end encrypted. If asked, say chats stay in this browser except messages sent to you, which are processed to write a reply.
Never invent that you sent email, placed a call, or changed device settings.`;

export const askGuide = createServerFn({ method: "POST" })
  .validator((input: { messages: GuideTurn[] }) => {
    if (!input || !Array.isArray(input.messages)) {
      throw new Error("Send a message first.");
    }
    if (input.messages.length < 1 || input.messages.length > 16) {
      throw new Error("Send a shorter conversation.");
    }
    const messages = input.messages.map((m) => {
      if (!m || (m.role !== "user" && m.role !== "assistant")) {
        throw new Error("That message could not be read.");
      }
      if (typeof m.content !== "string") throw new Error("That message could not be read.");
      const content = m.content.trim();
      if (!content || content.length > 2000) throw new Error("That message is too long.");
      return { role: m.role, content };
    });
    return { messages };
  })
  .handler(async ({ data }) => {
    const apiKey = process.env.XAI_API_KEY;
    if (!apiKey) {
      return { ok: false as const, error: "Nara Guide is unavailable in this session." };
    }
    try {
      const res = await fetch("https://api.x.ai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        signal: AbortSignal.timeout(25000),
        body: JSON.stringify({
          model: "grok-4.5",
          max_tokens: 320,
          temperature: 0.7,
          messages: [{ role: "system", content: SYSTEM }, ...data.messages],
        }),
      });
      if (!res.ok) {
        return { ok: false as const, error: "Nara Guide could not answer just now." };
      }
      const body = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      const text = body.choices?.[0]?.message?.content?.trim() ?? "";
      if (!text) return { ok: false as const, error: "Nara Guide sent an empty reply." };
      return { ok: true as const, text };
    } catch {
      return { ok: false as const, error: "Nara Guide could not be reached." };
    }
  });
