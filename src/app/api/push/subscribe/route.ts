import { NextResponse } from "next/server";
import { z } from "zod";
import { db, schema } from "@/db";
import { isOwner } from "@/lib/server/auth";
import { sendPush } from "@/lib/server/push";

const Sub = z.object({ endpoint: z.url().max(1000), keys: z.object({ p256dh: z.string().max(200), auth: z.string().max(100) }), test: z.boolean().optional() });

export async function POST(req: Request) {
  if (!(await isOwner())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const p = Sub.safeParse(await req.json().catch(() => null));
  if (!p.success) return NextResponse.json({ error: "invalid" }, { status: 400 });
  const host = new URL(p.data.endpoint).hostname;
  if (!/(push\.apple\.com|fcm\.googleapis\.com|push\.services\.mozilla\.com|notify\.windows\.com|web\.push\.apple\.com)$/.test(host)) return NextResponse.json({ error: "unknown push service" }, { status: 400 });
  await db
    .insert(schema.pushSubscriptions)
    .values({ endpoint: p.data.endpoint, p256dh: p.data.keys.p256dh, auth: p.data.keys.auth, userAgent: req.headers.get("user-agent")?.slice(0, 200) })
    .onConflictDoUpdate({ target: schema.pushSubscriptions.endpoint, set: { p256dh: p.data.keys.p256dh, auth: p.data.keys.auth } });
  if (p.data.test) await sendPush({ title: "Nourish", body: "Notifikace fungují. Budu připomínat klidně a jen to podstatné.", url: "/settings" });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  if (!(await isOwner())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { endpoint } = (await req.json().catch(() => ({}))) as { endpoint?: string };
  if (endpoint) await db.delete(schema.pushSubscriptions).where((await import("drizzle-orm")).eq(schema.pushSubscriptions.endpoint, endpoint));
  return NextResponse.json({ ok: true });
}
