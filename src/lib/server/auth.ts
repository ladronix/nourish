import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { and, eq, gte, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { SESSION_COOKIE, SESSION_DAYS, signSession, verifySession } from "@/lib/session-token";
import { sha256, hmac } from "./crypto";

const LOCK_WINDOW_MIN = 15;
const MAX_FAILS_PER_IP = 5;
const MAX_FAILS_GLOBAL = 25;

export async function sessionGeneration(): Promise<number> {
  const row = await db.query.appState.findFirst({ where: eq(schema.appState.key, "session_gen") });
  return Number((row?.value as number | undefined) ?? 1);
}

/** Data Access Layer guard: every server action / route handler calls this. */
export async function requireOwner(): Promise<void> {
  const jar = await cookies();
  const claims = await verifySession(jar.get(SESSION_COOKIE)?.value);
  if (!claims) redirect("/login");
  if (claims.gen !== (await sessionGeneration())) redirect("/login");
}

export async function isOwner(): Promise<boolean> {
  const jar = await cookies();
  const claims = await verifySession(jar.get(SESSION_COOKIE)?.value);
  return !!claims && claims.gen === (await sessionGeneration());
}

export async function clientIpHash() {
  const h = await headers();
  const ip = h.get("x-real-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  return hmac("ip:" + ip).slice(0, 32);
}

/**
 * `global: false` for passkeys: a passkey can't be brute-forced, so a password-guessing flood from many IPs
 * (which trips the global limit) must not lock the owner out of Face ID.
 */
export async function checkRateLimit(ipHash: string, opts: { global?: boolean } = {}): Promise<{ ok: boolean; retryMin?: number }> {
  const since = new Date(Date.now() - LOCK_WINDOW_MIN * 60_000);
  const [ip] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.authAttempts)
    .where(and(eq(schema.authAttempts.ipHash, ipHash), eq(schema.authAttempts.ok, false), gte(schema.authAttempts.at, since)));
  const [all] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.authAttempts)
    .where(and(eq(schema.authAttempts.ok, false), gte(schema.authAttempts.at, since)));
  if (ip.n >= MAX_FAILS_PER_IP || (opts.global !== false && all.n >= MAX_FAILS_GLOBAL)) return { ok: false, retryMin: LOCK_WINDOW_MIN };
  return { ok: true };
}

export async function recordAttempt(ipHash: string, ok: boolean, method: string) {
  await db.insert(schema.authAttempts).values({ ipHash, ok, method });
  await db.delete(schema.authAttempts).where(sql`${schema.authAttempts.at} < now() - interval '30 days'`);
}

export async function startSession(method: "password" | "passkey") {
  const token = await signSession({ gen: await sessionGeneration(), m: method });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 86400,
  });
  await audit("login", { method });
}

export async function endSession() {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
}

/** Invalidate every issued session (e.g. lost phone). */
export async function revokeAllSessions() {
  const gen = (await sessionGeneration()) + 1;
  await db
    .insert(schema.appState)
    .values({ key: "session_gen", value: gen })
    .onConflictDoUpdate({ target: schema.appState.key, set: { value: gen, updatedAt: new Date() } });
  await audit("revoke_sessions", { gen });
}

import { audit } from "./audit";
export { audit };

/** Personal API token check for iOS Shortcuts endpoints. */
export async function verifyApiToken(authHeader: string | null): Promise<boolean> {
  const token = authHeader?.replace(/^Bearer\s+/i, "").trim();
  if (!token || token.length < 20) return false;
  const row = await db.query.apiTokens.findFirst({ where: eq(schema.apiTokens.tokenHash, sha256(token)) });
  if (!row || row.revokedAt) return false;
  await db.update(schema.apiTokens).set({ lastUsedAt: new Date() }).where(eq(schema.apiTokens.id, row.id));
  return true;
}

export function rpConfig(host: string | null) {
  const origin = process.env.APP_ORIGIN ?? (host ? `${host.startsWith("localhost") ? "http" : "https"}://${host}` : "http://localhost:3000");
  const rpID = new URL(origin).hostname;
  return { origin, rpID, rpName: "Nourish" };
}
