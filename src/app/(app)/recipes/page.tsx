import Link from "next/link";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { getActiveLots, getCatalog, getProfile } from "@/lib/server/data";
import { recipePerServing, recipeAllergens, SLOT_LABEL, type MealSlot } from "@/lib/domain/catalog";
import { diffDays, todayISO } from "@/lib/domain/dates";
import { ImportRecipe } from "@/components/recipe-tools";

export const metadata = { title: "Recepty" };

const FILTERS: [string, string][] = [
  ["all", "Vše"],
  ["breakfast", "Snídaně"],
  ["lunch", "Obědy"],
  ["dinner", "Večeře"],
  ["snack", "Svačiny"],
  ["batch", "Meal prep"],
  ["fav", "Oblíbené"],
  ["fast", "Do 15 min"],
  ["archived", "Skryté"],
];

export default async function RecipesPage({ searchParams }: { searchParams: Promise<{ f?: string; use?: string; q?: string }> }) {
  const sp = await searchParams;
  const f = sp.f ?? "all";
  const [{ recipes, ingredients }, lots, profile, inbox] = await Promise.all([getCatalog(), getActiveLots(), getProfile(), db.select().from(schema.inbox).where(eq(schema.inbox.processed, false))]);
  const today = todayISO();
  const useIds = new Set((sp.use ?? "").split(",").filter(Boolean));
  const expiring = new Set(lots.filter((l) => l.ingredientId && l.expiresOn && diffDays(l.expiresOn, today) <= 3).map((l) => l.ingredientId!));
  const stock = new Set(lots.filter((l) => l.ingredientId).map((l) => l.ingredientId!));
  const allergenSet = new Set(profile.allergens);

  let list = recipes.map((r) => {
    const m = recipePerServing(r, ingredients);
    const al = [...recipeAllergens(r, ingredients)];
    const nonStaple = r.items.filter((i) => !ingredients.get(i.ingredientId)?.isStaple);
    const haveShare = nonStaple.length ? nonStaple.filter((i) => stock.has(i.ingredientId)).length / nonStaple.length : 0;
    const useHits = r.items.filter((i) => useIds.has(i.ingredientId) || (useIds.size === 0 && expiring.has(i.ingredientId))).length;
    return { r, m, blocked: al.some((a) => allergenSet.has(a)), haveShare, useHits };
  });
  if (sp.q) list = list.filter((x) => x.r.name.toLowerCase().includes(sp.q!.toLowerCase()));
  list = list.filter(({ r }) => {
    if (f === "archived") return r.archived;
    if (r.archived) return false;
    if (f === "batch") return r.batchable;
    if (f === "fav") return r.favorite;
    if (f === "fast") return r.prepMin + r.cookMin <= 15;
    if (f === "snack") return r.mealTypes.includes("snack") || r.mealTypes.includes("snack_am");
    if (f !== "all") return r.mealTypes.includes(f as MealSlot);
    return true;
  });
  list.sort((a, b) => (useIds.size ? b.useHits - a.useHits : 0) || Number(b.r.favorite) - Number(a.r.favorite) || b.haveShare - a.haveShare || a.r.name.localeCompare(b.r.name, "cs"));

  return (
    <>
      <section className="intro">
        <div>
          <span className="eyebrow">{recipes.filter((r) => !r.archived).length} receptů</span>
          <h2>{useIds.size ? "Co uvařit z toho, co expiruje" : "Recepty, které plán zná."}</h2>
          <p>{useIds.size ? "Seřazeno podle toho, kolik surovin z lednice spotřebují." : "Každý recept má přepočtené živiny, alergeny a trvanlivost — plánovač s nimi umí počítat."}</p>
        </div>
        <div className="actions">
          <ImportRecipe inbox={inbox.map((i) => ({ id: i.id, content: i.content }))} />
        </div>
      </section>
      <div className="toolbar">
        <form className="search">
          <input name="q" placeholder="Hledat recept…" defaultValue={sp.q} aria-label="Hledat recept" />
          {f !== "all" && <input type="hidden" name="f" value={f} />}
        </form>
      </div>
      <div className="chips" style={{ marginBottom: 14 }}>
        {FILTERS.map(([id, l]) => (
          <Link key={id} href={id === "all" ? "/recipes" : `/recipes?f=${id}`} className="chip" aria-pressed={f === id}>
            {l}
          </Link>
        ))}
      </div>
      <div className="recipe-grid">
        {list.map(({ r, m, blocked, haveShare, useHits }) => (
          <Link key={r.id} href={`/recipes/${r.id}`} className="rcard" style={{ opacity: blocked ? 0.55 : 1 }}>
            <div className="top">
              <span className="e">{r.emoji}</span>
              <span className="row" style={{ gap: 4 }}>
                {r.favorite && <span className="pill pill-coral">♥</span>}
                {r.batchable && <span className="pill pill-dark">prep</span>}
              </span>
            </div>
            <h3>{r.name}</h3>
            <p>
              {Math.round(m.kcal)} kcal · {Math.round(m.protein)} g B · {r.prepMin + r.cookMin} min{r.servings > 1 ? ` · ${r.servings} porce` : ""}
            </p>
            <div className="tags">
              {r.mealTypes.slice(0, 3).map((t) => (
                <span key={t} className="pill pill-gray">
                  {SLOT_LABEL[t]}
                </span>
              ))}
              {haveShare >= 0.6 && <span className="pill pill-green">doma {Math.round(haveShare * 100)} %</span>}
              {useHits > 0 && <span className="pill pill-amber">spotřebuje {useHits}</span>}
              {blocked && <span className="pill pill-coral">alergen</span>}
            </div>
          </Link>
        ))}
      </div>
    </>
  );
}
