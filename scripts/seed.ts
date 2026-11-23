/* Idempotent seed: catalog, recipes, default profile & reminders. Safe to re-run. */
import { config } from "dotenv";
// Local overrides first (dotenv never overwrites): .env.development.local points at docker Postgres.
config({ path: ".env.development.local" });
config({ path: ".env.local" });
import { sql } from "drizzle-orm";
import * as schema from "../src/db/schema";
import { INGREDIENTS, RECIPES, DEFAULT_REMINDERS } from "../src/db/seed-data";

async function main() {
  const url = process.env.DATABASE_URL ?? "postgres://nourish:nourish@localhost:5434/nourish";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- two drivers with incompatible generics
  let db: any;
  if (/neon\.tech/.test(url)) {
    const { neon } = await import("@neondatabase/serverless");
    const { drizzle } = await import("drizzle-orm/neon-http");
    db = drizzle(neon(url), { schema });
  } else {
    const { drizzle } = await import("drizzle-orm/node-postgres");
    db = drizzle(url, { schema });
  }

  for (const i of INGREDIENTS) {
    const row = {
      id: i.id, name: i.name, aliases: i.aliases ?? [], category: i.cat, unit: i.unit ?? "g", gramsPerPiece: i.gpp ?? null,
      packSize: i.pack ?? null, priceCzkPerPack: i.price ?? null,
      kcal: i.n[0], protein: i.n[1], carbs: i.n[2], fat: i.n[3], fiber: i.n[4],
      allergens: i.al ?? [], plant: i.plant ?? 0, shelfDays: i.shelf ?? {}, defaultLocation: i.loc ?? "fridge",
      isStaple: i.staple ?? false, minStock: i.min ?? null, seasonMonths: i.season ?? null, emoji: i.e,
    };
    const { id, ...rest } = row;
    await db.insert(schema.ingredients).values(row).onConflictDoUpdate({ target: schema.ingredients.id, set: { ...rest, isStaple: sql`ingredients.is_staple`, minStock: sql`ingredients.min_stock` } });
  }
  for (const r of RECIPES) {
    const row = {
      id: r.id, name: r.name, description: r.d, mealTypes: r.types, servings: r.serv, prepMin: r.prep, cookMin: r.cook,
      batchable: r.batch ?? false, fridgeDays: r.fridge ?? 3, freezerOk: r.freezer ?? false,
      steps: r.steps.map(([text, timerMin]) => ({ text, ...(timerMin ? { timerMin } : {}) })), tags: r.tags ?? [], emoji: r.e,
    };
    const { id, ...rest } = row;
    await db.insert(schema.recipes).values({ ...row, favorite: r.fav ?? false }).onConflictDoUpdate({ target: schema.recipes.id, set: rest });
    await db.delete(schema.recipeIngredients).where(sql`recipe_id = ${r.id}`);
    await db.insert(schema.recipeIngredients).values(r.items.map(([ingredientId, qty, note]) => ({ recipeId: r.id, ingredientId, qty, note: note ?? null })));
  }
  await db.insert(schema.profile).values({
    id: 1,
    slots: [
      { slot: "breakfast", time: "07:30", share: 0.25 },
      { slot: "lunch", time: "12:30", share: 0.33 },
      { slot: "snack", time: "16:00", share: 0.12 },
      { slot: "dinner", time: "19:00", share: 0.3 },
    ],
  }).onConflictDoNothing();
  for (const r of DEFAULT_REMINDERS) {
    await db.insert(schema.reminders).values({ ...r, enabled: r.id !== "weigh" }).onConflictDoNothing();
  }
  console.log(`Seeded ${INGREDIENTS.length} ingredients, ${RECIPES.length} recipes.`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
