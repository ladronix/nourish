"use server";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { requireOwner } from "@/lib/server/auth";
import { addLot, applyMove } from "@/lib/server/inventory-ops";

const LotInput = z.object({
  ingredientId: z.string().max(80).nullable().optional(),
  name: z.string().min(1).max(120),
  qty: z.number().positive().max(100000),
  unit: z.enum(["g", "ml", "ks"]),
  location: z.enum(["fridge", "freezer", "pantry"]),
  expiresOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  barcode: z.string().max(32).nullable().optional(),
  nutritionPer100: z.object({ kcal: z.number(), protein: z.number(), carbs: z.number(), fat: z.number(), fiber: z.number() }).nullable().optional(),
  priceCzk: z.number().nonnegative().nullable().optional(),
  source: z.enum(["manual", "barcode", "photo", "receipt", "shopping", "shortcut"]).optional(),
  confidence: z.number().min(0).max(1).optional(),
});
export type LotInputT = z.infer<typeof LotInput>;

export async function addInventory(input: LotInputT) {
  await requireOwner();
  const v = LotInput.parse(input);
  await addLot(v);
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function addInventoryBulk(items: LotInputT[]) {
  await requireOwner();
  const list = z.array(LotInput).max(80).parse(items);
  for (const v of list) await addLot(v);
  revalidatePath("/", "layout");
  return { ok: true, count: list.length };
}

export async function updateLot(id: number, patch: { expiresOn?: string | null; location?: "fridge" | "freezer" | "pantry"; opened?: boolean; qty?: number; name?: string }) {
  await requireOwner();
  const lot = await db.query.inventoryLots.findFirst({ where: eq(schema.inventoryLots.id, id) });
  if (!lot) return;
  const set: Partial<typeof schema.inventoryLots.$inferInsert> = { needsReview: false };
  if (patch.expiresOn !== undefined) set.expiresOn = patch.expiresOn;
  if (patch.name) set.name = patch.name.slice(0, 120);
  if (patch.location) set.location = patch.location;
  if (patch.opened) {
    set.openedAt = new Date();
    if (lot.ingredientId) {
      const ing = await db.query.ingredients.findFirst({ where: eq(schema.ingredients.id, lot.ingredientId) });
      const od = ing?.shelfDays?.opened;
      if (od) {
        const d = new Date();
        d.setDate(d.getDate() + od);
        const iso = d.toISOString().slice(0, 10);
        if (!lot.expiresOn || iso < lot.expiresOn) set.expiresOn = iso;
      }
    }
  }
  await db.update(schema.inventoryLots).set(set).where(eq(schema.inventoryLots.id, id));
  if (patch.qty !== undefined && patch.qty >= 0 && Math.abs(patch.qty - lot.qty) > 0.001) {
    await applyMove({ lotId: id, delta: patch.qty - lot.qty, reason: "adjust", key: `adjust:${id}:${Date.now()}` });
  }
  revalidatePath("/", "layout");
}

export async function consumeLot(id: number, qty: number | "all", reqId: string) {
  await requireOwner();
  const lot = await db.query.inventoryLots.findFirst({ where: eq(schema.inventoryLots.id, id) });
  if (!lot) return;
  const q = qty === "all" ? lot.qty : Math.min(lot.qty, qty);
  await applyMove({ lotId: id, delta: -q, reason: "consume", key: `use:${id}:${reqId}` });
  revalidatePath("/", "layout");
}

/** Throw away — tracked separately for waste statistics (value lost). */
export async function discardLot(id: number, reqId: string) {
  await requireOwner();
  const lot = await db.query.inventoryLots.findFirst({ where: eq(schema.inventoryLots.id, id) });
  if (!lot) return;
  let value = lot.priceCzk ?? null;
  if (value == null && lot.ingredientId) {
    const ing = await db.query.ingredients.findFirst({ where: eq(schema.ingredients.id, lot.ingredientId) });
    if (ing?.priceCzkPerPack && ing.packSize) value = Math.round((lot.qty / ing.packSize) * ing.priceCzkPerPack);
  }
  await applyMove({ lotId: id, delta: -lot.qty, reason: "discard", key: `discard:${id}:${reqId}`, valueCzk: value });
  revalidatePath("/", "layout");
}
