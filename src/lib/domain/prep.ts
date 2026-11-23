/**
 * Meal-prep orchestration: interleave several recipes so passive steps
 * (oven, simmering, soaking) run while hands do active steps elsewhere.
 * Greedy list scheduling with one "hands" resource.
 */
import type { RecipeStep } from "@/db/schema";

export type PrepRecipe = { id: string; name: string; steps: RecipeStep[]; servings: number; scale: number };
export type ScheduledStep = { id: string; recipeId: string; recipeName: string; text: string; startMin: number; durationMin: number; passive: boolean };

const PASSIVE_RE = /(pe[cč]|trou|vař|dus|chlad|mari|nam[aá]č|odpoč|kyn|zapé|var|simmer|bake|roast)/i;

export function isPassive(step: RecipeStep) {
  return (step.timerMin ?? 0) >= 8 && PASSIVE_RE.test(step.text);
}

export function scheduleSteps(recipes: PrepRecipe[]): { steps: ScheduledStep[]; totalMin: number; handsOnMin: number } {
  type Q = { r: PrepRecipe; idx: number; readyAt: number; remaining: number };
  const durOf = (s: RecipeStep) => Math.max(2, s.timerMin ?? 5);
  const queues: Q[] = recipes.map((r) => ({ r, idx: 0, readyAt: 0, remaining: r.steps.reduce((a, s) => a + durOf(s), 0) }));
  const out: ScheduledStep[] = [];
  let handsFreeAt = 0;
  let handsOn = 0;
  let guard = 0;
  while (queues.some((q) => q.idx < q.r.steps.length) && guard++ < 500) {
    // Prefer steps that are ready soonest; tie-break by most remaining work (critical path first).
    const open = queues.filter((q) => q.idx < q.r.steps.length);
    const pick = open
      .map((q) => {
        const s = q.r.steps[q.idx];
        const passive = isPassive(s);
        const start = passive ? q.readyAt : Math.max(q.readyAt, handsFreeAt);
        return { q, s, passive, start };
      })
      .sort((a, b) => a.start - b.start || b.q.remaining - a.q.remaining)[0];
    const d = durOf(pick.s);
    out.push({
      id: `${pick.q.r.id}-${pick.q.idx}`,
      recipeId: pick.q.r.id,
      recipeName: pick.q.r.name,
      text: pick.s.text,
      startMin: pick.start,
      durationMin: d,
      passive: pick.passive,
    });
    if (pick.passive) {
      // Starting a passive step still needs ~2 min of hands (put it in the oven).
      handsFreeAt = Math.max(handsFreeAt, pick.start + 2);
      handsOn += 2;
    } else {
      handsFreeAt = pick.start + d;
      handsOn += d;
    }
    pick.q.readyAt = pick.start + d;
    pick.q.remaining -= d;
    pick.q.idx++;
  }
  const portioning = recipes.reduce((a, r) => a + r.servings, 0);
  const end = Math.max(0, ...out.map((s) => s.startMin + s.durationMin));
  out.push({ id: "portion", recipeId: "_", recipeName: "Porcování", text: `Rozděl do ${portioning} krabiček, nech vychladnout a ulož do lednice / mrazáku.`, startMin: end, durationMin: 8, passive: false });
  return { steps: out.sort((a, b) => a.startMin - b.startMin), totalMin: end + 8, handsOnMin: handsOn + 8 };
}
