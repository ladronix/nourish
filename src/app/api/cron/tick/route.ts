import { NextResponse } from "next/server";
import { safeEqual } from "@/lib/server/crypto";
import { runReminderTick } from "@/lib/server/reminders";

/**
 * Reminder tick. Called by Vercel Cron (Authorization: Bearer $CRON_SECRET) and/or an external
 * scheduler every 5–15 minutes for meal-time reminders. Idempotent — duplicates are suppressed.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";
  if (!secret || !safeEqual(auth, `Bearer ${secret}`)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const r = await runReminderTick();
  return NextResponse.json(r);
}
