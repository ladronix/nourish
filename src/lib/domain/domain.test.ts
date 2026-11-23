import { describe, it, expect } from "vitest";
import { computeTargets, bmrMifflin } from "./nutrition";
import { trendSeries, estimateTdee } from "./trend";
import { shoppingDiff } from "./shopping";
import { generatePlan, swapCandidates } from "./planner";
import { scheduleSteps } from "./prep";
import { weekStart, addDays } from "./dates";
import type { IngredientLite, RecipeLite } from "./catalog";

const ing = (p: Partial<IngredientLite> & { id: string }): IngredientLite => ({
  name: p.id,
  category: "ostatni",
  unit: "g",
  gramsPerPiece: null,
  packSize: null,
  priceCzkPerPack: null,
  kcal: 100,
  protein: 5,
  carbs: 10,
  fat: 3,
  fiber: 1,
  allergens: [],
  plant: 0,
  shelfDays: {},
  defaultLocation: "fridge",
  isStaple: false,
  minStock: null,
  emoji: "",
  ...p,
});

const INGS = new Map(
  [
    ing({ id: "chicken", kcal: 110, protein: 23, carbs: 0, fat: 1.5 }),
    ing({ id: "rice", kcal: 350, protein: 7, carbs: 78, fat: 1, packSize: 1000, priceCzkPerPack: 50 }),
    ing({ id: "salmon", kcal: 200, protein: 20, carbs: 0, fat: 13, allergens: ["fish"] }),
    ing({ id: "oats", kcal: 380, protein: 13, carbs: 60, fat: 7, allergens: ["gluten"], plant: 1 }),
    ing({ id: "yogurt", kcal: 95, protein: 9, carbs: 4, fat: 5, allergens: ["milk"] }),
    ing({ id: "egg", unit: "ks", gramsPerPiece: 55, kcal: 143, protein: 12.6, carbs: 0.7, fat: 9.5, allergens: ["eggs"] }),
    ing({ id: "spinach", kcal: 23, protein: 2.9, carbs: 3.6, fat: 0.4, fiber: 2.2, plant: 1 }),
    ing({ id: "oil", kcal: 884, protein: 0, carbs: 0, fat: 100, isStaple: true }),
    ing({ id: "lentils", kcal: 350, protein: 24, carbs: 50, fat: 1.5, fiber: 11, plant: 1, defaultLocation: "pantry" }),
  ].map((i) => [i.id, i]),
);

const R = (p: Partial<RecipeLite> & { id: string; items: RecipeLite["items"] }): RecipeLite => ({
  name: p.id,
  mealTypes: ["lunch", "dinner"],
  servings: 1,
  prepMin: 5,
  cookMin: 10,
  batchable: false,
  fridgeDays: 3,
  freezerOk: false,
  tags: [],
  emoji: "",
  ...p,
});

const RECIPES: RecipeLite[] = [
  R({ id: "porridge", mealTypes: ["breakfast"], items: [{ ingredientId: "oats", qty: 80 }, { ingredientId: "yogurt", qty: 150 }] }),
  R({ id: "eggs", mealTypes: ["breakfast", "snack"], items: [{ ingredientId: "egg", qty: 3 }, { ingredientId: "spinach", qty: 60 }] }),
  R({ id: "chicken-rice", servings: 4, batchable: true, fridgeDays: 4, items: [{ ingredientId: "chicken", qty: 800 }, { ingredientId: "rice", qty: 320 }, { ingredientId: "oil", qty: 20 }] }),
  R({ id: "dal", servings: 4, batchable: true, fridgeDays: 5, freezerOk: true, tags: ["vegetarian"], items: [{ ingredientId: "lentils", qty: 300 }, { ingredientId: "spinach", qty: 200 }] }),
  R({ id: "salmon-plate", mealTypes: ["dinner"], items: [{ ingredientId: "salmon", qty: 180 }, { ingredientId: "rice", qty: 80 }, { ingredientId: "spinach", qty: 80 }] }),
  R({ id: "yogurt-bowl", mealTypes: ["snack"], items: [{ ingredientId: "yogurt", qty: 250 }] }),
  R({ id: "chicken-salad", mealTypes: ["dinner"], items: [{ ingredientId: "chicken", qty: 180 }, { ingredientId: "spinach", qty: 100 }] }),
];

const today = "2026-11-23";
const baseInput = {
  days: Array.from({ length: 7 }, (_, i) => addDays(weekStart(today), i)),
  today,
  slots: [
    { slot: "breakfast" as const, time: "07:30", share: 0.25 },
    { slot: "lunch" as const, time: "12:30", share: 0.35 },
    { slot: "snack" as const, time: "16:00", share: 0.1 },
    { slot: "dinner" as const, time: "19:00", share: 0.3 },
  ],
  target: { kcalMin: 2000, kcalMax: 2200, proteinMin: 140, proteinMax: 180, fiberMin: 30 },
  allergens: [] as string[],
  dislikes: [] as string[],
  dietTags: [] as string[],
  maxCookMinutesWeekday: 30,
  recipes: RECIPES,
  ingredients: INGS,
  inventory: [{ ingredientId: "spinach", qty: 150, expiresOn: "2026-11-24", kind: "raw" as const }],
  locked: [],
};

