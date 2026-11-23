import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { z } from "zod";
import { isOwner, rpConfig } from "@/lib/server/auth";
import { finishConnect, parsePastedRedirect, RETAILERS, type Retailer } from "@/lib/server/retailer";

/** Redirect-based callback (retailers that accept our own redirect URI). */
export async function GET(req: Request, ctx: { params: Promise<{ r: string }> }) {
  const { origin } = rpConfig((await headers()).get("host"));
  if (!(await isOwner())) return NextResponse.redirect(`${origin}/login`);
  const { r } = await ctx.params;
  if (!(r in RETAILERS)) return NextResponse.json({ error: "unknown" }, { status: 404 });
  const u = new URL(req.url);
  const code = u.searchParams.get("code");
  if (!code) return NextResponse.redirect(`${origin}/settings?retailer=${r}&error=${encodeURIComponent(u.searchParams.get("error") ?? "zrušeno")}`);
  try {
    await finishConnect(r as Retailer, origin, code, u.searchParams.get("state"));
    return NextResponse.redirect(`${origin}/shopping?connected=${r}`);
  } catch (e) {
    return NextResponse.redirect(`${origin}/settings?retailer=${r}&error=${encodeURIComponent((e as Error).message.slice(0, 140))}`);
  }
}

const Body = z.object({ pasted: z.string().min(8).max(4000) });

/** Loopback flow: the owner pastes the address the retailer redirected to. */
export async function POST(req: Request, ctx: { params: Promise<{ r: string }> }) {
  if (!(await isOwner())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { r } = await ctx.params;
  if (!(r in RETAILERS)) return NextResponse.json({ error: "unknown" }, { status: 404 });
  const p = Body.safeParse(await req.json().catch(() => null));
  if (!p.success) return NextResponse.json({ error: "Vlož celou adresu z prohlížeče." }, { status: 400 });
  const { code, state, error } = parsePastedRedirect(r as Retailer, p.data.pasted);
  if (!code) return NextResponse.json({ error: error ?? "V adrese chybí kód přihlášení." }, { status: 400 });
  const { origin } = rpConfig((await headers()).get("host"));
  try {
    await finishConnect(r as Retailer, origin, code, state);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("retailer finish", (e as Error).message);
    return NextResponse.json({ error: `Dokončení selhalo: ${(e as Error).message.slice(0, 160)} — zkus „Připojit“ znovu.` }, { status: 400 });
  }
}
