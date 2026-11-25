import { NextResponse } from "next/server";
import { isOwner } from "@/lib/server/auth";
import { scanInventory, aiAvailable, aiErrorMessage } from "@/lib/server/ai";
import { getCatalog } from "@/lib/server/data";
import { estimateExpiry } from "@/lib/domain/catalog";
import { todayISO } from "@/lib/domain/dates";
import { matchIngredientByName } from "@/lib/domain/fridge-cook";

export const maxDuration = 120;

export async function POST(req: Request) {
  if (!(await isOwner())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!aiAvailable()) return NextResponse.json({ error: "AI není nakonfigurovaná (AI Gateway)." }, { status: 503 });
  const form = await req.formData();
  const file = form.get("image");
  const mode = form.get("mode") === "receipt" ? "receipt" : "fridge";
  if (!(file instanceof File) || file.size > 4_000_000 || !file.type.startsWith("image/")) return NextResponse.json({ error: "Nahraj obrázek do 4 MB." }, { status: 400 });
  const { ingredients, ingredientRows } = await getCatalog();
  const today = todayISO();
  try {
    const out = await scanInventory(new Uint8Array(await file.arrayBuffer()), file.type, mode, ingredientRows.map((i) => ({ id: i.id, name: i.name, unit: i.unit })), today);
    // Never trust IDs blindly; fill missing expiry from the shelf-life table. Everything goes to review.
    const items = (out?.items ?? []).filter((it) => it.qty > 0 && !/^(jiné|ostatní|další)\b/i.test(it.name.trim())).map((it) => {
      // The model often leaves catalog id empty for things it read off a label — match by name ourselves.
      const ing = (it.ingredientId ? ingredients.get(it.ingredientId) : undefined) ?? (() => {
        const id = matchIngredientByName(it.name, ingredients);
        return id ? ingredients.get(id) : undefined;
      })();
      // Small models often say "6 g" of tomatoes meaning 6 pieces — convert pieces to the catalog unit.
      let qty = it.qty;
      if (ing && ing.unit !== "ks" && (it.unit === "ks" || (it.qty > 0 && it.qty < 20))) {
        const produce = ing.category === "zelenina" || ing.category === "ovoce";
        const perPiece = ing.gramsPerPiece ?? (produce ? 120 : ing.packSize);
        if (perPiece) qty = Math.round(it.qty * perPiece);
      }
      return {
        ...it,
        qty,
        ingredientId: ing ? ing.id : null,
        unit: ing ? ing.unit : it.unit,
        expiresOn: it.expiresOn && /^\d{4}-\d{2}-\d{2}$/.test(it.expiresOn) ? it.expiresOn : estimateExpiry(ing ?? null, it.location, today),
      };
    });
    return NextResponse.json({ items, note: out?.note ?? null });
  } catch (e) {
    console.error("inventory-scan", (e as Error).message);
    return NextResponse.json({ error: aiErrorMessage(e, "Sken se nepovedl. Zkus ostřejší fotku nebo přidej ručně.") }, { status: 502 });
  }
}
