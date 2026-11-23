"use server";
import { revalidatePath } from "next/cache";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { requireOwner, audit } from "@/lib/server/auth";
import { getDayTotals, getProfile, getTarget, getWeighIns } from "@/lib/server/data";
import { addDays, todayISO, weekStart } from "@/lib/domain/dates";
import { estimateTdee } from "@/lib/domain/trend";
import { confirmTargets } from "./profile";

const LogInput = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  slot: z.enum(["breakfast", "snack_am", "lunch", "snack", "dinner"]).nullable().optional(),
  name: z.string().min(1).max(160),
  kcal: z.number().min(0).max(6000),
  protein: z.number().min(0).max(400).default(0),
  carbs: z.number().min(0).max(800).default(0),
  fat: z.number().min(0).max(400).default(0),
  fiber: z.number().min(0).max(150).default(0),
  source: z.enum(["quick", "photo", "barcode", "shortcut", "inventory"]).default("quick"),
  confidence: z.number().min(0).max(1).default(1),
});

export async function logFood(input: z.input<typeof LogInput>) {
  await requireOwner();
  const v = LogInput.parse(input);
  await db.insert(schema.foodLog).values(v);
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function deleteLog(id: number) {
  await requireOwner();
  await db.delete(schema.foodLog).where(eq(schema.foodLog.id, id));
  revalidatePath("/", "layout");
}

export async function addWater(ml: number, date = todayISO()) {
  await requireOwner();
  const d = Math.max(-1000, Math.min(2000, Math.round(ml)));
  await db.insert(schema.waterLog).values({ date, ml: Math.max(0, d) }).onConflictDoUpdate({ target: schema.waterLog.date, set: { ml: sql`GREATEST(0, ${schema.waterLog.ml} + ${d})` } });
  revalidatePath("/");
}

export async function addWeighIn(kg: number, date = todayISO()) {
  await requireOwner();
  const v = z.number().min(30).max(300).parse(kg);
  await db.insert(schema.weighIns).values({ date, kg: v }).onConflictDoUpdate({ target: schema.weighIns.date, set: { kg: v } });
  await db.update(schema.profile).set({ weightKg: v }).where(eq(schema.profile.id, 1));
  revalidatePath("/", "layout");
}

export async function deleteWeighIn(date: string) {
  await requireOwner();
  await db.delete(schema.weighIns).where(eq(schema.weighIns.date, date));
  revalidatePath("/progress");
}

/** Weekly check-in: adaptive TDEE estimate → proposed new target range. */
export async function previewCheckin() {
  await requireOwner();
  const today = todayISO();
  const [target, weighIns, totals, profile] = await Promise.all([getTarget(), getWeighIns(60), getDayTotals(addDays(today, -27), addDays(today, -1)), getProfile()]);
  const intake = [...totals.entries()].map(([date, d]) => ({ date, kcal: d.eaten.kcal, logged: d.logged && d.eaten.kcal > 600 }));
  const est = estimateTdee({ weighIns: weighIns.map((w) => ({ date: w.date, kg: w.kg })), intake, prior: target.tdee, today: addDays(today, -1) });
  return { est, currentTdee: target.tdee, goal: profile.goal, goalRate: profile.goalRateKgWeek };
}

export async function submitCheckin(input: { hunger: number; energy: number; note?: string; applyTdee: boolean }) {
  await requireOwner();
  const v = z.object({ hunger: z.number().int().min(1).max(5), energy: z.number().int().min(1).max(5), note: z.string().max(500).optional(), applyTdee: z.boolean() }).parse(input);
  const { est } = await previewCheckin();
  let appliedTargetId: number | null = null;
  if (v.applyTdee && est.confidence !== "low") {
    const t = await confirmTargets(est.tdee);
    appliedTargetId = t.id;
  }
  const ws = weekStart(todayISO());
  await db
    .insert(schema.checkins)
    .values({ weekStart: ws, tdeeEstimate: est.tdee, trendKg: est.trendKg, rateKgWeek: est.rateKgWeek, hunger: v.hunger, energy: v.energy, note: v.note ?? null, appliedTargetId })
    .onConflictDoUpdate({ target: schema.checkins.weekStart, set: { tdeeEstimate: est.tdee, trendKg: est.trendKg, rateKgWeek: est.rateKgWeek, hunger: v.hunger, energy: v.energy, note: v.note ?? null, appliedTargetId } });
  await audit("checkin", { tdee: est.tdee, applied: appliedTargetId });
  revalidatePath("/", "layout");
  return { ok: true, applied: !!appliedTargetId, est };
}
