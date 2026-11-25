import "server-only";
import { and, asc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { estimateExpiry, type IngredientLite, type Location, type RecipeLite, type Unit } from "@/lib/domain/catalog";
import { todayISO, addDays } from "@/lib/domain/dates";
import { inLotUnit, matchIngredientByName, substitutesFor } from "@/lib/domain/fridge-cook";

/**
 * Apply one inventory movement atomically and idempotently:
 * the move row is inserted only once per idempotency key, and the lot quantity
 * changes only when that insert actually happened (single SQL statement).
 */
export async function applyMove(opts: { lotId: number; delta: number; reason: "add" | "consume" | "discard" | "adjust" | "cook"; key: string; plannedMealId?: number | null; valueCzk?: number | null }) {
  const res = await db.execute(sql`
    WITH ins AS (
      INSERT INTO inventory_moves (lot_id, delta, reason, idempotency_key, planned_meal_id, value_czk)
      VALUES (${opts.lotId}, ${opts.delta}, ${opts.reason}, ${opts.key}, ${opts.plannedMealId ?? null}, ${opts.valueCzk ?? null})
      ON CONFLICT (idempotency_key) DO NOTHING
      RETURNING lot_id, delta
    )
    UPDATE inventory_lots l
       SET qty = GREATEST(0, l.qty + ins.delta),
           status = CASE WHEN l.qty + ins.delta <= 0.001 THEN (CASE WHEN ${opts.reason} = 'discard' THEN 'discarded' ELSE 'used' END) ELSE 'active' END
      FROM ins WHERE l.id = ins.lot_id
    RETURNING l.id`);
  const rows = (res as unknown as { rows?: unknown[] }).rows ?? (res as unknown as unknown[]);
  return Array.isArray(rows) && rows.length > 0;
}

/**
 * Take `qty` (in the ingredient's unit) from active lots, first-expiring first (FEFO).
 * With `ings`, free-text lots (e.g. from a fridge photo, no catalog id) that match by name count too,
 * and quantities are converted to each lot's own unit (8 ks of tomatoes vs. grams in a recipe).
 */
export async function consumeIngredient(ingredientId: string, qty: number, keyPrefix: string, plannedMealId?: number, ings?: Map<string, IngredientLite>) {
  const ing = ings?.get(ingredientId);
  const all = await db
    .select()
    .from(schema.inventoryLots)
    .where(and(eq(schema.inventoryLots.status, "active"), eq(schema.inventoryLots.kind, "raw"), ing ? sql`(${schema.inventoryLots.ingredientId} = ${ingredientId} OR ${schema.inventoryLots.ingredientId} IS NULL)` : eq(schema.inventoryLots.ingredientId, ingredientId)))
    .orderBy(sql`${schema.inventoryLots.expiresOn} asc nulls last`, asc(schema.inventoryLots.addedAt));
  const lots = all.filter((l) => l.ingredientId === ingredientId || (ings && !l.ingredientId && matchIngredientByName(l.name, ings) === ingredientId));
  let left = qty;
  for (const lot of lots) {
    if (left <= 0.0001) break;
    const want = ing ? inLotUnit(left, lot.unit, ing) : left;
    const take = Math.min(lot.qty, want);
    await applyMove({ lotId: lot.id, delta: -take, reason: "consume", key: `${keyPrefix}:${lot.id}`, plannedMealId });
    left -= ing ? (want > 0 ? (take / want) * left : 0) : take;
  }
  return { missing: Math.max(0, left) };
}

export async function consumeRecipe(recipe: RecipeLite, servings: number, keyPrefix: string, ings: Map<string, IngredientLite>, plannedMealId?: number) {
  const missing: string[] = [];
  for (const it of recipe.items) {
    if (it.optional) continue;
    const ing = ings.get(it.ingredientId);
    if (!ing || ing.isStaple) continue;
    let r = await consumeIngredient(it.ingredientId, (it.qty / recipe.servings) * servings, `${keyPrefix}:${it.ingredientId}`, plannedMealId, ings);
    // Cooked with a substitute (turkey for chicken, bread for a tortilla…): take the rest from it.
    for (const sub of substitutesFor(it.ingredientId)) {
      if (r.missing <= 0.01 || !ings.has(sub)) break;
      r = await consumeIngredient(sub, r.missing, `${keyPrefix}:${it.ingredientId}:sub:${sub}`, plannedMealId, ings);
    }
    if (r.missing > 0.01) missing.push(ing.name);
  }
  return { missing };
}

/** Eat one portion of a batch-cooked recipe from the fridge/freezer, if present. */
export async function consumePortion(recipeId: string, servings: number, key: string, plannedMealId: number) {
  const lot = await db.query.inventoryLots.findFirst({
    where: and(eq(schema.inventoryLots.recipeId, recipeId), eq(schema.inventoryLots.kind, "portion"), eq(schema.inventoryLots.status, "active")),
    orderBy: [sql`${schema.inventoryLots.location} = 'freezer'`, asc(schema.inventoryLots.expiresOn)],
  });
  if (!lot) return false;
  await applyMove({ lotId: lot.id, delta: -Math.min(lot.qty, servings), reason: "consume", key: `${key}:${lot.id}`, plannedMealId });
  return true;
}

/** Reverse every movement recorded for a planned meal (undo "eaten"). */
export async function revertMealMoves(plannedMealId: number) {
  const moves = await db.select().from(schema.inventoryMoves).where(eq(schema.inventoryMoves.plannedMealId, plannedMealId));
  for (const m of moves) {
    await db.execute(sql`UPDATE inventory_lots SET qty = qty - ${m.delta}, status = 'active' WHERE id = ${m.lotId}`);
    await db.delete(schema.inventoryMoves).where(eq(schema.inventoryMoves.id, m.id));
  }
}

export async function addLot(input: {
  ingredientId?: string | null;
  name: string;
  qty: number;
  unit: Unit;
  location: Location;
  expiresOn?: string | null;
  source?: (typeof schema.inventoryLots.$inferInsert)["source"];
  confidence?: number;
  barcode?: string | null;
  nutritionPer100?: { kcal: number; protein: number; carbs: number; fat: number; fiber: number } | null;
  priceCzk?: number | null;
  kind?: "raw" | "portion";
  recipeId?: string | null;
  needsReview?: boolean;
  key?: string;
}) {
  let expiresOn = input.expiresOn ?? null;
  if (!expiresOn && input.ingredientId) {
    const ing = await db.query.ingredients.findFirst({ where: eq(schema.ingredients.id, input.ingredientId) });
    expiresOn = estimateExpiry(ing ? { shelfDays: ing.shelfDays, defaultLocation: ing.defaultLocation } : null, input.location, todayISO());
  }
  if (!expiresOn) expiresOn = estimateExpiry(null, input.location, todayISO());
  const [lot] = await db
    .insert(schema.inventoryLots)
    .values({
      ingredientId: input.ingredientId ?? null,
      recipeId: input.recipeId ?? null,
      kind: input.kind ?? "raw",
      name: input.name,
      qty: 0,
      unit: input.unit,
      location: input.location,
      expiresOn,
      source: input.source ?? "manual",
      confidence: input.confidence ?? 1,
      barcode: input.barcode ?? null,
      nutritionPer100: input.nutritionPer100 ?? null,
      priceCzk: input.priceCzk ?? null,
      needsReview: input.needsReview ?? false,
    })
    .returning();
  await applyMove({ lotId: lot.id, delta: input.qty, reason: "add", key: input.key ?? `add:${lot.id}` });
  return lot;
}

export async function createPortions(recipe: { id: string; name: string; fridgeDays: number; freezerOk: boolean }, servings: number, date: string, key: string) {
  // Portions beyond fridge life go to the freezer when the recipe freezes well.
  const fridgeCount = recipe.freezerOk ? Math.min(servings, Math.max(1, recipe.fridgeDays - 1)) : servings;
  const freezerCount = servings - fridgeCount;
  await addLot({ name: `${recipe.name} (porce)`, qty: fridgeCount, unit: "ks", location: "fridge", expiresOn: addDays(date, recipe.fridgeDays), source: "prep", kind: "portion", recipeId: recipe.id, key: `${key}:fridge` });
  if (freezerCount > 0) await addLot({ name: `${recipe.name} (porce)`, qty: freezerCount, unit: "ks", location: "freezer", expiresOn: addDays(date, 90), source: "prep", kind: "portion", recipeId: recipe.id, key: `${key}:freezer` });
  return { fridgeCount, freezerCount };
}
