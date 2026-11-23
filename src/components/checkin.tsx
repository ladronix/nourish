"use client";
import { useState, useTransition } from "react";
import { previewCheckin, submitCheckin } from "@/app/actions/log";
import { useToast } from "./toast";

type Preview = Awaited<ReturnType<typeof previewCheckin>>;

export function Checkin() {
  const [p, setP] = useState<Preview | null>(null);
  const [hunger, setHunger] = useState(3);
  const [energy, setEnergy] = useState(3);
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();
  const toast = useToast();
  const scale = (v: number, set: (n: number) => void, labels: [string, string]) => (
    <div className="between">
      <span className="tiny muted">{labels[0]}</span>
      <div className="seg">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} aria-pressed={v === n} onClick={() => set(n)}>
            {n}
          </button>
        ))}
      </div>
      <span className="tiny muted">{labels[1]}</span>
    </div>
  );
  return (
    <div className="panel" id="checkin">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">Týdenní check-in</span>
          <h3>Dvě minuty, žádné známkování</h3>
        </div>
      </div>
      {!p ? (
        <button className="btn btn-dark" disabled={pending} onClick={() => start(async () => setP(await previewCheckin()))}>
          {pending ? "Počítám…" : "Spočítat odhad výdeje"}
        </button>
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          <div className={`note ${p.est.confidence === "low" ? "info" : ""}`}>
            <p style={{ margin: 0 }}>
              <strong>
                Odhad výdeje: {p.est.tdee.toLocaleString("cs-CZ")} kcal/den
              </strong>{" "}
              (dosud {p.currentTdee.toLocaleString("cs-CZ")}, jistota {p.est.confidence === "high" ? "vysoká" : p.est.confidence === "medium" ? "střední" : "nízká"}). {p.est.reason}
            </p>
          </div>
          <div className="field">
            <span>Hlad během týdne</span>
            {scale(hunger, setHunger, ["žádný", "velký"])}
          </div>
          <div className="field">
            <span>Energie</span>
            {scale(energy, setEnergy, ["nízká", "skvělá"])}
          </div>
          <textarea className="textarea" placeholder="Poznámka (volitelné): co šlo dobře, co ne…" value={note} onChange={(e) => setNote(e.target.value)} style={{ minHeight: 60 }} />
          {hunger >= 4 && energy <= 2 && p.goal === "lose" && <p className="note warn">Velký hlad a nízká energie: zvaž pomalejší tempo nebo týden na udržovací hladině. To není neúspěch, to je udržitelnost.</p>}
          <div className="row" style={{ flexWrap: "wrap" }}>
            <button
              className="btn btn-primary"
              disabled={pending || p.est.confidence === "low"}
              onClick={() =>
                start(async () => {
                  const r = await submitCheckin({ hunger, energy, note, applyTdee: true });
                  toast(r.applied ? "Cíl upraven podle skutečného výdeje." : "Uloženo.");
                  setP(null);
                })
              }
            >
              Uložit a upravit cíl
            </button>
            <button
              className="btn btn-soft"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  await submitCheckin({ hunger, energy, note, applyTdee: false });
                  toast("Uloženo, cíl beze změny.");
                  setP(null);
                })
              }
            >
              Uložit bez změny cíle
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
