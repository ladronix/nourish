"use client";
import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { Plus, Search } from "lucide-react";
import { MealRow, type MealView } from "./meal-row";
import { Sheet } from "./sheet";
import { addMeal } from "@/app/actions/plan";
import { useToast } from "./toast";

type Day = { date: string; short: string; num: number; kcal: number; protein: number; isToday: boolean; isPast: boolean; meals: (MealView & { slot: string })[]; prep?: { totalMin: number; portions: number } | null };
type RecipeOpt = { id: string; name: string; emoji: string; mealTypes: string[]; kcal: number; protein: number; totalMin: number };

const SLOTS: [string, string][] = [
  ["breakfast", "Snídaně"],
  ["snack_am", "Dopolední svačina"],
  ["lunch", "Oběd"],
  ["snack", "Svačina"],
  ["dinner", "Večeře"],
];

export function WeekBoard({ days, recipes, target }: { days: Day[]; recipes: RecipeOpt[]; target: { kcalMin: number; kcalMax: number } }) {
  const [open, setOpen] = useState<MealView | null>(null);
  const [adding, setAdding] = useState<string | null>(null);
  const [slot, setSlot] = useState("dinner");
  const [q, setQ] = useState("");
  const [pending, start] = useTransition();
  const toast = useToast();
  const filtered = useMemo(() => recipes.filter((r) => r.mealTypes.includes(slot) && r.name.toLowerCase().includes(q.toLowerCase())), [recipes, slot, q]);

  return (
    <>
      <div className="week">
        {days.map((d) => (
          <article key={d.date} className={`${d.isToday ? "today" : ""} ${d.isPast ? "past" : ""}`}>
            <header>
              <span>{d.short}</span>
              <strong>{d.num}</strong>
              <em style={{ color: d.kcal && (d.kcal < target.kcalMin - 150 || d.kcal > target.kcalMax + 150) ? "var(--coral-ink)" : undefined }}>
                {d.kcal ? `${Math.round(d.kcal).toLocaleString("cs-CZ")} kcal` : "—"}
                <br />
                {d.protein ? `${Math.round(d.protein)} g B` : ""}
              </em>
            </header>
            {d.prep && (
              <Link href="/prep" className="prep-chip">
                <b>Meal prep</b>
                <span>
                  {d.prep.totalMin} min · {d.prep.portions} porcí
                </span>
              </Link>
            )}
            {d.meals.map((m) => (
              <button key={m.id} className={`wmeal ${m.fromPrep ? "prep" : ""} ${m.status} ${m.locked ? "locked" : ""}`} onClick={() => setOpen(m)}>
                <span className="e" aria-hidden>
                  {m.emoji}
                </span>
                <b>
                  {m.slotLabel} · {m.time}
                </b>
                <span style={{ paddingRight: 22 }}>{m.name}</span>
                <small>
                  {Math.round(m.kcal)} kcal · {Math.round(m.protein)} g B{m.fromPrep ? " · krabička" : ""}
                </small>
              </button>
            ))}
            <button className="add-meal" onClick={() => setAdding(d.date)}>
              + Přidat jídlo
            </button>
          </article>
        ))}
      </div>

      <Sheet open={!!open} onClose={() => setOpen(null)} label="Jídlo">
        {open && (
          <>
            <span className="eyebrow">Upravit jídlo</span>
            <div style={{ marginTop: 10 }} onClick={(e) => (e.target as HTMLElement).closest(".cand, .option") && setTimeout(() => setOpen(null), 50)}>
              <MealRow m={open} />
            </div>
          </>
        )}
      </Sheet>

      <Sheet open={!!adding} onClose={() => setAdding(null)} label="Přidat jídlo" wide>
        <span className="eyebrow">Přidat jídlo</span>
        <h2>Co si dáš?</h2>
        <div className="chips" style={{ margin: "10px 0" }}>
          {SLOTS.map(([id, l]) => (
            <button key={id} className="chip" aria-pressed={slot === id} onClick={() => setSlot(id)}>
              {l}
            </button>
          ))}
        </div>
        <div className="search" style={{ maxWidth: "none", marginBottom: 10 }}>
          <Search />
          <input placeholder="Hledat recept…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div style={{ display: "grid", gap: 8 }}>
          {filtered.map((r) => (
            <button
              key={r.id}
              className="cand"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  await addMeal(adding!, slot as never, r.id, 1);
                  setAdding(null);
                  toast(`Přidáno: ${r.name}`);
                })
              }
            >
              <span className="emoji">{r.emoji}</span>
              <span>
                <strong>{r.name}</strong>
                <small>
                  {r.kcal} kcal · {r.protein} g B · {r.totalMin} min
                </small>
              </span>
              <Plus size={18} />
            </button>
          ))}
          {!filtered.length && <p className="muted">Nic neodpovídá. Přidej vlastní recept v Receptech.</p>}
        </div>
      </Sheet>
    </>
  );
}
