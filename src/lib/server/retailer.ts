import "server-only";
import { eq } from "drizzle-orm";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { auth, type OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js";
import type { OAuthClientInformationMixed, OAuthClientMetadata, OAuthTokens } from "@modelcontextprotocol/sdk/shared/auth.js";
import { db, schema } from "@/db";
import { seal, open } from "./secret-box";
import { audit } from "./audit";

export type Retailer = "rohlik" | "kosik";

/**
 * `loopback`: the retailer's dynamic client registration only accepts localhost / 127.0.0.1 redirect URIs
 * (verified for identity.rohlik.cz). The browser lands on a page that does not load; the owner pastes that
 * address back into Nourish, which finishes the PKCE exchange server-side.
 */
export const RETAILERS: Record<Retailer, { name: string; url: string; confidential: boolean; loopback: boolean; scope?: string }> = {
  rohlik: { name: "Rohlík", url: "https://mcp.rohlik.cz/mcp", confidential: false, loopback: true, scope: "openid email roles offline_access" },
  kosik: { name: "Košík", url: "https://mcp.kosik.cz/mcp/", confidential: true, loopback: false },
};

const LOOPBACK_REDIRECT = (r: Retailer) => `http://127.0.0.1:53682/nourish/${r}/callback`;

/** Tools that could place / pay / change delivery are never exposed — the user finishes checkout in the shop. */
export const FORBIDDEN_TOOL = /(order|checkout|submit|pay|purchase|delivery|slot|address|complaint|reklamac|cancel|customer|account|profile)/i;

type Stored = { client?: OAuthClientInformationMixed; tokens?: OAuthTokens; verifier?: string; state?: string };

async function load(r: Retailer): Promise<Stored> {
  const row = await db.query.appState.findFirst({ where: eq(schema.appState.key, `retailer-oauth:${r}`) });
  return row ? (open<Stored>((row.value as { s: string }).s) ?? {}) : {};
}
async function save(r: Retailer, patch: Partial<Stored>) {
  const cur = await load(r);
  const next = { ...cur, ...patch };
  const value = { s: seal(next) };
  await db.insert(schema.appState).values({ key: `retailer-oauth:${r}`, value }).onConflictDoUpdate({ target: schema.appState.key, set: { value, updatedAt: new Date() } });
  if (patch.tokens) await db.insert(schema.appState).values({ key: `retailer:${r}`, value: { connectedAt: new Date().toISOString() } }).onConflictDoUpdate({ target: schema.appState.key, set: { value: { connectedAt: new Date().toISOString() }, updatedAt: new Date() } });
}

export async function disconnect(r: Retailer) {
  await db.delete(schema.appState).where(eq(schema.appState.key, `retailer-oauth:${r}`));
  await db.delete(schema.appState).where(eq(schema.appState.key, `retailer:${r}`));
  await audit("retailer_disconnected", { r });
}

class Provider implements OAuthClientProvider {
  authUrl: URL | null = null;
  constructor(
    private r: Retailer,
    private origin: string,
  ) {}
  get redirectUrl() {
    return RETAILERS[this.r].loopback ? LOOPBACK_REDIRECT(this.r) : `${this.origin}/api/retailers/${this.r}/callback`;
  }
  get clientMetadata(): OAuthClientMetadata {
    return {
      client_name: "Nourish (osobní plánovač)",
      redirect_uris: [this.redirectUrl],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: RETAILERS[this.r].confidential ? "client_secret_post" : "none",
      ...(RETAILERS[this.r].scope ? { scope: RETAILERS[this.r].scope } : {}),
    };
  }
  async state() {
    const s = (await load(this.r)).state ?? crypto.randomUUID();
    await save(this.r, { state: s });
    return s;
  }
  async clientInformation() {
    return (await load(this.r)).client;
  }
  async saveClientInformation(c: OAuthClientInformationMixed) {
    await save(this.r, { client: c });
  }
  async tokens() {
    return (await load(this.r)).tokens;
  }
  async saveTokens(t: OAuthTokens) {
    await save(this.r, { tokens: t });
  }
  redirectToAuthorization(u: URL) {
    this.authUrl = u;
  }
  async saveCodeVerifier(v: string) {
    await save(this.r, { verifier: v });
  }
  async codeVerifier() {
    const v = (await load(this.r)).verifier;
    if (!v) throw new Error("missing verifier");
    return v;
  }
  async invalidateCredentials(scope: "all" | "client" | "tokens" | "verifier" | "discovery") {
    if (scope === "all") await save(this.r, { client: undefined, tokens: undefined, verifier: undefined });
    if (scope === "tokens") await save(this.r, { tokens: undefined });
    if (scope === "client") await save(this.r, { client: undefined });
  }
}

/** Start OAuth (dynamic client registration + PKCE). Returns the URL to send the user to. */
export async function startConnect(r: Retailer, origin: string): Promise<string | null> {
  // Fresh registration each time: an older client may carry a redirect URI the AS no longer accepts.
  await save(r, { state: crypto.randomUUID(), tokens: undefined, client: undefined, verifier: undefined });
  const p = new Provider(r, origin);
  const res = await auth(p, { serverUrl: RETAILERS[r].url, scope: RETAILERS[r].scope });
  if (res === "AUTHORIZED") return null;
  return p.authUrl?.toString() ?? null;
}

export async function finishConnect(r: Retailer, origin: string, code: string, state: string | null) {
  const stored = await load(r);
  if (!stored.state || stored.state !== state) throw new Error("Neplatný stav přihlášení (state).");
  const p = new Provider(r, origin);
  const res = await auth(p, { serverUrl: RETAILERS[r].url, authorizationCode: code, scope: RETAILERS[r].scope });
  await save(r, { state: undefined, verifier: undefined });
  await audit("retailer_connected", { r, res });
  return res === "AUTHORIZED";
}

/** Parse the address the owner pasted after the retailer's login (loopback flow). */
export function parsePastedRedirect(r: Retailer, pasted: string): { code: string | null; state: string | null; error: string | null } {
  const raw = pasted.trim();
  let u: URL;
  try {
    u = new URL(raw.startsWith("http") ? raw : `http://x/?${raw.replace(/^\?/, "")}`);
  } catch {
    return { code: null, state: null, error: "Tohle není adresa z přihlášení." };
  }
  if (raw.startsWith("http") && !u.href.startsWith(LOOPBACK_REDIRECT(r).replace(/callback$/, ""))) return { code: null, state: null, error: "Adresa nepochází z přihlášení do obchodu." };
  return { code: u.searchParams.get("code"), state: u.searchParams.get("state"), error: u.searchParams.get("error_description") ?? u.searchParams.get("error") };
}

export async function withRetailer<T>(r: Retailer, origin: string, fn: (c: Client) => Promise<T>): Promise<T> {
  const p = new Provider(r, origin);
  const transport = new StreamableHTTPClientTransport(new URL(RETAILERS[r].url), { authProvider: p });
  const client = new Client({ name: "nourish", version: "1.0.0" });
  await client.connect(transport);
  try {
    return await fn(client);
  } finally {
    await client.close().catch(() => {});
  }
}

/**
 * Allow-list, not just deny-list: the Rohlík server exposes ~58 tools (claims, scheduled tasks, shopping-list
 * deletion, bag counts…). Nourish only ever needs product search/details and reading/adding to the cart.
 */
const ALLOWED_TOOL = /(search_products|product_details|products_composition|get_cart|add_items_to_cart|add_to_cart|discounted_items|favorites)/i;
const NEVER_TOOL = /(clear|remove|delete|cancel|update|submit|adjust|credit|reserve)/i;

export async function listSafeTools(c: Client) {
  const { tools } = await c.listTools();
  return tools.filter((t) => ALLOWED_TOOL.test(t.name) && !FORBIDDEN_TOOL.test(t.name) && !NEVER_TOOL.test(t.name));
}
