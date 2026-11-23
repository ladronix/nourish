"use server";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { requireOwner, audit } from "@/lib/server/auth";
import { getProfile } from "@/lib/server/data";
import { computeTargets, CALC_VERSION } from "@/lib/domain/nutrition";
import { todayISO } from "@/lib/domain/dates";

const ProfileInput = z.object({
  name: z.string().max(60),
  sex: z.enum(["male", "female"]),
  birthYear: z.number().int().min(1920).max(new Date().getFullYear()),
  heightCm: z.number().min(120).max(230),
  weightKg: z.number().min(35).max(300),
  activity: z.enum(["sedentary", "light", "moderate", "active", "very_active"]),
  goal: z.enum(["lose", "maintain", "gain"]),
  goalRateKgWeek: z.number().min(0).max(1.5),
  proteinGPerKg: z.number().min(0.8).max(2.4),
  slots: z.array(z.object({ slot: z.enum(["breakfast", "snack_am", "lunch", "snack", "dinner"]), time: z.string().regex(/^\d{2}:\d{2}$/), share: z.number().min(0).max(1) })).min(1).max(5),
  allergens: z.array(z.string().max(30)).max(20),
  dislikes: z.array(z.string().max(80)).max(100),
  dietTags: z.array(z.string().max(30)).max(10),
  maxCookMinutesWeekday: z.number().int().min(5).max(180),
  prepDay: z.number().int().min(0).max(6),
  budgetWeekCzk: z.number().int().min(0).max(100000).nullable(),
  preferredRetailer: z.enum(["rohlik", "kosik", "none"]),
  safetyFlags: z.array(z.string().max(40)).max(10),
});
export type ProfileInputT = z.infer<typeof ProfileInput>;

const FIELD_CZ: Record<string, string> = { birthYear: "rok narození", heightCm: "výška", weightKg: "váha", maxCookMinutesWeekday: "čas na vaření", budgetWeekCzk: "rozpočet", slots: "jídla", name: "jméno" };

export async function saveProfile(input: ProfileInputT): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireOwner();
  const parsed = ProfileInput.safeParse(input);
  if (!parsed.success) {
    const f = String(parsed.error.issues[0]?.path[0] ?? "");
    return { ok: false, error: `Zkontroluj pole: ${FIELD_CZ[f] ?? f}.` };
  }
  const v = parsed.data;
  const total = v.slots.reduce((a, s) => a + s.share, 0) || 1;
  v.slots = v.slots.map((s) => ({ ...s, share: Math.round((s.share / total) * 100) / 100 })).sort((a, b) => a.time.localeCompare(b.time));
  await db.update(schema.profile).set({ ...v, onboarded: true, updatedAt: new Date() }).where(eq(schema.profile.id, 1));
  await audit("profile_saved");
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function previewTargets(input: ProfileInputT, tdeeOverride?: number | null) {
  await requireOwner();
  // Live preview while typing: half-typed values (e.g. height "1") are normal, not errors.
  const parsed = ProfileInput.safeParse(input);
  if (!parsed.success) return null;
  const v = parsed.data;
  return computeTargets({ ...v, age: new Date().getFullYear() - v.birthYear, tdeeOverride });
}

/** Confirm a target: versioned row with source + inputs, valid from today. */
export async function confirmTargets(tdeeOverride?: number | null) {
  await requireOwner();
  const p = await getProfile();
  const r = computeTargets({ sex: p.sex, age: new Date().getFullYear() - p.birthYear, heightCm: p.heightCm, weightKg: p.weightKg, activity: p.activity, goal: p.goal, goalRateKgWeek: p.goalRateKgWeek, proteinGPerKg: p.proteinGPerKg, safetyFlags: p.safetyFlags, tdeeOverride });
  const [row] = await db
    .insert(schema.nutritionTargets)
    .values({ validFrom: todayISO(), kcalMin: r.kcalMin, kcalMax: r.kcalMax, proteinMin: r.proteinMin, proteinMax: r.proteinMax, fatMin: r.fatMin, fatMax: r.fatMax, carbsMin: r.carbsMin, carbsMax: r.carbsMax, fiberMin: r.fiberMin, waterMl: r.waterMl, tdee: r.tdee, calculationVersion: CALC_VERSION, source: { ...r.source, warnings: r.warnings } })
    .returning();
  await audit("target_confirmed", { id: row.id, kcal: [r.kcalMin, r.kcalMax] });
  revalidatePath("/", "layout");
  return row;
}

export async function toggleStaple(ingredientId: string) {
  await requireOwner();
  const ing = await db.query.ingredients.findFirst({ where: eq(schema.ingredients.id, ingredientId) });
  if (!ing) return;
  await db.update(schema.ingredients).set({ isStaple: !ing.isStaple }).where(eq(schema.ingredients.id, ingredientId));
  revalidatePath("/settings");
}

export async function setMinStock(ingredientId: string, minStock: number | null) {
  await requireOwner();
  await db.update(schema.ingredients).set({ minStock }).where(eq(schema.ingredients.id, ingredientId));
  revalidatePath("/settings");
}
