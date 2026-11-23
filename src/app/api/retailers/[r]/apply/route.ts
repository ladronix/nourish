import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { z } from "zod";
import { isOwner, rpConfig, audit } from "@/lib/server/auth";
import { RETAILERS, withRetailer, type Retailer } from "@/lib/server/retailer";
import { applyDirect, UnsupportedTools } from "@/lib/server/cart-direct";
import { applyCart } from "@/lib/server/cart-agent";

export const maxDuration = 300;

const Body = z.object({ lines: z.array(z.object({ productId: z.string().max(80), quantity: z.number().int().min(1).max(30), name: z.string().max(160) })).min(1).max(40) });

export async function POST(req: Request, ctx: { params: Promise<{ r: string }> }) {
  if (!(await isOwner())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { r } = await ctx.params;
  if (!(r in RETAILERS)) return NextResponse.json({ error: "unknown" }, { status: 404 });
  const p = Body.safeParse(await req.json().catch(() => null));
  if (!p.success) return NextResponse.json({ error: "Neplatný košík." }, { status: 400 });
  const { origin } = rpConfig((await headers()).get("host"));
  try {
    let out;
    try {
      out = await withRetailer(r as Retailer, origin, (c) => applyDirect(c, p.data.lines));
    } catch (e) {
      if (!(e instanceof UnsupportedTools)) throw e;
      console.error("cart apply fallback to AI:", e.message);
      out = await applyCart(r as Retailer, origin, p.data.lines);
    }
    await audit("cart_applied", { r, lines: p.data.lines.length, ok: out?.results.filter((x) => x.ok).length });
    return NextResponse.json(out ?? { results: [], cartTotalCzk: null });
  } catch (e) {
    console.error("cart apply", (e as Error).message);
    return NextResponse.json({ error: "Přidání do košíku selhalo. Zkontroluj košík v obchodě — nic se neobjednalo." }, { status: 502 });
  }
}
