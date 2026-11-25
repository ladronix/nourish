/**
 * "What can I cook right now from my fridge?" — pure ranking, no I/O.
 *
 * Used when meal prep did not happen (no boxed portions), for a spontaneous meal, or to rebuild
 * the rest of the day from stock. Ranks recipes by how much of them is already at home, favouring
 * food that expires soon, the time you have, and the macros left for the day.
 */
import { diffDays } from "./dates";
import { recipeAllergens, recipePerServing, toGrams, type IngredientLite, type MealSlot, type RecipeLite } from "./catalog";
import { scaleMacros, type Macros } from "./nutrition";

export type StockLot = {
  id: number;
  ingredientId: string | null;
  recipeId?: string | null;
  kind: "raw" | "portion";
  name: string;
  qty: number;
  unit: string;
  expiresOn: string | null;
};

/** Interchangeable ingredients: a recipe still works if one stands in for another (counted at 90 %). */
export const SUBSTITUTES: string[][] = [
  ["kureci-prsa", "kruti-prsa", "kureci-stehna"],
  ["recky-jogurt", "skyr"],
  ["tvaroh", "cottage", "skyr"],
  ["ryze-basmati", "ryze-natural", "quinoa", "bulgur", "kuskus"],
  ["testoviny", "kuskus"],
  ["spenat", "kapusta", "rukola", "salat-mix"],
  ["losos", "treska"],
  ["cizrna", "fazole-cerne", "cocka-cervena"],
  ["tofu", "edamame"],
  ["mozzarella", "eidam", "feta", "halloumi"],
  ["brambory", "batat"],
  ["boruvky", "maliny", "lesni-ovoce"],
  ["mandle", "vlasske-orechy", "lneny-dyne-seminka"],
  ["zitny-chleb", "tortilla"],
  ["paprika", "rajcata", "cuketa", "okurka"],
  ["zeleni-fazolky", "brokolice", "hrasek", "zelenina-mix-mrazena"],
  ["citron", "pomeranc"],
];

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const STOP = new Set(["bez", "kosti", "filet", "cerstve", "cerstvy", "mrazene", "mrazeny", "sterilovane", "polotucny", "polotucne", "bily", "natural", "light", "mix", "nejvyssi", "jakosti", "celozrnne", "celozrnny", "celozrnna", "vlastni", "stave", "varena"]);

/** Match a free-text lot (e.g. from a fridge photo) to a catalog ingredient by its significant words. */
export function matchIngredientByName(name: string, ingredients: Map<string, IngredientLite>): string | null {
  const words = norm(name)
    .split(" ")
    .filter((w) => w.length > 2 && !STOP.has(w));
  if (!words.length) return null;
  let best: { id: string; s: number } | null = null;
  for (const ing of ingredients.values()) {
    const iw = norm(ing.name)
      .split(/[ /]/)
      .filter((w) => w.length > 2 && !STOP.has(w));
    if (!iw.length) continue;
    // stem match on the first 5 letters handles Czech endings (rajčata/rajčat, jogurt/jogurtu)
    const hits = iw.filter((a) => words.some((b) => a.slice(0, 5) === b.slice(0, 5))).length;
    if (!hits) continue;
    const s = hits / iw.length + (norm(ing.name).split(" ")[0].slice(0, 5) === words[0].slice(0, 5) ? 0.5 : 0);
    if (!best || s > best.s) best = { id: ing.id, s };
  }
  return best && best.s >= 0.5 ? best.id : null;
}

/** Convert a lot quantity into the catalog ingredient's unit. */
export function inIngredientUnit(qty: number, unit: string, ing: IngredientLite) {
  if (unit === ing.unit) return qty;
  const gpp = ing.gramsPerPiece ?? (ing.category === "zelenina" || ing.category === "ovoce" ? 120 : 100);
  if (unit === "ks" && (ing.unit === "g" || ing.unit === "ml")) return qty * gpp;
  if ((unit === "g" || unit === "ml") && ing.unit === "ks") return qty / gpp;
  return qty; // g ↔ ml treated as equal
}

/** Inverse of inIngredientUnit: how much of a lot (in its own unit) equals `qty` of the ingredient. */
export function inLotUnit(qty: number, lotUnit: string, ing: IngredientLite) {
  const one = inIngredientUnit(1, lotUnit, ing);
  return one > 0 ? qty / one : qty;
}

/** The substitutes for an ingredient (same group, excluding itself). */
export function substitutesFor(id: string) {
  return SUBSTITUTES.find((g) => g.includes(id))?.filter((x) => x !== id) ?? [];
}

export type Stock = Map<string, { qty: number; soonest: string | null; names: string[] }>;

