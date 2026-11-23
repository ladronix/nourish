/**
 * Deterministic weekly planner.
 *
 * Constraints (hard): allergens, disliked ingredients, diet tags, meal type per slot.
 * Objectives (soft, scored): use expiring inventory first, protein per meal, variety,
 * weekday cooking time, favourites, seasonal produce, plant diversity, budget.
 * Batch cooking: lunches are covered by 1–2 batchable recipes cooked on the prep day.
 * Portions are then scaled so each day lands inside the kcal range.
 */
import type { IngredientLite, MealSlot, RecipeLite } from "./catalog";
import { recipePerServing, recipeAllergens, recipeCostPerServing, toGrams } from "./catalog";
import type { Macros } from "./nutrition";
import { addMacros, ZERO, scaleMacros } from "./nutrition";
import { diffDays, weekday } from "./dates";

export type SlotSpec = { slot: MealSlot; time: string; share: number };

export type PlanInput = {
  days: string[];
  today: string;
  slots: SlotSpec[];
  target: { kcalMin: number; kcalMax: number; proteinMin: number; proteinMax: number; fiberMin: number };
  allergens: string[];
  dislikes: string[]; // ingredient ids
  dietTags: string[]; // e.g. "vegetarian" → recipe must carry the tag
  maxCookMinutesWeekday: number;
  recipes: RecipeLite[];
  ingredients: Map<string, IngredientLite>;
  inventory: { ingredientId: string | null; qty: number; expiresOn: string | null; kind: "raw" | "portion"; recipeId?: string | null }[];
  locked: { date: string; slot: MealSlot; recipeId: string | null; servings: number }[];
  budgetWeekCzk?: number | null;
  seed?: number;
  /** Emphasis for alternative weeks: quick = less cooking, cheap = lower cost, protein = more protein, fresh = other recipes than `avoid`. */
  style?: PlanStyle;
  /** Recipe ids to steer away from (the current plan) when proposing an alternative. */
  avoid?: string[];
  /** Days to leave free (eating out). */
  freeSlots?: { date: string; slot: MealSlot }[];
};

export type PlanStyle = "balanced" | "quick" | "cheap" | "protein" | "fresh";

export type PlannedMealOut = {
  date: string;
  slot: MealSlot;
  time: string;
  recipeId: string | null;
  servings: number;
  fromPrep: boolean;
  locked: boolean;
  macros: Macros;
  note?: string;
};

export type PlanOutput = {
  meals: PlannedMealOut[];
  batch: { recipeId: string; servings: number }[];
  explanation: {
    notes: string[];
    usedFromInventory: string[];
    uncovered: string[];
    avgKcal: number;
    avgProtein: number;
    plantPoints: number;
    estCostCzk: number;
    cookMinutes: number;
  };
};

function hash(str: string, seed: number) {
  let h = 2166136261 ^ seed;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 1000) / 1000;
}

export function eligibleRecipes(input: Pick<PlanInput, "recipes" | "ingredients" | "allergens" | "dislikes" | "dietTags">) {
  const allergenSet = new Set(input.allergens);
  const dislikeSet = new Set(input.dislikes);
  return input.recipes.filter((r) => {
    if (r.archived) return false;
    for (const a of recipeAllergens(r, input.ingredients)) if (allergenSet.has(a)) return false;
    if (r.items.some((i) => dislikeSet.has(i.ingredientId) && !i.optional)) return false;
    if (r.items.some((i) => !input.ingredients.has(i.ingredientId))) return false;
    for (const t of input.dietTags) if (!r.tags.includes(t)) return false;
    return true;
  });
}

type Ctx = {
  input: PlanInput;
  stock: Map<string, { qty: number; urgency: number }>;
  usedCount: Map<string, number>;
  lastUsed: Map<string, string>;
  plantsUsed: Set<string>;
  perServing: Map<string, Macros>;
  cost: Map<string, number>;
  month: number;
};

