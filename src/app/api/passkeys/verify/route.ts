import { NextResponse } from "next/server";
import { headers, cookies } from "next/headers";
import { verifyRegistrationResponse, type RegistrationResponseJSON } from "@simplewebauthn/server";
import { db, schema } from "@/db";
import { rpConfig, requireOwner, audit } from "@/lib/server/auth";
import { verifyShort } from "@/lib/session-token";

export async function POST(req: Request) {
  await requireOwner();
  const jar = await cookies();
  const ch = await verifyShort<{ c: string; t: string }>(jar.get("nourish_wa")?.value);
  jar.delete("nourish_wa");
  if (!ch || ch.t !== "reg") return NextResponse.json({ error: "Výzva vypršela." }, { status: 400 });
  const body = (await req.json().catch(() => null)) as { response: RegistrationResponseJSON; name?: string } | null;
  if (!body?.response) return NextResponse.json({ error: "Neplatný požadavek." }, { status: 400 });
  const { origin, rpID } = rpConfig((await headers()).get("host"));
  try {
    const v = await verifyRegistrationResponse({ response: body.response, expectedChallenge: ch.c, expectedOrigin: origin, expectedRPID: rpID, requireUserVerification: true });
    if (!v.verified) throw new Error();
    const c = v.registrationInfo.credential;
    await db.insert(schema.passkeys).values({
      id: c.id,
      publicKey: Buffer.from(c.publicKey).toString("base64url"),
      counter: c.counter,
      transports: c.transports ?? [],
      deviceName: (body.name ?? "Zařízení").slice(0, 60),
    });
    await audit("passkey_added", { name: body.name });
  } catch {
    return NextResponse.json({ error: "Registrace passkey selhala." }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
