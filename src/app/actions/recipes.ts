"use server";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireOwner } from "@/lib/server/auth";

export async function toggleFavorite(id: string) {
  await requireOwner();
  const r = await db.query.recipes.findFirst({ where: eq(schema.recipes.id, id) });
  if (!r) return;
  await db.update(schema.recipes).set({ favorite: !r.favorite }).where(eq(schema.recipes.id, id));
  revalidatePath("/recipes");
  revalidatePath(`/recipes/${id}`);
}

export async function setArchived(id: string, archived: boolean) {
  await requireOwner();
  await db.update(schema.recipes).set({ archived }).where(eq(schema.recipes.id, id));
  revalidatePath("/recipes");
  revalidatePath(`/recipes/${id}`);
}

export async function setBatchable(id: string, batchable: boolean) {
  await requireOwner();
  await db.update(schema.recipes).set({ batchable }).where(eq(schema.recipes.id, id));
  revalidatePath(`/recipes/${id}`);
}
