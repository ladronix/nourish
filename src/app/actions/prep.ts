"use server";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireOwner, audit } from "@/lib/server/auth";
import { getCatalog } from "@/lib/server/data";
import { consumeRecipe, createPortions } from "@/lib/server/inventory-ops";
import { todayISO } from "@/lib/domain/dates";

export async function toggleStep(sessionId: number, stepId: string) {
  await requireOwner();
  const s = await db.query.prepSessions.findFirst({ where: eq(schema.prepSessions.id, sessionId) });
  if (!s) return;
  const done = s.completed.includes(stepId) ? s.completed.filter((x) => x !== stepId) : [...s.completed, stepId];
  await db.update(schema.prepSessions).set({ completed: done, status: s.status === "done" ? "done" : "in_progress" }).where(eq(schema.prepSessions.id, sessionId));
  revalidatePath("/prep");
}

/** Finish meal prep: subtract raw ingredients, store cooked portions with expiry. Idempotent. */
export async function finishPrep(sessionId: number) {
  await requireOwner();
  const s = await db.query.prepSessions.findFirst({ where: eq(schema.prepSessions.id, sessionId) });
  if (!s || s.status === "done") return { ok: false };
  const { recipeMap, ingredients } = await getCatalog();
  const missing: string[] = [];
  const created: string[] = [];
  for (const b of s.recipes) {
    const r = recipeMap.get(b.recipeId);
    if (!r) continue;
    const res = await consumeRecipe(r, b.servings, `prep:${s.id}:${r.id}`, ingredients);
    missing.push(...res.missing);
    const p = await createPortions(r, b.servings, todayISO(), `prep:${s.id}:${r.id}:portions`);
    created.push(`${r.name}: ${p.fridgeCount}× lednice${p.freezerCount ? `, ${p.freezerCount}× mrazák` : ""}`);
  }
  await db.update(schema.prepSessions).set({ status: "done", completed: s.steps.map((x) => x.id) }).where(eq(schema.prepSessions.id, sessionId));
  await audit("prep_done", { sessionId, created });
  revalidatePath("/", "layout");
  return { ok: true, created, missing: [...new Set(missing)] };
}
