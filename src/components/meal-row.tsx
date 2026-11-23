"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { Check, Minus, MoreHorizontal, Repeat2, Undo2, Lock, LockOpen, Trash2, ChefHat } from "lucide-react";
import { setMealStatus, getSwapOptions, swapMeal, setServings, toggleLock, removeMeal } from "@/app/actions/plan";
import { Sheet } from "./sheet";
import { useToast } from "./toast";

export type MealView = {
  id: number;
  time: string;
  slotLabel: string;
  status: "planned" | "eaten" | "skipped" | "swapped";
  recipeId: string | null;
  name: string;
  emoji: string;
  kcal: number;
  protein: number;
  servings: number;
  fromPrep: boolean;
  locked: boolean;
  totalMin: number;
  note: string | null;
};

type Cand = Awaited<ReturnType<typeof getSwapOptions>>[number];

export function MealRow({ m }: { m: MealView }) {
  const [pending, start] = useTransition();
  const [menu, setMenu] = useState(false);
  const [swap, setSwap] = useState<Cand[] | null>(null);
  const toast = useToast();

  const toggle = () =>
    start(async () => {
      const next = m.status === "eaten" ? "planned" : "eaten";
      const r = await setMealStatus(m.id, next);
      toast(next === "eaten" ? (r?.note ? `Snědeno. ${r.note}` : "Snědeno — zásoby odečteny.") : "Vráceno do plánu.");
    });

  const openSwap = () =>
    start(async () => {
      setMenu(false);
      setSwap(await getSwapOptions(m.id));
    });

  return (
    <div className={`meal ${m.status}`} style={{ opacity: pending ? 0.6 : 1 }}>
      <button className="meal-check" onClick={toggle} disabled={pending || !m.recipeId} aria-label={m.status === "eaten" ? `Vrátit ${m.name}` : `Označit ${m.name} jako snědené`} aria-pressed={m.status === "eaten"}>
        {m.status === "eaten" ? <Check /> : m.status === "skipped" ? <Minus /> : null}
      </button>
      <div className="meal-time">
        <strong>{m.time}</strong>
        <span>{m.slotLabel}</span>
      </div>
      <div className="meal-emoji" aria-hidden>
        {m.emoji}
      </div>
      <div className="meal-copy">
        <strong>{m.name}</strong>
        <span>
          {Math.round(m.kcal)} kcal · {Math.round(m.protein)} g bílkovin
          {m.servings !== 1 ? ` · ${String(m.servings).replace(".", ",")} porce` : ""}
          {m.fromPrep ? " · krabička z meal prepu" : m.totalMin ? ` · ${m.totalMin} min` : ""}
          {m.note ? ` · ${m.note}` : ""}
        </span>
      </div>
      <div className="meal-actions">
        {m.status === "eaten" ? (
          <span className="pill pill-green">Hotovo</span>
        ) : m.status === "skipped" ? (
          <span className="pill pill-gray">Vynecháno</span>
        ) : m.recipeId ? (
          <Link className="btn btn-xs btn-ghost hide-mobile" href={`/recipes/${m.recipeId}?servings=${m.servings}`}>
            Recept
          </Link>
        ) : null}
        <button className="icon-btn" style={{ width: 36, height: 36 }} onClick={() => setMenu(true)} aria-label="Možnosti jídla">
          <MoreHorizontal />
        </button>
      </div>

      <Sheet open={menu} onClose={() => setMenu(false)} label="Možnosti jídla">
        <span className="eyebrow">
          {m.slotLabel} · {m.time}
        </span>
        <h2>{m.name}</h2>
        <p>
          {Math.round(m.kcal)} kcal · {Math.round(m.protein)} g bílkovin
        </p>
        <div className="options">
          {m.recipeId && (
            <Link className="option" href={`/recipes/${m.recipeId}?servings=${m.servings}&cook=1`}>
              <ChefHat size={18} /> Vařit podle receptu
            </Link>
          )}
          {m.status !== "eaten" && (
            <button className="option" onClick={openSwap}>
              <Repeat2 size={18} /> Vyměnit jídlo
            </button>
          )}
          {m.status === "planned" ? (
            <button
              className="option"
              onClick={() =>
                start(async () => {
                  await setMealStatus(m.id, "skipped");
                  setMenu(false);
                  toast("Vynecháno. Zásoby zůstávají.");
                })
              }
            >
              <Minus size={18} /> Vynechat
            </button>
          ) : (
            <button
              className="option"
              onClick={() =>
                start(async () => {
                  await setMealStatus(m.id, "planned");
                  setMenu(false);
                })
              }
            >
              <Undo2 size={18} /> Vrátit do plánu
            </button>
          )}
          <button
            className="option"
            onClick={() =>
              start(async () => {
                await toggleLock(m.id);
                setMenu(false);
                toast(m.locked ? "Odemčeno — přestavění týdne ho může změnit." : "Zamčeno — přestavění týdne ho nechá být.");
              })
            }
          >
            {m.locked ? <LockOpen size={18} /> : <Lock size={18} />} {m.locked ? "Odemknout" : "Zamknout v plánu"}
          </button>
          <button
            className="option"
            onClick={() =>
              start(async () => {
                await removeMeal(m.id);
                setMenu(false);
              })
            }
          >
            <Trash2 size={18} /> Odebrat
          </button>
        </div>
        {m.recipeId && m.status !== "eaten" && !m.fromPrep && (
          <div className="between" style={{ marginTop: 4 }}>
            <span className="label">Velikost porce</span>
            <div className="seg">
              {[0.5, 0.75, 1, 1.25, 1.5, 2].map((s) => (
                <button key={s} aria-pressed={m.servings === s} onClick={() => start(() => setServings(m.id, s))}>
                  {String(s).replace(".", ",")}×
                </button>
              ))}
            </div>
          </div>
        )}
      </Sheet>

      <Sheet open={swap !== null} onClose={() => setSwap(null)} label="Vyměnit jídlo">
        <span className="eyebrow">Vyměnit · {m.slotLabel}</span>
        <h2>Co místo toho?</h2>
        <p>Seřazeno podle zásob, bílkovin a času. Porce je přepočtená na podobné kalorie.</p>
        <div style={{ display: "grid", gap: 8 }}>
          {swap?.length === 0 && <p className="muted">Žádná alternativa nesplňuje tvoje omezení.</p>}
          {swap?.map((c) => (
            <button
              key={c.recipeId}
              className="cand"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  await swapMeal(m.id, c.recipeId, c.servings);
                  setSwap(null);
                  toast(`Vyměněno za ${c.name}.`);
                })
              }
            >
              <span className="emoji">{c.emoji}</span>
              <span>
                <strong>{c.name}</strong>
                <small>
                  {c.kcal} kcal · {c.protein} g B · {c.totalMin} min{c.servings !== 1 ? ` · ${String(c.servings).replace(".", ",")} porce` : ""}
                  {c.reasons.length ? ` · ${c.reasons.join(", ")}` : ""}
                </small>
              </span>
              <Repeat2 size={18} />
            </button>
          ))}
        </div>
      </Sheet>
    </div>
  );
}
