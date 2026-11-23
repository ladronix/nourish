import { NextResponse } from "next/server";
import { z } from "zod";
import { db, schema } from "@/db";
import { isOwner, audit } from "@/lib/server/auth";
import { structureRecipe, aiAvailable } from "@/lib/server/ai";
import { getCatalog } from "@/lib/server/data";
import { safeFetchText, extractRecipeJsonLd, htmlToText } from "@/lib/server/safe-fetch";

export const maxDuration = 120;

const Body = z.object({ url: z.url().max(2000).optional(), text: z.string().max(20000).optional() });

function slug(s: string) {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

export async function POST(req: Request) {
  if (!(await isOwner())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!aiAvailable()) return NextResponse.json({ error: "AI není nakonfigurovaná (AI Gateway)." }, { status: 503 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success || (!parsed.data.url && !parsed.data.text)) return NextResponse.json({ error: "Zadej odkaz nebo text receptu." }, { status: 400 });

  let source = parsed.data.text ?? "";
  let sourceUrl: string | null = null;
  if (parsed.data.url) {
    try {
      const page = await safeFetchText(parsed.data.url);
      sourceUrl = page.url;
      source = extractRecipeJsonLd(page.text) ?? htmlToText(page.text);
    } catch (e) {
      return NextResponse.json({ error: `Stránku se nepodařilo načíst: ${(e as Error).message}` }, { status: 400 });
    }
  }
  const { ingredientRows, ingredients } = await getCatalog();
  let r;
  try {
    r = await structureRecipe(source, ingredientRows.map((i) => ({ id: i.id, name: i.name, unit: i.unit })));
  } catch (e) {
    console.error("recipe-import", (e as Error).message);
    return NextResponse.json({ error: "Recept se nepodařilo zpracovat." }, { status: 502 });
  }
  if (!r) return NextResponse.json({ error: "Recept se nepodařilo zpracovat." }, { status: 502 });

  const items: { ingredientId: string; qty: number; optional: boolean; note: string }[] = [];
  for (const it of r.ingredients) {
    let id = it.ingredientId && ingredients.has(it.ingredientId) ? it.ingredientId : null;
    if (!id && it.newIngredient) {
      const ni = it.newIngredient;
      id = slug(ni.id || ni.name) || `ing-${Date.now()}`;
      if (!ingredients.has(id)) {
        await db
          .insert(schema.ingredients)
          .values({ id, name: ni.name, category: ni.category, unit: ni.unit, gramsPerPiece: ni.gramsPerPiece, kcal: ni.kcal, protein: ni.protein, carbs: ni.carbs, fat: ni.fat, fiber: ni.fiber, allergens: ni.allergens, plant: ni.plant, source: "ai-estimate" })
          .onConflictDoNothing();
      }
    }
    if (!id || it.qty <= 0) continue;
    const existing = items.find((x) => x.ingredientId === id);
    if (existing) existing.qty += it.qty;
    else items.push({ ingredientId: id, qty: it.qty, optional: it.optional, note: it.original.slice(0, 200) });
  }
  let id = slug(r.name) || `recept-${Date.now()}`;
  if (await db.query.recipes.findFirst({ where: (t, { eq }) => eq(t.id, id) })) id = `${id}-${Date.now().toString(36)}`;
  await db.insert(schema.recipes).values({
    id,
    name: r.name,
    description: r.description,
    mealTypes: r.mealTypes,
    servings: r.servings,
    prepMin: r.prepMin,
    cookMin: r.cookMin,
    batchable: r.batchable,
    fridgeDays: Math.min(5, Math.max(1, r.fridgeDays)),
    freezerOk: r.freezerOk,
    tags: [...new Set([...r.tags, "importováno"])].slice(0, 8),
    emoji: r.emoji.slice(0, 4) || "🍽️",
    steps: r.steps.map((s) => ({ text: s.text, ...(s.timerMin ? { timerMin: s.timerMin } : {}) })),
    sourceUrl,
  });
  if (items.length) await db.insert(schema.recipeIngredients).values(items.map((i) => ({ recipeId: id, ...i })));
  await audit("recipe_imported", { id, sourceUrl });
  return NextResponse.json({ id });
}
