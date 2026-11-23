import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { getCatalog, getDayTotals, getMealsForRange, getTarget, getWeighIns, getProfile } from "@/lib/server/data";
import { addDays, daysAgo, todayISO, weekStart } from "@/lib/domain/dates";
import { trendSeries, slopePerDay } from "@/lib/domain/trend";
import { plantPoints } from "@/lib/domain/planner";
import { WeightChart } from "@/components/weight-chart";
import { Checkin } from "@/components/checkin";
import { WeighInQuick } from "@/components/day-tools";
import { fmt } from "@/lib/server/views";

export const metadata = { title: "Pokrok" };

export default async function ProgressPage() {
  const today = todayISO();
  const from = addDays(today, -27);
  const [weighIns, totals, target, meals, catalog, checkins, profile, waste] = await Promise.all([
    getWeighIns(120),
    getDayTotals(from, today),
    getTarget(),
    getMealsForRange(from, today),
    getCatalog(),
    db.select().from(schema.checkins).orderBy(desc(schema.checkins.weekStart)).limit(6),
    getProfile(),
    db
      .select({ v: sql<number>`coalesce(sum(${schema.inventoryMoves.valueCzk}),0)::float`, n: sql<number>`count(*)::int` })
      .from(schema.inventoryMoves)
      .where(and(eq(schema.inventoryMoves.reason, "discard"), gte(schema.inventoryMoves.at, daysAgo(28)))),
  ]);
  const series = trendSeries(weighIns.map((w) => ({ date: w.date, kg: w.kg })));
  const recent = series.filter((p) => p.date >= addDays(today, -20));
  const slope = slopePerDay(recent.map((p) => ({ date: p.date, value: p.trend })));
  const rate = slope !== null && recent.length >= 3 ? slope * 7 : null;
  const first = series.find((p) => p.date >= from);
  const last = series.at(-1);
  const change = first && last ? last.trend - first.trend : null;

  // Consistency: days on plan (≥ 75 % of planned meals eaten), last 4 weeks, per week bars
  const past = meals.filter((m) => m.date < today && m.recipeId);
  const eatenShare = past.length ? past.filter((m) => m.status === "eaten").length / past.length : 0;
  const weeks = [3, 2, 1, 0].map((w) => {
    const ws = addDays(weekStart(today), -7 * w);
    let on = 0;
    let n = 0;
    for (let i = 0; i < 7; i++) {
      const d = addDays(ws, i);
      if (d >= today) continue;
      const t = totals.get(d);
      if (!t || !t.mealsTotal) continue;
      n++;
      if (t.mealsEaten / t.mealsTotal >= 0.75) on++;
    }
    return n ? Math.round((on / n) * 100) : 0;
  });
  const logged = [...totals.entries()].filter(([d, t]) => d < today && t.logged && t.eaten.kcal > 0);
  const avgProtein = logged.length ? logged.reduce((a, [, t]) => a + t.eaten.protein, 0) / logged.length : 0;
  const avgKcal = logged.length ? logged.reduce((a, [, t]) => a + t.eaten.kcal, 0) / logged.length : 0;
  const thisWeek = meals.filter((m) => m.date >= weekStart(today) && m.status === "eaten" && m.recipeId).map((m) => m.recipeId!);
  const plants = plantPoints(thisWeek, catalog.recipeMap, catalog.ingredients);
  const prepSaved = meals.filter((m) => m.fromPrep && m.status === "eaten").length * 20;

  const rateText =
    rate === null
      ? "Po pár váženích uvidíš tempo."
      : profile.goal === "lose"
        ? rate < -profile.weightKg * 0.01
          ? "Rychleji, než je udržitelné. Zvaž přidat jídlo."
          : rate < -0.1
            ? "Tempo odpovídá cíli. Plán není potřeba zpřísňovat."
            : "Trend je zatím plochý — check-in upraví cíl podle reálného výdeje."
        : profile.goal === "gain"
          ? rate > 0.05
            ? "Pozvolné nabírání, přesně tak."
            : "Zatím bez nárůstu — check-in upraví cíl."
          : Math.abs(rate) < 0.2
            ? "Stabilní a udržitelné."
            : "Mírný pohyb, sledujeme trend.";

  return (
    <>
      <section className="intro">
        <div>
          <span className="eyebrow">Posledních 28 dní</span>
          <h2>Pokrok bez posedlosti čísly.</h2>
          <p>Konzistence, energie a udržitelnost plánu. Hmotnost jako vyhlazený trend — denní výkyvy jsou voda, ne tuk.</p>
        </div>
      </section>
      <div className="insights">
        <article className="icard coral">
          <span>Dny podle plánu</span>
          <strong>{weeks[3]} %</strong>
          <p>tento týden · snědeno {Math.round(eatenShare * 100)} % plánovaných jídel za 4 týdny</p>
          <div className="spark" aria-label="Konzistence po týdnech">
            {weeks.map((w, i) => (
              <i key={i} style={{ height: `${Math.max(4, w)}%` }} title={`${w} %`} />
            ))}
          </div>
        </article>
        <article className="icard green">
          <span>Průměr bílkovin</span>
          <strong>{avgProtein ? `${fmt(avgProtein)} g` : "—"}</strong>
          <p>
            cíl {target.proteinMin}–{target.proteinMax} g · průměr {avgKcal ? `${fmt(avgKcal)} kcal` : "—"}
          </p>
          <div className="track" style={{ marginTop: 40, background: "rgba(255,255,255,.18)" }}>
            <i style={{ width: `${Math.min(100, (avgProtein / target.proteinMin) * 100)}%`, background: "var(--green)" }} />
          </div>
        </article>
        <article className="icard cream">
          <span>Rostliny tento týden</span>
          <strong>{Math.round(plants)} / 30</strong>
          <p>pestrost podporuje střevní mikrobiom · ušetřeno ~{Math.round(prepSaved / 60)} h díky meal prepu</p>
        </article>
      </div>

      <div className="grid-2" style={{ marginTop: 14 }}>
        <article className="panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">Trend hmotnosti</span>
              <h3>{rateText}</h3>
            </div>
            {change !== null && (
              <span className="pill pill-coral">
                {change > 0 ? "+" : ""}
                {change.toFixed(1).replace(".", ",")} kg / 28 dní
              </span>
            )}
          </div>
          <WeightChart points={series.slice(-90)} />
          <div className="stats" style={{ marginTop: 14, marginBottom: 0 }}>
            <div>
              <span>Trend</span>
              <strong>{last ? `${last.trend.toFixed(1).replace(".", ",")} kg` : "—"}</strong>
            </div>
            <div>
              <span>Tempo</span>
              <strong>{rate !== null ? `${rate > 0 ? "+" : ""}${rate.toFixed(2).replace(".", ",")} kg/týd` : "—"}</strong>
            </div>
            <div>
              <span>Výdej (TDEE)</span>
              <strong>{fmt(target.tdee)} kcal</strong>
            </div>
            <div>
              <span>Vyhozeno (28 d)</span>
              <strong>{waste[0].n ? `${waste[0].n}× · ${fmt(waste[0].v)} Kč` : "0"}</strong>
            </div>
          </div>
        </article>
        <aside className="stack">
          <WeighInQuick last={weighIns.at(-1)?.kg ?? null} trend={last?.trend ?? null} />
          <Checkin />
          {checkins.length > 0 && (
            <div className="panel">
              <span className="eyebrow">Historie check-inů</span>
              <ul className="list">
                {checkins.map((c) => (
                  <li key={c.id}>
                    <span className="emoji">🗓️</span>
                    <div>
                      <strong>Týden od {Number(c.weekStart.slice(8))}. {Number(c.weekStart.slice(5, 7))}.</strong>
                      <small>
                        výdej {c.tdeeEstimate ?? "—"} kcal · hlad {c.hunger}/5 · energie {c.energy}/5{c.appliedTargetId ? " · cíl upraven" : ""}
                      </small>
                    </div>
                    <span />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>
      </div>
      <div className="health-note">
        <span className="pill pill-dark">i</span>
        <p>
          <strong>Nourish je nástroj pro plánování, ne zdravotnická aplikace.</strong> Cíle jsou orientační. Při zdravotním omezení, poruše příjmu potravy, těhotenství nebo léčbě řeš jídelníček s lékařem či nutričním terapeutem.
        </p>
      </div>
    </>
  );
}