/** Usable raw stock per catalog ingredient (expired lots excluded, free-text lots matched by name). */
export function buildStock(lots: StockLot[], ingredients: Map<string, IngredientLite>, today: string): Stock {
  const stock: Stock = new Map();
  for (const l of lots) {
    if (l.kind !== "raw" || l.qty <= 0) continue;
    if (l.expiresOn && l.expiresOn < today) continue;
    const id = l.ingredientId ?? matchIngredientByName(l.name, ingredients);
    const ing = id ? ingredients.get(id) : undefined;
    if (!ing) continue;
    const cur = stock.get(ing.id) ?? { qty: 0, soonest: null, names: [] };
    cur.qty += inIngredientUnit(l.qty, l.unit, ing);
    if (l.expiresOn && (!cur.soonest || l.expiresOn < cur.soonest)) cur.soonest = l.expiresOn;
    if (!cur.names.includes(l.name)) cur.names.push(l.name);
    stock.set(ing.id, cur);
  }
  return stock;
}

export type FridgeInput = {
  today: string;
  slot: MealSlot;
  /** kcal the meal should roughly have (slot share of the day, or what is left). */
  kcalTarget: number;
  /** protein (g) a main meal should reach. */
  proteinTarget: number;
  maxMinutes?: number;
  recipes: RecipeLite[];
  ingredients: Map<string, IngredientLite>;
  lots: StockLot[];
  allergens: string[];
  dislikes: string[];
  dietTags: string[];
  /** recipe ids eaten in the last ~2 days (variety). */
  recentRecipeIds?: string[];
  /** recipe ids to leave out (e.g. already suggested for an earlier slot today). */
  exclude?: string[];
};

export type FridgeIdea = {
  recipeId: string;
  name: string;
  emoji: string;
  servings: number;
  macros: Macros;
  totalMin: number;
  /** 0–1 share of the (non-staple, non-optional) ingredient quantity that is at home. */
  coverage: number;
  tier: "ready" | "almost" | "shop";
  /** `minor`: a small part of the dish (≤ 8 % by weight, e.g. lemon, herbs) — you can cook without it. */
  missing: { ingredientId: string; name: string; qty: number; unit: string; minor: boolean }[];
  substitutions: { want: string; use: string }[];
  usesExpiring: { name: string; days: number }[];
  score: number;
  reasons: string[];
};

export type Leftover = { lotId: number; recipeId: string | null; name: string; qty: number; unit: string; expiresOn: string | null; days: number | null; macros: Macros | null };

/** Cooked portions waiting in the fridge/freezer — zero cooking, eat first when they expire soon. */
export function leftovers(lots: StockLot[], recipes: Map<string, RecipeLite>, ingredients: Map<string, IngredientLite>, today: string): Leftover[] {
  return lots
    .filter((l) => l.kind === "portion" && l.qty > 0 && (!l.expiresOn || l.expiresOn >= today))
    .map((l) => {
      const r = l.recipeId ? recipes.get(l.recipeId) : undefined;
      return {
        lotId: l.id,
        recipeId: l.recipeId ?? null,
        name: l.name,
        qty: l.qty,
        unit: l.unit,
        expiresOn: l.expiresOn,
        days: l.expiresOn ? diffDays(l.expiresOn, today) : null,
        macros: r ? recipePerServing(r, ingredients) : null,
      };
    })
    .sort((a, b) => (a.days ?? 99) - (b.days ?? 99));
}

