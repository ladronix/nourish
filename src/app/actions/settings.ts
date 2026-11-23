"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { requireOwner, revokeAllSessions, audit, endSession } from "@/lib/server/auth";
import { randomToken, sha256 } from "@/lib/server/crypto";

export async function createApiToken(name: string) {
  await requireOwner();
  const n = z.string().min(1).max(40).parse(name);
  const token = `nrsh_${randomToken(30)}`;
  await db.insert(schema.apiTokens).values({ name: n, tokenHash: sha256(token), prefix: token.slice(0, 9) });
  await audit("api_token_created", { name: n });
  revalidatePath("/settings");
  return token; // shown once
}

export async function revokeApiToken(id: number) {
  await requireOwner();
  await db.update(schema.apiTokens).set({ revokedAt: new Date() }).where(eq(schema.apiTokens.id, id));
  await audit("api_token_revoked", { id });
  revalidatePath("/settings");
}

export async function deletePasskey(id: string) {
  await requireOwner();
  await db.delete(schema.passkeys).where(eq(schema.passkeys.id, id));
  await audit("passkey_removed");
  revalidatePath("/settings");
}

export async function logoutEverywhere() {
  await requireOwner();
  await revokeAllSessions();
  await db.update(schema.apiTokens).set({ revokedAt: new Date() }).where(isNull(schema.apiTokens.revokedAt));
  await endSession();
  redirect("/login");
}

export async function updateReminder(id: string, patch: { enabled?: boolean; time?: string; days?: number[] }) {
  await requireOwner();
  const v = z.object({ enabled: z.boolean().optional(), time: z.string().regex(/^(\d{2}:\d{2}|slot)$/).optional(), days: z.array(z.number().int().min(0).max(6)).optional() }).parse(patch);
  await db.update(schema.reminders).set(v).where(eq(schema.reminders.id, id));
  revalidatePath("/settings");
}

export async function markInboxProcessed(id: number) {
  await requireOwner();
  await db.update(schema.inbox).set({ processed: true }).where(eq(schema.inbox.id, id));
  revalidatePath("/recipes");
}
