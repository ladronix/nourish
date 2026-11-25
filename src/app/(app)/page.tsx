import Link from "next/link";
import { Snowflake, Sparkles, Info } from "lucide-react";
import { getActiveLots, getCatalog, getDayTotals, getFoodLog, getMealsForRange, getProfile, getShoppingItems, getTarget, getWater, getWeighIns, getPlanForWeek } from "@/lib/server/data";
import { addDays, dayNum, dayShort, diffDays, longDate, relativeDays, todayISO, weekDays, weekStart } from "@/lib/domain/dates";
import { toMealView, greeting, fmt } from "@/lib/server/views";
import { MealRow } from "@/components/meal-row";
import { RebuildDayButton, GenerateWeekButton, WaterWidget, WeighInQuick } from "@/components/day-tools";
import { QuickLog } from "@/components/quick-log";
import { FridgeCookButton } from "@/components/fridge-cook";
import { trendSeries } from "@/lib/domain/trend";
import { proteinPerMealTarget } from "@/lib/domain/nutrition";
import { formatQty } from "@/lib/domain/catalog";

export const metadata = { title: "Dnes" };

export default async function Today({ searchParams }: { searchParams: Promise<{ d?: string }> }) {
  const sp = await searchParams;
  const today = todayISO();
  const date = sp.d && /^\d{4}-\d{2}-\d{2}$/.test(sp.d) ? sp.d : today;
  const ws = weekStart(date);
  const days = weekDays(ws);
  const [profile, target, catalog, meals, totals, logs, lots, water, weighIns, shopping, week] = await Promise.all([
    getProfile(),
    getTarget(),
    getCatalog(),
    getMealsForRange(date, date),
    getDayTotals(days[0], days[6]),
    getFoodLog(date, date),
    getActiveLots(),
    getWater(date),
    getWeighIns(60),
    getShoppingItems(),
    getPlanForWeek(ws),
  ]);
  const day = totals.get(date);
  const views = meals.map((m) => toMealView(m, catalog.recipeMap));
  const planned = day?.planned ?? { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 };
  const eaten = day?.eaten ?? { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 };
  const kcalMid = (target.kcalMin + target.kcalMax) / 2;
  const pctRing = Math.min(100, Math.round((eaten.kcal / kcalMid) * 100));
  const mealsWithRecipe = views.filter((v) => v.recipeId);
  const kitchenMin = mealsWithRecipe.filter((v) => !v.fromPrep).reduce((a, v) => a + v.totalMin, 0);
  const expiring = lots.filter((l) => l.expiresOn && diffDays(l.expiresOn, today) <= 3).slice(0, 5);
  const freshPct = lots.length ? Math.round((lots.filter((l) => !l.expiresOn || diffDays(l.expiresOn, today) > 2).length / lots.length) * 100) : 100;
  const trend = trendSeries(weighIns.map((w) => ({ date: w.date, kg: w.kg })));
  const lastW = weighIns.at(-1);
  const openShop = shopping.filter((s) => !s.checked);
  const shopCost = openShop.reduce((a, s) => a + (s.estPriceCzk ?? 0), 0);
  const ppm = proteinPerMealTarget(profile.weightKg);
  const lowProteinMeals = mealsWithRecipe.filter((m) => m.slotLabel !== "Svačina" && m.protein < ppm.min);
  const prep = week?.prep && week.prep.status !== "done" && week.prep.date >= today ? week.prep : null;
  // Meals planned from a prep box that isn't in the fridge (prep not done yet, or portions eaten up).
  const portionsByRecipe = new Map<string, number>();
  for (const l of lots) if (l.kind === "portion" && l.recipeId && (!l.expiresOn || l.expiresOn >= today)) portionsByRecipe.set(l.recipeId, (portionsByRecipe.get(l.recipeId) ?? 0) + l.qty);
  const prepGap = date === today ? views.map((v, i) => ({ ...v, slot: meals[i].slot })).filter((v) => v.fromPrep && v.status === "planned" && v.recipeId && (portionsByRecipe.get(v.recipeId) ?? 0) < v.servings - 0.01) : [];

  const remaining = Math.max(0, target.kcalMin - eaten.kcal);
  const balance =
    eaten.kcal === 0
      ? "Den je před tebou. Odškrtávej jídla jedním klepnutím — zbytek spočítám."
      : eaten.kcal > target.kcalMax
        ? "Dnes nad rozmezím — to je v pořádku. Počítá se týdenní průměr, ne jeden den."
        : eaten.protein < target.proteinMin * 0.6 && eaten.kcal > kcalMid * 0.6
          ? "Na dobré cestě. Zbytek dne pomůže víc bílkovin — třeba skyr nebo tvaroh."
          : `Na dobré cestě. Do rozmezí zbývá zhruba ${fmt(remaining)} kcal.`;

  return (
    <>
      <header className="topbar">
        <div>
          <span className="eyebrow">{longDate(date).toUpperCase()}</span>
          <h1>{date === today ? greeting(profile.name) : `Plán na ${longDate(date)}`}</h1>
        </div>
        <div className="top-actions">
          <Link href="/settings" className="icon-btn" aria-label="Nastavení">
            ⚙︎
          </Link>
        </div>
      </header>

      {!profile.onboarded && (
        <div className="note warn" style={{ marginBottom: 16 }}>
          <Info />
          <div>
            <strong>Nastav si profil a cíl.</strong> Zatím počítám s výchozími hodnotami.{" "}
            <Link href="/settings#profile" style={{ textDecoration: "underline" }}>
              Vyplnit profil (2 minuty)
            </Link>
          </div>
        </div>
      )}

      <section className="hero">
        <div className="hero-copy">
          <span className="pill pill-light">DNEŠNÍ RYTMUS · {mealsWithRecipe.length} JÍDEL</span>
          <h2>
            Jez dobře.
            <br />
            Nemusíš nad tím přemýšlet.
          </h2>
          <p>
            {mealsWithRecipe.length
              ? `Plán je sestavený z toho, co máš doma${mealsWithRecipe.some((m) => m.fromPrep) ? ", oběd čeká v krabičce" : ""}. V kuchyni dnes ${kitchenMin} minut.`
              : "Na tento den zatím není plán. Sestav týden a já pohlídám cíl, zásoby i čas."}
          </p>
          <div className="hero-actions">
            {week ? (
              <>
                <a className="btn btn-primary" href="#timeline">
                  Otevřít dnešní plán
                </a>
                <RebuildDayButton date={date} />
                {date === today && <FridgeCookButton date={date} className="btn btn-ghost-light" label="Z lednice" />}
              </>
            ) : (
              <GenerateWeekButton weekStart={ws} />
            )}
          </div>
        </div>
        <div className="hero-stats" aria-label="Dnešní souhrn">
          <div>
            <strong>{fmt(planned.kcal)}</strong>
            <span>kcal v plánu</span>
          </div>
          <div>
            <strong>{fmt(planned.protein)} g</strong>
            <span>bílkovin</span>
          </div>
          <div>
            <strong>{kitchenMin} min</strong>
            <span>v kuchyni</span>
          </div>
        </div>
      </section>

      <nav className="day-strip" aria-label="Výběr dne">
        {days.map((d) => {
          const t = totals.get(d);
          const ok = t && t.mealsTotal > 0 && t.mealsEaten / t.mealsTotal >= 0.75;
          return (
            <Link key={d} href={d === today ? "/" : `/?d=${d}`} aria-current={d === date ? "date" : undefined}>
              <span>{dayShort(d)}</span>
              <strong>{dayNum(d)}</strong>
              <i className={ok ? "ok" : d === today ? "today" : ""} />
            </Link>
          );
        })}
        <div className="daily-progress">
          <span>Dnešní plán</span>
          <strong>
            {day?.mealsEaten ?? 0} / {day?.mealsTotal ?? 0} hotovo
          </strong>
          <div className="track">
            <i style={{ width: `${day?.mealsTotal ? Math.round((day.mealsEaten / day.mealsTotal) * 100) : 0}%` }} />
          </div>
        </div>
      </nav>

      {prepGap.length > 0 && (
        <div className="note warn prep-gap" style={{ marginBottom: 16 }}>
          <Info />
          <div style={{ display: "grid", gap: 8 }}>
            <div>
              <strong>Krabička z meal prepu v lednici není</strong> — {prepGap.map((m) => `${m.slotLabel.toLowerCase()}: ${m.name}`).join(", ")}.
              {prep ? ` Meal prep je naplánovaný na ${relativeDays(prep.date, today)}.` : " Meal prep tento týden neproběhl."} Vyber jídlo z toho, co máš doma.
            </div>
            <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
              <FridgeCookButton date={date} slot={prepGap[0].slot} className="btn btn-sm btn-dark" label="Co uvařit z lednice" />
              <Link className="btn btn-sm btn-ghost" href="/prep">
                Udělat meal prep
              </Link>
            </div>
          </div>
        </div>
      )}

      <div className="grid-2">
        <div className="stack">
          <article className="panel">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">Energie a makra</span>
                <h3>Dnešní rovnováha</h3>
              </div>
              <Link className="text-btn" href="/progress">
                Detail
              </Link>
            </div>
            <div className="macro-layout">
              <div className="ring" style={{ ["--value" as string]: pctRing }}>
                <div>
                  <strong>{fmt(eaten.kcal)}</strong>
                  <span>
                    z {fmt(target.kcalMin)}–{fmt(target.kcalMax)} kcal
                  </span>
                </div>
              </div>
              <div className="macro-list">
                <Macro label="Bílkoviny" color="var(--coral)" value={eaten.protein} min={target.proteinMin} max={target.proteinMax} planned={planned.protein} />
                <Macro label="Sacharidy" color="var(--green-deep)" value={eaten.carbs} min={target.carbsMin} max={target.carbsMax} planned={planned.carbs} />
                <Macro label="Tuky" color="#d8b56f" value={eaten.fat} min={target.fatMin} max={target.fatMax} planned={planned.fat} />
                <Macro label="Vláknina" color="#738da5" value={eaten.fiber} min={target.fiberMin} max={target.fiberMin + 15} planned={planned.fiber} />
              </div>
            </div>
            <div className="note" style={{ marginTop: 18 }}>
              <Sparkles />
              <p style={{ margin: 0 }}>{balance}</p>
            </div>
          </article>

          <article className="panel" id="timeline">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">Menu dne</span>
                <h3>Jídlo po jídle</h3>
              </div>
              <Link className="text-btn" href="/plan">
                Celý týden
              </Link>
            </div>
            {views.length ? (
              <div className="meal-list">
                {views.map((v) => (
                  <MealRow key={v.id} m={v} />
                ))}
              </div>
            ) : (
              <div className="empty">
                <h3>Na tento den není nic naplánováno</h3>
                <p>Sestav plán na týden — využije zásoby a pohlídá cíl.</p>
                <GenerateWeekButton weekStart={ws} />
              </div>
            )}
            {lowProteinMeals.length > 0 && (
              <p className="tiny muted" style={{ marginTop: 10 }}>
                Tip: na jedno hlavní jídlo cílíme ~{ppm.ideal} g bílkovin (0,4 g/kg). {lowProteinMeals.map((m) => m.slotLabel.toLowerCase()).join(", ")} je pod {ppm.min} g.
              </p>
            )}
          </article>

          <QuickLog date={date} logs={logs.map((l) => ({ id: l.id, name: l.name, kcal: l.kcal, protein: l.protein, source: l.source }))} />
        </div>

        <aside className="stack">
          <article className="panel">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">Moje kuchyně</span>
                <h3>Co spotřebovat</h3>
              </div>
              <Link className="text-btn" href="/fridge">
                Lednice
              </Link>
            </div>
            <div className="row" style={{ padding: 12, background: "var(--green-soft)", borderRadius: 14, marginBottom: 8 }}>
              <span className="emoji" style={{ background: "var(--green-deep)", color: "#fff" }}>
                <Snowflake size={18} />
              </span>
              <div>
                <strong className="small">{freshPct} % zásob je čerstvých</strong>
                <div className="tiny muted">{expiring.length ? `${expiring.length} věci chtějí pozornost` : "Nic nehoří"}</div>
              </div>
            </div>
            {expiring.length > 0 ? (
              <ul className="list">
                {expiring.map((l) => {
                  const d = diffDays(l.expiresOn!, today);
                  return (
                    <li key={l.id}>
                      <span className="emoji">{l.ingredientId ? (catalog.ingredients.get(l.ingredientId)?.emoji ?? "🥣") : l.kind === "portion" ? "🍱" : "🥣"}</span>
                      <div>
                        <strong>{l.name}</strong>
                        <small>{formatQty(l.qty, l.unit)}</small>
                      </div>
                      <em className={`due ${d <= 0 ? "urgent" : d <= 1 ? "urgent" : "soon"}`}>{relativeDays(l.expiresOn!, today)}</em>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="small muted">Všechno má čas. Přidej nákup do lednice, ať plán ví, co máš.</p>
            )}
            {expiring.length > 0 && (
              <Link className="btn btn-soft btn-full btn-sm" style={{ marginTop: 12 }} href={`/recipes?use=${expiring.map((l) => l.ingredientId).filter(Boolean).join(",")}`}>
                Najít jídlo z těchto surovin
              </Link>
            )}
          </article>

          <article className="panel">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">Chytrý nákup</span>
                <h3>Příští doplnění</h3>
              </div>
            </div>
            <p className="small muted" style={{ marginTop: -8 }}>
              {openShop.length ? `Na seznamu ${openShop.length} položek${shopCost ? ` · odhad ${fmt(shopCost)} Kč` : ""}. Zbytek už máš doma.` : "Seznam je prázdný. Vygeneruj ho z plánu — odečtu, co máš doma."}
            </p>
            <Link className="btn btn-primary btn-full" href="/shopping">
              {openShop.length ? "Zkontrolovat nákup" : "Připravit nákup z plánu"}
            </Link>
            <small className="muted tiny" style={{ display: "block", textAlign: "center", marginTop: 8 }}>
              Objednávku vždy potvrdíš ty v obchodě.
            </small>
          </article>

          {prep && (
            <article className="panel panel-dark">
              <span className="eyebrow" style={{ color: "var(--coral)" }}>
                Meal prep · {relativeDays(prep.date, today)}
              </span>
              <h3 style={{ fontSize: 22, margin: "6px 0" }}>{prep.totalMin} minut. Klid na několik dní.</h3>
              <p className="small" style={{ color: "#a3a59d" }}>
                {prep.recipes.reduce((a, r) => a + r.servings, 0)} porcí ze {prep.recipes.length} receptů. Trouba a plotýnka běží souběžně.
              </p>
              <Link className="btn btn-ghost-light" href="/prep">
                Spustit průvodce přípravou
              </Link>
            </article>
          )}

          <WeighInQuick last={lastW?.kg ?? null} trend={trend.at(-1)?.trend ?? null} />
          <WaterWidget ml={water} goal={target.waterMl} />
        </aside>
      </div>
      <p className="tiny muted" style={{ marginTop: 20 }}>
        Nourish je nástroj pro plánování, ne zdravotnická aplikace. Cíle jsou orientační rozmezí. Výpočet {target.calculationVersion}.
      </p>
    </>
  );
}

function Macro({ label, color, value, min, max, planned }: { label: string; color: string; value: number; min: number; max: number; planned: number }) {
  const pct = Math.min(100, Math.round((value / max) * 100));
  const plannedPct = Math.min(100, Math.round((planned / max) * 100));
  return (
    <div className="macro">
      <span className="macro-label">
        <i style={{ background: color }} />
        {label}
      </span>
      <strong>
        {Math.round(value)}{" "}
        <small>
          / {min}–{max} g
        </small>
      </strong>
      <div className="track" style={{ position: "relative" }}>
        <i style={{ width: `${plannedPct}%`, background: color, opacity: 0.22, position: "absolute", inset: 0 }} />
        <i style={{ width: `${pct}%`, background: color, position: "relative" }} />
      </div>
    </div>
  );
}

void addDays;
