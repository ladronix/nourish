import "server-only";
import * as webpushNs from "web-push";

// CJS package: default export may be missing when loaded as an external ESM import.
const webpush = ((webpushNs as unknown as { default?: typeof webpushNs }).default ?? webpushNs) as typeof webpushNs;
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";

export function pushConfigured() {
  return !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

let configured = false;
function setup() {
  if (configured || !pushConfigured()) return;
  webpush.setVapidDetails(process.env.VAPID_SUBJECT ?? process.env.APP_ORIGIN ?? "https://nourish.local", process.env.VAPID_PUBLIC_KEY!, process.env.VAPID_PRIVATE_KEY!);
  configured = true;
}

export type PushPayload = { title: string; body: string; url?: string; tag?: string; badge?: number };

/** Send to every registered device. Dead subscriptions (404/410) are removed. */
export async function sendPush(p: PushPayload) {
  setup();
  if (!configured) return { sent: 0, failed: 0 };
  const subs = await db.select().from(schema.pushSubscriptions);
  let sent = 0;
  let failed = 0;
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(p), { TTL: 3600, urgency: "normal", topic: p.tag?.slice(0, 32) });
        sent++;
      } catch (e) {
        failed++;
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) await db.delete(schema.pushSubscriptions).where(eq(schema.pushSubscriptions.id, s.id));
      }
    }),
  );
  return { sent, failed };
}