export function fridgeIdeas(input: FridgeInput, limit = 12): FridgeIdea[] {
  const { ingredients, today } = input;
  const stock = buildStock(input.lots, ingredients, today);
  const allergenSet = new Set(input.allergens);
  const dislikeSet = new Set(input.dislikes);
  const exclude = new Set(input.exclude ?? []);
  const recent = new Set(input.recentRecipeIds ?? []);
  const subsOf = (id: string) => SUBSTITUTES.find((g) => g.includes(id))?.filter((x) => x !== id) ?? [];

  const out: FridgeIdea[] = [];
  for (const r of input.recipes) {
    if (r.archived || exclude.has(r.id) || !r.mealTypes.includes(input.slot)) continue;
    if (r.items.some((i) => !ingredients.has(i.ingredientId))) continue;
    if ([...recipeAllergens(r, ingredients)].some((a) => allergenSet.has(a))) continue;
    if (r.items.some((i) => !i.optional && dislikeSet.has(i.ingredientId))) continue;
    if (input.dietTags.some((t) => !r.tags.includes(t))) continue;

    const per = recipePerServing(r, ingredients);
    const servings = per.kcal > 0 ? Math.min(2, Math.max(0.5, Math.round((input.kcalTarget / per.kcal) * 4) / 4)) : 1;
    const totalMin = r.prepMin + r.cookMin;

    let needW = 0;
    let haveW = 0;
    const missing: FridgeIdea["missing"] = [];
    const substitutions: FridgeIdea["substitutions"] = [];
    const usesExpiring: FridgeIdea["usesExpiring"] = [];
    const taken = new Map<string, number>(); // stock consumed by this recipe (two items may share a substitute)

    for (const it of r.items) {
      const ing = ingredients.get(it.ingredientId)!;
      if (ing.isStaple) continue;
      const need = (it.qty / r.servings) * servings;
      const w = Math.max(1, toGrams(ing, need)); // weight by grams so a pinch of herbs ≠ the protein
      const avail = (id: string) => (stock.get(id)?.qty ?? 0) - (taken.get(id) ?? 0);
      let got = Math.min(need, Math.max(0, avail(ing.id)));
      let source = ing.id;
      if (got < need * 0.6) {
        const sub = subsOf(ing.id).find((s) => avail(s) >= need * 0.6);
        if (sub) {
          got = Math.min(need, avail(sub)) * 0.9;
          source = sub;
          substitutions.push({ want: ing.name, use: ingredients.get(sub)?.name ?? sub });
        }
      }
      if (got > 0) taken.set(source, (taken.get(source) ?? 0) + got);
      if (it.optional) continue;
      needW += w;
      haveW += w * Math.min(1, got / need);
      if (got < need * 0.6) missing.push({ ingredientId: ing.id, name: ing.name, qty: Math.max(0, need - got), unit: ing.unit, minor: false, w } as FridgeIdea["missing"][number] & { w: number });
      const soon = stock.get(source)?.soonest;
      if (got > 0 && soon) {
        const d = diffDays(soon, today);
        if (d <= 3) usesExpiring.push({ name: ingredients.get(source)?.name ?? source, days: d });
      }
    }
    const coverage = needW ? haveW / needW : 1;
    for (const m of missing as (FridgeIdea["missing"][number] & { w?: number })[]) {
      m.minor = (m.w ?? 0) / Math.max(1, needW) <= 0.08;
      delete m.w;
    }
    if (coverage < 0.35) continue; // mostly a shopping trip, not "from the fridge"

    const macros = scaleMacros(per, servings);
    const reasons: string[] = [];
    let score = coverage * 10;
    const major = missing.filter((m) => !m.minor);
    if (!missing.length) reasons.push("máš všechno doma");
    else if (!major.length) reasons.push(`zvládneš i bez: ${missing.map((m) => m.name.toLowerCase()).join(", ")}`);
    for (const e of usesExpiring) score += e.days <= 1 ? 2.5 : 1.2;
    if (usesExpiring.length) reasons.push(`spotřebuje ${usesExpiring.map((e) => e.name.toLowerCase()).join(", ")}`);
    const isMain = input.slot === "lunch" || input.slot === "dinner";
    if (isMain) score += Math.max(-2, Math.min(2, (macros.protein - input.proteinTarget * 0.8) / 8));
    if (macros.protein >= input.proteinTarget && isMain) reasons.push(`${Math.round(macros.protein)} g bílkovin`);
    if (input.maxMinutes && totalMin > input.maxMinutes) score -= (totalMin - input.maxMinutes) / 5;
    if (totalMin <= 15) {
      score += 0.8;
      reasons.push("do 15 minut");
    }
    if (r.favorite) score += 1;
    if (recent.has(r.id)) score -= 3;
    score -= substitutions.length * 0.4;

    score -= missing.filter((m) => m.minor).length * 0.5;
    const tier: FridgeIdea["tier"] = major.length === 0 ? "ready" : major.length <= 2 && coverage >= 0.7 ? "almost" : "shop";
    out.push({ recipeId: r.id, name: r.name, emoji: r.emoji, servings, macros, totalMin, coverage, tier, missing, substitutions, usesExpiring, score, reasons });
  }
  const tierRank = { ready: 0, almost: 1, shop: 2 } as const;
  return out.sort((a, b) => tierRank[a.tier] - tierRank[b.tier] || b.score - a.score).slice(0, limit);
}

/** Pick distinct ideas for several slots at once (rebuild the rest of the day from the fridge). */
export function planDayFromFridge(base: Omit<FridgeInput, "slot" | "kcalTarget" | "exclude">, slots: { slot: MealSlot; kcalTarget: number }[]) {
  const used: string[] = [];
  const picks: { slot: MealSlot; idea: FridgeIdea | null }[] = [];
  // Simulate consumption: later slots should not count on food an earlier slot already used.
  let lots = base.lots.map((l) => ({ ...l }));
  for (const s of slots) {
    const ideas = fridgeIdeas({ ...base, lots, slot: s.slot, kcalTarget: s.kcalTarget, exclude: used }, 5);
    const idea = ideas.find((i) => i.tier !== "shop") ?? null;
    picks.push({ slot: s.slot, idea });
    if (idea) {
      used.push(idea.recipeId);
      lots = consumeFromLots(lots, base.recipes.find((r) => r.id === idea.recipeId)!, idea.servings, base.ingredients, base.today);
    }
  }
  return picks;
}

