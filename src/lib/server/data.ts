import "server-only";
import { and, asc, desc, eq, gte, lte, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import type { IngredientLite, RecipeLite } from "@/lib/domain/catalog";
import { addDays, todayISO, weekDays, weekStart } from "@/lib/domain/dates";
import { addMacros, computeTargets, ZERO, type Macros } from "@/lib/domain/nutrition";

export type Profile = typeof schema.profile.$inferSelect;
export type Target = typeof schema.nutritionTargets.$inferSelect;
export type Lot = typeof schema.inventoryLots.$inferSelect;
export type PlannedMeal = typeof schema.plannedMeals.$inferSelect;

export async function getProfile(): Promise<Profile> {
  const p = await db.query.profile.findFirst({ where: eq(schema.profile.id, 1) });
  if (p) return p;
  const [row] = await db
    .insert(schema.profile)
    .values({ id: 1, slots: [{ slot: "breakfast", time: "07:30", share: 0.25 }, { slot: "lunch", time: "12:30", share: 0.33 }, { slot: "snack", time: "16:00", share: 0.12 }, { slot: "dinner", time: "19:00", share: 0.3 }] })
    .onConflictDoNothing()
    .returning();
  return row ?? (await db.query.profile.findFirst({ where: eq(schema.profile.id, 1) }))!;
}

/** Current confirmed target; falls back to a computed preview (not stored) if none confirmed yet. */
export async function getTarget(): Promise<Target> {
  const t = await db.query.nutritionTargets.findFirst({ where: lte(schema.nutritionTargets.validFrom, todayISO()), orderBy: [desc(schema.nutritionTargets.validFrom), desc(schema.nutritionTargets.id)] });
  if (t) return t;
  const p = await getProfile();
  const r = computeTargets({ sex: p.sex, age: new Date().getFullYear() - p.birthYear, heightCm: p.heightCm, weightKg: p.weightKg, activity: p.activity, goal: p.goal, goalRateKgWeek: p.goalRateKgWeek, proteinGPerKg: p.proteinGPerKg, safetyFlags: p.safetyFlags });
  return { id: 0, validFrom: todayISO(), ...r, calculationVersion: "preview", source: r.source, createdAt: new Date() };
}

export async function getCatalog() {
  const [ings, recs, items] = await Promise.all([
    db.select().from(schema.ingredients).orderBy(asc(schema.ingredients.name)),
    db.select().from(schema.recipes).orderBy(asc(schema.recipes.name)),
    db.select().from(schema.recipeIngredients),
  ]);
  const ingredients = new Map<string, IngredientLite>(ings.map((i) => [i.id, i as IngredientLite]));
  const byRecipe = new Map<string, RecipeLite["items"]>();
  for (const it of items) {
    const arr = byRecipe.get(it.recipeId) ?? [];
    arr.push({ ingredientId: it.ingredientId, qty: it.qty, optional: it.optional });
    byRecipe.set(it.recipeId, arr);
  }
  const recipes: (RecipeLite & { description: string; steps: typeof recs[number]["steps"]; imageUrl: string | null; sourceUrl: string | null })[] = recs.map((r) => ({ ...r, items: byRecipe.get(r.id) ?? [] }));
  return { ingredients, recipes, recipeMap: new Map(recipes.map((r) => [r.id, r])), ingredientRows: ings };
}

export async function getActiveLots(): Promise<Lot[]> {
  return db.select().from(schema.inventoryLots).where(eq(schema.inventoryLots.status, "active")).orderBy(asc(schema.inventoryLots.expiresOn));
}

export async function getPlanForWeek(start: string) {
  const plan = await db.query.mealPlans.findFirst({ where: eq(schema.mealPlans.weekStart, start) });
  if (!plan) return null;
  const meals = await db.select().from(schema.plannedMeals).where(eq(schema.plannedMeals.planId, plan.id)).orderBy(asc(schema.plannedMeals.date), asc(schema.plannedMeals.time));
  const prep = await db.query.prepSessions.findFirst({ where: eq(schema.prepSessions.planId, plan.id) });
  return { plan, meals, prep };
}

export async function getMealsForRange(from: string, to: string) {
  return db.select().from(schema.plannedMeals).where(and(gte(schema.plannedMeals.date, from), lte(schema.plannedMeals.date, to))).orderBy(asc(schema.plannedMeals.date), asc(schema.plannedMeals.time));
}

export async function getFoodLog(from: string, to: string) {
  return db.select().from(schema.foodLog).where(and(gte(schema.foodLog.date, from), lte(schema.foodLog.date, to))).orderBy(asc(schema.foodLog.createdAt));
}

const mOf = (m: { kcal: number; protein: number; carbs: number; fat: number; fiber: number }): Macros => ({ kcal: m.kcal, protein: m.protein, carbs: m.carbs, fat: m.fat, fiber: m.fiber });

/** Daily intake = eaten planned meals + free log. Planned = all planned/eaten meals. */
export async function getDayTotals(from: string, to: string) {
  const [meals, log] = await Promise.all([getMealsForRange(from, to), getFoodLog(from, to)]);
  const days = new Map<string, { eaten: Macros; planned: Macros; mealsTotal: number; mealsEaten: number; logged: boolean }>();
  const get = (d: string) => {
    let v = days.get(d);
    if (!v) days.set(d, (v = { eaten: ZERO, planned: ZERO, mealsTotal: 0, mealsEaten: 0, logged: false }));
    return v;
  };
  for (const m of meals) {
    const d = get(m.date);
    if (m.status !== "skipped" && m.status !== "swapped") {
      d.planned = addMacros(d.planned, mOf(m));
      if (m.recipeId) d.mealsTotal++;
    }
    if (m.status === "eaten") {
      d.eaten = addMacros(d.eaten, mOf(m));
      d.mealsEaten++;
      d.logged = true;
    }
    if (m.status === "skipped") d.logged = true;
  }
  for (const l of log) {
    const d = get(l.date);
    d.eaten = addMacros(d.eaten, mOf(l));
    d.logged = true;
  }
  return days;
}

export async function getWeighIns(days = 120) {
  return db.select().from(schema.weighIns).where(gte(schema.weighIns.date, addDays(todayISO(), -days))).orderBy(asc(schema.weighIns.date));
}

export async function getShoppingItems() {
  return db.select().from(schema.shoppingItems).where(eq(schema.shoppingItems.movedToInventory, false)).orderBy(asc(schema.shoppingItems.category), asc(schema.shoppingItems.name));
}

export async function getReminders() {
  return db.select().from(schema.reminders).orderBy(asc(schema.reminders.time));
}

export async function getWater(date: string) {
  const r = await db.query.waterLog.findFirst({ where: eq(schema.waterLog.date, date) });
  return r?.ml ?? 0;
}

export function currentWeek() {
  const t = todayISO();
  return { today: t, start: weekStart(t), days: weekDays(weekStart(t)) };
}

export async function getRecipesByIds(ids: string[]) {
  if (!ids.length) return [];
  return db.select().from(schema.recipes).where(inArray(schema.recipes.id, ids));
}
