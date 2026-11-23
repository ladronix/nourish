import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { getActiveLots, getCatalog, getProfile, getShoppingItems } from "@/lib/server/data";
import { CATEGORY_LABEL, CATEGORY_ORDER, formatQty } from "@/lib/domain/catalog";
import { ShoppingBoard, type ShopItem } from "@/components/shopping-board";

export const metadata = { title: "Nákup" };

export default async function ShoppingPage() {
  const [items, profile, lots, { ingredients }, rohlik] = await Promise.all([getShoppingItems(), getProfile(), getActiveLots(), getCatalog(), db.query.appState.findFirst({ where: eq(schema.appState.key, "retailer:rohlik") })]);
  const sorted = [...items].sort((a, b) => CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category) || a.name.localeCompare(b.name, "cs"));
  const views: ShopItem[] = sorted.map((i) => ({
    id: i.id,
    name: i.name,
    qtyLabel: formatQty(i.qty, i.unit),
    category: i.category,
    categoryLabel: CATEGORY_LABEL[i.category] ?? "Ostatní",
    checked: i.checked,
    reason: i.reason,
    note: i.note,
    estPriceCzk: i.estPriceCzk,
    required: i.required,
    available: i.available ? Math.round(i.available) : null,
    unit: i.unit,
  }));
  const coveredIds = new Set(lots.filter((l) => l.ingredientId).map((l) => l.ingredientId!));
  const covered = [...coveredIds].filter((id) => ingredients.has(id) && !items.some((i) => i.ingredientId === id)).length;
  return (
    <>
      <section className="intro">
        <div>
          <span className="eyebrow">Chytrý nákup</span>
          <h2>Nakup jen to, co skutečně sníš.</h2>
          <p>Plán minus zásoby doma, zaokrouhleno na balení. Základy (olej, sůl, koření) se přeskakují; minimální zásoby se doplní samy.</p>
        </div>
      </section>
      <ShoppingBoard items={views} preferred={profile.preferredRetailer} covered={covered} rohlikConnected={!!rohlik} />
    </>
  );
}
