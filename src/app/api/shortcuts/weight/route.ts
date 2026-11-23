import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { guardShortcut } from "@/lib/server/shortcut-guard";
import { todayISO } from "@/lib/domain/dates";

/** Apple Health bridge: a daily Shortcuts automation posts the latest body weight. */
export async function POST(req: Request) {
  const denied = await guardShortcut(req);
  if (denied) return denied;
  const raw = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const kg = Number(String(raw?.kg ?? raw?.weight ?? "").replace(",", "."));
  const p = z.object({ kg: z.number().min(30).max(300), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).safeParse({ kg, date: typeof raw?.date === "string" ? raw.date.slice(0, 10) : todayISO() });
  if (!p.success) return NextResponse.json({ error: "Pošli {\"kg\": 82.4}" }, { status: 400 });
  await db.insert(schema.weighIns).values({ date: p.data.date, kg: p.data.kg, source: "apple-health" }).onConflictDoUpdate({ target: schema.weighIns.date, set: { kg: p.data.kg, source: "apple-health" } });
  await db.update(schema.profile).set({ weightKg: p.data.kg }).where(eq(schema.profile.id, 1));
  return NextResponse.json({ ok: true, message: `Zapsáno ${p.data.kg} kg` });
}
