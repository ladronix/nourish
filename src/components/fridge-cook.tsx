"use client";
import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { ChefHat, Clock, Sparkles, Refrigerator, AlertTriangle, Check } from "lucide-react";
import { Sheet } from "./sheet";
import { useToast } from "./toast";
import { getFridgeIdeas, applyFridgeIdea, eatLeftover, rebuildDayFromFridge, type FridgeView } from "@/app/actions/fridge";
import { logFood } from "@/app/actions/log";
import type { MealSlot } from "@/lib/domain/catalog";

type AiIdea = { name: string; minutes: number; servings: number; kcal: number; protein: number; ingredients: { name: string; amount: string; fromFridge: boolean; staple?: boolean }[]; steps: string[]; why: string; estimated: "catalog" | "ai" };

const fmt = (n: number) => Math.round(n).toLocaleString("cs-CZ");
const portions = (s: number) => (s === 1 ? "1 porce" : `${String(s).replace(".", ",")} porce`);
const daysLabel = (d: number) => (d <= 0 ? "dnes" : d === 1 ? "zítra" : `za ${d} dny`);

/**
 * "What can I cook now from the fridge?" — for days without meal prep, spontaneous meals,
 * or to rebuild the rest of the day from stock. Opens as a sheet from Today, the prep-gap
 * banner and the Fridge page.
 */
export function FridgeCookButton({ date, slot, label = "Co uvařit z lednice", className = "btn btn-soft" }: { date?: string; slot?: MealSlot; label?: string; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>
        <Refrigerator size={18} /> {label}
      </button>
      {open && <FridgeCookSheet date={date} initialSlot={slot} onClose={() => setOpen(false)} />}
    </>
  );
}

