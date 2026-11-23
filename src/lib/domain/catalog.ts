import type { Macros } from "./nutrition";
import { ZERO, addMacros } from "./nutrition";

export type Unit = "g" | "ml" | "ks";
export type Location = "fridge" | "freezer" | "pantry";
export type MealSlot = "breakfast" | "snack_am" | "lunch" | "snack" | "dinner";

export const SLOT_LABEL: Record<MealSlot, string> = {
  breakfast: "Snídaně",
  snack_am: "Dopolední svačina",
  lunch: "Oběd",
  snack: "Svačina",
  dinner: "Večeře",
};

export const LOCATION_LABEL: Record<Location, string> = { fridge: "Lednice", freezer: "Mrazák", pantry: "Spíž" };

export const CATEGORY_LABEL: Record<string, string> = {
  zelenina: "Zelenina",
  ovoce: "Ovoce",
  maso: "Maso",
  ryby: "Ryby",
  mlecne: "Mléčné a vejce",
  pecivo: "Pečivo",
  trvanlive: "Trvanlivé",
  lusteniny: "Luštěniny",
  orechy: "Ořechy a semínka",
  mrazene: "Mrazené",
  koreni: "Koření a dochucovadla",
  napoje: "Nápoje",
  ostatni: "Ostatní",
};

/** Aisle order for the shopping list (fresh first, like walking a store). */
export const CATEGORY_ORDER = ["zelenina", "ovoce", "pecivo", "maso", "ryby", "mlecne", "lusteniny", "trvanlive", "orechy", "koreni", "mrazene", "napoje", "ostatni"];

export const ALLERGENS: Record<string, string> = {
  gluten: "Lepek",
  crustaceans: "Korýši",
  eggs: "Vejce",
  fish: "Ryby",
  peanuts: "Arašídy",
  soy: "Sója",
  milk: "Mléko / laktóza",
  nuts: "Skořápkové plody",
  celery: "Celer",
  mustard: "Hořčice",
  sesame: "Sezam",
  sulphites: "Siřičitany",
  lupin: "Vlčí bob",
  molluscs: "Měkkýši",
};

export type IngredientLite = {
  id: string;
  name: string;
  category: string;
  unit: Unit;
  gramsPerPiece: number | null;
  packSize: number | null;
  priceCzkPerPack: number | null;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  allergens: string[];
  plant: number;
  shelfDays: { fridge?: number; freezer?: number; pantry?: number; opened?: number };
  defaultLocation: Location;
  isStaple: boolean;
  minStock: number | null;
  emoji: string;
  seasonMonths?: number[] | null;
};

export type RecipeLite = {
  id: string;
  name: string;
  mealTypes: MealSlot[];
  servings: number;
  prepMin: number;
  cookMin: number;
  batchable: boolean;
  fridgeDays: number;
  freezerOk: boolean;
  tags: string[];
  emoji: string;
  favorite?: boolean;
  archived?: boolean;
  items: { ingredientId: string; qty: number; optional?: boolean }[];
};

/** grams (or ml) represented by `qty` of ingredient in its unit. */
export function toGrams(ing: Pick<IngredientLite, "unit" | "gramsPerPiece">, qty: number): number {
  if (ing.unit === "ks") return qty * (ing.gramsPerPiece ?? 50);
  return qty;
}

export function ingredientMacros(ing: IngredientLite, qty: number): Macros {
  const g = toGrams(ing, qty) / 100;
  return { kcal: ing.kcal * g, protein: ing.protein * g, carbs: ing.carbs * g, fat: ing.fat * g, fiber: ing.fiber * g };
}

/** Nutrition of ONE serving of a recipe. */
export function recipePerServing(r: RecipeLite, ings: Map<string, IngredientLite>): Macros {
  let total = ZERO;
  for (const it of r.items) {
    const ing = ings.get(it.ingredientId);
    if (!ing || it.optional) continue;
    total = addMacros(total, ingredientMacros(ing, it.qty));
  }
  return { kcal: total.kcal / r.servings, protein: total.protein / r.servings, carbs: total.carbs / r.servings, fat: total.fat / r.servings, fiber: total.fiber / r.servings };
}

export function recipeAllergens(r: RecipeLite, ings: Map<string, IngredientLite>): Set<string> {
  const s = new Set<string>();
  for (const it of r.items) for (const a of ings.get(it.ingredientId)?.allergens ?? []) s.add(a);
  return s;
}

export function recipeCostPerServing(r: RecipeLite, ings: Map<string, IngredientLite>): number {
  let c = 0;
  for (const it of r.items) {
    const ing = ings.get(it.ingredientId);
    if (!ing?.priceCzkPerPack || !ing.packSize || ing.isStaple) continue;
    c += (it.qty / ing.packSize) * ing.priceCzkPerPack;
  }
  return c / r.servings;
}

export function formatQty(qty: number, unit: Unit): string {
  if (unit === "ks") return `${qty % 1 === 0 ? qty : qty.toFixed(1).replace(".", ",")} ks`;
  if (qty >= 1000) return `${(qty / 1000).toFixed(qty % 1000 === 0 ? 0 : 1).replace(".", ",")} ${unit === "g" ? "kg" : "l"}`;
  return `${Math.round(qty)} ${unit}`;
}

/** Estimated expiry date for a newly stored item (USDA FoodKeeper-style table on each ingredient). */
export function estimateExpiry(ing: Pick<IngredientLite, "shelfDays" | "defaultLocation"> | null, location: Location, fromISO: string): string | null {
  const fallback: Record<Location, number> = { fridge: 5, freezer: 90, pantry: 180 };
  const days = ing?.shelfDays?.[location] ?? fallback[location];
  const d = new Date(fromISO + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
