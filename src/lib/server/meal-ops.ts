import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { getCatalog } from "./data";
import { consumePortion, consumeRecipe, revertMealMoves } from "./inventory-ops";
import { todayISO, nowHHMM } from "@/lib/domain/dates";

/** Change a planned meal's status; "eaten" subtracts inventory idempotently (portion first, else raw FEFO). */
export async function markMeal(mealId: number, status: "planned" | "eaten" | "skipped") {
  const meal = await db.query.plannedMeals.findFirst({ where: eq(schema.plannedMeals.id, mealId) });
  if (!meal) return { ok: false, note: null as string | null };
  if (meal.status === status) return { ok: true, note: null };
  let note: string | null = null;
  if (meal.status === "eaten" && status !== "eaten") await revertMealMoves(meal.id);
  if (status === "eaten" && meal.recipeId) {
    const catalog = await getCatalog();
    const recipe = catalog.recipeMap.get(meal.recipeId);
    if (recipe) {
      const key = `meal:${meal.id}:eaten`;
      const usedPortion = meal.fromPrep ? await consumePortion(recipe.id, meal.servings, key, meal.id) : false;
      if (!usedPortion) {
        const r = await consumeRecipe(recipe, meal.servings, key, catalog.ingredients, meal.id);
        if (r.missing.length) note = `V zásobách chybělo: ${r.missing.join(", ")}`;
      }
    }
  }
  await db.update(schema.plannedMeals).set({ status, eatenAt: status === "eaten" ? new Date() : null }).where(eq(schema.plannedMeals.id, mealId));
  return { ok: true, note };
}

/** The next planned (not yet eaten) meal today, closest to now. */
export async function nextPlannedMeal() {
  const meals = await db
    .select()
    .from(schema.plannedMeals)
    .where(and(eq(schema.plannedMeals.date, todayISO()), eq(schema.plannedMeals.status, "planned")))
    .orderBy(asc(schema.plannedMeals.time));
  if (!meals.length) return null;
  const now = nowHHMM();
  // the latest meal whose time has passed, otherwise the first upcoming one
  const past = meals.filter((m) => m.time <= now);
  return past.length ? past[past.length - 1] : meals[0];
}
