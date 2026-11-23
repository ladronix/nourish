import "server-only";
import { and, eq, gte, lte, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { addDays, diffDays, nowHHMM, todayISO, weekday } from "@/lib/domain/dates";
import { SLOT_LABEL } from "@/lib/domain/catalog";
import { getCatalog, getDayTotals, getTarget } from "./data";
import { sendPush, type PushPayload } from "./push";

function minutes(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

async function once(key: string) {
  const r = await db.insert(schema.appState).values({ key, value: true }).onConflictDoNothing().returning();
  return r.length > 0;
}

/**
 * Evaluate all reminders for "now" (Europe/Prague). Safe to call as often as every minute:
 * every notification is de-duplicated with a once-per-day key. Supportive tone, no streak shame.
 */
export async function runReminderTick(now = new Date()) {
  const today = todayISO(now);
  const nowMin = minutes(nowHHMM(now));
  const wd = weekday(today);
  const reminders = await db.select().from(schema.reminders).where(eq(schema.reminders.enabled, true));
  const sent: string[] = [];
  const send = async (key: string, p: PushPayload) => {
    if (await once(`push:${today}:${key}`)) {
      await sendPush(p);
      sent.push(key);
    }
  };
  const due = (time: string) => nowMin >= minutes(time) && nowMin - minutes(time) <= 180;
  const { recipeMap } = await getCatalog();

  for (const r of reminders) {
    if (!r.days.includes(wd)) continue;
    if (r.id === "meal") {
      const meals = await db.select().from(schema.plannedMeals).where(and(eq(schema.plannedMeals.date, today), eq(schema.plannedMeals.status, "planned")));
      for (const m of meals) {
        const t = minutes(m.time) - 10;
        if (nowMin >= t && nowMin - t <= 90 && m.recipeId) {
          const rec = recipeMap.get(m.recipeId);
          await send(`meal:${m.id}`, { title: `${SLOT_LABEL[m.slot]} v ${m.time}`, body: `${rec?.emoji ?? ""} ${rec?.name ?? "Jídlo podle plánu"}${m.fromPrep ? " · krabička z meal prepu" : ""}`, url: "/", tag: `meal-${m.id}` });
        }
      }
      continue;
    }
    if (!due(r.time)) continue;
    if (r.id === "plan") {
      const [target, totals] = await Promise.all([getTarget(), getDayTotals(today, today)]);
      const meals = await db.select().from(schema.plannedMeals).where(eq(schema.plannedMeals.date, today));
      const d = totals.get(today);
      await send("plan", { title: "Dnešní plán je připravený", body: `${meals.filter((m) => m.recipeId).length} jídel · ${Math.round(d?.planned.kcal ?? 0)} kcal (cíl ${target.kcalMin}–${target.kcalMax}) · ${Math.round(d?.planned.protein ?? 0)} g bílkovin`, url: "/" });
    } else if (r.id === "expiry") {
      const soon = await db.select().from(schema.inventoryLots).where(and(eq(schema.inventoryLots.status, "active"), lte(schema.inventoryLots.expiresOn, addDays(today, 1))));
      if (soon.length) await send("expiry", { title: "Spotřebuj dnes nebo zítra", body: soon.slice(0, 4).map((l) => l.name).join(", ") + (soon.length > 4 ? ` a ${soon.length - 4} další` : ""), url: "/fridge", badge: soon.length });
    } else if (r.id === "prep") {
      const prep = await db.query.prepSessions.findFirst({ where: and(eq(schema.prepSessions.date, today), sql`${schema.prepSessions.status} <> 'done'`) });
      if (prep) await send("prep", { title: "Dnes je meal prep", body: `${prep.totalMin} minut a máš jídlo na několik dní. Zkontroluj nákup.`, url: "/prep" });
    } else if (r.id === "weigh") {
      const w = await db.query.weighIns.findFirst({ where: eq(schema.weighIns.date, today) });
      if (!w) await send("weigh", { title: "Ranní vážení", body: "Jedno číslo pro trend. Výkyvy jsou normální — počítá se průměr.", url: "/progress" });
    } else if (r.id === "shopping") {
      const preps = await db.select().from(schema.prepSessions).where(and(gte(schema.prepSessions.date, today), lte(schema.prepSessions.date, addDays(today, 2))));
      const open = await db.select({ n: sql<number>`count(*)::int` }).from(schema.shoppingItems).where(and(eq(schema.shoppingItems.checked, false), eq(schema.shoppingItems.movedToInventory, false)));
      if (preps.length && open[0].n > 0) await send("shopping", { title: "Nákup před meal prepem", body: `Na seznamu je ${open[0].n} položek. Objednej, ať to dorazí včas.`, url: "/shopping" });
    } else if (r.id === "checkin" && wd === 0) {
      const last = await db.query.checkins.findFirst({ orderBy: (c, { desc }) => [desc(c.weekStart)] });
      if (!last || diffDays(today, last.weekStart) >= 6) await send("checkin", { title: "Týdenní check-in", body: "Dvě minuty: jak ses cítil a jak upravit cíl na další týden.", url: "/progress#checkin" });
    }
  }
  // housekeeping: old dedupe keys
  await db.delete(schema.appState).where(and(sql`${schema.appState.key} like 'push:%'`, sql`${schema.appState.updatedAt} < now() - interval '3 days'`));
  return { sent };
}
