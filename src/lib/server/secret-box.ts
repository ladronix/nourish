import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/** AES-256-GCM for retailer OAuth tokens at rest. Key from TOKEN_ENC_KEY (fallback: SESSION_SECRET). */
function key() {
  const k = process.env.TOKEN_ENC_KEY ?? process.env.SESSION_SECRET;
  if (!k && process.env.NODE_ENV === "production") throw new Error("TOKEN_ENC_KEY missing");
  return createHash("sha256").update(k ?? "dev-token-key").digest();
}

export function seal(data: unknown): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([c.update(JSON.stringify(data), "utf8"), c.final()]);
  return [iv.toString("base64url"), c.getAuthTag().toString("base64url"), enc.toString("base64url")].join(".");
}

export function open<T>(sealed: string): T | null {
  try {
    const [iv, tag, enc] = sealed.split(".").map((p) => Buffer.from(p, "base64url"));
    const d = createDecipheriv("aes-256-gcm", key(), iv);
    d.setAuthTag(tag);
    return JSON.parse(Buffer.concat([d.update(enc), d.final()]).toString("utf8")) as T;
  } catch {
    return null;
  }
}
