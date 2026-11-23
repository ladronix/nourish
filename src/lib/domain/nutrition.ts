/**
 * Nutrition engine — energy and macro targets expressed as RANGES.
 *
 * Sources (calculation_version "nourish-2026.11"):
 *  - BMR: Mifflin-St Jeor (1990).
 *  - Activity factors: FAO/WHO/UNU PAL bands.
 *  - Protein: 1.6–2.2 g/kg for active adults (ISSN position stand 2017; Morton 2018 meta-analysis),
 *    floor 0.83 g/kg (EFSA PRI).
 *  - Fat: 20–35 % energy (EFSA RI). Carbs: remainder, bounded by 45–60 % EFSA RI when maintaining.
 *  - Fibre: ≥ 25 g/day (EFSA AI), scaled 14 g / 1000 kcal (DGA) if higher.
 *  - Energy per kg body-mass change ≈ 7 700 kcal.
 */
export const CALC_VERSION = "nourish-2026.11";
export const KCAL_PER_KG = 7700;

export type Sex = "male" | "female";
export type Activity = "sedentary" | "light" | "moderate" | "active" | "very_active";
export type Goal = "lose" | "maintain" | "gain";

export const ACTIVITY_FACTOR: Record<Activity, number> = {
  sedentary: 1.3,
  light: 1.45,
  moderate: 1.6,
  active: 1.75,
  very_active: 1.9,
};

export const ACTIVITY_LABEL: Record<Activity, string> = {
  sedentary: "Sedavý (kancelář, málo pohybu)",
  light: "Lehký (chůze, 1–2× trénink)",
  moderate: "Střední (3–4× trénink týdně)",
  active: "Aktivní (5–6× trénink, hodně chůze)",
  very_active: "Velmi aktivní (fyzická práce + trénink)",
};

export type Macros = { kcal: number; protein: number; carbs: number; fat: number; fiber: number };
export const ZERO: Macros = { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 };

export function addMacros(a: Macros, b: Macros, k = 1): Macros {
  return {
    kcal: a.kcal + b.kcal * k,
    protein: a.protein + b.protein * k,
    carbs: a.carbs + b.carbs * k,
    fat: a.fat + b.fat * k,
    fiber: a.fiber + b.fiber * k,
  };
}

export function scaleMacros(a: Macros, k: number): Macros {
  return addMacros(ZERO, a, k);
}

export function roundMacros(m: Macros): Macros {
  return {
    kcal: Math.round(m.kcal),
    protein: Math.round(m.protein),
    carbs: Math.round(m.carbs),
    fat: Math.round(m.fat),
    fiber: Math.round(m.fiber),
  };
}

export function bmrMifflin(sex: Sex, kg: number, cm: number, age: number): number {
  return 10 * kg + 6.25 * cm - 5 * age + (sex === "male" ? 5 : -161);
}

export type TargetInput = {
  sex: Sex;
  age: number;
  heightCm: number;
  weightKg: number;
  activity: Activity;
  goal: Goal;
  goalRateKgWeek: number; // positive number, direction from goal
  proteinGPerKg: number;
  /** Adaptive TDEE from the weekly check-in. Overrides the formula when present. */
  tdeeOverride?: number | null;
  safetyFlags?: string[];
};

export type TargetResult = {
  tdee: number;
  bmr: number;
  kcalMin: number;
  kcalMax: number;
  proteinMin: number;
  proteinMax: number;
  fatMin: number;
  fatMax: number;
  carbsMin: number;
  carbsMax: number;
  fiberMin: number;
  waterMl: number;
  warnings: string[];
  consultProfessional: boolean;
  source: Record<string, unknown>;
};

const SAFETY_FLAGS_REQUIRING_PRO = ["pregnant", "breastfeeding", "eating_disorder", "medical_condition", "under_18", "diabetes_medication"];

export const SAFETY_FLAG_LABEL: Record<string, string> = {
  pregnant: "Těhotenství",
  breastfeeding: "Kojení",
  eating_disorder: "Porucha příjmu potravy (i v minulosti)",
  medical_condition: "Onemocnění ovlivňující výživu (ledviny, játra, GIT…)",
  diabetes_medication: "Léky na cukrovku / inzulin",
  under_18: "Věk pod 18 let",
};

