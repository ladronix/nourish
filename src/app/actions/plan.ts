"use server";
import { revalidatePath } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireOwner, audit } from "@/lib/server/auth";
import { getActiveLots, getCatalog, getProfile, getTarget } from "@/lib/server/data";
import { generatePlan, swapCandidates, type PlanInput, type PlanStyle, type SlotSpec } from "@/lib/domain/planner";
import { addDays, todayISO, weekDays, weekday } from "@/lib/domain/dates";
import { scaleMacros } from "@/lib/domain/nutrition";
import { recipePerServing, type MealSlot } from "@/lib/domain/catalog";
import { revertMealMoves } from "@/lib/server/inventory-ops";
import { markMeal } from "@/lib/server/meal-ops";
import { buildPrepForPlan } from "@/lib/server/prep-ops";

async function planInput(days: string[], seed = 0, extra?: Partial<PlanInput>): Promise<PlanInput> {
  const [profile, target, catalog, lots] = await Promise.all([getProfile(), getTarget(), getCatalog(), getActiveLots()]);
  return {
    days,
    today: todayISO(),
    slots: profile.slots,
    target,
    allergens: profile.allergens,
    dislikes: profile.dislikes,
    dietTags: profile.dietTags,
    maxCookMinutesWeekday: profile.maxCookMinutesWeekday,
    recipes: catalog.recipes,
    ingredients: catalog.ingredients,
    inventory: lots.map((l) => ({ ingredientId: l.ingredientId, qty: l.qty, expiresOn: l.expiresOn, kind: l.kind, recipeId: l.recipeId })),
    locked: [],
    budgetWeekCzk: profile.budgetWeekCzk,
    seed,
    ...extra,
  };
}

type GenOpts = { seed?: number; keepLocked?: boolean; style?: PlanStyle; avoidCurrent?: boolean };

/** What stays when a week is regenerated: the past, anything eaten/skipped, and locked meals. */
async function weekContext(weekStartISO: string, opts?: GenOpts) {
  const today = todayISO();
  const existing = await db.query.mealPlans.findFirst({ where: eq(schema.mealPlans.weekStart, weekStartISO) });
  let locked: PlanInput["locked"] = [];
  let keepIds: number[] = [];
  let current: string[] = [];
  if (existing) {
    const meals = await db.select().from(schema.plannedMeals).where(eq(schema.plannedMeals.planId, existing.id));
    const keep = meals.filter((m) => m.date < today || m.status !== "planned" || (opts?.keepLocked !== false && m.locked));
    keepIds = keep.map((m) => m.id);
    locked = keep.filter((m) => m.status !== "swapped").map((m) => ({ date: m.date, slot: m.slot, recipeId: m.recipeId, servings: m.servings }));
    current = [...new Set(meals.filter((m) => !keepIds.includes(m.id) && m.recipeId).map((m) => m.recipeId!))];
  }
  return { existing, locked, keepIds, current };
}

const VARIANTS: { style: PlanStyle; label: string; hint: string }[] = [
  { style: "fresh", label: "Jiné recepty", hint: "co nejvíc jiných jídel než teď" },
  { style: "quick", label: "Rychlé vaření", hint: "kratší vaření ve všední dny" },
  { style: "cheap", label: "Úspornější", hint: "levnější suroviny" },
  { style: "protein", label: "Víc bílkovin", hint: "bílkoviny v každém jídle" },
];

/** Propose alternative weeks side by side; nothing is saved until one is picked via generateWeek(seed, style). */
export async function previewWeekVariants(weekStartISO: string) {
  await requireOwner();
  const days = weekDays(weekStartISO);
  const ctx = await weekContext(weekStartISO);
  const catalog = await getCatalog();
  const base = Math.floor(Math.random() * 100000);
  return Promise.all(
    VARIANTS.map(async (v, i) => {
      const seed = base + i * 7919;
      const out = generatePlan(await planInput(days, seed, { locked: ctx.locked, style: v.style, avoid: ctx.current }));
      const kept = new Set(ctx.locked.map((l) => l.date + l.slot));
      const fresh = out.meals.filter((m) => m.recipeId && !kept.has(m.date + m.slot));
      const names = [...new Set(fresh.filter((m) => m.slot === "dinner" || m.slot === "lunch").map((m) => catalog.recipeMap.get(m.recipeId!)?.name).filter(Boolean))] as string[];
      const changed = fresh.filter((m) => !ctx.current.includes(m.recipeId!)).length;
      return {
        style: v.style,
        seed,
        label: v.label,
        hint: v.hint,
        avgKcal: Math.round(out.explanation.avgKcal),
        avgProtein: Math.round(out.explanation.avgProtein),
        estCostCzk: Math.round(out.explanation.estCostCzk),
        cookMinutes: Math.round(out.explanation.cookMinutes),
        plantPoints: out.explanation.plantPoints,
        changed,
        total: fresh.length,
        sample: names.slice(0, 6),
      };
    }),
  );
}

