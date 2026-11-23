import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { isOwner, rpConfig } from "@/lib/server/auth";
import { startConnect, RETAILERS, type Retailer } from "@/lib/server/retailer";

/** POST → { url } of the retailer login page (the client opens it and, for loopback retailers, asks for the pasted address). */
export async function POST(_req: Request, ctx: { params: Promise<{ r: string }> }) {
  if (!(await isOwner())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { r } = await ctx.params;
  if (!(r in RETAILERS)) return NextResponse.json({ error: "unknown" }, { status: 404 });
  const { origin } = rpConfig((await headers()).get("host"));
  try {
    const url = await startConnect(r as Retailer, origin);
    return NextResponse.json({ url, connected: !url, loopback: RETAILERS[r as Retailer].loopback });
  } catch (e) {
    console.error("retailer connect", (e as Error).message);
    return NextResponse.json({ error: `Obchod odmítl připojení: ${(e as Error).message.slice(0, 160)}` }, { status: 502 });
  }
}
