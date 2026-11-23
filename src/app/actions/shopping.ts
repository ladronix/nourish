"use server";
import { revalidatePath } from "next/cache";
import { and, eq, gte, lte, inArray } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { requireOwner } from "@/lib/server/auth";
import { getActiveLots, getCatalog, getShoppingItems } from "@/lib/server/data";
import { needsFromPlan } from "@/lib/domain/planner";
import { shoppingDiff } from "@/lib/domain/shopping";
import { addDays, todayISO } from "@/lib/domain/dates";
import { addLot } from "@/lib/server/inventory-ops";

/** Rebuild the plan-derived part of the list for the next `days` days. Manual items are kept. */
export async function rebuildShopping(days = 7) {
  await requireOwner();
  const from = todayISO();
  const to = addDays(from, days - 1);
  const [{ recipeMap, ingredients }, lots, meals, preps] = await Promise.all([
    getCatalog(),
    getActiveLots(),
    db.select().from(schema.plannedMeals).where(and(gte(schema.plannedMeals.date, from), lte(schema.plannedMeals.date, to))),
    db.select().from(schema.prepSessions).where(and(gte(schema.prepSessions.date, from), lte(schema.prepSessions.date, to))),
  ]);
  const batch = preps.filter((p) => p.status !== "done").flatMap((p) => p.recipes.map((r) => ({ ...r, date: p.date })));
  const needs = needsFromPlan(meals, batch, recipeMap);
  const manual = await db.select().from(schema.shoppingItems).where(and(eq(schema.shoppingItems.reason, "manual"), eq(schema.shoppingItems.movedToInventory, false)));
  const diff = shoppingDiff({
    needs,
    stock: lots.map((l) => ({ ingredientId: l.ingredientId, qty: l.qty, unit: l.unit, expiresOn: l.expiresOn, kind: l.kind })),
    ingredients,
    exclude: new Set(manual.map((m) => m.ingredientId).filter((x): x is string => !!x)),
  });
  // Preserve check state of lines that survive the rebuild.
  const old = await db.select().from(schema.shoppingItems).where(and(inArray(schema.shoppingItems.reason, ["plan", "min_stock"]), eq(schema.shoppingItems.movedToInventory, false)));
  const checked = new Set(old.filter((o) => o.checked).map((o) => o.ingredientId));
  if (old.length) await db.delete(schema.shoppingItems).where(inArray(schema.shoppingItems.id, old.map((o) => o.id)));
  if (diff.lines.length)
    await db.insert(schema.shoppingItems).values(
      diff.lines.map((l) => ({ ingredientId: l.ingredientId, name: l.name, category: l.category, qty: l.buy, unit: l.unit, required: l.required, available: l.available, reason: l.reason, estPriceCzk: l.estPriceCzk, checked: checked.has(l.ingredientId), note: l.conversion })),
    );
  revalidatePath("/shopping");
  revalidatePath("/");
  return { lines: diff.lines.length, covered: diff.coveredByStock.length, staples: diff.staplesSkipped };
}

export async function toggleShoppingItem(id: number) {
  await requireOwner();
  const it = await db.query.shoppingItems.findFirst({ where: eq(schema.shoppingItems.id, id) });
  if (!it) return;
  await db.update(schema.shoppingItems).set({ checked: !it.checked }).where(eq(schema.shoppingItems.id, id));
  revalidatePath("/shopping");
}

export async function addShoppingItem(input: { name: string; ingredientId?: string | null; qty?: number; unit?: "g" | "ml" | "ks" }) {
  await requireOwner();
  const v = z.object({ name: z.string().min(1).max(120), ingredientId: z.string().max(80).nullable().optional(), qty: z.number().positive().max(100000).optional(), unit: z.enum(["g", "ml", "ks"]).optional() }).parse(input);
  let category = "ostatni";
  let unit = v.unit ?? "ks";
  if (v.ingredientId) {
    const ing = await db.query.ingredients.findFirst({ where: eq(schema.ingredients.id, v.ingredientId) });
    if (ing) {
      category = ing.category;
      unit = v.unit ?? ing.unit;
    }
  }
  await db.insert(schema.shoppingItems).values({ name: v.name, ingredientId: v.ingredientId ?? null, qty: v.qty ?? 1, unit, category, reason: "manual" });
  revalidatePath("/shopping");
}

export async function removeShoppingItem(id: number) {
  await requireOwner();
  await db.delete(schema.shoppingItems).where(eq(schema.shoppingItems.id, id));
  revalidatePath("/shopping");
}

/** Close the loop: checked (bought) items become inventory lots with estimated expiry. */
export async function moveCheckedToInventory() {
  await requireOwner();
  const items = (await getShoppingItems()).filter((i) => i.checked);
  const { ingredients } = await getCatalog();
  for (const it of items) {
    await db.update(schema.shoppingItems).set({ movedToInventory: true }).where(eq(schema.shoppingItems.id, it.id));
    const ing = it.ingredientId ? ingredients.get(it.ingredientId) : null;
    await addLot({ ingredientId: it.ingredientId, name: ing?.name ?? it.name, qty: it.qty, unit: it.unit, location: ing?.defaultLocation ?? "fridge", source: "shopping", priceCzk: it.estPriceCzk, key: `shop:${it.id}` });
  }
  revalidatePath("/", "layout");
  return { moved: items.length };
}
