/** Edge-safe session token helpers (used by proxy and server). */
import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = process.env.NODE_ENV === "production" ? "__Host-nourish" : "nourish_session";
export const SESSION_DAYS = 30;

function key() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) {
    if (process.env.NODE_ENV === "production") throw new Error("SESSION_SECRET must be set (≥ 32 chars)");
    return new TextEncoder().encode("dev-only-insecure-session-secret-change-me!!");
  }
  return new TextEncoder().encode(s);
}

export type SessionClaims = { sub: "owner"; gen: number; m: "password" | "passkey" };

export async function signSession(claims: Omit<SessionClaims, "sub">) {
  return new SignJWT({ gen: claims.gen, m: claims.m })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject("owner")
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .setAudience("nourish")
    .sign(key());
}

export async function verifySession(token: string | undefined): Promise<SessionClaims | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key(), { audience: "nourish", algorithms: ["HS256"] });
    if (payload.sub !== "owner") return null;
    return { sub: "owner", gen: Number(payload.gen ?? 0), m: (payload.m as SessionClaims["m"]) ?? "password" };
  } catch {
    return null;
  }
}

export async function signShort(data: Record<string, unknown>, minutes = 5) {
  return new SignJWT(data).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime(`${minutes}m`).setAudience("nourish-short").sign(key());
}

export async function verifyShort<T>(token: string | undefined): Promise<T | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key(), { audience: "nourish-short", algorithms: ["HS256"] });
    return payload as T;
  } catch {
    return null;
  }
}
