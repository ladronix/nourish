import { NextResponse } from "next/server";
import { z } from "zod";
import { db, schema } from "@/db";
import { guardShortcut } from "@/lib/server/shortcut-guard";
import { markMeal, nextPlannedMeal } from "@/lib/server/meal-ops";
import { getCatalog } from "@/lib/server/data";
import { todayISO } from "@/lib/domain/dates";

/**
 * Shortcuts / Siri logging:
 *   {"action":"eat-next"}                        → marks the current planned meal as eaten
 *   {"action":"skip-next"}                       → skips it
 *   {"name":"Káva s mlékem","kcal":60,"protein":3} → free log entry
 */
export async function POST(req: Request) {
  const denied = await guardShortcut(req);
  if (denied) return denied;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  if (body.action === "eat-next" || body.action === "skip-next") {
    const m = await nextPlannedMeal();
    if (!m) return NextResponse.json({ ok: false, message: "Dnes už nic naplánovaného nezbývá." });
    const r = await markMeal(m.id, body.action === "eat-next" ? "eaten" : "skipped");
    const { recipeMap } = await getCatalog();
    const name = m.recipeId ? recipeMap.get(m.recipeId)?.name : "jídlo";
    return NextResponse.json({ ok: true, message: `${body.action === "eat-next" ? "Snědeno" : "Vynecháno"}: ${name}${r.note ? ` (${r.note})` : ""}` });
  }
  const p = z
    .object({ name: z.string().min(1).max(160), kcal: z.coerce.number().min(0).max(6000), protein: z.coerce.number().min(0).max(400).default(0), carbs: z.coerce.number().min(0).max(800).default(0), fat: z.coerce.number().min(0).max(400).default(0) })
    .safeParse(body);
  if (!p.success) return NextResponse.json({ error: "Pošli {action:'eat-next'} nebo {name, kcal, protein}" }, { status: 400 });
  await db.insert(schema.foodLog).values({ date: todayISO(), ...p.data, fiber: 0, source: "shortcut" });
  return NextResponse.json({ ok: true, message: `Zapsáno: ${p.data.name}, ${Math.round(p.data.kcal)} kcal` });
}
