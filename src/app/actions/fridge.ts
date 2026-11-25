"use server";
import { revalidatePath } from "next/cache";
import { and, eq, gte, lte } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { requireOwner, audit } from "@/lib/server/auth";
import { getActiveLots, getCatalog, getProfile, getTarget } from "@/lib/server/data";
import { addDays, nowHHMM, todayISO, weekStart } from "@/lib/domain/dates";
import { SLOT_LABEL, recipePerServing, type MealSlot } from "@/lib/domain/catalog";
import { proteinPerMealTarget, scaleMacros } from "@/lib/domain/nutrition";
import { fridgeIdeas, leftovers, planDayFromFridge, type FridgeIdea, type Leftover } from "@/lib/domain/fridge-cook";
import { markMeal } from "@/lib/server/meal-ops";

const Slot = z.enum(["breakfast", "snack_am", "lunch", "snack", "dinner"]);
const DateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export type FridgeSlot = {
  slot: MealSlot;
  label: string;
  time: string;
  mealId: number | null;
  plannedName: string | null;
  kcalTarget: number;
  fromPrep: boolean;
  /** planned from a meal-prep box, but the box isn't in the fridge (prep not done / eaten up). */
  prepMissing: boolean;
};

export type FridgeView = {
  date: string;
  slots: FridgeSlot[];
  active: MealSlot;
  ideas: FridgeIdea[];
  leftovers: Leftover[];
  stockCount: number;
  prepPending: { date: string; status: string } | null;
};

async function context(date: string) {
  const [profile, target, catalog, lots] = await Promise.all([getProfile(), getTarget(), getCatalog(), getActiveLots()]);
  const meals = await db.select().from(schema.plannedMeals).where(eq(schema.plannedMeals.date, date));
  const recent = await db
    .select({ recipeId: schema.plannedMeals.recipeId })
    .from(schema.plannedMeals)
    .where(and(gte(schema.plannedMeals.date, addDays(date, -2)), lte(schema.plannedMeals.date, date), eq(schema.plannedMeals.status, "eaten")));
  const kcalMid = (target.kcalMin + target.kcalMax) / 2;
  const portionsByRecipe = new Map<string, number>();
  for (const l of lots) if (l.kind === "portion" && l.recipeId && (!l.expiresOn || l.expiresOn >= todayISO())) portionsByRecipe.set(l.recipeId, (portionsByRecipe.get(l.recipeId) ?? 0) + l.qty);

  // Remaining slots of the day: planned-but-not-eaten meals, plus profile slots with nothing planned.
  const isToday = date === todayISO();
  const now = nowHHMM();
  const slots: FridgeSlot[] = [];
  for (const s of profile.slots) {
    const meal = meals.find((m) => m.slot === s.slot);
    if (meal && meal.status !== "planned") continue;
    if (isToday && !meal && s.time < now) continue;
    const prepMissing = !!meal?.fromPrep && !!meal.recipeId && (portionsByRecipe.get(meal.recipeId) ?? 0) < meal.servings - 0.01;
    slots.push({
      slot: s.slot,
      label: SLOT_LABEL[s.slot],
      time: meal?.time ?? s.time,
      mealId: meal?.id ?? null,
      plannedName: meal?.recipeId ? (catalog.recipeMap.get(meal.recipeId)?.name ?? null) : null,
      kcalTarget: Math.round(meal?.kcal || kcalMid * s.share),
      fromPrep: !!meal?.fromPrep,
      prepMissing,
    });
  }
  slots.sort((a, b) => a.time.localeCompare(b.time));
  const ws = weekStart(date);
  const plan = await db.query.mealPlans.findFirst({ where: eq(schema.mealPlans.weekStart, ws) });
  const prep = plan ? await db.query.prepSessions.findFirst({ where: eq(schema.prepSessions.planId, plan.id) }) : null;
  return {
    profile,
    catalog,
    lots,
    slots,
    recentRecipeIds: recent.map((r) => r.recipeId).filter(Boolean) as string[],
    proteinTarget: proteinPerMealTarget(profile.weightKg).min,
    kcalMid,
    prepPending: prep && prep.status !== "done" ? { date: prep.date, status: prep.status } : null,
  };
}

function lotsForDomain(lots: Awaited<ReturnType<typeof getActiveLots>>) {
  return lots.map((l) => ({ id: l.id, ingredientId: l.ingredientId, recipeId: l.recipeId, kind: l.kind, name: l.name, qty: l.qty, unit: l.unit, expiresOn: l.expiresOn }));
}

