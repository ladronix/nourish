import Link from "next/link";
import { desc, gte } from "drizzle-orm";
import { db, schema } from "@/db";
import { getActiveLots, getCatalog } from "@/lib/server/data";
import { addDays, longDate, todayISO } from "@/lib/domain/dates";
import { formatQty } from "@/lib/domain/catalog";
import { PrepGuide } from "@/components/prep-guide";

export const metadata = { title: "Meal prep" };

export default async function PrepPage() {
  const today = todayISO();
  const sessions = await db.select().from(schema.prepSessions).where(gte(schema.prepSessions.date, addDays(today, -7))).orderBy(desc(schema.prepSessions.date));
  const s = sessions.find((x) => x.status !== "done" && x.date >= addDays(today, -1)) ?? sessions[0];
  const [{ recipeMap, ingredients }, lots] = await Promise.all([getCatalog(), getActiveLots()]);

  if (!s)
    return (
      <>
        <section className="intro">
          <div>
            <span className="eyebrow">Meal prep</span>
            <h2>Jeden blok vaření. Klid na celý týden.</h2>
            <p>Až sestavíš týdenní plán, připravím sem koordinovaný postup pro krabičky na obědy.</p>
          </div>
          <Link className="btn btn-primary" href="/plan">
            Otevřít plán
          </Link>
        </section>
      </>
    );

  // Aggregate ingredients for the session and compare with stock
  const need = new Map<string, number>();
  for (const b of s.recipes) {
    const r = recipeMap.get(b.recipeId);
    if (!r) continue;
    for (const it of r.items) if (!it.optional) need.set(it.ingredientId, (need.get(it.ingredientId) ?? 0) + (it.qty / r.servings) * b.servings);
  }
  const have = (id: string) => lots.filter((l) => l.ingredientId === id && l.kind === "raw").reduce((a, l) => a + l.qty, 0);
  const rows = [...need.entries()].map(([id, qty]) => {
    const ing = ingredients.get(id)!;
    return { id, ing, qty, have: have(id), ok: ing.isStaple || have(id) >= qty * 0.95 };
  });
  const missing = rows.filter((r) => !r.ok);
  const portions = s.recipes.reduce((a, r) => a + r.servings, 0);

  return (
    <>
      <section className="intro">
        <div>
          <span className="eyebrow">
            Meal prep · {longDate(s.date)} {s.status === "done" ? "· hotovo" : ""}
          </span>
          <h2>
            {s.totalMin} minut. {portions} porcí.
          </h2>
          <p>Kroky jsou proložené: zatímco peče trouba nebo se vaří rýže, ruce dělají něco jiného. Na konci se porce uloží do lednice s datem spotřeby.</p>
        </div>
      </section>
      <div className="grid-2">
        <div className="panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">Časová osa</span>
              <h3>Postup</h3>
            </div>
          </div>
          <PrepGuide sessionId={s.id} steps={s.steps} completed={s.completed} done={s.status === "done"} />
        </div>
        <aside className="stack">
          <div className="panel">
            <span className="eyebrow">Vaří se</span>
            <ul className="list" style={{ marginTop: 6 }}>
              {s.recipes.map((b) => {
                const r = recipeMap.get(b.recipeId);
                return (
                  <li key={b.recipeId}>
                    <span className="emoji">{r?.emoji}</span>
                    <div>
                      <Link href={`/recipes/${b.recipeId}?servings=${b.servings}`}>
                        <strong>{r?.name}</strong>
                      </Link>
                      <small>
                        {b.servings} porce · v lednici {r?.fridgeDays} dny{r?.freezerOk ? " · lze mrazit" : ""}
                      </small>
                    </div>
                    <span />
                  </li>
                );
              })}
            </ul>
          </div>
          <div className="panel">
            <div className="between">
              <span className="eyebrow">Suroviny</span>
              {missing.length ? <span className="pill pill-coral">chybí {missing.length}</span> : <span className="pill pill-green">vše doma</span>}
            </div>
            <ul className="list" style={{ marginTop: 6 }}>
              {rows.map((r) => (
                <li key={r.id}>
                  <span className="emoji">{r.ing.emoji}</span>
                  <div>
                    <strong>{r.ing.name}</strong>
                    <small>
                      {formatQty(r.qty, r.ing.unit)}
                      {r.ing.isStaple ? " · základ" : ` · doma ${formatQty(r.have, r.ing.unit)}`}
                    </small>
                  </div>
                  <em className={`due ${r.ok ? "ok" : "urgent"}`}>{r.ok ? "✓" : "koupit"}</em>
                </li>
              ))}
            </ul>
            {missing.length > 0 && (
              <Link className="btn btn-primary btn-full btn-sm" style={{ marginTop: 10 }} href="/shopping">
                Doplnit do nákupu
              </Link>
            )}
          </div>
        </aside>
      </div>
    </>
  );
}
