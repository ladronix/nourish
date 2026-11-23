import { NextResponse } from "next/server";
import { headers, cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { verifyAuthenticationResponse, type AuthenticationResponseJSON } from "@simplewebauthn/server";
import { db, schema } from "@/db";
import { rpConfig, clientIpHash, recordAttempt, startSession, checkRateLimit } from "@/lib/server/auth";
import { verifyShort } from "@/lib/session-token";

export async function POST(req: Request) {
  const ipHash = await clientIpHash();
  const rl = await checkRateLimit(ipHash, { global: false });
  if (!rl.ok) return NextResponse.json({ error: "Příliš mnoho pokusů." }, { status: 429 });
  const jar = await cookies();
  const ch = await verifyShort<{ c: string; t: string }>(jar.get("nourish_wa")?.value);
  jar.delete("nourish_wa");
  if (!ch || ch.t !== "auth") return NextResponse.json({ error: "Výzva vypršela, zkus to znovu." }, { status: 400 });

  const body = (await req.json().catch(() => null)) as AuthenticationResponseJSON | null;
  if (!body?.id) return NextResponse.json({ error: "Neplatný požadavek." }, { status: 400 });
  const key = await db.query.passkeys.findFirst({ where: eq(schema.passkeys.id, body.id) });
  if (!key) {
    await recordAttempt(ipHash, false, "passkey");
    return NextResponse.json({ error: "Neznámý passkey." }, { status: 401 });
  }
  const { origin, rpID } = rpConfig((await headers()).get("host"));
  try {
    const v = await verifyAuthenticationResponse({
      response: body,
      expectedChallenge: ch.c,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: true,
      credential: { id: key.id, publicKey: new Uint8Array(Buffer.from(key.publicKey, "base64url")), counter: key.counter, transports: (key.transports ?? []) as never },
    });
    if (!v.verified) throw new Error("not verified");
    await db.update(schema.passkeys).set({ counter: v.authenticationInfo.newCounter, lastUsedAt: new Date() }).where(eq(schema.passkeys.id, key.id));
  } catch {
    await recordAttempt(ipHash, false, "passkey");
    return NextResponse.json({ error: "Ověření selhalo." }, { status: 401 });
  }
  await recordAttempt(ipHash, true, "passkey");
  await startSession("passkey");
  return NextResponse.json({ ok: true });
}
