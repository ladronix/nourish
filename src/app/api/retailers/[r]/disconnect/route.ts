import { NextResponse } from "next/server";
import { isOwner } from "@/lib/server/auth";
import { disconnect, RETAILERS, type Retailer } from "@/lib/server/retailer";

export async function POST(_req: Request, ctx: { params: Promise<{ r: string }> }) {
  if (!(await isOwner())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { r } = await ctx.params;
  if (!(r in RETAILERS)) return NextResponse.json({ error: "unknown" }, { status: 404 });
  await disconnect(r as Retailer);
  return NextResponse.json({ ok: true });
}
