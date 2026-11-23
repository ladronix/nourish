import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { isOwner, rpConfig, audit } from "@/lib/server/auth";
import { RETAILERS, withRetailer, type Retailer } from "@/lib/server/retailer";
import { previewDirect, UnsupportedTools } from "@/lib/server/cart-direct";
import { previewCart } from "@/lib/server/cart-agent";
import { getProfile, getShoppingItems } from "@/lib/server/data";

export const maxDuration = 300;

export async function POST(_req: Request, ctx: { params: Promise<{ r: string }> }) {
  if (!(await isOwner())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { r } = await ctx.params;
  if (!(r in RETAILERS)) return NextResponse.json({ error: "unknown" }, { status: 404 });
  const { origin } = rpConfig((await headers()).get("host"));
  const [items, profile] = await Promise.all([getShoppingItems(), getProfile()]);
  const open = items.filter((i) => !i.checked).slice(0, 40);
  if (!open.length) return NextResponse.json({ error: "Seznam je prázdný." }, { status: 400 });
  try {
    const lines = open.map((i) => ({ id: i.id, name: i.name, qty: i.qty, unit: i.unit }));
    let out;
    try {
      // Deterministic search first: fast, no AI cost, works without AI Gateway.
      out = await withRetailer(r as Retailer, origin, (c) => previewDirect(c, lines, profile.allergens));
    } catch (e) {
      if (!(e instanceof UnsupportedTools)) throw e;
      console.error("cart preview fallback to AI:", e.message);
      out = await previewCart(r as Retailer, origin, lines, profile.allergens);
    }
    await audit("cart_preview", { r, items: open.length });
    return NextResponse.json({ matches: out?.matches ?? [], items: open.map((i) => ({ id: i.id, name: i.name })) });
  } catch (e) {
    const m = (e as Error).message;
    console.error("cart preview", m);
    if (/unauthor|401|invalid_token/i.test(m)) return NextResponse.json({ error: "Propojení vypršelo — připoj obchod znovu.", reconnect: true }, { status: 401 });
    return NextResponse.json({ error: `Obchod teď neodpovídá (${m.slice(0, 120)}). Použij odkazy u položek.` }, { status: 502 });
  }
}
