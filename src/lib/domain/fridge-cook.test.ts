import { describe, it, expect } from "vitest";
import { fridgeIdeas, leftovers, matchIngredientByName, planDayFromFridge, buildStock, groundIdea, parseAmount, type StockLot } from "./fridge-cook";
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
    ing({ id: "kureci-prsa", name: "Kuřecí prsa", category: "maso", kcal: 110, protein: 23, carbs: 0, fat: 1.5 }),
    ing({ id: "kruti-prsa", name: "Krůtí prsa", category: "maso", kcal: 105, protein: 24, carbs: 0, fat: 1 }),
    ing({ id: "ryze-basmati", name: "Rýže basmati", kcal: 350, protein: 7, carbs: 78, fat: 1 }),
    ing({ id: "spenat", name: "Baby špenát", category: "zelenina", kcal: 23, protein: 3, plant: 1 }),
    ing({ id: "rajcata", name: "Cherry rajčata", category: "zelenina", kcal: 18, protein: 1, plant: 1 }),
    ing({ id: "vejce", name: "Vejce M", unit: "ks", gramsPerPiece: 55, kcal: 143, protein: 12.6, allergens: ["eggs"] }),
    ing({ id: "losos", name: "Losos filet", kcal: 200, protein: 20, fat: 13, allergens: ["fish"] }),
    ing({ id: "olivovy-olej", name: "Olivový olej", kcal: 884, protein: 0, isStaple: true }),
    ing({ id: "tvaroh", name: "Tvaroh polotučný", kcal: 100, protein: 13, allergens: ["milk"] }),
  ].map((i) => [i.id, i]),
);

const rec = (p: Partial<RecipeLite> & { id: string; items: RecipeLite["items"] }): RecipeLite => ({
  name: p.id,
  mealTypes: ["lunch", "dinner"],
  servings: 2,
  prepMin: 10,
  cookMin: 15,
  batchable: false,
  fridgeDays: 3,
  freezerOk: false,
  tags: [],
  emoji: "🍽",
  ...p,
});

const RECIPES = [
  rec({ id: "kure-ryze", name: "Kuře s rýží a špenátem", items: [{ ingredientId: "kureci-prsa", qty: 300 }, { ingredientId: "ryze-basmati", qty: 150 }, { ingredientId: "spenat", qty: 100 }, { ingredientId: "olivovy-olej", qty: 10 }] }),
  rec({ id: "omeleta", name: "Omeleta se špenátem", prepMin: 5, cookMin: 7, mealTypes: ["breakfast", "dinner"], items: [{ ingredientId: "vejce", qty: 6 }, { ingredientId: "spenat", qty: 100 }, { ingredientId: "rajcata", qty: 100, optional: true }] }),
  rec({ id: "losos-ryze", name: "Losos s rýží", items: [{ ingredientId: "losos", qty: 300 }, { ingredientId: "ryze-basmati", qty: 150 }] }),
];

const TODAY = "2026-11-25";
const lot = (p: Partial<StockLot> & { name: string; qty: number }): StockLot => ({ id: Math.floor(Math.random() * 1e6), ingredientId: null, kind: "raw", unit: "g", expiresOn: null, ...p });

const base = { today: TODAY, recipes: RECIPES, ingredients: INGS, allergens: [], dislikes: [], dietTags: [], proteinTarget: 35 };