function makeCtx(input: PlanInput): Ctx {
  const stock = new Map<string, { qty: number; urgency: number }>();
  for (const l of input.inventory) {
    if (l.kind !== "raw" || !l.ingredientId) continue;
    const days = l.expiresOn ? diffDays(l.expiresOn, input.today) : 60;
    const urgency = days <= 1 ? 4 : days <= 3 ? 2.5 : days <= 6 ? 1.2 : 0.4;
    const cur = stock.get(l.ingredientId);
    if (cur) {
      cur.qty += l.qty;
      cur.urgency = Math.max(cur.urgency, urgency);
    } else stock.set(l.ingredientId, { qty: l.qty, urgency });
  }
  const perServing = new Map<string, Macros>();
  const cost = new Map<string, number>();
  for (const r of input.recipes) {
    perServing.set(r.id, recipePerServing(r, input.ingredients));
    cost.set(r.id, recipeCostPerServing(r, input.ingredients));
  }
  return { input, stock, usedCount: new Map(), lastUsed: new Map(), plantsUsed: new Set(), perServing, cost, month: Number(input.today.slice(5, 7)) };
}

export function scoreRecipe(ctx: Ctx, r: RecipeLite, date: string, slot: SlotSpec, servings = 1): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  let score = 0;
  const m = ctx.perServing.get(r.id)!;
  const { input } = ctx;
  // inventory usage
  let inv = 0;
  for (const it of r.items) {
    const s = ctx.stock.get(it.ingredientId);
    if (s && s.qty > 0) {
      const ing = input.ingredients.get(it.ingredientId)!;
      if (ing.isStaple) continue;
      const share = Math.min(1, s.qty / ((it.qty / r.servings) * servings));
      inv += s.urgency * share;
    }
  }
  if (inv > 0) {
    score += inv * 1.6;
    if (inv > 2) reasons.push("využije zásoby, které brzy expirují");
  }
  // protein per meal (target ≈ dailyProteinMid × slot share, at least 25 g for main meals)
  const proteinGoal = ((input.target.proteinMin + input.target.proteinMax) / 2) * slot.share;
  const pr = m.protein * servings;
  score += Math.max(-2, Math.min(2, (pr - proteinGoal * 0.8) / 10)) * (input.style === "protein" ? 2.2 : 1);
  // fibre
  score += Math.min(1.2, (m.fiber * servings) / 8);
  // variety
  const used = ctx.usedCount.get(r.id) ?? 0;
  score -= used * 2.2;
  const last = ctx.lastUsed.get(r.id);
  if (last && Math.abs(diffDays(date, last)) <= 1) score -= 4;
  // cooking time on weekdays
  const wd = weekday(date);
  const total = r.prepMin + r.cookMin;
  if (wd >= 1 && wd <= 5 && total > input.maxCookMinutesWeekday) score -= (total - input.maxCookMinutesWeekday) / 8;
  // favourites
  if (r.favorite) {
    score += 1.2;
    reasons.push("oblíbené");
  }
  // season & plants
  let newPlants = 0;
  for (const it of r.items) {
    const ing = input.ingredients.get(it.ingredientId)!;
    if (ing.seasonMonths?.includes(ctx.month)) score += 0.25;
    if (ing.plant > 0 && !ctx.plantsUsed.has(ing.id)) newPlants += ing.plant;
  }
  score += Math.min(1.5, newPlants * 0.25);
  // budget
  if (input.budgetWeekCzk) {
    const perMealBudget = input.budgetWeekCzk / (input.days.length * input.slots.length);
    const c = (ctx.cost.get(r.id) ?? 0) * servings;
    if (c > perMealBudget) score -= (c - perMealBudget) / perMealBudget;
  }
  // alternative-week emphasis
  if (input.style === "quick") score -= total / 15;
  if (input.style === "cheap") score -= ((ctx.cost.get(r.id) ?? 0) * servings) / 12;
  if (input.avoid?.includes(r.id)) score -= input.style === "fresh" ? 3.5 : 1.2;
  score += hash(r.id + date + slot.slot, input.seed ?? 0) * (input.style === "fresh" ? 2.5 : 1.5);
  return { score, reasons };
}

