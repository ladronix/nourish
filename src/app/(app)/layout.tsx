import { and, eq, lte, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireOwner } from "@/lib/server/auth";
import { Sidebar, MobileNav } from "@/components/nav";
import { ToastProvider } from "@/components/toast";
import { addDays, todayISO } from "@/lib/domain/dates";
import { getDayTotals } from "@/lib/server/data";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireOwner();
  const today = todayISO();
  const [[exp], [shop], totals] = await Promise.all([
    db.select({ n: sql<number>`count(*)::int` }).from(schema.inventoryLots).where(and(eq(schema.inventoryLots.status, "active"), lte(schema.inventoryLots.expiresOn, addDays(today, 1)))),
    db.select({ n: sql<number>`count(*)::int` }).from(schema.shoppingItems).where(and(eq(schema.shoppingItems.checked, false), eq(schema.shoppingItems.movedToInventory, false))),
    getDayTotals(addDays(today, -6), today),
  ]);
  // "Days on plan": a day counts when most planned meals were eaten — the north-star metric, shown gently.
  const dots = Array.from({ length: 7 }, (_, i) => {
    const d = totals.get(addDays(today, i - 6));
    return !!d && d.mealsTotal > 0 && d.mealsEaten / d.mealsTotal >= 0.75;
  });
  const onPlan = dots.filter(Boolean).length;
  const badges = { fridge: exp.n, shop: shop.n };
  return (
    <ToastProvider>
      <div className="shell">
        <Sidebar badges={badges} side={{ title: "Posledních 7 dní", value: `${onPlan} / 7 dní`, sub: "podle plánu, bez improvizace", dots }} />
        <main className="main">{children}</main>
        <MobileNav badges={badges} />
      </div>
    </ToastProvider>
  );
}
