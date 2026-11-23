import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getActiveLots, getCatalog } from "@/lib/server/data";
import { ALLERGENS, formatQty, recipePerServing, recipeAllergens, recipeCostPerServing, SLOT_LABEL } from "@/lib/domain/catalog";
import { RecipeActions } from "@/components/recipe-tools";

export default async function RecipePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ servings?: string; cook?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const [{ recipeMap, ingredients }, lots] = await Promise.all([getCatalog(), getActiveLots()]);
  const r = recipeMap.get(id);
  if (!r) notFound();
  const servings = Math.min(12, Math.max(0.25, Number(sp.servings) || r.servings));
  const k = servings / r.servings;
  const per = recipePerServing(r, ingredients);
  const al = [...recipeAllergens(r, ingredients)];
  const cost = recipeCostPerServing(r, ingredients);
  const have = (ingId: string) => lots.filter((l) => l.ingredientId === ingId && l.kind === "raw").reduce((a, l) => a + l.qty, 0);
  const plants = new Set(r.items.filter((i) => (ingredients.get(i.ingredientId)?.plant ?? 0) > 0).map((i) => i.ingredientId)).size;

  return (
    <>
      <Link href="/recipes" className="text-btn row" style={{ marginBottom: 10 }}>
        <ArrowLeft size={16} /> Recepty
      </Link>
      <section className="intro">
        <div>
          <span className="eyebrow">
            {r.mealTypes.map((t) => SLOT_LABEL[t]).join(" · ")} · {r.prepMin + r.cookMin} min
          </span>
          <h2>
            {r.emoji} {r.name}
          </h2>
          <p>{r.description}</p>
        </div>
      </section>
      <RecipeActions id={r.id} favorite={!!r.favorite} archived={!!r.archived} batchable={r.batchable} name={r.name} mealTypes={r.mealTypes} steps={r.steps.map((s, i) => ({ id: String(i), text: s.text, timerMin: s.timerMin }))} startCook={sp.cook === "1"} />
      <div className="stats" style={{ marginTop: 16 }}>
        <div>
          <span>Na porci</span>
          <strong>{Math.round(per.kcal)} kcal</strong>
        </div>
        <div>
          <span>Bílkoviny</span>
          <strong>{Math.round(per.protein)} g</strong>
        </div>
        <div>
          <span>Sacharidy / tuky</span>
          <strong>
            {Math.round(per.carbs)} / {Math.round(per.fat)} g
          </strong>
        </div>
        <div>
          <span>Vláknina</span>
          <strong>{Math.round(per.fiber)} g</strong>
        </div>
        <div>
          <span>Rostlin</span>
          <strong>{plants}</strong>
        </div>
        <div>
          <span>Cena / porce</span>
          <strong>{cost ? `≈ ${Math.round(cost)} Kč` : "—"}</strong>
        </div>
      </div>
      <div className="grid-2">
        <div className="panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">Postup</span>
              <h3>{r.steps.length} kroků</h3>
            </div>
          </div>
          <ol style={{ margin: 0, paddingLeft: 20, display: "grid", gap: 12 }}>
            {r.steps.map((s, i) => (
              <li key={i} style={{ fontSize: 15.5 }}>
                {s.text}
                {s.timerMin ? <span className="pill pill-gray" style={{ marginLeft: 8 }}>⏱ {s.timerMin} min</span> : null}
              </li>
            ))}
          </ol>
          <p className="tiny muted" style={{ marginTop: 16 }}>
            V lednici vydrží {r.fridgeDays} {r.fridgeDays === 1 ? "den" : "dny"}
            {r.freezerOk ? " · lze zamrazit" : ""}. {r.sourceUrl && <a href={r.sourceUrl} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "underline" }}>Zdroj</a>}
          </p>
        </div>
        <aside className="panel">
          <div className="between">
            <span className="eyebrow">Suroviny · {String(servings).replace(".", ",")} porce</span>
            <span className="seg">
              {[1, 2, r.servings, r.servings * 2].filter((v, i, a) => a.indexOf(v) === i).map((s) => (
                <Link key={s} href={`/recipes/${r.id}?servings=${s}`} className="btn btn-xs" style={{ background: s === servings ? "var(--card)" : "transparent" }}>
                  {s}
                </Link>
              ))}
            </span>
          </div>
          <ul className="list" style={{ marginTop: 8 }}>
            {r.items.map((it) => {
              const ing = ingredients.get(it.ingredientId);
              if (!ing) return null;
              const qty = it.qty * k;
              const h = have(ing.id);
              return (
                <li key={it.ingredientId}>
                  <span className="emoji">{ing.emoji}</span>
                  <div>
                    <strong>{ing.name}</strong>
                    <small>{ing.isStaple ? "základ" : h >= qty ? "✓ doma" : h > 0 ? `doma ${formatQty(h, ing.unit)}` : "koupit"}</small>
                  </div>
                  <em className="due" style={{ color: "var(--ink-2)" }}>
                    {formatQty(qty, ing.unit)}
                  </em>
                </li>
              );
            })}
          </ul>
          {al.length > 0 && <p className="tiny muted">Alergeny: {al.map((a) => ALLERGENS[a] ?? a).join(", ")}</p>}
        </aside>
      </div>
    </>
  );
}
