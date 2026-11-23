"use client";
import { useState, useTransition } from "react";
import { Check, Flame, Hand, Play, PackageCheck } from "lucide-react";
import { toggleStep, finishPrep } from "@/app/actions/prep";
import { CookMode } from "./cook-mode";
import { useToast } from "./toast";

type Step = { id: string; text: string; recipeName: string; startMin: number; durationMin: number; passive: boolean };

export function PrepGuide({ sessionId, steps, completed, done }: { sessionId: number; steps: Step[]; completed: string[]; done: boolean }) {
  const [cook, setCook] = useState(false);
  const [pending, start] = useTransition();
  const toast = useToast();
  const set = new Set(completed);
  return (
    <>
      <div className="row" style={{ flexWrap: "wrap", marginBottom: 14 }}>
        {!done && (
          <button className="btn btn-primary" onClick={() => setCook(true)}>
            <Play size={18} /> Spustit průvodce
          </button>
        )}
        {!done && (
          <button
            className="btn btn-dark"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await finishPrep(sessionId);
                if (r.ok) toast(`Uloženo do lednice: ${r.created?.join("; ")}${r.missing?.length ? `. Chybělo: ${r.missing.join(", ")}` : ""}`);
              })
            }
          >
            <PackageCheck size={18} /> Hotovo — uložit porce
          </button>
        )}
      </div>
      <div className="timeline">
        {steps.map((s) => (
          <div key={s.id} className={`tstep ${set.has(s.id) ? "done" : ""} ${s.passive ? "passive" : ""}`}>
            <div className="tmin">
              {s.startMin}′<small>{s.durationMin} min</small>
            </div>
            <span title={s.passive ? "Běží samo (trouba / vaření)" : "Ruce"}>{s.passive ? <Flame size={20} color="#c0663f" /> : <Hand size={20} color="#6c6e66" />}</span>
            <div className="ttext">
              {s.text}
              <small>{s.recipeName}</small>
            </div>
            <button className="icon-btn" style={{ width: 36, height: 36 }} disabled={done || pending} onClick={() => start(() => toggleStep(sessionId, s.id))} aria-label={set.has(s.id) ? "Odznačit krok" : "Označit krok jako hotový"} aria-pressed={set.has(s.id)}>
              <Check size={18} />
            </button>
          </div>
        ))}
      </div>
      {cook && (
        <CookMode
          title="Meal prep"
          steps={steps.map((s) => ({ id: s.id, text: s.text, sub: `${s.recipeName} · ${s.startMin}′${s.passive ? " · běží samo" : ""}`, timerMin: s.passive || s.durationMin >= 5 ? s.durationMin : undefined }))}
          onClose={() => setCook(false)}
          onStepDone={(id) => !set.has(id) && start(() => toggleStep(sessionId, id))}
        />
      )}
    </>
  );
}
