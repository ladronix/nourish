/**
 * Weight trend + adaptive expenditure (TDEE) estimation.
 *
 * Trend: time-aware exponential smoothing  α = 1 − exp(−Δd/τ), τ = 10 days
 *        (≈ Hacker's Diet 10 % daily smoothing, robust to gaps).
 * TDEE:  over a rolling 21-day window: TDEE_raw = mean intake − ρ · slope(trend),
 *        blended with the previous estimate, capped ±75 kcal/day per update.
 */
import { diffDays, addDays } from "./dates";
import { KCAL_PER_KG } from "./nutrition";

export type WeighIn = { date: string; kg: number };
export type TrendPoint = { date: string; kg: number; trend: number };

const TAU = 10;

export function trendSeries(weighIns: WeighIn[]): TrendPoint[] {
  const sorted = [...weighIns].sort((a, b) => a.date.localeCompare(b.date));
  const out: TrendPoint[] = [];
  let prev: TrendPoint | null = null;
  for (const w of sorted) {
    if (!prev) {
      prev = { date: w.date, kg: w.kg, trend: w.kg };
    } else {
      const dd = Math.max(1, diffDays(w.date, prev.date));
      const alpha = 1 - Math.exp(-dd / TAU);
      prev = { date: w.date, kg: w.kg, trend: prev.trend + alpha * (w.kg - prev.trend) };
    }
    out.push(prev);
  }
  return out;
}

/** Least-squares slope in kg/day. */
export function slopePerDay(points: { date: string; value: number }[]): number | null {
  if (points.length < 2) return null;
  const x0 = points[0].date;
  const xs = points.map((p) => diffDays(p.date, x0));
  const ys = points.map((p) => p.value);
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    den += (xs[i] - mx) ** 2;
  }
  return den === 0 ? null : num / den;
}

export type IntakeDay = { date: string; kcal: number; logged: boolean };

export type TdeeEstimate = {
  tdee: number;
  confidence: "low" | "medium" | "high";
  rateKgWeek: number | null;
  trendKg: number | null;
  reason: string;
  usedDays: number;
};

export function estimateTdee(opts: {
  weighIns: WeighIn[];
  intake: IntakeDay[];
  prior: number; // formula TDEE or previous estimate
  today: string;
  windowDays?: number;
}): TdeeEstimate {
  const window = opts.windowDays ?? 21;
  const from = addDays(opts.today, -window + 1);
  const series = trendSeries(opts.weighIns);
  const inWin = series.filter((p) => p.date >= from && p.date <= opts.today);
  const trendKg = series.length ? series[series.length - 1].trend : null;
  const intake = opts.intake.filter((d) => d.date >= from && d.date <= opts.today);
  const logged = intake.filter((d) => d.logged);

  const last7 = intake.filter((d) => d.date > addDays(opts.today, -7));
  const missing7 = 7 - last7.filter((d) => d.logged).length;

  if (inWin.length < 3 || logged.length < 7) {
    return {
      tdee: Math.round(opts.prior),
      confidence: "low",
      rateKgWeek: null,
      trendKg,
      reason: "Málo dat — potřebuji alespoň 3 vážení a 7 zapsaných dní za 3 týdny. Používám výchozí odhad.",
      usedDays: logged.length,
    };
  }
  const slope = slopePerDay(inWin.map((p) => ({ date: p.date, value: p.trend })))!;
  if (missing7 > 3) {
    return {
      tdee: Math.round(opts.prior),
      confidence: "low",
      rateKgWeek: slope * 7,
      trendKg,
      reason: "Za poslední týden chybí víc než 3 dny záznamů — odhad výdeje jsem nechal beze změny.",
      usedDays: logged.length,
    };
  }
  const meanIntake = logged.reduce((a, d) => a + d.kcal, 0) / logged.length;
  const raw = meanIntake - KCAL_PER_KG * slope;
  const blended = opts.prior + 0.35 * (raw - opts.prior); // weekly update ≈ 0.1/day compounded
  const capped = Math.min(opts.prior + 7 * 75, Math.max(opts.prior - 7 * 75, blended));
  const confidence = logged.length >= 18 && inWin.length >= 8 ? "high" : "medium";
  return {
    tdee: Math.round(capped),
    confidence,
    rateKgWeek: slope * 7,
    trendKg,
    reason: `Průměrný příjem ${Math.round(meanIntake)} kcal, trend ${(slope * 7).toFixed(2)} kg/týden → výdej ≈ ${Math.round(raw)} kcal.`,
    usedDays: logged.length,
  };
}
