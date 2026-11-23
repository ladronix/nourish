import { env } from "cloudflare:workers";

/**
 * Private Workers AI proxy for Nourish (photo → JSON). Only the Nourish server knows VISION_SECRET.
 * Accepts OpenAI-style chat messages (image as data URL) for an allow-listed vision model.
 */
const MODELS = new Set(["@cf/meta/llama-4-scout-17b-16e-instruct", "@cf/meta/llama-3.3-70b-instruct-fp8-fast", "@cf/google/gemma-4-26b-a4b-it", "@cf/mistralai/mistral-small-3.1-24b-instruct"]);
const MAX_BODY = 6_000_000;

function safeEqual(a: string, b: string) {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  if (ea.length !== eb.length) return false;
  let d = 0;
  for (let i = 0; i < ea.length; i++) d |= ea[i] ^ eb[i];
  return d === 0;
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

export default {
  async fetch(req: Request) {
    const secret = (env as { VISION_SECRET?: string }).VISION_SECRET;
    if (!secret || !safeEqual(req.headers.get("authorization") ?? "", `Bearer ${secret}`)) return json({ error: "unauthorized" }, 401);
    if (req.method !== "POST") return json({ ok: true, models: [...MODELS] });
    if (Number(req.headers.get("content-length") ?? 0) > MAX_BODY) return json({ error: "too large" }, 413);
    const body = (await req.json().catch(() => null)) as { model?: string; messages?: unknown[]; max_tokens?: number; response_format?: unknown; guided_json?: unknown; temperature?: number; reasoning_effort?: string; chat_template_kwargs?: Record<string, unknown> } | null;
    if (!body?.model || !MODELS.has(body.model) || !Array.isArray(body.messages)) return json({ error: "bad request" }, 400);
    try {
      const ai = (env as unknown as { AI: { run: (m: string, i: unknown) => Promise<unknown> } }).AI;
      const out = await ai.run(body.model, {
        messages: body.messages,
        max_tokens: Math.min(body.max_tokens ?? 2048, 4096),
        temperature: body.temperature ?? 0.2,
        ...(body.response_format ? { response_format: body.response_format } : {}),
        ...(body.guided_json ? { guided_json: body.guided_json } : {}),
        ...(body.reasoning_effort ? { reasoning_effort: body.reasoning_effort } : {}),
        ...(body.chat_template_kwargs ? { chat_template_kwargs: body.chat_template_kwargs } : {}),
      });
      return json({ result: out });
    } catch (e) {
      return json({ error: (e as Error).message.slice(0, 500) }, 502);
    }
  },
} satisfies ExportedHandler;
