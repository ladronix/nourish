"use client";
import { useState, useTransition } from "react";
import { Timer, Salad, UtensilsCrossed, Beef, Droplets, Scale, Sparkles, Shuffle } from "lucide-react";
import { rebuildDay, generateWeek, previewWeekVariants } from "@/app/actions/plan";
import { addWater, addWeighIn } from "@/app/actions/log";
import { Sheet } from "./sheet";
import { useToast } from "./toast";

const MODES = [
  { id: "less_time", label: "Méně času", icon: Timer },
  { id: "lighter", label: "Lehčí večeři", icon: Salad },
  { id: "eating_out", label: "Jím venku", icon: UtensilsCrossed },
  { id: "more_protein", label: "Víc bílkovin", icon: Beef },
] as const;

export function RebuildDayButton({ date, className = "btn btn-ghost-light" }: { date: string; className?: string }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<(typeof MODES)[number]["id"]>("less_time");
  const [pending, start] = useTransition();
  const toast = useToast();
  return (
    <>
      <button className={className} onClick={() => setOpen(true)}>
        Upravit den
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} label="Upravit den">
        <span className="eyebrow">Rychlá úprava</span>
        <h2>Co dnes potřebuješ změnit?</h2>
        <p>Cíl i zásoby zůstanou. Přestaví se jen jídla, která ještě nejsou snědená. Krabičky z meal prepu zůstanou.</p>
        <div className="options">
          {MODES.map((m) => (
            <button key={m.id} className="option" aria-pressed={mode === m.id} onClick={() => setMode(m.id)}>
              <m.icon size={18} /> {m.label}
            </button>
          ))}
        </div>
        <button
          className="btn btn-primary btn-full"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await rebuildDay(date, mode);
              setOpen(false);
              toast(r.changed.length ? `Přestavěno: ${r.changed.join(", ")}` : "Nebylo co měnit — dnešní jídla už sedí.");
            })
          }
        >
          {pending ? "Přestavuji…" : "Přestavět dnešní plán"}
        </button>
      </Sheet>
    </>
  );
}

export function GenerateWeekButton({ weekStart, label = "Sestavit plán na týden", className = "btn btn-primary" }: { weekStart: string; label?: string; className?: string }) {
  const [pending, start] = useTransition();
  const toast = useToast();
  return (
    <button
      className={className}
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await generateWeek(weekStart);
          toast(r.explanation.notes[0] ?? "Plán je připravený.");
        })
      }
    >
      <Sparkles size={18} /> {pending ? "Skládám týden…" : label}
    </button>
  );
}

type Variant = Awaited<ReturnType<typeof previewWeekVariants>>[number];