function consume(ctx: Ctx, r: RecipeLite, servings: number, date: string) {
  ctx.usedCount.set(r.id, (ctx.usedCount.get(r.id) ?? 0) + 1);
  ctx.lastUsed.set(r.id, date);
  for (const it of r.items) {
    const s = ctx.stock.get(it.ingredientId);
    if (s) s.qty = Math.max(0, s.qty - (it.qty / r.servings) * servings);
    const ing = ctx.input.ingredients.get(it.ingredientId);
    if (ing && ing.plant > 0) ctx.plantsUsed.add(ing.id);
  }
}

export function generatePlan(input: PlanInput): PlanOutput {
  const ctx = makeCtx(input);
  const pool = eligibleRecipes(input);
  const notes: string[] = [];
  const meals: PlannedMealOut[] = [];
  const free = new Set((input.freeSlots ?? []).map((f) => f.date + f.slot));
  const lockedMap = new Map(input.locked.map((l) => [l.date + l.slot, l]));

  if (pool.length === 0) {
    return {
      meals: [],
      batch: [],
      explanation: { notes: ["Žádný recept nesplňuje tvoje omezení (alergeny / zákazy). Přidej recepty nebo uprav profil."], usedFromInventory: [], uncovered: [], avgKcal: 0, avgProtein: 0, plantPoints: 0, estCostCzk: 0, cookMinutes: 0 },
    };
  }

  // ── Batch lunches: weekdays get portions from 1–2 batch recipes cooked on prep day.
  const lunchSlot = input.slots.find((s) => s.slot === "lunch");
  const weekdayDates = input.days.filter((d) => {
    const w = weekday(d);
    return w >= 1 && w <= 5 && !lockedMap.has(d + "lunch") && !free.has(d + "lunch");
  });
  const batch: { recipeId: string; servings: number }[] = [];
  const batchByDate = new Map<string, string>();
  if (lunchSlot && weekdayDates.length >= 2) {
    const batchables = pool.filter((r) => r.batchable && r.mealTypes.includes("lunch"));
    const ranked = batchables
      .map((r) => ({ r, s: scoreRecipe(ctx, r, weekdayDates[0], lunchSlot, 3).score }))
      .sort((a, b) => b.s - a.s);
    if (ranked.length) {
      const a = ranked[0].r;
      const aDays = weekdayDates.slice(0, Math.min(3, a.fridgeDays));
      aDays.forEach((d) => batchByDate.set(d, a.id));
      batch.push({ recipeId: a.id, servings: aDays.length });
      consume(ctx, a, aDays.length, aDays[0]);
      const rest = weekdayDates.filter((d) => !batchByDate.has(d));
      const keeps = ranked.find((x) => x.r.id !== a.id && (x.r.fridgeDays >= 5 || x.r.freezerOk))?.r;
      const b = keeps ?? ranked.find((x) => x.r.id !== a.id)?.r;
      if (rest.length && b) {
        rest.forEach((d) => batchByDate.set(d, b.id));
        batch.push({ recipeId: b.id, servings: rest.length });
        consume(ctx, b, rest.length, rest[0]);
        if (!keeps) notes.push(`${b.name}: kvůli trvanlivosti uvař ve středu večer (${rest.length} porce na konec týdne).`);
        else if (b.fridgeDays < 5) notes.push(`${b.name}: porce na konec týdne dej po uvaření do mrazáku a večer předem přendej do lednice.`);
      }
      notes.push(`Meal prep: ${batch.map((x) => `${pool.find((r) => r.id === x.recipeId)!.name} (${x.servings} porce)`).join(" + ")} pokryje obědy ve všední dny.`);
    }
  }

  // ── Fill every day slot by slot.
  for (const date of input.days) {
    const dayMeals: PlannedMealOut[] = [];
    for (const slot of input.slots) {
      const key = date + slot.slot;
      const lk = lockedMap.get(key);
      if (lk) {
        const r = input.recipes.find((x) => x.id === lk.recipeId);
        dayMeals.push({ date, slot: slot.slot, time: slot.time, recipeId: lk.recipeId, servings: lk.servings, fromPrep: false, locked: true, macros: r ? scaleMacros(ctx.perServing.get(r.id)!, lk.servings) : ZERO });
        if (r) consume(ctx, r, lk.servings, date);
        continue;
      }
      if (free.has(key)) {
        dayMeals.push({ date, slot: slot.slot, time: slot.time, recipeId: null, servings: 0, fromPrep: false, locked: true, macros: ZERO, note: "Volné jídlo / venku" });
        continue;
      }
      const bId = slot.slot === "lunch" ? batchByDate.get(date) : undefined;
      if (bId) {
        dayMeals.push({ date, slot: slot.slot, time: slot.time, recipeId: bId, servings: 1, fromPrep: true, locked: false, macros: ctx.perServing.get(bId)! });
        continue;
      }
      const candidates = pool.filter((r) => r.mealTypes.includes(slot.slot) && !(r.batchable && batch.some((b) => b.recipeId === r.id)));
      if (!candidates.length) continue;
      const best = candidates.map((r) => ({ r, ...scoreRecipe(ctx, r, date, slot) })).sort((a, b) => b.score - a.score)[0];
      consume(ctx, best.r, 1, date);
      dayMeals.push({ date, slot: slot.slot, time: slot.time, recipeId: best.r.id, servings: 1, fromPrep: false, locked: false, macros: ctx.perServing.get(best.r.id)! });
    }
    fitDay(dayMeals, input, ctx);
    meals.push(...dayMeals);
  }

  // ── Explanation
  const totals = new Map<string, Macros>();
  for (const m of meals) totals.set(m.date, addMacros(totals.get(m.date) ?? ZERO, m.macros));
  const dayVals = [...totals.values()];
  const avgKcal = Math.round(dayVals.reduce((a, d) => a + d.kcal, 0) / Math.max(1, dayVals.length));
  const avgProtein = Math.round(dayVals.reduce((a, d) => a + d.protein, 0) / Math.max(1, dayVals.length));
  const lowProteinDays = [...totals.entries()].filter(([, m]) => m.protein < input.target.proteinMin * 0.95).length;
  if (lowProteinDays) notes.push(`${lowProteinDays} ${lowProteinDays === 1 ? "den má" : "dny mají"} méně bílkovin než cíl — zvaž skyr nebo tvaroh ke svačině.`);

  const usedFromInventory: string[] = [];
  for (const [id, s] of ctx.stock) {
    const orig = input.inventory.filter((l) => l.ingredientId === id && l.kind === "raw").reduce((a, l) => a + l.qty, 0);
    if (orig - s.qty > 0.01) usedFromInventory.push(input.ingredients.get(id)?.name ?? id);
  }
  const uncovered = [...ctx.stock.entries()].filter(([, s]) => s.urgency >= 2.5 && s.qty > 0).map(([id]) => input.ingredients.get(id)?.name ?? id);
  if (uncovered.length) notes.push(`Brzy expiruje a v plánu není: ${uncovered.join(", ")}.`);

  const plantPoints = [...ctx.plantsUsed].reduce((a, id) => a + (input.ingredients.get(id)?.plant ?? 0), 0);
  const estCostCzk = Math.round(meals.reduce((a, m) => a + (m.recipeId && !m.fromPrep ? (ctx.cost.get(m.recipeId) ?? 0) * m.servings : 0), 0) + batch.reduce((a, b) => a + (ctx.cost.get(b.recipeId) ?? 0) * b.servings, 0));
  const cookMinutes =
    meals.filter((m) => m.recipeId && !m.fromPrep).reduce((a, m) => {
      const r = input.recipes.find((x) => x.id === m.recipeId)!;
      return a + r.prepMin + r.cookMin;
    }, 0) + batch.reduce((a, b) => {
      const r = input.recipes.find((x) => x.id === b.recipeId)!;
      return a + r.prepMin + r.cookMin;
    }, 0);
  if (input.budgetWeekCzk && estCostCzk > input.budgetWeekCzk) notes.push(`Odhad nákladů ${estCostCzk} Kč je nad rozpočtem ${input.budgetWeekCzk} Kč.`);

  return { meals, batch, explanation: { notes, usedFromInventory, uncovered, avgKcal, avgProtein, plantPoints: Math.round(plantPoints * 4) / 4, estCostCzk, cookMinutes } };
}

