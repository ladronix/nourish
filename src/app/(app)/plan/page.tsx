import Link from "next/link";
import { ChevronLeft, ChevronRight, Info } from "lucide-react";
import { getCatalog, getDayTotals, getPlanForWeek, getTarget, getProfile } from "@/lib/server/data";
import { addDays, dayNum, dayShort, isoWeekNumber, todayISO, weekDays, weekStart } from "@/lib/domain/dates";
import { toMealView, fmt } from "@/lib/server/views";
import { recipePerServing } from "@/lib/domain/catalog";
import { plantPoints } from "@/lib/domain/planner";
import { WeekBoard } from "@/components/week-board";
import { GenerateWeekButton, WeekAlternatives } from "@/components/day-tools";

export const metadata = { title: "Plán" };

export default async function PlanPage({ searchParams }: { searchParams: Promise<{ w?: string }> }) {
  const sp = await searchParams;
  const today = todayISO();
  const ws = sp.w && /^\d{4}-\d{2}-\d{2}$/.test(sp.w) ? weekStart(sp.w) : weekStart(today);
  const days = weekDays(ws);
  const [week, totals, catalog, target, profile] = await Promise.all([getPlanForWeek(ws), getDayTotals(days[0], days[6]), getCatalog(), getTarget(), getProfile()]);
  const meals = week?.meals ?? [];
  const ex = week?.plan.explanation;
  const recipeIds = meals.filter((m) => m.recipeId && m.status !== "skipped").map((m) => m.recipeId!);
  const plants = plantPoints(recipeIds, catalog.recipeMap, catalog.ingredients);
  const dayTotals = days.map((d) => totals.get(d)?.planned);
  const withData = dayTotals.filter((t) => t && t.kcal > 0);
  const avgKcal = withData.length ? withData.reduce((a, t) => a + t!.kcal, 0) / withData.length : 0;
  const avgProtein = withData.length ? withData.reduce((a, t) => a + t!.protein, 0) / withData.length : 0;

  const boardDays = days.map((d) => ({
    date: d,
    short: dayShort(d),
    num: dayNum(d),
    kcal: totals.get(d)?.planned.kcal ?? 0,
    protein: totals.get(d)?.planned.protein ?? 0,
    isToday: d === today,
    isPast: d < today,
    meals: meals.filter((m) => m.date === d).map((m) => ({ ...toMealView(m, catalog.recipeMap), slot: m.slot })),
    prep: week?.prep && week.prep.date === d ? { totalMin: week.prep.totalMin, portions: week.prep.recipes.reduce((a, r) => a + r.servings, 0) } : null,
  }));
  // Prep may fall on the Sunday before the week starts
  const prepBefore = week?.prep && week.prep.date < ws ? week.prep : null;

  const recipes = catalog.recipes
    .filter((r) => !r.archived)
    .map((r) => {
      const m = recipePerServing(r, catalog.ingredients);
      return { id: r.id, name: r.name, emoji: r.emoji, mealTypes: r.mealTypes, kcal: Math.round(m.kcal), protein: Math.round(m.protein), totalMin: r.prepMin + r.cookMin };
    });

  return (
    <>
      <section className="intro">
        <div>
          <span className="eyebrow">
            Týden {isoWeekNumber(ws)} · {dayNum(ws)}. – {dayNum(days[6])}. {Number(days[6].slice(5, 7))}.
          </span>
          <h2>Plán, který se přizpůsobí realitě.</h2>
          <p>Využívá zásoby, čas a tvůj nutriční cíl. Klepni na jídlo → vyměnit, zamknout nebo změnit porci. „Alternativy týdne“ ukážou jiné verze celého týdne.</p>
        </div>
        <div className="actions">
          <Link className="icon-btn" href={`/plan?w=${addDays(ws, -7)}`} aria-label="Předchozí týden">
            <ChevronLeft />
          </Link>
          <Link className="icon-btn" href={`/plan?w=${addDays(ws, 7)}`} aria-label="Další týden">
            <ChevronRight />
          </Link>
          {week && meals.length ? <WeekAlternatives weekStart={ws} /> : <GenerateWeekButton weekStart={ws} label="Sestavit týden" />}
        </div>
      </section>

      <div className="stats">
        <div>
          <span>Průměrný den</span>
          <strong>{avgKcal ? `${fmt(avgKcal)} kcal` : "—"}</strong>
        </div>
        <div>
          <span>Cíl</span>
          <strong>
            {fmt(target.kcalMin)}–{fmt(target.kcalMax)}
          </strong>
        </div>
        <div>
          <span>Bílkoviny</span>
          <strong>{avgProtein ? `${fmt(avgProtein)} g / den` : "—"}</strong>
        </div>
        <div>
          <span>Rostliny v týdnu</span>
          <strong>{Math.round(plants)} / 30</strong>
        </div>
        <div>
          <span>Vaření</span>
          <strong>{ex ? `${Math.floor(ex.cookMinutes / 60)} h ${ex.cookMinutes % 60} min` : "—"}</strong>
        </div>
        <div>
          <span>Odhad nákladů</span>
          <strong>{ex?.estCostCzk ? `${fmt(ex.estCostCzk)} Kč` : "—"}</strong>
        </div>
      </div>

      {prepBefore && (
        <Link href="/prep" className="panel panel-dark" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <span>
            <span className="eyebrow" style={{ color: "var(--coral)" }}>
              Meal prep {dayShort(prepBefore.date)} {dayNum(prepBefore.date)}.
            </span>
            <strong>
              {prepBefore.totalMin} min · {prepBefore.recipes.reduce((a, r) => a + r.servings, 0)} porcí na všední dny
            </strong>
          </span>
          <ChevronRight />
        </Link>
      )}

      {week ? (
        <WeekBoard days={boardDays} recipes={recipes} target={target} />
      ) : (
        <div className="panel empty">
          <h3>Na tento týden zatím plán není</h3>
          <p>Sestavím ho z tvých receptů, zásob a cíle. Obědy ve všední dny pokryje meal prep.</p>
          <GenerateWeekButton weekStart={ws} />
        </div>
      )}

      {ex && ex.notes.length > 0 && (
        <div className="panel" style={{ marginTop: 16 }}>
          <div className="panel-heading" style={{ marginBottom: 10 }}>
            <div>
              <span className="eyebrow">Proč takhle</span>
              <h3>Vysvětlení plánu</h3>
            </div>
          </div>
          <ul style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 6 }} className="small">
            {ex.notes.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
            {ex.usedFromInventory.length > 0 && <li>Ze zásob využívám: {ex.usedFromInventory.join(", ")}.</li>}
          </ul>
        </div>
      )}
      {profile.safetyFlags.length > 0 && (
        <div className="note warn" style={{ marginTop: 14 }}>
          <Info />
          <p style={{ margin: 0 }}>Máš nastavené zdravotní okolnosti — plán drží udržovací rozmezí. Úpravy cíle konzultuj s odborníkem.</p>
        </div>
      )}
    </>
  );
}