/** Alternatives for an existing week: shuffle, or compare 4 differently-weighted weeks before saving one. */
export function WeekAlternatives({ weekStart }: { weekStart: string }) {
  const [open, setOpen] = useState(false);
  const [variants, setVariants] = useState<Variant[] | null>(null);
  const [pending, start] = useTransition();
  const toast = useToast();
  const load = () =>
    start(async () => {
      setVariants(null);
      setVariants(await previewWeekVariants(weekStart));
    });
  return (
    <>
      <button
        className="btn btn-primary"
        onClick={() => {
          setOpen(true);
          load();
        }}
      >
        <Shuffle size={18} /> Alternativy týdne
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} label="Alternativy týdne" wide>
        <span className="eyebrow">Přestavět týden</span>
        <h2>Vyber si jinou verzi</h2>
        <p className="small muted">Snědená, minulá a zamčená jídla (🔒) zůstanou. Jednotlivé jídlo vyměníš klepnutím na něj v plánu → „Vyměnit“.</p>
        <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
          {!variants && <p className="muted">Skládám 4 varianty…</p>}
          {variants?.map((v) => (
            <button
              key={v.style}
              className="cand"
              style={{ gridTemplateColumns: "minmax(0,1fr) auto" }}
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await generateWeek(weekStart, { seed: v.seed, style: v.style });
                  setOpen(false);
                  toast(`Uloženo: ${v.label}. ${r.explanation.notes[0] ?? ""}`);
                })
              }
            >
              <span>
                <strong>
                  {v.label} <span className="muted" style={{ fontWeight: 400 }}>· {v.hint}</span>
                </strong>
                <small>
                  {v.avgKcal.toLocaleString("cs-CZ")} kcal · {v.avgProtein} g B / den · ≈ {v.estCostCzk.toLocaleString("cs-CZ")} Kč · vaření {v.cookMinutes} min · {Math.round(v.plantPoints)} rostlin
                </small>
                <small>
                  Změní {v.changed} z {v.total} jídel{v.sample.length ? ` · např. ${v.sample.slice(0, 4).join(", ")}` : ""}
                </small>
              </span>
              <span className="pill">Použít</span>
            </button>
          ))}
        </div>
        <div className="between" style={{ marginTop: 12, gap: 8 }}>
          <button className="btn btn-ghost btn-sm" disabled={pending} onClick={load}>
            Jiné návrhy
          </button>
          <button
            className="btn btn-soft btn-sm"
            disabled={pending}
            onClick={() =>
              start(async () => {
                await generateWeek(weekStart);
                setOpen(false);
                toast("Týden zamíchán (vyvážená verze).");
              })
            }
          >
            Jen zamíchat
          </button>
        </div>
      </Sheet>
    </>
  );
}

export function WaterWidget({ ml, goal }: { ml: number; goal: number }) {
  const [pending, start] = useTransition();
  const pct = Math.min(100, Math.round((ml / goal) * 100));
  return (
    <div className="panel">
      <div className="between">
        <div>
          <span className="eyebrow">Pitný režim</span>
          <h3 style={{ marginTop: 4, fontSize: 18 }}>
            {(ml / 1000).toFixed(1).replace(".", ",")} / {(goal / 1000).toFixed(1).replace(".", ",")} l
          </h3>
        </div>
        <Droplets color="#738da5" />
      </div>
      <div className="track" style={{ margin: "12px 0" }}>
        <i style={{ width: `${pct}%`, background: "#738da5" }} />
      </div>
      <div className="row" style={{ flexWrap: "wrap" }}>
        {[250, 500].map((v) => (
          <button key={v} className="btn btn-sm btn-soft" disabled={pending} onClick={() => start(() => addWater(v))}>
            + {v} ml
          </button>
        ))}
        <button className="btn btn-sm btn-ghost" disabled={pending || ml <= 0} onClick={() => start(() => addWater(-250))} aria-label="Ubrat 250 ml">
          −
        </button>
      </div>
    </div>
  );
}

export function WeighInQuick({ last, trend }: { last: number | null; trend: number | null }) {
  const [v, setV] = useState(last ? String(last).replace(".", ",") : "");
  const [pending, start] = useTransition();
  const toast = useToast();
  return (
    <form
      className="panel"
      onSubmit={(e) => {
        e.preventDefault();
        const kg = parseFloat(v.replace(",", "."));
        if (!kg) return;
        start(async () => {
          await addWeighIn(kg);
          toast("Zapsáno. Sledujeme trend, ne jednotlivá čísla.");
        });
      }}
    >
      <div className="between">
        <div>
          <span className="eyebrow">Ranní vážení</span>
          <h3 style={{ marginTop: 4, fontSize: 18 }}>{trend ? `Trend ${trend.toFixed(1).replace(".", ",")} kg` : "Začni trend"}</h3>
        </div>
        <Scale color="#6c6e66" />
      </div>
      <div className="row" style={{ marginTop: 12 }}>
        <input className="input" inputMode="decimal" placeholder="kg" value={v} onChange={(e) => setV(e.target.value)} aria-label="Hmotnost v kg" style={{ maxWidth: 120 }} />
        <button className="btn btn-dark" disabled={pending || !v}>
          Uložit
        </button>
      </div>
    </form>
  );
}
