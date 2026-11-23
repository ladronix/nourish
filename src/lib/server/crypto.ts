import { scrypt as _scrypt, randomBytes, timingSafeEqual, createHash, createHmac } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(_scrypt) as (pw: string, salt: Buffer, keylen: number, opts: { N: number; r: number; p: number; maxmem: number }) => Promise<Buffer>;
const PARAMS = { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

/** Format: scrypt$<saltB64>$<hashB64> */
export async function hashPassword(pw: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(pw.normalize("NFKC"), salt, 32, PARAMS);
  return `scrypt$${salt.toString("base64url")}$${key.toString("base64url")}`;
}

export async function verifyPassword(pw: string, stored: string): Promise<boolean> {
  const [alg, saltB64, hashB64] = stored.split("$");
  if (alg !== "scrypt" || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, "base64url");
  const key = await scrypt(pw.normalize("NFKC"), Buffer.from(saltB64, "base64url"), expected.length, PARAMS);
  return key.length === expected.length && timingSafeEqual(key, expected);
}

export function sha256(s: string) {
  return createHash("sha256").update(s).digest("hex");
}

export function hmac(s: string) {
  return createHmac("sha256", process.env.SESSION_SECRET ?? "dev").update(s).digest("hex");
}

export function randomToken(bytes = 32) {
  return randomBytes(bytes).toString("base64url");
}

export function safeEqual(a: string, b: string) {
  const A = Buffer.from(a);
  const B = Buffer.from(b);
  return A.length === B.length && timingSafeEqual(A, B);
}