/** Scale flexible portions so the day lands in the kcal range (0.5–2.0 servings, 0.25 steps). */
function fitDay(dayMeals: PlannedMealOut[], input: PlanInput, ctx: Ctx) {
  const mid = (input.target.kcalMin + input.target.kcalMax) / 2;
  for (let iter = 0; iter < 3; iter++) {
    const total = dayMeals.reduce((a, m) => a + m.macros.kcal, 0);
    if (total >= input.target.kcalMin && total <= input.target.kcalMax) return;
    const flex = dayMeals.filter((m) => !m.locked && !m.fromPrep && m.recipeId);
    const flexKcal = flex.reduce((a, m) => a + m.macros.kcal, 0);
    if (!flexKcal) return;
    const fixed = total - flexKcal;
    const k = (mid - fixed) / flexKcal;
    for (const m of flex) {
      const s = Math.min(2, Math.max(0.5, Math.round(m.servings * k * 4) / 4));
      m.servings = s;
      m.macros = scaleMacros(ctx.perServing.get(m.recipeId!)!, s);
    }
  }
}

/** Ranked alternatives for one slot (used by "swap"). */
export function swapCandidates(input: PlanInput, date: string, slot: SlotSpec, currentRecipeId: string | null, currentKcal: number, limit = 6) {
  const ctx = makeCtx(input);
  const pool = eligibleRecipes(input).filter((r) => r.mealTypes.includes(slot.slot) && r.id !== currentRecipeId);
  return pool
    .map((r) => {
      const per = ctx.perServing.get(r.id)!;
      const servings = per.kcal > 0 && currentKcal > 0 ? Math.min(2, Math.max(0.5, Math.round((currentKcal / per.kcal) * 4) / 4)) : 1;
      const { score, reasons } = scoreRecipe(ctx, r, date, slot, servings);
      return { recipe: r, servings, macros: scaleMacros(per, servings), score, reasons, totalMin: r.prepMin + r.cookMin };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/** Ingredient needs (in ingredient units) for a set of planned meals + batch cooking. */
export function needsFromPlan(
  meals: { date: string; recipeId: string | null; servings: number; fromPrep: boolean; status?: string }[],
  batch: { recipeId: string; servings: number; date: string }[],
  recipes: Map<string, RecipeLite>,
) {
  const needs: { ingredientId: string; qty: number; neededOn: string }[] = [];
  const add = (r: RecipeLite, servings: number, date: string) => {
    for (const it of r.items) if (!it.optional) needs.push({ ingredientId: it.ingredientId, qty: (it.qty / r.servings) * servings, neededOn: date });
  };
  for (const m of meals) {
    if (!m.recipeId || m.fromPrep || (m.status && m.status !== "planned")) continue;
    const r = recipes.get(m.recipeId);
    if (r) add(r, m.servings, m.date);
  }
  for (const b of batch) {
    const r = recipes.get(b.recipeId);
    if (r) add(r, b.servings, b.date);
  }
  return needs;
}

/** Plant points (30-a-week idea): distinct plants eaten, herbs/spices count ¼. */
export function plantPoints(recipeIds: string[], recipes: Map<string, RecipeLite>, ingredients: Map<string, IngredientLite>) {
  const seen = new Set<string>();
  for (const id of recipeIds) for (const it of recipes.get(id)?.items ?? []) if ((ingredients.get(it.ingredientId)?.plant ?? 0) > 0) seen.add(it.ingredientId);
  return [...seen].reduce((a, id) => a + (ingredients.get(id)?.plant ?? 0), 0);
}

export { toGrams };
