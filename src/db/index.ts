import "server-only";
import { neon } from "@neondatabase/serverless";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-http";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import * as schema from "./schema";

const url = process.env.DATABASE_URL ?? "postgres://nourish:nourish@localhost:5434/nourish";

function create() {
  // Neon (production / preview) uses the HTTP driver; local dev uses a plain Postgres pool.
  if (/neon\.tech|neon\.build/.test(url)) return drizzleNeon(neon(url), { schema });
  return drizzlePg(url, { schema }) as unknown as ReturnType<typeof drizzleNeon<typeof schema>>;
}

const g = globalThis as unknown as { __nourishDb?: ReturnType<typeof create> };
export const db = g.__nourishDb ?? (g.__nourishDb = create());
export { schema };
