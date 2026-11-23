import "server-only";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { getCatalog, getProfile } from "./data";
import { scheduleSteps } from "@/lib/domain/prep";
import { addDays, todayISO, weekday } from "@/lib/domain/dates";

export async function buildPrepForPlan(planId: number, weekStartISO: string, batch: { recipeId: string; servings: number }[]) {
  const existing = await db.query.prepSessions.findFirst({ where: eq(schema.prepSessions.planId, planId) });
  if (existing?.status === "done") return existing;
  if (existing) await db.delete(schema.prepSessions).where(eq(schema.prepSessions.id, existing.id));
  if (!batch.length) return null;
  const profile = await getProfile();
  const { recipeMap } = await getCatalog();
  // Prep day = the chosen weekday on or before the week start (default Sunday before Monday).
  let date = weekStartISO;
  for (let i = 0; i < 7; i++) {
    const d = addDays(weekStartISO, -i);
    if (weekday(d) === profile.prepDay) {
      date = d;
      break;
    }
  }
  if (date < todayISO()) date = todayISO();
  const recipes = batch
    .map((b) => {
      const r = recipeMap.get(b.recipeId);
      return r ? { id: r.id, name: r.name, steps: r.steps, servings: b.servings, scale: b.servings / r.servings } : null;
    })
    .filter((x): x is NonNullable<typeof x> => !!x);
  const { steps, totalMin } = scheduleSteps(recipes);
  const [row] = await db
    .insert(schema.prepSessions)
    .values({ planId, date, recipes: batch, steps: steps.map((s) => ({ ...s })), totalMin })
    .returning();
  return row;
}
