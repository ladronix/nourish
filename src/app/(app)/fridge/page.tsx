import { and, eq, gte, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { getActiveLots, getCatalog } from "@/lib/server/data";
import { addDays, daysAgo, diffDays, relativeDays, todayISO } from "@/lib/domain/dates";
import { formatQty } from "@/lib/domain/catalog";
import { FridgeBoard, type LotView } from "@/components/fridge-board";
import { fmt } from "@/lib/server/views";

export const metadata = { title: "Lednice" };

export default async function FridgePage() {
  const today = todayISO();
  const [lots, { ingredients, ingredientRows }, waste] = await Promise.all([
    getActiveLots(),
    getCatalog(),
    db
      .select({ value: sql<number>`coalesce(sum(${schema.inventoryMoves.valueCzk}),0)::float`, n: sql<number>`count(*)::int` })
      .from(schema.inventoryMoves)
      .where(and(eq(schema.inventoryMoves.reason, "discard"), gte(schema.inventoryMoves.at, daysAgo(30)))),
  ]);
  const views: LotView[] = lots.map((l) => {
    const ing = l.ingredientId ? ingredients.get(l.ingredientId) : undefined;
    const daysLeft = l.expiresOn ? diffDays(l.expiresOn, today) : null;
    const added = l.addedAt.toISOString().slice(0, 10);
    const total = l.expiresOn ? Math.max(1, diffDays(l.expiresOn, added)) : 30;
    return {
      id: l.id,
      name: l.name,
      emoji: l.kind === "portion" ? "🍱" : (ing?.emoji ?? "🥣"),
      qty: l.qty,
      unit: l.unit,
      qtyLabel: l.kind === "portion" ? `${l.qty} ${l.qty === 1 ? "porce" : l.qty < 5 ? "porce" : "porcí"}` : formatQty(l.qty, l.unit),
      location: l.location,
      expiresOn: l.expiresOn,
      daysLeft,
      dueLabel: daysLeft === null ? "bez data" : daysLeft < 0 ? "prošlé" : relativeDays(l.expiresOn!, today),
      kind: l.kind,
      category: ing?.category ?? "ostatni",
      opened: !!l.openedAt,
      needsReview: l.needsReview || l.confidence < 0.6,
      freshPct: daysLeft === null ? 100 : Math.max(4, Math.min(100, Math.round((daysLeft / total) * 100))),
    };
  });
  const soon = views.filter((v) => v.daysLeft !== null && v.daysLeft <= 2).length;
  const score = views.length ? Math.round(100 - (soon / views.length) * 100) : 100;
  const count = (loc: string) => views.filter((v) => v.location === loc).length;
  const soonValue = lots
    .filter((l) => l.expiresOn && diffDays(l.expiresOn, today) <= 3 && l.ingredientId)
    .reduce((a, l) => {
      const ing = ingredients.get(l.ingredientId!);
      return a + (ing?.priceCzkPerPack && ing.packSize ? (l.qty / ing.packSize) * ing.priceCzkPerPack : 0);
    }, 0);

  return (
    <>
      <section className="intro">
        <div>
          <span className="eyebrow">{views.length} položek doma</span>
          <h2>Lednice, která ví, co sníst první.</h2>
          <p>Foto, účtenka, čárový kód nebo rychlé klepnutí. Plán automaticky upřednostní, co brzy expiruje.</p>
        </div>
      </section>
      <div className="inv-top">
        <div className="panel inv-score">
          <div className="ring" style={{ width: 84, height: 84, ["--value" as string]: score, ["--ring-color" as string]: "var(--green-deep)" }}>
            <div>
              <strong style={{ fontSize: 22 }}>{score}</strong>
              <span>/ 100</span>
            </div>
          </div>
          <div>
            <span className="eyebrow">Skóre čerstvosti</span>
            <h3 style={{ margin: "4px 0", fontSize: 18 }}>{soon ? `${soon} věci chtějí pozornost` : "Všechno má čas"}</h3>
            <p className="small muted" style={{ margin: 0 }}>
              {soonValue > 20 ? `Využitím zásob před expirací zachráníš ~${fmt(soonValue)} Kč. ` : ""}
              {waste[0].n ? `Za 30 dní vyhozeno ${waste[0].n}× (~${fmt(waste[0].value)} Kč).` : "Za 30 dní nic nevyhozeno. 👏"}
            </p>
          </div>
        </div>
        <div className="panel inv-stat">
          <span>Lednice</span>
          <strong>{count("fridge")}</strong>
        </div>
        <div className="panel inv-stat">
          <span>Mrazák</span>
          <strong>{count("freezer")}</strong>
        </div>
        <div className="panel inv-stat">
          <span>Spíž</span>
          <strong>{count("pantry")}</strong>
        </div>
      </div>
      <FridgeBoard
        lots={views}
        ingredients={ingredientRows.map((i) => ({ id: i.id, name: i.name, unit: i.unit, emoji: i.emoji, defaultLocation: i.defaultLocation, packSize: i.packSize, aliases: i.aliases }))}
      />
    </>
  );
}

void addDays;
