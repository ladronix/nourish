"use client";
import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, X, TimerReset, Play, Pause } from "lucide-react";

export type CookStep = { id: string; text: string; sub?: string; timerMin?: number };

type Timer = { id: string; label: string; endsAt: number; total: number; paused?: number };

function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || !("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    const req = () =>
      navigator.wakeLock
        .request("screen")
        .then((l) => (lock = l))
        .catch(() => {});
    req();
    const onVis = () => document.visibilityState === "visible" && req();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      lock?.release().catch(() => {});
    };
  }, [active]);
}

function beep() {
  try {
    const ctx = new AudioContext();
    [0, 0.35, 0.7].forEach((t) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = 880;
      o.connect(g);
      g.connect(ctx.destination);
      g.gain.setValueAtTime(0.25, ctx.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.3);
      o.start(ctx.currentTime + t);
      o.stop(ctx.currentTime + t + 0.3);
    });
  } catch {
    /* audio blocked */
  }
  navigator.vibrate?.([200, 100, 200]);
}

export function CookMode({ title, steps, onClose, onStepDone }: { title: string; steps: CookStep[]; onClose: () => void; onStepDone?: (id: string) => void }) {
  const [i, setI] = useState(0);
  const [timers, setTimers] = useState<Timer[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const fired = useRef(new Set<string>());
  useWakeLock(true);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    for (const t of timers) {
      if (!t.paused && t.endsAt <= now && !fired.current.has(t.id)) {
        fired.current.add(t.id);
        beep();
      }
    }
  }, [now, timers]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") setI((x) => Math.min(steps.length - 1, x + 1));
      if (e.key === "ArrowLeft") setI((x) => Math.max(0, x - 1));
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", k);
    return () => document.removeEventListener("keydown", k);
  }, [steps.length, onClose]);

  const s = steps[i];
  const startTimer = (step: CookStep) => {
    const id = `${step.id}-${Date.now()}`;
    setTimers((ts) => [...ts, { id, label: step.text.slice(0, 40), endsAt: Date.now() + (step.timerMin ?? 1) * 60000, total: (step.timerMin ?? 1) * 60000 }]);
  };
  const fmt = (ms: number) => {
    const sec = Math.max(0, Math.round(ms / 1000));
    return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
  };

  const next = () => {
    onStepDone?.(s.id);
    if (i < steps.length - 1) setI(i + 1);
    else onClose();
  };

  return (
    <div className="cook" role="dialog" aria-modal="true" aria-label={`Vaření: ${title}`}>
      <div className="between">
        <div>
          <span className="eyebrow" style={{ color: "var(--coral)" }}>
            Krok {i + 1} / {steps.length}
          </span>
          <strong style={{ fontFamily: "var(--font-display)" }}>{title}</strong>
        </div>
        <button className="icon-btn" style={{ background: "var(--dark-3)", borderColor: "#333", color: "#fff" }} onClick={onClose} aria-label="Zavřít režim vaření">
          <X />
        </button>
      </div>
      <div className="track" style={{ margin: "14px 0", background: "#2a2b27" }}>
        <i style={{ width: `${((i + 1) / steps.length) * 100}%` }} />
      </div>
      {timers.length > 0 && (
        <div className="row" style={{ flexWrap: "wrap" }}>
          {timers.map((t) => {
            const left = t.paused ?? t.endsAt - now;
            const done = !t.paused && left <= 0;
            return (
              <div key={t.id} className={`timer ${done ? "end" : t.paused ? "" : "run"}`}>
                <span style={{ fontSize: 12, maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: "var(--font-body)" }}>{t.label}</span>
                {done ? "Hotovo" : fmt(left)}
                {!done && (
                  <button
                    className="text-btn"
                    style={{ color: "inherit" }}
                    aria-label={t.paused ? "Pokračovat" : "Pozastavit"}
                    onClick={() => setTimers((ts) => ts.map((x) => (x.id !== t.id ? x : x.paused ? { ...x, endsAt: Date.now() + x.paused, paused: undefined } : { ...x, paused: x.endsAt - Date.now() })))}
                  >
                    {t.paused ? <Play size={16} /> : <Pause size={16} />}
                  </button>
                )}
                <button className="text-btn" style={{ color: "inherit" }} aria-label="Zrušit časovač" onClick={() => setTimers((ts) => ts.filter((x) => x.id !== t.id))}>
                  <X size={16} />
                </button>
              </div>
            );
          })}
        </div>
      )}
      <div className="cook-step">
        {s.sub && <span className="pill pill-light">{s.sub}</span>}
        <p>{s.text}</p>
        {s.timerMin ? (
          <button className="btn btn-ghost-light" style={{ justifySelf: "start" }} onClick={() => startTimer(s)}>
            <TimerReset size={18} /> Spustit časovač {s.timerMin} min
          </button>
        ) : null}
      </div>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <button className="btn btn-ghost-light" onClick={() => setI(Math.max(0, i - 1))} disabled={i === 0}>
          <ChevronLeft size={18} /> Zpět
        </button>
        <button className="btn btn-primary" onClick={next} style={{ minWidth: 160 }}>
          {i < steps.length - 1 ? (
            <>
              Hotovo, další <ChevronRight size={18} />
            </>
          ) : (
            "Dokončit"
          )}
        </button>
      </div>
    </div>
  );
}