/** Ideas for one slot of the day (default: the next meal), plus cooked portions waiting in the fridge. */
export async function getFridgeIdeas(dateIn?: string, slotIn?: MealSlot, opts?: { maxMinutes?: number }): Promise<FridgeView> {
  await requireOwner();
  const date = DateStr.parse(dateIn ?? todayISO());
  const ctx = await context(date);
  // Default to the next meal: the first remaining slot that isn't more than ~1 h in the past.
  const soon = date === todayISO() ? ctx.slots.find((s) => s.time >= shiftHHMM(nowHHMM(), -60)) : ctx.slots[0];
  const fallback: MealSlot = soon?.slot ?? ctx.slots.at(-1)?.slot ?? (nowHHMM() < "10:30" ? "breakfast" : nowHHMM() < "15:00" ? "lunch" : "dinner");
  const active = slotIn ? Slot.parse(slotIn) : fallback;
  const slotInfo = ctx.slots.find((s) => s.slot === active);
  const share = ctx.profile.slots.find((s) => s.slot === active)?.share ?? 0.3;
  const ideas = fridgeIdeas(
    {
      today: todayISO(),
      slot: active,
      kcalTarget: slotInfo?.kcalTarget ?? Math.round(ctx.kcalMid * share),
      proteinTarget: active === "lunch" || active === "dinner" ? ctx.proteinTarget : Math.round(ctx.proteinTarget * 0.7),
      maxMinutes: opts?.maxMinutes ?? (active === "lunch" ? Math.max(15, ctx.profile.maxCookMinutesWeekday) : undefined),
      recipes: ctx.catalog.recipes,
      ingredients: ctx.catalog.ingredients,
      lots: lotsForDomain(ctx.lots),
      allergens: ctx.profile.allergens,
      dislikes: ctx.profile.dislikes,
      dietTags: ctx.profile.dietTags,
      recentRecipeIds: ctx.recentRecipeIds,
    },
    12,
  );
  return {
    date,
    slots: ctx.slots,
    active,
    ideas,
    leftovers: leftovers(lotsForDomain(ctx.lots), ctx.catalog.recipeMap, ctx.catalog.ingredients, todayISO()),
    stockCount: ctx.lots.filter((l) => l.kind === "raw").length,
    prepPending: ctx.prepPending,
  };
}

const UseInput = z.object({ date: DateStr, slot: Slot, mealId: z.number().int().nullable(), recipeId: z.string().min(1).max(80), servings: z.number().min(0.25).max(4), eatNow: z.boolean() });

/** Put a fridge idea into the plan (replacing the planned meal, incl. a missing prep box) and optionally eat it now. */
export async function applyFridgeIdea(input: z.input<typeof UseInput>) {
  await requireOwner();
  const v = UseInput.parse(input);
  const { recipeMap, ingredients } = await getCatalog();
  const r = recipeMap.get(v.recipeId);
  if (!r) return { ok: false as const, note: "Recept neexistuje." };
  const m = scaleMacros(recipePerServing(r, ingredients), v.servings);
  let mealId = v.mealId;
  if (mealId) {
    const meal = await db.query.plannedMeals.findFirst({ where: eq(schema.plannedMeals.id, mealId) });
    if (!meal || meal.status === "eaten") return { ok: false as const, note: "Jídlo už je snědené." };
    await db.update(schema.plannedMeals).set({ recipeId: r.id, servings: v.servings, fromPrep: false, locked: true, note: "z lednice", kcal: m.kcal, protein: m.protein, carbs: m.carbs, fat: m.fat, fiber: m.fiber }).where(eq(schema.plannedMeals.id, mealId));
  } else {
    mealId = await insertMeal(v.date, v.slot, { recipeId: r.id, servings: v.servings, fromPrep: false, macros: m });
  }
  let note: string | null = null;
  if (v.eatNow) note = (await markMeal(mealId, "eaten")).note;
  await audit("fridge_idea_used", { recipe: r.id, eatNow: v.eatNow });
  revalidatePath("/", "layout");
  return { ok: true as const, note };
}

const LeftoverInput = z.object({ date: DateStr, slot: Slot, mealId: z.number().int().nullable(), recipeId: z.string().min(1).max(80) });

/** Eat a cooked portion from the fridge for this slot (consumes the portion, not raw stock). */
export async function eatLeftover(input: z.input<typeof LeftoverInput>) {
  await requireOwner();
  const v = LeftoverInput.parse(input);
  const { recipeMap, ingredients } = await getCatalog();
  const r = recipeMap.get(v.recipeId);
  if (!r) return { ok: false as const, note: "Recept neexistuje." };
  const m = recipePerServing(r, ingredients);
  let mealId = v.mealId;
  if (mealId) {
    const meal = await db.query.plannedMeals.findFirst({ where: eq(schema.plannedMeals.id, mealId) });
    if (!meal || meal.status === "eaten") return { ok: false as const, note: "Jídlo už je snědené." };
    await db.update(schema.plannedMeals).set({ recipeId: r.id, servings: 1, fromPrep: true, locked: true, kcal: m.kcal, protein: m.protein, carbs: m.carbs, fat: m.fat, fiber: m.fiber }).where(eq(schema.plannedMeals.id, mealId));
  } else {
    mealId = await insertMeal(v.date, v.slot, { recipeId: r.id, servings: 1, fromPrep: true, macros: m });
  }
  const res = await markMeal(mealId, "eaten");
  revalidatePath("/", "layout");
  return { ok: true as const, note: res.note };
}

