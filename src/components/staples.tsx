"use client";
import { useMemo, useState, useTransition } from "react";
import { toggleStaple, setMinStock } from "@/app/actions/profile";

export function Staples({ items }: { items: { id: string; name: string; emoji: string; unit: string; isStaple: boolean; minStock: number | null }[] }) {
  const [q, setQ] = useState("");
  const [pending, start] = useTransition();
  const shown = useMemo(() => items.filter((i) => (q ? i.name.toLowerCase().includes(q.toLowerCase()) : i.isStaple || i.minStock != null)), [items, q]);
  return (
    <div className="panel">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">Spíž</span>
          <h3>Základy a minimální zásoby</h3>
        </div>
      </div>
      <p className="small muted" style={{ marginTop: -8 }}>
        <strong>Základ</strong> = vždy doma, na nákup se nepíše (olej, sůl). <strong>Minimum</strong> = když klesne pod hranici, doplní se do nákupu samo.
      </p>
      <input className="input" placeholder="Najít surovinu a nastavit…" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 8 }} />
      {shown.map((i) => (
        <div key={i.id} className="setting">
          <div>
            <strong>
              {i.emoji} {i.name}
            </strong>
            <small>{i.isStaple ? "základ — nekupuje se" : i.minStock != null ? `minimum ${i.minStock} ${i.unit}` : "bez pravidla"}</small>
          </div>
          <div className="row">
            <input
              className="input"
              inputMode="decimal"
              placeholder={`min ${i.unit}`}
              defaultValue={i.minStock ?? ""}
              style={{ width: 90, minHeight: 34 }}
              aria-label={`Minimální zásoba ${i.name}`}
              onBlur={(e) => {
                const v = e.target.value ? Number(e.target.value.replace(",", ".")) : null;
                if (v !== i.minStock) start(() => setMinStock(i.id, v));
              }}
            />
            <button className={`btn btn-xs ${i.isStaple ? "btn-dark" : "btn-ghost"}`} disabled={pending} onClick={() => start(() => toggleStaple(i.id))}>
              Základ
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
