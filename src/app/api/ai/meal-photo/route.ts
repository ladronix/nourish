import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { isOwner } from "@/lib/server/auth";
import { analyzeMealPhoto, aiAvailable, aiErrorMessage } from "@/lib/server/ai";
import { getCatalog } from "@/lib/server/data";
import { todayISO } from "@/lib/domain/dates";

export const maxDuration = 120;

export async function POST(req: Request) {
  if (!(await isOwner())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!aiAvailable()) return NextResponse.json({ error: "AI není nakonfigurovaná (AI Gateway)." }, { status: 503 });
  const form = await req.formData();
  const file = form.get("image");
  if (!(file instanceof File) || file.size > 4_000_000 || !file.type.startsWith("image/")) return NextResponse.json({ error: "Nahraj obrázek do 4 MB." }, { status: 400 });
  const date = String(form.get("date") ?? todayISO());
  const meals = await db.select().from(schema.plannedMeals).where(and(eq(schema.plannedMeals.date, date), eq(schema.plannedMeals.status, "planned")));
  const { recipeMap } = await getCatalog();
  const candidates = meals.filter((m) => m.recipeId).map((m) => ({ id: m.id, name: recipeMap.get(m.recipeId!)?.name ?? "", kcal: m.kcal }));
  try {
    const out = await analyzeMealPhoto(new Uint8Array(await file.arrayBuffer()), file.type, candidates, String(form.get("hint") ?? "").slice(0, 300));
    return NextResponse.json(out);
  } catch (e) {
    console.error("meal-photo", (e as Error).message);
    return NextResponse.json({ error: aiErrorMessage(e, "Analýza fotky se nepovedla. Zkus to znovu nebo zadej ručně.") }, { status: 502 });
  }
}