function FridgeCookSheet({ date, initialSlot, onClose }: { date?: string; initialSlot?: MealSlot; onClose: () => void }) {
  const [view, setView] = useState<FridgeView | null>(null);
  const [slot, setSlot] = useState<MealSlot | undefined>(initialSlot);
  const [filter, setFilter] = useState<"all" | "ready" | "quick">("all");
  const [ai, setAi] = useState<AiIdea[] | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [pending, start] = useTransition();
  const toast = useToast();

  useEffect(() => {
    let alive = true;
    getFridgeIdeas(date, slot).then((v) => alive && setView(v));
    return () => {
      alive = false;
    };
  }, [date, slot]);

  const active = view?.slots.find((s) => s.slot === view.active);
  const ideas = (view?.ideas ?? []).filter((i) => (filter === "ready" ? i.tier === "ready" : filter === "quick" ? i.totalMin <= 15 : true));
  const reload = () => getFridgeIdeas(date, view?.active).then(setView);

  const use = (recipeId: string, servings: number, eatNow: boolean, name: string) =>
    start(async () => {
      if (!view) return;
      const r = await applyFridgeIdea({ date: view.date, slot: view.active, mealId: active?.mealId ?? null, recipeId, servings, eatNow });
      if (!r.ok) return toast(r.note ?? "Nepovedlo se.", true);
      toast(eatNow ? `Dobrou chuť! ${name} je zapsané a suroviny odečtené.${r.note ? " " + r.note : ""}` : `${name} je v plánu na ${active?.label.toLowerCase() ?? "dnes"}.`);
      onClose();
    });

  const askAi = async () => {
    if (!view) return;
    setAiBusy(true);
    try {
      const r = await fetch("/api/ai/fridge-ideas", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ slot: view.active, kcalTarget: active?.kcalTarget }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Chyba");
      setAi(j.ideas);
      if (!j.ideas.length) toast("Nic rozumného nevymyslel, zkus to znovu.", true);
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setAiBusy(false);
    }
  };

  return (
    <Sheet open onClose={onClose} label="Co uvařit z lednice" wide>
      <span className="eyebrow">Z lednice · {view ? `${view.stockCount} surovin doma` : "načítám…"}</span>
      <h2>Co uvařit teď</h2>
      <p className="small muted" style={{ marginTop: -4 }}>
        Recepty seřazené podle toho, co máš doma, co brzy expiruje, času a bílkovin. Nic se nezmění, dokud nevybereš.
      </p>

      {view && view.slots.length > 0 && (
        <div className="chips" aria-label="Jídlo" style={{ margin: "12px 0 8px" }}>
          {view.slots.map((s) => (
            <button key={s.slot} className="chip" aria-pressed={s.slot === view.active} onClick={() => (setSlot(s.slot), setAi(null))}>
              {s.prepMissing && <AlertTriangle size={14} aria-label="chybí krabička" />} {s.label} {s.time}
            </button>
          ))}
        </div>
      )}

      {active?.prepMissing && (
        <div className="note warn" style={{ marginBottom: 10 }}>
          <AlertTriangle />
          <div>
            <strong>{active.label} měl být z meal prepu ({active.plannedName}), ale krabička v lednici není.</strong> Vyber náhradu níže, nebo přestav zbytek dne.
            {view?.prepPending && (
              <>
                {" "}
                <Link href="/prep">Meal prep je naplánovaný na {view.prepPending.date.split("-").reverse().slice(0, 2).join(". ")}.</Link>
              </>
            )}
          </div>
        </div>
      )}

      {view && view.leftovers.length > 0 && (
        <section aria-label="Hotové porce" style={{ display: "grid", gap: 6, marginBottom: 12 }}>
          <strong className="small">Hotové porce v lednici — bez vaření</strong>
          {view.leftovers.slice(0, 4).map((l) => (
            <div key={l.lotId} className="fc-card fc-left">
              <div>
                <strong>{l.name}</strong>
                <small>
                  {String(l.qty).replace(".", ",")} {l.unit === "ks" ? "porce" : l.unit}
                  {l.days != null ? ` · spotřebovat ${daysLabel(l.days)}` : ""}
                  {l.macros ? ` · ${fmt(l.macros.kcal)} kcal · ${fmt(l.macros.protein)} g B` : ""}
                </small>
              </div>
              {l.recipeId && (
                <button
                  className="btn btn-sm btn-primary"
                  disabled={pending}
                  onClick={() =>
                    start(async () => {
                      const r = await eatLeftover({ date: view.date, slot: view.active, mealId: active?.mealId ?? null, recipeId: l.recipeId! });
                      if (!r.ok) return toast(r.note ?? "Nepovedlo se.", true);
                      toast(`Zapsáno: ${l.name}.`);
                      onClose();
                    })
                  }
                >
                  Sníst teď
                </button>
              )}
            </div>
          ))}
        </section>
      )}

      <div className="chips" style={{ marginBottom: 10 }}>
        {(
          [
            ["all", "Vše"],
            ["ready", "Mám všechno"],
            ["quick", "Do 15 min"],
          ] as const
        ).map(([id, l]) => (
          <button key={id} className="chip" aria-pressed={filter === id} onClick={() => setFilter(id)}>
            {l}
          </button>
        ))}
      </div>

      {!view && <p className="muted">Procházím lednici…</p>}
      {view && !ideas.length && (
        <div className="empty" style={{ padding: 16 }}>
          <p>Z receptů tu teď nic nevychází{filter !== "all" ? " s tímhle filtrem" : ""}. Zkus nápad od AI níže, nebo doplň zásoby (foto lednice, účtenka).</p>
        </div>
      )}

      <div style={{ display: "grid", gap: 8 }}>
        {ideas.map((i) => (
          <article key={i.recipeId} className="fc-card">
            <span className="fc-emoji" aria-hidden>
              {i.emoji}
            </span>
            <div className="fc-body">
              <div className="fc-title">
                <strong>{i.name}</strong>
                <span className={`pill ${i.tier === "ready" ? "pill-green" : i.tier === "almost" ? "pill-amber" : ""}`}>{i.tier === "ready" ? "Máš všechno" : i.tier === "almost" ? `Chybí ${i.missing.filter((m) => !m.minor).length}` : `${Math.round(i.coverage * 100)} % doma`}</span>
              </div>
              <small className="fc-meta">
                <Clock size={13} /> {i.totalMin} min · {portions(i.servings)} · {fmt(i.macros.kcal)} kcal · {fmt(i.macros.protein)} g B
              </small>
              {i.usesExpiring.length > 0 && <small className="fc-exp">Spotřebuje: {i.usesExpiring.map((e) => `${e.name.toLowerCase()} (${daysLabel(e.days)})`).join(", ")}</small>}
              {i.substitutions.length > 0 && <small className="muted">Náhrada: {i.substitutions.map((s) => `${s.use.toLowerCase()} místo ${s.want.toLowerCase()}`).join(", ")}</small>}
              {i.missing.some((m) => !m.minor) && (
                <small className="fc-miss">
                  Chybí:{" "}
                  {i.missing
                    .filter((m) => !m.minor)
                    .map((m) => m.name.toLowerCase())
                    .join(", ")}
                </small>
              )}
              {i.missing.some((m) => m.minor) && (
                <small className="muted">
                  Klidně bez:{" "}
                  {i.missing
                    .filter((m) => m.minor)
                    .map((m) => m.name.toLowerCase())
                    .join(", ")}
                </small>
              )}
              <div className="fc-actions">
                <button className="btn btn-sm btn-primary" disabled={pending} onClick={() => use(i.recipeId, i.servings, true, i.name)}>
                  <ChefHat size={16} /> Uvařit a sníst
                </button>
                <button className="btn btn-sm btn-soft" disabled={pending} onClick={() => use(i.recipeId, i.servings, false, i.name)}>
                  Dát do plánu
                </button>
                <Link className="btn btn-sm btn-ghost" href={`/recipes/${i.recipeId}`}>
                  Recept
                </Link>
              </div>
            </div>
          </article>
        ))}
      </div>

      <section style={{ marginTop: 16, display: "grid", gap: 8 }} aria-label="Nápady od AI">
        {!ai && (
          <button className="btn btn-ghost btn-full" disabled={aiBusy || !view} onClick={askAi}>
            <Sparkles size={18} /> {aiBusy ? "Vymýšlím z toho, co máš… (~20 s)" : "Vymysli něco jiného z lednice (AI)"}
          </button>
        )}
        {ai?.map((a, k) => (
          <article key={k} className="fc-card fc-ai">
            <div className="fc-body">
              <div className="fc-title">
                <strong>{a.name}</strong>
                <span className="pill">AI nápad</span>
              </div>
              <small className="fc-meta">
                <Clock size={13} /> {Math.round(a.minutes)} min · {fmt(a.kcal)} kcal · {fmt(a.protein)} g B na porci ({a.estimated === "catalog" ? "spočítáno ze surovin" : "odhad AI"})
              </small>
              <small className="muted">{a.why}</small>
              <ul className="fc-ings">
                {a.ingredients.map((g, j) => (
                  <li key={j} className={g.fromFridge ? "" : "fc-miss"}>
                    {g.fromFridge ? <Check size={12} /> : "+"} {g.name} — {g.amount}
                  </li>
                ))}
              </ul>
              <ol className="fc-steps">
                {a.steps.map((s, j) => (
                  <li key={j}>{s}</li>
                ))}
              </ol>
              <div className="fc-actions">
                <button
                  className="btn btn-sm btn-primary"
                  disabled={pending}
                  onClick={() =>
                    start(async () => {
                      await logFood({ date: view?.date ?? new Date().toISOString().slice(0, 10), slot: view?.active ?? null, name: a.name, kcal: Math.max(0, a.kcal), protein: Math.max(0, a.protein), source: "inventory", confidence: 0.6 });
                      toast(`Zapsáno: ${a.name}. Suroviny si odepiš v Lednici.`);
                      onClose();
                    })
                  }
                >
                  Snědeno — zapsat
                </button>
                <button
                  className="btn btn-sm btn-soft"
                  disabled={pending}
                  onClick={() =>
                    start(async () => {
                      const text = `${a.name} (${a.servings} porce, ${Math.round(a.minutes)} min)\nSuroviny:\n${a.ingredients.map((g) => `- ${g.name}: ${g.amount}`).join("\n")}\nPostup:\n${a.steps.map((s, j) => `${j + 1}. ${s}`).join("\n")}`;
                      const r = await fetch("/api/recipes/import", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text }) });
                      const j = await r.json().catch(() => ({}));
                      if (!r.ok) return toast(j.error ?? "Uložení se nepovedlo.", true);
                      toast("Uloženo do receptů — plánovač ho teď zná.");
                      await reload();
                    })
                  }
                >
                  Uložit jako recept
                </button>
              </div>
            </div>
          </article>
        ))}
        {ai && (
          <button className="btn btn-ghost btn-sm" disabled={aiBusy} onClick={askAi}>
            {aiBusy ? "Vymýšlím…" : "Jiné nápady"}
          </button>
        )}
      </section>

      {view && view.slots.some((s) => s.mealId) && (
        <div className="between" style={{ marginTop: 16, gap: 8, flexWrap: "wrap" }}>
          <small className="muted">Nestihl jsi meal prep? Přestavím zbytek dne jen z toho, co je doma.</small>
          <button
            className="btn btn-sm btn-dark"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await rebuildDayFromFridge(view.date, true);
                toast(r.changed.length ? `Přestaveno: ${r.changed.join(" · ")}${r.unfilled.length ? `. Bez náhrady: ${r.unfilled.join(", ")}` : ""}` : "Z lednice teď nic vhodného nevychází.", !r.changed.length);
                if (r.changed.length) onClose();
              })
            }
          >
            Přestavět zbytek dne z lednice
          </button>
        </div>
      )}
    </Sheet>
  );
}
