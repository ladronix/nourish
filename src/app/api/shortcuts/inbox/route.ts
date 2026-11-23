import { NextResponse } from "next/server";
import { db, schema } from "@/db";
import { guardShortcut } from "@/lib/server/shortcut-guard";

/** "Poslat do Nourish" share-sheet shortcut (iOS PWAs cannot be share targets). */
export async function POST(req: Request) {
  const denied = await guardShortcut(req);
  if (denied) return denied;
  const body = (await req.json().catch(() => ({}))) as { url?: string; text?: string };
  const content = (body.url ?? body.text ?? "").toString().trim().slice(0, 5000);
  if (!content) return NextResponse.json({ error: "empty" }, { status: 400 });
  const kind = /^https?:\/\//.test(content) ? "url" : "text";
  await db.insert(schema.inbox).values({ kind, content });
  return NextResponse.json({ ok: true, message: kind === "url" ? "Odkaz uložen do Nourish — import najdeš v Receptech." : "Uloženo do Nourish." });
}