export function computeTargets(input: TargetInput): TargetResult {
  const warnings: string[] = [];
  const bmr = bmrMifflin(input.sex, input.weightKg, input.heightCm, input.age);
  const formulaTdee = bmr * ACTIVITY_FACTOR[input.activity];
  const tdee = Math.round(input.tdeeOverride ?? formulaTdee);
  const flags = input.safetyFlags ?? [];
  const consultProfessional = flags.some((f) => SAFETY_FLAGS_REQUIRING_PRO.includes(f)) || input.age < 18;

  let rate = Math.abs(input.goalRateKgWeek);
  // Guard rails: max 1 % body weight / week loss, max 0.5 % gain.
  const maxLoss = input.weightKg * 0.01;
  const maxGain = input.weightKg * 0.005;
  if (input.goal === "lose" && rate > maxLoss) {
    warnings.push(`Tempo hubnutí omezeno na ${maxLoss.toFixed(1)} kg/týden (1 % hmotnosti).`);
    rate = maxLoss;
  }
  if (input.goal === "gain" && rate > maxGain) {
    warnings.push(`Tempo nabírání omezeno na ${maxGain.toFixed(1)} kg/týden.`);
    rate = maxGain;
  }
  if (consultProfessional && input.goal !== "maintain") {
    warnings.push("Kvůli zdravotním okolnostem nastavujeme jen udržovací rozmezí. Změnu cíle konzultuj s lékařem nebo nutričním terapeutem.");
    rate = 0;
  }

  const dailyDelta = input.goal === "maintain" || rate === 0 ? 0 : ((input.goal === "lose" ? -1 : 1) * rate * KCAL_PER_KG) / 7;
  let center = tdee + dailyDelta;

  // Never go below BMR × 1.1 or an absolute floor (1500 m / 1200 f).
  const floor = Math.max(bmr * 1.1, input.sex === "male" ? 1500 : 1200);
  if (center < floor) {
    warnings.push("Cíl by byl pod bezpečným minimem — zvedli jsme ho. Pomalejší tempo je udržitelnější.");
    center = floor;
  }

  const kcalMin = Math.round((center - 100) / 10) * 10;
  const kcalMax = Math.round((center + 100) / 10) * 10;

  const kg = input.weightKg;
  const pPerKg = Math.min(Math.max(input.proteinGPerKg, 0.83), 2.4);
  const proteinMin = Math.round(Math.max(kg * 0.83, kg * (pPerKg - 0.2)));
  const proteinMax = Math.round(kg * Math.min(pPerKg + 0.3, 2.6));

  const fatMin = Math.round((center * 0.22) / 9);
  const fatMax = Math.round((center * 0.35) / 9);
  const proteinMid = (proteinMin + proteinMax) / 2;
  const carbsMin = Math.max(100, Math.round((kcalMin - proteinMid * 4 - fatMax * 9) / 4));
  const carbsMax = Math.round((kcalMax - proteinMin * 4 - fatMin * 9) / 4);
  const fiberMin = Math.max(25, Math.round((center / 1000) * 14));
  const waterMl = Math.round((kg * 33) / 100) * 100;

  return {
    tdee,
    bmr: Math.round(bmr),
    kcalMin,
    kcalMax,
    proteinMin,
    proteinMax,
    fatMin,
    fatMax,
    carbsMin,
    carbsMax,
    fiberMin,
    waterMl,
    warnings,
    consultProfessional,
    source: {
      method: input.tdeeOverride ? "adaptive-tdee" : "mifflin-st-jeor",
      activityFactor: ACTIVITY_FACTOR[input.activity],
      formulaTdee: Math.round(formulaTdee),
      dailyDelta: Math.round(dailyDelta),
      rateKgWeek: rate,
      inputs: { ...input, safetyFlags: flags },
    },
  };
}

/** Protein per meal guidance: ~0.4 g/kg per meal (Schoenfeld & Aragon 2018). */
export function proteinPerMealTarget(weightKg: number) {
  return { min: Math.round(weightKg * 0.3), ideal: Math.round(weightKg * 0.4) };
}
