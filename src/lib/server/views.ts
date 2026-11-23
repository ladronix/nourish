import "server-only";
import type { MealView } from "@/components/meal-row";
import { SLOT_LABEL } from "@/lib/domain/catalog";
import type { PlannedMeal } from "./data";

type RecipeMapLite = Map<string, { name: string; emoji: string; prepMin: number; cookMin: number }>;

export function toMealView(m: PlannedMeal, recipes: RecipeMapLite): MealView {
  const r = m.recipeId ? recipes.get(m.recipeId) : undefined;
  return {
    id: m.id,
    time: m.time,
    slotLabel: SLOT_LABEL[m.slot],
    status: m.status,
    recipeId: m.recipeId,
    name: r?.name ?? m.note ?? "Volné jídlo",
    emoji: r?.emoji ?? "🍽️",
    kcal: m.kcal,
    protein: m.protein,
    servings: m.servings,
    fromPrep: m.fromPrep,
    locked: m.locked,
    totalMin: r ? r.prepMin + r.cookMin : 0,
    note: m.note,
  };
}

export function greeting(name: string, now = new Date()) {
  const h = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Prague", hour: "2-digit", hour12: false }).format(now));
  const base = h < 10 ? "Dobré ráno" : h < 18 ? "Dobrý den" : "Dobrý večer";
  return name ? `${base}, ${name}` : base;
}

export function fmt(n: number) {
  return Math.round(n).toLocaleString("cs-CZ");
}