describe("nutrition targets", () => {
  it("computes Mifflin BMR", () => {
    expect(Math.round(bmrMifflin("male", 80, 180, 35))).toBe(1755);
  });
  it("returns ranges and clamps aggressive loss", () => {
    const t = computeTargets({ sex: "male", age: 35, heightCm: 180, weightKg: 80, activity: "moderate", goal: "lose", goalRateKgWeek: 2, proteinGPerKg: 1.8 });
    expect(t.kcalMax - t.kcalMin).toBe(200);
    expect(t.warnings.join(" ")).toMatch(/omezeno/);
    expect(t.proteinMin).toBeGreaterThan(100);
  });
  it("forces maintenance with safety flags", () => {
    const t = computeTargets({ sex: "female", age: 30, heightCm: 168, weightKg: 62, activity: "light", goal: "lose", goalRateKgWeek: 0.5, proteinGPerKg: 1.6, safetyFlags: ["pregnant"] });
    expect(t.consultProfessional).toBe(true);
    expect(t.source.dailyDelta).toBe(0);
  });
});

describe("trend + adaptive TDEE", () => {
  it("smooths noise", () => {
    const s = trendSeries([
      { date: "2026-11-01", kg: 80 },
      { date: "2026-11-02", kg: 81.5 },
      { date: "2026-11-03", kg: 79.5 },
    ]);
    expect(s[2].trend).toBeGreaterThan(79.6);
    expect(s[2].trend).toBeLessThan(80.5);
  });
  it("estimates higher TDEE when weight stays flat on higher intake", () => {
    const weighIns = Array.from({ length: 21 }, (_, i) => ({ date: addDays("2026-11-01", i), kg: 80 + (i % 2 ? 0.2 : -0.2) }));
    const intake = Array.from({ length: 21 }, (_, i) => ({ date: addDays("2026-11-01", i), kcal: 2800, logged: true }));
    const e = estimateTdee({ weighIns, intake, prior: 2500, today: "2026-11-21" });
    expect(e.tdee).toBeGreaterThan(2500);
    expect(e.tdee).toBeLessThanOrEqual(2500 + 525);
  });
  it("holds when data missing", () => {
    const e = estimateTdee({ weighIns: [], intake: [], prior: 2400, today });
    expect(e.tdee).toBe(2400);
    expect(e.confidence).toBe("low");
  });
});

describe("shopping diff", () => {
  it("subtracts stock, skips staples, rounds to packs", () => {
    const r = shoppingDiff({
      needs: [
        { ingredientId: "rice", qty: 400, neededOn: today },
        { ingredientId: "rice", qty: 200, neededOn: today },
        { ingredientId: "oil", qty: 20, neededOn: today },
        { ingredientId: "spinach", qty: 100, neededOn: today },
      ],
      stock: [
        { ingredientId: "rice", qty: 250, unit: "g", expiresOn: null, kind: "raw" },
        { ingredientId: "spinach", qty: 200, unit: "g", expiresOn: "2026-12-01", kind: "raw" },
      ],
      ingredients: INGS,
    });
    const rice = r.lines.find((l) => l.ingredientId === "rice")!;
    expect(rice.required).toBe(600);
    expect(rice.available).toBe(250);
    expect(rice.missing).toBe(350);
    expect(rice.buy).toBe(1000);
    expect(rice.estPriceCzk).toBe(50);
    expect(r.staplesSkipped).toContain("oil");
    expect(r.coveredByStock).toContain("spinach");
  });
  it("ignores stock that expires before it is needed", () => {
    const r = shoppingDiff({
      needs: [{ ingredientId: "spinach", qty: 100, neededOn: "2026-11-28" }],
      stock: [{ ingredientId: "spinach", qty: 200, unit: "g", expiresOn: "2026-11-25", kind: "raw" }],
      ingredients: INGS,
    });
    expect(r.lines[0].missing).toBe(100);
  });
});

describe("planner", () => {
  it("never plans allergens", () => {
    const p = generatePlan({ ...baseInput, allergens: ["fish", "gluten"] });
    const ids = new Set(p.meals.map((m) => m.recipeId));
    expect(ids.has("salmon-plate")).toBe(false);
    expect(ids.has("porridge")).toBe(false);
    expect(p.meals.length).toBeGreaterThan(20);
  });
  it("batches weekday lunches", () => {
    const p = generatePlan(baseInput);
    expect(p.batch.length).toBeGreaterThan(0);
    const weekdayLunches = p.meals.filter((m) => m.slot === "lunch" && m.fromPrep);
    expect(weekdayLunches.length).toBe(5);
  });
  it("keeps days near the kcal range", () => {
    const p = generatePlan(baseInput);
    const days = new Map<string, number>();
    for (const m of p.meals) days.set(m.date, (days.get(m.date) ?? 0) + m.macros.kcal);
    for (const k of days.values()) {
      expect(k).toBeGreaterThan(1500);
      expect(k).toBeLessThan(2900);
    }
  });
  it("is deterministic per seed", () => {
    const a = generatePlan({ ...baseInput, seed: 3 });
    const b = generatePlan({ ...baseInput, seed: 3 });
    expect(a.meals.map((m) => m.recipeId)).toEqual(b.meals.map((m) => m.recipeId));
  });
  it("offers swap candidates for the slot", () => {
    const c = swapCandidates(baseInput, baseInput.days[0], baseInput.slots[3], "salmon-plate", 600);
    expect(c.every((x) => x.recipe.mealTypes.includes("dinner"))).toBe(true);
    expect(c.find((x) => x.recipe.id === "salmon-plate")).toBeUndefined();
  });
});

describe("prep scheduling", () => {
  it("overlaps passive steps", () => {
    const s = scheduleSteps([
      { id: "a", name: "A", servings: 3, scale: 1, steps: [{ text: "Nakrájej", timerMin: 10 }, { text: "Peč v troubě", timerMin: 40 }] },
      { id: "b", name: "B", servings: 3, scale: 1, steps: [{ text: "Nakrájej", timerMin: 10 }, { text: "Vař rýži", timerMin: 20 }] },
    ]);
    expect(s.totalMin).toBeLessThan(80 + 8);
  });
});
