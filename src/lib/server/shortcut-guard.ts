import "server-only";
import { NextResponse } from "next/server";
import { verifyApiToken, checkRateLimit, clientIpHash, recordAttempt } from "./auth";

/** Bearer-token guard for iOS Shortcuts endpoints, with the same lockout as login. */
export async function guardShortcut(req: Request): Promise<NextResponse | null> {
  const ipHash = await clientIpHash();
  const rl = await checkRateLimit(ipHash);
  if (!rl.ok) return NextResponse.json({ error: "locked" }, { status: 429 });
  const ok = await verifyApiToken(req.headers.get("authorization"));
  if (!ok) {
    await recordAttempt(ipHash, false, "api_token");
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return null;
}
