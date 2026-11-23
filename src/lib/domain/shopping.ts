/**
 * Shopping diff: required(plan) − usable inventory − staples, rounded up to packs.
 * Pure function; every line explains required / available / missing.
 */
import type { IngredientLite, Unit } from "./catalog";

export type Need = { ingredientId: string; qty: number; neededOn: string };
export type StockLot = { ingredientId: string | null; qty: number; unit: Unit; expiresOn: string | null; kind: "raw" | "portion" };

export type ShoppingLine = {
  ingredientId: string;
  name: string;
  category: string;
  unit: Unit;
  required: number;
  available: number;
  missing: number;
  buy: number; // rounded to packs
  packs: number | null;
  estPriceCzk: number | null;
  reason: "plan" | "min_stock";
  conversion: string | null;
};

export function shoppingDiff(opts: {
  needs: Need[];
  stock: StockLot[];
  ingredients: Map<string, IngredientLite>;
  /** ingredient ids already present on the manual list or excluded */
  exclude?: Set<string>;
}): { lines: ShoppingLine[]; coveredByStock: string[]; staplesSkipped: string[] } {
  const required = new Map<string, { qty: number; firstNeed: string }>();
  for (const n of opts.needs) {
    const r = required.get(n.ingredientId);
    if (r) {
      r.qty += n.qty;
      if (n.neededOn < r.firstNeed) r.firstNeed = n.neededOn;
    } else required.set(n.ingredientId, { qty: n.qty, firstNeed: n.neededOn });
  }

  const lines: ShoppingLine[] = [];
  const coveredByStock: string[] = [];
  const staplesSkipped: string[] = [];

  const availableFor = (id: string, firstNeed: string | null) =>
    opts.stock
      .filter((l) => l.kind === "raw" && l.ingredientId === id && (!l.expiresOn || !firstNeed || l.expiresOn >= firstNeed))
      .reduce((a, l) => a + l.qty, 0);

  for (const [id, r] of required) {
    const ing = opts.ingredients.get(id);
    if (!ing || opts.exclude?.has(id)) continue;
    if (ing.isStaple) {
      staplesSkipped.push(ing.name);
      continue;
    }
    const available = availableFor(id, r.firstNeed);
    const missing = Math.max(0, r.qty - available);
    if (missing <= 0.0001) {
      coveredByStock.push(ing.name);
      continue;
    }
    lines.push(buildLine(ing, r.qty, available, missing, "plan"));
  }

  // Minimum stock rules (Grocy-style): top up when below threshold, even if the plan does not need it.
  for (const ing of opts.ingredients.values()) {
    if (ing.minStock == null || opts.exclude?.has(ing.id) || lines.some((l) => l.ingredientId === ing.id)) continue;
    const avail = availableFor(ing.id, null);
    const planned = required.get(ing.id)?.qty ?? 0;
    const after = avail - planned;
    if (after < ing.minStock) {
      lines.push(buildLine(ing, planned + ing.minStock, avail, ing.minStock - after, "min_stock"));
    }
  }
  return { lines, coveredByStock, staplesSkipped };
}

function buildLine(ing: IngredientLite, required: number, available: number, missing: number, reason: "plan" | "min_stock"): ShoppingLine {
  let buy = missing;
  let packs: number | null = null;
  let conversion: string | null = null;
  if (ing.packSize && ing.packSize > 0) {
    packs = Math.ceil(missing / ing.packSize - 1e-6);
    buy = packs * ing.packSize;
    conversion = `chybí ${cz(round(missing))} ${ing.unit} → ${packs}× balení ${cz(ing.packSize)} ${ing.unit}`;
  } else if (ing.unit === "ks") {
    buy = Math.ceil(missing - 1e-6);
  } else {
    buy = Math.ceil(missing / 10) * 10;
  }
  const estPriceCzk = ing.priceCzkPerPack && ing.packSize ? Math.round((buy / ing.packSize) * ing.priceCzkPerPack) : null;
  return {
    ingredientId: ing.id,
    name: ing.name,
    category: ing.category,
    unit: ing.unit,
    required: round(required),
    available: round(available),
    missing: round(missing),
    buy: round(buy),
    packs,
    estPriceCzk,
    reason,
    conversion,
  };
}

const round = (n: number) => Math.round(n * 10) / 10;
const cz = (n: number) => String(n % 1 === 0 ? n : Math.round(n)).replace(".", ",");

export function retailerSearchUrl(retailer: "rohlik" | "kosik", term: string) {
  const q = encodeURIComponent(term);
  return retailer === "rohlik" ? `https://www.rohlik.cz/hledat?q=${q}` : `https://www.kosik.cz/vyhledavani?search=${q}`;
}
