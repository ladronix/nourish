import { NextResponse } from "next/server";
import { guardShortcut } from "@/lib/server/shortcut-guard";
import { getCatalog, getDayTotals, getMealsForRange, getTarget } from "@/lib/server/data";
import { todayISO } from "@/lib/domain/dates";
import { SLOT_LABEL } from "@/lib/domain/catalog";

/** Siri-friendly summary: "Co mám dnes jíst?" */
export async function GET(req: Request) {
  const denied = await guardShortcut(req);
  if (denied) return denied;
  const today = todayISO();
  const [meals, target, totals, { recipeMap }] = await Promise.all([getMealsForRange(today, today), getTarget(), getDayTotals(today, today), getCatalog()]);
  const d = totals.get(today);
  const left = meals.filter((m) => m.status === "planned" && m.recipeId);
  const eaten = Math.round(d?.eaten.kcal ?? 0);
  const text = left.length
    ? `Zbývá: ${left.map((m) => `${SLOT_LABEL[m.slot].toLowerCase()} v ${m.time} – ${recipeMap.get(m.recipeId!)?.name}`).join("; ")}. Zatím ${eaten} kcal z ${target.kcalMin}–${target.kcalMax}.`
    : `Dnes máš hotovo. Snědeno ${eaten} kcal a ${Math.round(d?.eaten.protein ?? 0)} g bílkovin.`;
  return NextResponse.json({ text, eatenKcal: eaten, proteinG: Math.round(d?.eaten.protein ?? 0), remaining: left.length });
}
