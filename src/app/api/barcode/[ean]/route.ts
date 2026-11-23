import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { isOwner } from "@/lib/server/auth";

/** Barcode lookup: local catalog first, then Open Food Facts (ODbL; attribution shown in UI). Cached in app_state. */
export async function GET(_req: Request, ctx: { params: Promise<{ ean: string }> }) {
  if (!(await isOwner())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { ean } = await ctx.params;
  if (!/^\d{8,14}$/.test(ean)) return NextResponse.json({ error: "Neplatný kód." }, { status: 400 });

  const local = await db.query.ingredients.findFirst({ where: eq(schema.ingredients.barcode, ean) });
  if (local) return NextResponse.json({ source: "catalog", ingredientId: local.id, name: local.name, unit: local.unit, per100: { kcal: local.kcal, protein: local.protein, carbs: local.carbs, fat: local.fat, fiber: local.fiber } });

  const cacheKey = `off:${ean}`;
  const cached = await db.query.appState.findFirst({ where: eq(schema.appState.key, cacheKey) });
  if (cached) return NextResponse.json(cached.value);

  const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${ean}?fields=product_name,product_name_cs,brands,quantity,nutriments,image_front_small_url,allergens_tags`, {
    headers: { "user-agent": "Nourish-personal/1.0 (private single-user app)" },
    signal: AbortSignal.timeout(8000),
  }).catch(() => null);
  if (!res || !res.ok) return NextResponse.json({ error: "Produkt nenalezen." }, { status: 404 });
  const data = (await res.json()) as { status: number; product?: Record<string, unknown> };
  if (data.status !== 1 || !data.product) return NextResponse.json({ error: "Produkt nenalezen v Open Food Facts." }, { status: 404 });
  const p = data.product as { product_name?: string; product_name_cs?: string; brands?: string; quantity?: string; nutriments?: Record<string, number>; image_front_small_url?: string; allergens_tags?: string[] };
  const n = p.nutriments ?? {};
  const qtyMatch = /([\d.,]+)\s*(g|kg|ml|l)\b/i.exec(p.quantity ?? "");
  let qty: number | null = null;
  let unit: "g" | "ml" = "g";
  if (qtyMatch) {
    const v = parseFloat(qtyMatch[1].replace(",", "."));
    const u = qtyMatch[2].toLowerCase();
    qty = u === "kg" || u === "l" ? v * 1000 : v;
    unit = u === "ml" || u === "l" ? "ml" : "g";
  }
  const out = {
    source: "openfoodfacts",
    ingredientId: null,
    name: [p.product_name_cs || p.product_name, p.brands?.split(",")[0]].filter(Boolean).join(" · ") || `Produkt ${ean}`,
    unit,
    qty,
    image: p.image_front_small_url ?? null,
    allergens: (p.allergens_tags ?? []).map((a) => a.replace(/^en:/, "")),
    per100: {
      kcal: Number(n["energy-kcal_100g"] ?? (n["energy_100g"] ? n["energy_100g"] / 4.184 : 0)),
      protein: Number(n["proteins_100g"] ?? 0),
      carbs: Number(n["carbohydrates_100g"] ?? 0),
      fat: Number(n["fat_100g"] ?? 0),
      fiber: Number(n["fiber_100g"] ?? 0),
    },
  };
  await db.insert(schema.appState).values({ key: cacheKey, value: out }).onConflictDoNothing();
  return NextResponse.json(out);
}
