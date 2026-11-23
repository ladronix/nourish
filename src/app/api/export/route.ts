import { NextResponse } from "next/server";
import { db, schema } from "@/db";
import { isOwner, audit } from "@/lib/server/auth";

/** Full personal data export (JSON). Secrets (passkeys, tokens) are excluded. */
export async function GET() {
  if (!(await isOwner())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const [profile, targets, lots, moves, plans, meals, log, weighIns, checkins, recipes, recipeIngredients, ingredients, shopping, water] = await Promise.all([
    db.select().from(schema.profile),
    db.select().from(schema.nutritionTargets),
    db.select().from(schema.inventoryLots),
    db.select().from(schema.inventoryMoves),
    db.select().from(schema.mealPlans),
    db.select().from(schema.plannedMeals),
    db.select().from(schema.foodLog),
    db.select().from(schema.weighIns),
    db.select().from(schema.checkins),
    db.select().from(schema.recipes),
    db.select().from(schema.recipeIngredients),
    db.select().from(schema.ingredients),
    db.select().from(schema.shoppingItems),
    db.select().from(schema.waterLog),
  ]);
  await audit("export");
  const body = JSON.stringify({ exportedAt: new Date().toISOString(), profile, targets, lots, moves, plans, meals, log, weighIns, checkins, recipes, recipeIngredients, ingredients, shopping, water }, null, 2);
  return new NextResponse(body, { headers: { "content-type": "application/json", "content-disposition": `attachment; filename="nourish-export-${new Date().toISOString().slice(0, 10)}.json"`, "cache-control": "no-store" } });
}
