import "server-only";
import { db, schema } from "@/db";

/** Append-only audit trail. Kept free of Next request APIs so scripts can use modules that log. */
export async function audit(action: string, detail?: Record<string, unknown>) {
  await db.insert(schema.auditLog).values({ action, detail: detail ?? null });
}