export async function generateWeek(weekStartISO: string, opts?: GenOpts) {
  await requireOwner();
  const days = weekDays(weekStartISO);
  const { existing, locked, keepIds, current } = await weekContext(weekStartISO, opts);
  const input = await planInput(days, opts?.seed ?? Math.floor(Math.random() * 1000), { locked, style: opts?.style, avoid: opts?.style ? current : undefined });
  const out = generatePlan(input);

  let planId = existing?.id;
  if (!planId) {
    const [p] = await db.insert(schema.mealPlans).values({ weekStart: weekStartISO, status: "generated", explanation: out.explanation }).returning();
    planId = p.id;
  } else {
    await db.update(schema.mealPlans).set({ explanation: out.explanation, status: "generated" }).where(eq(schema.mealPlans.id, planId));
    const all = await db.select({ id: schema.plannedMeals.id }).from(schema.plannedMeals).where(eq(schema.plannedMeals.planId, planId));
    const del = all.map((m) => m.id).filter((id) => !keepIds.includes(id));
    if (del.length) await db.delete(schema.plannedMeals).where(inArray(schema.plannedMeals.id, del));
  }
  const keptKeys = new Set(locked.map((l) => l.date + l.slot));
  const rows = out.meals
    .filter((m) => !keptKeys.has(m.date + m.slot) && m.recipeId)
    .map((m) => ({ planId: planId!, date: m.date, slot: m.slot, time: m.time, recipeId: m.recipeId, servings: m.servings, fromPrep: m.fromPrep, locked: false, kcal: m.macros.kcal, protein: m.macros.protein, carbs: m.macros.carbs, fat: m.macros.fat, fiber: m.macros.fiber }));
  if (rows.length) await db.insert(schema.plannedMeals).values(rows);
  await buildPrepForPlan(planId!, weekStartISO, out.batch);
  await audit("plan_generated", { weekStart: weekStartISO, meals: rows.length });
  revalidatePath("/", "layout");
  return { ok: true, explanation: out.explanation };
}

export async function confirmPlan(planId: number) {
  await requireOwner();
  await db.update(schema.mealPlans).set({ status: "confirmed" }).where(eq(schema.mealPlans.id, planId));
  revalidatePath("/plan");
}

export async function setMealStatus(mealId: number, status: "planned" | "eaten" | "skipped") {
  await requireOwner();
  const r = await markMeal(mealId, status);
  revalidatePath("/", "layout");
  return r;
}

export async function getSwapOptions(mealId: number) {
  await requireOwner();
  const meal = await db.query.plannedMeals.findFirst({ where: eq(schema.plannedMeals.id, mealId) });
  if (!meal) return [];
  const input = await planInput([meal.date]);
  const slot: SlotSpec = input.slots.find((s) => s.slot === meal.slot) ?? { slot: meal.slot, time: meal.time, share: 0.3 };
  return swapCandidates(input, meal.date, slot, meal.recipeId, meal.kcal, 8).map((c) => ({
    recipeId: c.recipe.id,
    name: c.recipe.name,
    emoji: c.recipe.emoji,
    servings: c.servings,
    kcal: Math.round(c.macros.kcal),
    protein: Math.round(c.macros.protein),
    totalMin: c.totalMin,
    reasons: c.reasons,
  }));
}