/** Replace every remaining planned meal of the day that can't be served (or all, if `all`) with the best fridge recipes. */
export async function rebuildDayFromFridge(dateIn?: string, all = false) {
  await requireOwner();
  const date = DateStr.parse(dateIn ?? todayISO());
  const ctx = await context(date);
  // Only meals still ahead (today: not more than ~1 h in the past) — don't rewrite a breakfast you just forgot to tick.
  const from = date === todayISO() ? shiftHHMM(nowHHMM(), -60) : "00:00";
  const target = ctx.slots.filter((s) => s.mealId && s.time >= from && (all || s.prepMissing || !s.plannedName));
  if (!target.length) return { changed: [] as string[], unfilled: [] as string[] };
  const picks = planDayFromFridge(
    {
      today: todayISO(),
      proteinTarget: ctx.proteinTarget,
      recipes: ctx.catalog.recipes,
      ingredients: ctx.catalog.ingredients,
      lots: lotsForDomain(ctx.lots),
      allergens: ctx.profile.allergens,
      dislikes: ctx.profile.dislikes,
      dietTags: ctx.profile.dietTags,
      recentRecipeIds: ctx.recentRecipeIds,
    },
    target.map((s) => ({ slot: s.slot, kcalTarget: s.kcalTarget })),
  );
  const changed: string[] = [];
  const unfilled: string[] = [];
  for (const p of picks) {
    const s = target.find((t) => t.slot === p.slot)!;
    if (!p.idea) {
      unfilled.push(s.label);
      continue;
    }
    const r = ctx.catalog.recipeMap.get(p.idea.recipeId)!;
    const m = scaleMacros(recipePerServing(r, ctx.catalog.ingredients), p.idea.servings);
    await db.update(schema.plannedMeals).set({ recipeId: r.id, servings: p.idea.servings, fromPrep: false, locked: true, note: "z lednice", kcal: m.kcal, protein: m.protein, carbs: m.carbs, fat: m.fat, fiber: m.fiber }).where(eq(schema.plannedMeals.id, s.mealId!));
    changed.push(`${s.label}: ${r.name}`);
  }
  await audit("day_from_fridge", { date, changed: changed.length });
  revalidatePath("/", "layout");
  return { changed, unfilled };
}

function shiftHHMM(t: string, min: number) {
  const [h, m] = t.split(":").map(Number);
  const v = Math.max(0, Math.min(23 * 60 + 59, h * 60 + m + min));
  return `${String(Math.floor(v / 60)).padStart(2, "0")}:${String(v % 60).padStart(2, "0")}`;
}

async function insertMeal(date: string, slot: MealSlot, p: { recipeId: string; servings: number; fromPrep: boolean; macros: { kcal: number; protein: number; carbs: number; fat: number; fiber: number } }) {
  const ws = weekStart(date);
  let plan = await db.query.mealPlans.findFirst({ where: eq(schema.mealPlans.weekStart, ws) });
  if (!plan) [plan] = await db.insert(schema.mealPlans).values({ weekStart: ws, status: "generated" }).returning();
  const profile = await getProfile();
  const time = profile.slots.find((s) => s.slot === slot)?.time ?? "12:00";
  const [row] = await db
    .insert(schema.plannedMeals)
    .values({ planId: plan.id, date, slot, time, recipeId: p.recipeId, servings: p.servings, fromPrep: p.fromPrep, locked: true, note: "z lednice", kcal: p.macros.kcal, protein: p.macros.protein, carbs: p.macros.carbs, fat: p.macros.fat, fiber: p.macros.fiber })
    .returning({ id: schema.plannedMeals.id });
  return row.id;
}

/** Today's meals planned from a prep box whose portions are not in the fridge (for the Today banner). */
export async function prepGap(dateIn?: string) {
  await requireOwner();
  const date = DateStr.parse(dateIn ?? todayISO());
  const ctx = await context(date);
  return { missing: ctx.slots.filter((s) => s.prepMissing).map((s) => ({ slot: s.slot, label: s.label, name: s.plannedName })), prepPending: ctx.prepPending };
}

export type { FridgeIdea, Leftover };
