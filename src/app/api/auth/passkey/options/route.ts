import { NextResponse } from "next/server";
import { headers, cookies } from "next/headers";
import { generateAuthenticationOptions } from "@simplewebauthn/server";
import { db, schema } from "@/db";
import { rpConfig, checkRateLimit, clientIpHash } from "@/lib/server/auth";
import { signShort } from "@/lib/session-token";

export async function POST() {
  const rl = await checkRateLimit(await clientIpHash(), { global: false });
  if (!rl.ok) return NextResponse.json({ error: "Příliš mnoho pokusů." }, { status: 429 });
  const { rpID } = rpConfig((await headers()).get("host"));
  const keys = await db.select({ id: schema.passkeys.id, transports: schema.passkeys.transports }).from(schema.passkeys);
  if (!keys.length) return NextResponse.json({ error: "Zatím není registrovaný žádný passkey." }, { status: 404 });
  const options = await generateAuthenticationOptions({
    rpID,
    userVerification: "required",
    allowCredentials: keys.map((k) => ({ id: k.id, transports: (k.transports ?? []) as never })),
  });
  (await cookies()).set("nourish_wa", await signShort({ c: options.challenge, t: "auth" }), { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/", maxAge: 300 });
  return NextResponse.json(options);
}