function consumeFromLots(lots: StockLot[], r: RecipeLite, servings: number, ingredients: Map<string, IngredientLite>, today: string) {
  const next = lots.map((l) => ({ ...l }));
  for (const it of r.items) {
    const ing = ingredients.get(it.ingredientId);
    if (!ing || ing.isStaple) continue;
    let need = (it.qty / r.servings) * servings;
    for (const l of next.filter((x) => x.kind === "raw" && (x.ingredientId ?? matchIngredientByName(x.name, ingredients)) === ing.id && (!x.expiresOn || x.expiresOn >= today)).sort((a, b) => (a.expiresOn ?? "9") .localeCompare(b.expiresOn ?? "9"))) {
      if (need <= 0) break;
      const have = inIngredientUnit(l.qty, l.unit, ing);
      const use = Math.min(have, need);
      l.qty -= l.unit === ing.unit ? use : (use / have) * l.qty;
      need -= use;
    }
  }
  return next;
}

/** Parse "150 g", "0,5 ks", "2 lžíce", "1 hrnek" into the ingredient's unit (rough household measures). */
export function parseAmount(amount: string, ing: IngredientLite): number | null {
  const m = amount.replace(",", ".").match(/(\d+(?:\.\d+)?)\s*(lžíce|lžic|lžička|lžičky|hrnek|hrnky|plátek|plátky|stroužek|stroužky|hrst|kusy|kusů|kus|kg|ks|ml|g(?![a-zá-ž])|l(?![a-zá-ž]))?/i);
  if (!m) return null;
  const n = parseFloat(m[1]);
  const u = (m[2] ?? (ing.unit === "ks" ? "ks" : "g")).toLowerCase();
  const grams =
    u === "kg" ? n * 1000 : u === "g" || u === "ml" ? n : u === "l" ? n * 1000 : u.startsWith("lžíc") || u.startsWith("lžic") ? n * 15 : u.startsWith("lžič") ? n * 5 : u.startsWith("hrn") ? n * 200 : u.startsWith("hrst") ? n * 30 : u.startsWith("plát") ? n * 25 : u.startsWith("strou") ? n * 4 : null;
  if (grams == null) {
    // pieces
    return ing.unit === "ks" ? n : n * (ing.gramsPerPiece ?? (ing.category === "zelenina" || ing.category === "ovoce" ? 120 : 100));
  }
  return ing.unit === "ks" ? grams / (ing.gramsPerPiece ?? 50) : grams;
}

/**
 * Ground an AI-invented dish in the catalog: recompute kcal/protein per serving from the listed
 * amounts and mark which ingredients are really in stock. Returns null macros when too little matched.
 */
export function groundIdea(
  idea: { servings: number; ingredients: { name: string; amount: string }[] },
  ingredients: Map<string, IngredientLite>,
  lots: StockLot[],
  today: string,
) {
  const stock = buildStock(lots, ingredients, today);
  const stockNames = lots.filter((l) => l.kind === "raw" && (!l.expiresOn || l.expiresOn >= today)).map((l) => norm(l.name));
  let kcal = 0;
  let protein = 0;
  let matchedItems = 0;
  const items = idea.ingredients.map((g) => {
    const id = matchIngredientByName(g.name, ingredients);
    const ing = id ? ingredients.get(id) : undefined;
    const qty = ing ? parseAmount(g.amount, ing) : null;
    if (ing && qty != null) {
      const grams = toGrams(ing, qty);
      kcal += (ing.kcal * grams) / 100;
      protein += (ing.protein * grams) / 100;
      matchedItems++;
    }
    const n = norm(g.name).split(" ")[0]?.slice(0, 5) ?? "";
    const inFridge = (id ? stock.has(id) : false) || (n.length >= 4 && stockNames.some((s) => s.split(" ").some((w) => w.slice(0, 5) === n)));
    const staple = !!ing?.isStaple || /^(sul|pepr|olej|ocet|koreni|voda|mouka)/.test(norm(g.name));
    return { ...g, fromFridge: inFridge || staple, staple };
  });
  const servings = Math.max(1, idea.servings || 1);
  const reliable = idea.ingredients.length > 0 && matchedItems / idea.ingredients.length >= 0.6;
  return { items, kcal: reliable ? kcal / servings : null, protein: reliable ? protein / servings : null };
}