describe("fridge-cook", () => {
  it("matches free-text lots from a fridge photo to catalog ingredients", () => {
    expect(matchIngredientByName("Vejce", INGS)).toBe("vejce");
    expect(matchIngredientByName("Rajčata", INGS)).toBe("rajcata");
    expect(matchIngredientByName("Tvaroh polotučný 250 g", INGS)).toBe("tvaroh");
    expect(matchIngredientByName("Hořčice", INGS)).toBeNull();
  });

  it("builds stock in catalog units, skipping expired lots", () => {
    const s = buildStock([lot({ name: "Vejce", qty: 10, unit: "ks" }), lot({ name: "Rajčata", qty: 4, unit: "ks" }), lot({ name: "Baby špenát", qty: 200, expiresOn: "2026-11-20" })], INGS, TODAY);
    expect(s.get("vejce")?.qty).toBe(10);
    expect(s.get("rajcata")?.qty).toBe(480); // 4 pieces × 120 g default for vegetables
    expect(s.has("spenat")).toBe(false);
  });

  it("puts a recipe with everything at home first and lists what's missing for the rest", () => {
    const lots = [lot({ ingredientId: "vejce", name: "Vejce", qty: 10, unit: "ks" }), lot({ ingredientId: "spenat", name: "Špenát", qty: 150, expiresOn: "2026-11-26" }), lot({ ingredientId: "ryze-basmati", name: "Rýže", qty: 500 })];
    const ideas = fridgeIdeas({ ...base, slot: "dinner", kcalTarget: 500, lots });
    expect(ideas[0].recipeId).toBe("omeleta");
    expect(ideas[0].tier).toBe("ready");
    expect(ideas[0].usesExpiring[0]).toMatchObject({ days: 1 });
    const kure = ideas.find((i) => i.recipeId === "kure-ryze");
    expect(kure?.missing.map((m) => m.ingredientId)).toEqual(["kureci-prsa"]);
    // staples (olive oil) never count as missing
    expect(kure?.missing.some((m) => m.ingredientId === "olivovy-olej")).toBe(false);
  });

  it("a missing garnish (≤ 8 % of the dish) doesn't block 'ready'", () => {
    const lots = [lot({ ingredientId: "vejce", name: "Vejce", qty: 10, unit: "ks" }), lot({ ingredientId: "spenat", name: "Špenát", qty: 200 })];
    const r = [rec({ id: "omeleta-citron", mealTypes: ["dinner"], items: [{ ingredientId: "vejce", qty: 6 }, { ingredientId: "spenat", qty: 100 }, { ingredientId: "rajcata", qty: 20 }] })];
    const [idea] = fridgeIdeas({ ...base, recipes: r, slot: "dinner", kcalTarget: 400, lots });
    expect(idea.tier).toBe("ready");
    expect(idea.missing).toEqual([expect.objectContaining({ ingredientId: "rajcata", minor: true })]);
  });

  it("uses a substitute (turkey for chicken) instead of declaring it missing", () => {
    const lots = [lot({ ingredientId: "kruti-prsa", name: "Krůtí", qty: 400 }), lot({ ingredientId: "ryze-basmati", name: "Rýže", qty: 500 }), lot({ ingredientId: "spenat", name: "Špenát", qty: 150 })];
    const ideas = fridgeIdeas({ ...base, slot: "lunch", kcalTarget: 600, lots });
    const kure = ideas.find((i) => i.recipeId === "kure-ryze")!;
    expect(kure.tier).toBe("ready");
    expect(kure.substitutions).toEqual([{ want: "Kuřecí prsa", use: "Krůtí prsa" }]);
  });

  it("respects allergens and meal type", () => {
    const lots = [lot({ ingredientId: "losos", name: "Losos", qty: 400 }), lot({ ingredientId: "ryze-basmati", name: "Rýže", qty: 500 })];
    expect(fridgeIdeas({ ...base, slot: "lunch", kcalTarget: 600, lots, allergens: ["fish"] }).some((i) => i.recipeId === "losos-ryze")).toBe(false);
    expect(fridgeIdeas({ ...base, slot: "breakfast", kcalTarget: 400, lots }).some((i) => i.recipeId === "losos-ryze")).toBe(false);
  });

  it("drops recipes that would be mostly a shopping trip", () => {
    const lots = [lot({ ingredientId: "spenat", name: "Špenát", qty: 100 })];
    expect(fridgeIdeas({ ...base, slot: "lunch", kcalTarget: 600, lots }).some((i) => i.recipeId === "losos-ryze")).toBe(false);
  });

  it("lists cooked portions, soonest-expiring first, skipping expired ones", () => {
    const recipeMap = new Map(RECIPES.map((r) => [r.id, r]));
    const l = leftovers(
      [
        lot({ kind: "portion", recipeId: "kure-ryze", name: "Kuře s rýží (porce)", qty: 2, unit: "ks", expiresOn: "2026-11-28" }),
        lot({ kind: "portion", recipeId: "omeleta", name: "Omeleta (porce)", qty: 1, unit: "ks", expiresOn: "2026-11-26" }),
        lot({ kind: "portion", recipeId: "losos-ryze", name: "Losos (porce)", qty: 1, unit: "ks", expiresOn: "2026-11-24" }),
      ],
      recipeMap,
      INGS,
      TODAY,
    );
    expect(l.map((x) => x.recipeId)).toEqual(["omeleta", "kure-ryze"]);
    expect(l[0].days).toBe(1);
  });

  it("plans distinct meals for the rest of the day without double-counting stock", () => {
    const lots = [lot({ ingredientId: "vejce", name: "Vejce", qty: 6, unit: "ks" }), lot({ ingredientId: "spenat", name: "Špenát", qty: 120 }), lot({ ingredientId: "kureci-prsa", name: "Kuře", qty: 400 }), lot({ ingredientId: "ryze-basmati", name: "Rýže", qty: 500 })];
    const picks = planDayFromFridge({ ...base, lots }, [
      { slot: "lunch", kcalTarget: 600 },
      { slot: "dinner", kcalTarget: 500 },
    ]);
    const ids = picks.map((p) => p.idea?.recipeId);
    expect(new Set(ids).size).toBe(2);
    expect(ids).toContain("kure-ryze");
  });

  it("grounds an AI idea: macros from the catalog, fridge check by stock", () => {
    expect(parseAmount("180 g", INGS.get("kureci-prsa")!)).toBe(180);
    expect(parseAmount("2 ks", INGS.get("vejce")!)).toBe(2);
    expect(parseAmount("0,5 kg", INGS.get("ryze-basmati")!)).toBe(500);
    const lots = [lot({ ingredientId: "kureci-prsa", name: "Kuřecí prsa", qty: 500 }), lot({ name: "Baby špenát", qty: 100 })];
    const g = groundIdea({ servings: 1, ingredients: [{ name: "Kuřecí prsa", amount: "200 g" }, { name: "Rýže basmati", amount: "80 g" }, { name: "Špenát", amount: "50 g" }, { name: "Olivový olej", amount: "1 lžíce" }] }, INGS, lots, TODAY);
    // 200 g chicken (220) + 80 g rice (280) + 50 g spinach (11.5) + 15 g oil (132.6)
    expect(Math.round(g.kcal!)).toBe(644);
    expect(g.items.map((i) => i.fromFridge)).toEqual([true, false, true, true]);
  });
});
