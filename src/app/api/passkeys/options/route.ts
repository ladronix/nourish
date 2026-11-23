import { NextResponse } from "next/server";
import { headers, cookies } from "next/headers";
import { generateRegistrationOptions } from "@simplewebauthn/server";
import { db, schema } from "@/db";
import { rpConfig, requireOwner } from "@/lib/server/auth";
import { signShort } from "@/lib/session-token";

export async function POST() {
  await requireOwner();
  const { rpID, rpName } = rpConfig((await headers()).get("host"));
  const existing = await db.select({ id: schema.passkeys.id, transports: schema.passkeys.transports }).from(schema.passkeys);
  const options = await generateRegistrationOptions({
    rpName,
    rpID,
    userName: "owner",
    userDisplayName: "Nourish",
    userID: new TextEncoder().encode("nourish-owner"),
    attestationType: "none",
    excludeCredentials: existing.map((k) => ({ id: k.id, transports: k.transports ?? [] })),
    authenticatorSelection: { residentKey: "preferred", userVerification: "required" },
  });
  (await cookies()).set("nourish_wa", await signShort({ c: options.challenge, t: "reg" }), { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/", maxAge: 300 });
  return NextResponse.json(options);
}
