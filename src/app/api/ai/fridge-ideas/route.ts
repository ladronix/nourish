import { NextResponse } from "next/server";
import { z } from "zod";
import { isOwner } from "@/lib/server/auth";
import { aiAvailable, aiErrorMessage, improviseFromFridge } from "@/lib/server/ai";
import { getActiveLots, getCatalog, getProfile, getTarget } from "@/lib/server/data";
import { diffDays, todayISO } from "@/lib/domain/dates";
import { ALLERGENS, SLOT_LABEL, formatQty } from "@/lib/domain/catalog";
import { proteinPerMealTarget } from "@/lib/domain/nutrition";
import { groundIdea } from "@/lib/domain/fridge-cook";

export const maxDuration = 120;

const Body = z.object({ slot: z.enum(["breakfast", "snack_am", "lunch", "snack", "dinner"]), kcalTarget: z.number().min(100).max(2500).optional() });

export async function POST(req: Request) {
  if (!(await isOwner())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!aiAvailable()) return NextResponse.json({ error: "AI není nastavená." }, { status: 503 });
  const p = Body.safeParse(await req.json().catch(() => null));
  if (!p.success) return NextResponse.json({ error: "Neplatný požadavek." }, { status: 400 });
  const [profile, target, catalog, lots] = await Promise.all([getProfile(), getTarget(), getCatalog(), getActiveLots()]);
  const today = todayISO();
  const stock = lots
    .filter((l) => l.kind === "raw" && l.qty > 0 && (!l.expiresOn || l.expiresOn >= today))
    .slice(0, 60)
    .map((l) => ({ name: l.name, qty: formatQty(l.qty, l.unit as "g" | "ml" | "ks"), daysLeft: l.expiresOn ? diffDays(l.expiresOn, today) : null }));
  if (stock.length < 2) return NextResponse.json({ error: "V lednici je zatím málo věcí. Přidej zásoby (foto lednice, účtenka) a zkus to znovu." }, { status: 400 });
  const share = profile.slots.find((s) => s.slot === p.data.slot)?.share ?? 0.3;
  const kcalTarget = p.data.kcalTarget ?? ((target.kcalMin + target.kcalMax) / 2) * share;
  const main = p.data.slot === "lunch" || p.data.slot === "dinner";
  try {
    const out = await improviseFromFridge({
      stock,
      slotLabel: SLOT_LABEL[p.data.slot],
      kcalTarget,
      proteinTarget: proteinPerMealTarget(profile.weightKg).min * (main ? 1 : 0.6),
      maxMinutes: main ? Math.max(20, profile.maxCookMinutesWeekday) : 15,
      allergens: profile.allergens.map((a) => ALLERGENS[a] ?? a),
      dislikes: profile.dislikes.map((d) => catalog.ingredients.get(d)?.name ?? d),
      dietTags: profile.dietTags,
    });
    // Don't trust the model's arithmetic: recompute macros from the catalog and check the fridge ourselves.
    const domainLots = lots.map((l) => ({ id: l.id, ingredientId: l.ingredientId, recipeId: l.recipeId, kind: l.kind, name: l.name, qty: l.qty, unit: l.unit, expiresOn: l.expiresOn }));
    const ideas = (out?.ideas ?? []).map((i) => {
      const g = groundIdea(i, catalog.ingredients, domainLots, today);
      return { ...i, ingredients: g.items, kcal: g.kcal ?? i.kcal, protein: g.protein ?? i.protein, estimated: g.kcal != null ? "catalog" : "ai" };
    });
    return NextResponse.json({ ideas });
  } catch (e) {
    console.error("fridge-ideas", (e as Error).message);
    return NextResponse.json({ error: aiErrorMessage(e, "Nápady se nepodařilo vymyslet. Zkus to znovu.") }, { status: 502 });
  }
}
