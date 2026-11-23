"use client";
import { useMemo, useRef, useState } from "react";

type P = { date: string; kg: number; trend: number };

/** Single-series trend chart: trend line (2px) + raw weigh-ins as muted markers, crosshair tooltip. */
export function WeightChart({ points }: { points: P[] }) {
  const ref = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const W = 640;
  const H = 220;
  const pad = { l: 40, r: 12, t: 14, b: 26 };
  const g = useMemo(() => {
    if (points.length < 2) return null;
    const t0 = Date.parse(points[0].date);
    const t1 = Date.parse(points[points.length - 1].date);
    const vals = points.flatMap((p) => [p.kg, p.trend]);
    let lo = Math.floor(Math.min(...vals) - 0.5);
    let hi = Math.ceil(Math.max(...vals) + 0.5);
    if (hi - lo < 3) {
      lo -= 1;
      hi += 1;
    }
    const x = (d: string) => pad.l + ((Date.parse(d) - t0) / Math.max(1, t1 - t0)) * (W - pad.l - pad.r);
    const y = (v: number) => pad.t + (1 - (v - lo) / (hi - lo)) * (H - pad.t - pad.b);
    const ticks = Array.from({ length: 4 }, (_, i) => lo + ((hi - lo) * i) / 3);
    return { x, y, ticks, line: points.map((p, i) => `${i ? "L" : "M"}${x(p.date).toFixed(1)},${y(p.trend).toFixed(1)}`).join(" ") };
  }, [points, pad.l, pad.r, pad.t, pad.b]);

  if (!g) return <p className="small muted">Pro graf potřebuji alespoň dvě vážení.</p>;
  const hp = hover !== null ? points[hover] : null;
  const fmt = (n: number) => n.toFixed(1).replace(".", ",");

  function onMove(e: React.PointerEvent<SVGSVGElement>) {
    const r = ref.current!.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    let best = 0;
    let bd = Infinity;
    points.forEach((p, i) => {
      const d = Math.abs(g!.x(p.date) - px);
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    setHover(best);
  }

  return (
    <div style={{ position: "relative" }}>
      <svg ref={ref} viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label={`Trend hmotnosti ${fmt(points[0].trend)} → ${fmt(points.at(-1)!.trend)} kg`} onPointerMove={onMove} onPointerLeave={() => setHover(null)} style={{ touchAction: "pan-y" }}>
        {g.ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={g.y(t)} y2={g.y(t)} stroke="#e9e7e0" strokeWidth={1} />
            <text x={pad.l - 8} y={g.y(t) + 4} textAnchor="end">
              {Math.round(t)}
            </text>
          </g>
        ))}
        {[points[0], points[Math.floor(points.length / 2)], points.at(-1)!].map((p) => (
          <text key={p.date} x={g.x(p.date)} y={H - 6} textAnchor="middle">
            {Number(p.date.slice(8))}.{Number(p.date.slice(5, 7))}.
          </text>
        ))}
        {points.map((p) => (
          <circle key={p.date} cx={g.x(p.date)} cy={g.y(p.kg)} r={4} fill="#c9c7be" stroke="var(--card)" strokeWidth={2} />
        ))}
        <path d={g.line} fill="none" stroke="var(--coral)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        {hp && (
          <g>
            <line x1={g.x(hp.date)} x2={g.x(hp.date)} y1={pad.t} y2={H - pad.b} stroke="#9c9e96" strokeDasharray="3 3" />
            <circle cx={g.x(hp.date)} cy={g.y(hp.trend)} r={5} fill="var(--coral)" stroke="var(--card)" strokeWidth={2} />
          </g>
        )}
      </svg>
      {hp && (
        <div className="panel" style={{ position: "absolute", top: 0, left: `${Math.min(70, (g.x(hp.date) / W) * 100)}%`, padding: "8px 10px", pointerEvents: "none", fontSize: 12.5, boxShadow: "var(--shadow)" }}>
          <strong>
            {Number(hp.date.slice(8))}. {Number(hp.date.slice(5, 7))}.
          </strong>
          <div>Váha {fmt(hp.kg)} kg</div>
          <div className="muted">Trend {fmt(hp.trend)} kg</div>
        </div>
      )}
      <div className="row tiny muted" style={{ gap: 14, marginTop: 4 }}>
        <span className="row" style={{ gap: 6 }}>
          <i style={{ width: 16, height: 2, background: "var(--coral)", display: "inline-block" }} /> trend (vyhlazený)
        </span>
        <span className="row" style={{ gap: 6 }}>
          <i style={{ width: 8, height: 8, borderRadius: 4, background: "#c9c7be", display: "inline-block" }} /> jednotlivá vážení
        </span>
      </div>
    </div>
  );
}
