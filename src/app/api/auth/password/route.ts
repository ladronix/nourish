import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyPassword } from "@/lib/server/crypto";
import { checkRateLimit, clientIpHash, recordAttempt, startSession } from "@/lib/server/auth";

const Body = z.object({ password: z.string().min(1).max(512) });

export async function POST(req: Request) {
  const ipHash = await clientIpHash();
  const rl = await checkRateLimit(ipHash);
  if (!rl.ok) return NextResponse.json({ error: `Příliš mnoho pokusů. Zkus to za ${rl.retryMin} minut.` }, { status: 429 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Neplatný požadavek." }, { status: 400 });

  const stored = process.env.OWNER_PASSWORD_HASH;
  let ok = false;
  if (stored) ok = await verifyPassword(parsed.data.password, stored);
  else if (process.env.NODE_ENV !== "production") ok = parsed.data.password === (process.env.DEV_PASSWORD ?? "nourish-dev-heslo");

  // constant-ish delay to blunt timing & brute force
  await new Promise((r) => setTimeout(r, 300 + Math.random() * 200));
  await recordAttempt(ipHash, ok, "password");
  if (!ok) return NextResponse.json({ error: "Nesprávné heslo." }, { status: 401 });
  await startSession("password");
  return NextResponse.json({ ok: true });
}