export async function swapMeal(mealId: number, recipeId: string, servings: number) {
  await requireOwner();
  const meal = await db.query.plannedMeals.findFirst({ where: eq(schema.plannedMeals.id, mealId) });
  if (!meal || meal.status === "eaten") return { ok: false };
  const { recipeMap, ingredients } = await getCatalog();
  const r = recipeMap.get(recipeId);
  if (!r) return { ok: false };
  const m = scaleMacros(recipePerServing(r, ingredients), servings);
  await db.update(schema.plannedMeals).set({ recipeId, servings, fromPrep: false, locked: true, kcal: m.kcal, protein: m.protein, carbs: m.carbs, fat: m.fat, fiber: m.fiber, status: "planned" }).where(eq(schema.plannedMeals.id, mealId));
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function setServings(mealId: number, servings: number) {
  await requireOwner();
  const meal = await db.query.plannedMeals.findFirst({ where: eq(schema.plannedMeals.id, mealId) });
  if (!meal?.recipeId) return;
  const { recipeMap, ingredients } = await getCatalog();
  const r = recipeMap.get(meal.recipeId)!;
  const s = Math.min(3, Math.max(0.25, Math.round(servings * 4) / 4));
  const m = scaleMacros(recipePerServing(r, ingredients), s);
  await db.update(schema.plannedMeals).set({ servings: s, kcal: m.kcal, protein: m.protein, carbs: m.carbs, fat: m.fat, fiber: m.fiber }).where(eq(schema.plannedMeals.id, mealId));
  revalidatePath("/", "layout");
}

export async function toggleLock(mealId: number) {
  await requireOwner();
  const meal = await db.query.plannedMeals.findFirst({ where: eq(schema.plannedMeals.id, mealId) });
  if (!meal) return;
  await db.update(schema.plannedMeals).set({ locked: !meal.locked }).where(eq(schema.plannedMeals.id, mealId));
  revalidatePath("/plan");
}

export async function removeMeal(mealId: number) {
  await requireOwner();
  const meal = await db.query.plannedMeals.findFirst({ where: eq(schema.plannedMeals.id, mealId) });
  if (!meal) return;
  if (meal.status === "eaten") await revertMealMoves(meal.id);
  await db.delete(schema.plannedMeals).where(eq(schema.plannedMeals.id, mealId));
  revalidatePath("/", "layout");
}

export async function addMeal(date: string, slot: MealSlot, recipeId: string, servings = 1) {
  await requireOwner();
  const { weekStart } = await import("@/lib/domain/dates");
  const ws = weekStart(date);
  let plan = await db.query.mealPlans.findFirst({ where: eq(schema.mealPlans.weekStart, ws) });
  if (!plan) [plan] = await db.insert(schema.mealPlans).values({ weekStart: ws, status: "generated" }).returning();
  const profile = await getProfile();
  const { recipeMap, ingredients } = await getCatalog();
  const r = recipeMap.get(recipeId);
  if (!r) return;
  const m = scaleMacros(recipePerServing(r, ingredients), servings);
  const time = profile.slots.find((s) => s.slot === slot)?.time ?? "12:00";
  await db.insert(schema.plannedMeals).values({ planId: plan.id, date, slot, time, recipeId, servings, locked: true, kcal: m.kcal, protein: m.protein, carbs: m.carbs, fat: m.fat, fiber: m.fiber });
  revalidatePath("/", "layout");
}

/** "Upravit den" quick modes: less time, lighter dinner, eating out, more protein. */
export async function rebuildDay(date: string, mode: "less_time" | "lighter" | "eating_out" | "more_protein") {
  await requireOwner();
  const meals = await db.select().from(schema.plannedMeals).where(and(eq(schema.plannedMeals.date, date), eq(schema.plannedMeals.status, "planned")));
  const input = await planInput([date], Math.floor(Math.random() * 1000));
  const { recipeMap, ingredients } = await getCatalog();
  const changed: string[] = [];
  for (const meal of meals) {
    if (meal.fromPrep && mode !== "eating_out") continue;
    const slot = input.slots.find((s) => s.slot === meal.slot) ?? { slot: meal.slot, time: meal.time, share: 0.3 };
    if (mode === "eating_out") {
      if (meal.slot !== "dinner" && meal.slot !== "lunch") continue;
      if (meal.slot === "lunch" && weekday(date) >= 1 && weekday(date) <= 5) continue;
      await db.update(schema.plannedMeals).set({ status: "skipped", note: "Jím venku" }).where(eq(schema.plannedMeals.id, meal.id));
      changed.push("večeře venku");
      continue;
    }
    if (mode === "lighter" && meal.slot !== "dinner") continue;
    let cands = swapCandidates(input, date, slot, meal.recipeId, meal.kcal, 20);
    if (mode === "less_time") cands = cands.filter((c) => c.totalMin <= 15).sort((a, b) => a.totalMin - b.totalMin || b.score - a.score);
    if (mode === "lighter") cands = cands.filter((c) => c.macros.kcal < meal.kcal * 0.85).map((c) => c);
    if (mode === "more_protein") cands = cands.filter((c) => c.macros.protein > meal.protein + 5).sort((a, b) => b.macros.protein - a.macros.protein);
    const pick = cands[0];
    if (!pick) continue;
    let servings = pick.servings;
    if (mode === "lighter") servings = Math.max(0.75, Math.round(((meal.kcal * 0.75) / Math.max(1, recipePerServing(pick.recipe, ingredients).kcal)) * 4) / 4);
    const m = scaleMacros(recipePerServing(recipeMap.get(pick.recipe.id)!, ingredients), servings);
    await db.update(schema.plannedMeals).set({ recipeId: pick.recipe.id, servings, kcal: m.kcal, protein: m.protein, carbs: m.carbs, fat: m.fat, fiber: m.fiber }).where(eq(schema.plannedMeals.id, meal.id));
    changed.push(pick.recipe.name);
  }
  revalidatePath("/", "layout");
  return { changed };
}

export async function ensureCurrentWeek() {
  await requireOwner();
  const { weekStart } = await import("@/lib/domain/dates");
  const ws = weekStart(todayISO());
  const exists = await db.query.mealPlans.findFirst({ where: eq(schema.mealPlans.weekStart, ws) });
  if (!exists) await generateWeek(ws, { seed: 1 });
  return ws;
}

export async function nextWeekStart() {
  const { weekStart } = await import("@/lib/domain/dates");
  return addDays(weekStart(todayISO()), 7);
}
