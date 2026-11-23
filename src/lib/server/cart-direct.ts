import "server-only";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { listSafeTools } from "./retailer";
import type { CartPreview } from "./cart-agent";

/**
 * Deterministic cart filling without an LLM: find the retailer's search + add-to-cart tools by name/schema,
 * search each shopping line, score candidates, and add approved lines. Tool names on the official servers
 * are not published, so discovery is schema-driven; if it can't recognise the tools it throws
 * `UnsupportedTools` and the caller may fall back to the AI agent.
 */
export class UnsupportedTools extends Error {}

type Props = Record<string, { type?: string | string[]; items?: { type?: string; properties?: Props }; properties?: Props }>;
const props = (t: Tool | undefined): Props => ((t?.inputSchema as { properties?: Props } | undefined)?.properties ?? {}) as Props;
const isType = (p: Props[string] | undefined, ty: string) => !!p && (p.type === ty || (Array.isArray(p.type) && p.type.includes(ty)));

export function pickTools(tools: Tool[]) {
  const by = (re: RegExp, extra?: (t: Tool) => boolean) => tools.find((t) => re.test(t.name) && (!extra || extra(t)));
  const search =
    by(/search.*product|product.*search|find.*product/i) ?? by(/search/i, (t) => !/recipe|order/i.test(t.name)) ?? by(/product/i, (t) => !!queryKey(t));
  const add = by(/add.*cart|cart.*add|add_to_basket|basket.*add/i) ?? by(/(update|set).*cart/i);
  const cart = by(/(get|show|view|list).*cart|cart.*(content|detail|get)/i);
  return { search, add, cart };
}

function queryKey(t: Tool): string | null {
  const p = props(t);
  for (const k of ["query", "keyword", "keywords", "q", "search", "searchTerm", "term", "text", "name", "product_name", "productName"]) if (isType(p[k], "string")) return k;
  const req = ((t.inputSchema as { required?: string[] }).required ?? []).find((k) => isType(p[k], "string"));
  return req ?? null;
}

/** Collect product-like objects from any JSON-ish tool result. */
export function extractProducts(result: unknown): ProductHit[] {
  const out: ProductHit[] = [];
  const seen = new Set<string>();
  const visit = (v: unknown, depth: number) => {
    if (depth > 7 || v == null) return;
    if (typeof v === "string") {
      const s = v.trim();
      if ((s.startsWith("{") || s.startsWith("[")) && s.length < 2_000_000) {
        try {
          visit(JSON.parse(s), depth + 1);
        } catch {}
      }
      return;
    }
    if (Array.isArray(v)) return v.forEach((x) => visit(x, depth + 1));
    if (typeof v !== "object") return;
    const o = v as Record<string, unknown>;
    const id = o.productId ?? o.product_id ?? o.id;
    const name = o.productName ?? o.product_name ?? o.name ?? o.title;
    if ((typeof id === "string" || typeof id === "number") && typeof name === "string" && name.length > 1) {
      const key = String(id);
      if (!seen.has(key)) {
        seen.add(key);
        out.push({ id: key, name, price: priceOf(o), pack: packOf(o), available: availableOf(o), raw: o });
      }
    }
    for (const x of Object.values(o)) if (x && typeof x === "object") visit(x, depth + 1);
    if (typeof o.text === "string") visit(o.text, depth + 1);
  };
  visit(result, 0);
  return out;
}

export type ProductHit = { id: string; name: string; price: number | null; pack: string | null; available: boolean; raw: Record<string, unknown> };

function num(v: unknown): number | null {
  if (typeof v === "number" && isFinite(v)) return v;
  if (typeof v === "string") {
    const n = parseFloat(v.replace(/\s/g, "").replace(",", "."));
    return isFinite(n) ? n : null;
  }
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return num(o.amount ?? o.full ?? o.value ?? o.price);
  }
  return null;
}
function priceOf(o: Record<string, unknown>) {
  return num(o.price ?? o.priceCzk ?? o.price_czk ?? o.currentPrice ?? o.salePrice ?? (o.prices as Record<string, unknown> | undefined)?.price);
}
function packOf(o: Record<string, unknown>) {
  const v = o.textualAmount ?? o.textual_amount ?? o.amount ?? o.unitAmount ?? o.packageInfo ?? o.package ?? o.weight ?? o.quantity_text;
  return typeof v === "string" ? v : typeof v === "number" ? String(v) : null;
}
function availableOf(o: Record<string, unknown>) {
  for (const k of ["available", "inStock", "in_stock", "isAvailable"]) if (typeof o[k] === "boolean") return o[k] as boolean;
  const s = o.stock ?? o.availability;
  if (typeof s === "string") return !/unavail|nedostup|sold.?out|vyprod/i.test(s);
  if (s && typeof s === "object" && typeof (s as { available?: unknown }).available === "boolean") return (s as { available: boolean }).available;
  return true;
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 ]/g, " ");

/** Parse "500 g", "1,5 l", "6 ks", "0.25 kg" into the shopping unit. */
export function packInUnit(pack: string | null, unit: string): number | null {
  if (!pack) return null;
  const m = pack.replace(",", ".").match(/(\d+(?:\.\d+)?)\s*(kg|g|ml|l|ks|x)\b/i);
  if (!m) return null;
  const n = parseFloat(m[1]);
  const u = m[2].toLowerCase();
  if (unit === "g") return u === "kg" ? n * 1000 : u === "g" ? n : null;
  if (unit === "ml") return u === "l" ? n * 1000 : u === "ml" ? n : null;
  if (unit === "ks") return u === "ks" || u === "x" ? n : null;
  return null;
}

const FORMS = ["dzem", "sirup", "stava", "napoj", "prichut", "tycink", "susenk", "bonbon", "cokolad", "pomazank", "mlety", "mleta", "mlete", "susen", "omack", "polevk", "chips", "lupinky", "smoothie", "musli", "zmrzlin"];

export function scoreHit(item: { name: string; qty: number; unit: string }, h: ProductHit, allergens: string[]) {
  const want = norm(item.name).split(" ").filter((w) => w.length > 2);
  const got = norm(h.name);
  const overlap = want.filter((w) => got.includes(w.slice(0, Math.max(4, w.length - 2)))).length / Math.max(1, want.length);
  let s = overlap * 10;
  if (!h.available) s -= 20;
  const pack = packInUnit(h.pack ?? h.name, item.unit);
  if (pack) s += 2 - Math.min(2, Math.abs(Math.log((pack * Math.max(1, Math.ceil(item.qty / pack))) / item.qty)));
  // A product in a different form than asked for (jam instead of frozen berries, ground instead of fresh ginger).
  for (const f of FORMS) if (got.includes(f) && !norm(item.name).includes(f)) s -= 6;
  const wantFrozen = /mrazen/.test(norm(item.name));
  if (wantFrozen && !/mrazen/.test(got)) s -= 3;
  // Prefer fewer, larger packs over a stack of tiny ones.
  if (pack) {
    const packs = Math.ceil(item.qty / pack);
    if (packs > 4) s -= (packs - 4) * 0.6;
  }
  if (h.raw.favourite === true || h.raw.favorite === true) s += 2;
  if (allergens.some((a) => got.includes(norm(a).trim()))) s -= 50;
  return s;
}

/** Rohlík-style tools want a short analytics `context` sentence (never personal data). */
const ctxArg = (t: Tool, sentence: string) => ("context" in props(t) ? { context: sentence } : {});

/** Parse a batch search result into one product list per query (falls back to one shared list). */
function perQuery(result: unknown, n: number): ProductHit[][] {
  const texts = (Array.isArray(result) ? result : [result]).map((x) => (x && typeof x === "object" && typeof (x as { text?: unknown }).text === "string" ? (x as { text: string }).text : x));
  for (const t of texts) {
    let o: unknown = t;
    if (typeof t === "string") {
      try {
        o = JSON.parse(t);
      } catch {
        continue;
      }
    }
    const res = (o as { results?: unknown[] } | null)?.results;
    if (Array.isArray(res) && res.length === n) return res.map((r) => extractProducts(r));
  }
  const all = extractProducts(result);
  return Array.from({ length: n }, () => all);
}

export async function previewDirect(c: Client, items: { id: number; name: string; qty: number; unit: string }[], allergens: string[]): Promise<CartPreview> {
  const tools = await listSafeTools(c);
  const { search } = pickTools(tools);
  const batchKey = search && Object.keys(props(search)).find((k) => isType(props(search)[k], "array") && /quer/i.test(k));
  const key = search && (batchKey ? null : queryKey(search));
  if (!search || (!key && !batchKey)) throw new UnsupportedTools(`search tool not recognised: ${tools.map((t) => t.name).join(", ")}`);
  const limitKey = ["limit", "max_results", "maxResults", "size", "count"].find((k) => isType(props(search)[k], "integer") || isType(props(search)[k], "number"));
  const ctx = ctxArg(search, "Find grocery products matching a weekly meal-plan shopping list.");

  // One search call per item, or batches of 4 for batch_search_products-style tools.
  const hitsFor = new Map<number, ProductHit[]>();
  if (batchKey) {
    const chunks: (typeof items)[] = [];
    for (let i = 0; i < items.length; i += 4) chunks.push(items.slice(i, i + 4));
    await Promise.all(
      chunks.map(async (ch) => {
        const r = await c.callTool({ name: search.name, arguments: { [batchKey]: ch.map((it) => ({ keyword: it.name })), ...ctx } });
        perQuery(r.structuredContent ?? r.content, ch.length).forEach((h, i) => hitsFor.set(ch[i].id, h));
      }),
    );
  }

  const matches: CartPreview["matches"] = [];
  // Small concurrency to stay polite to the shop.
  const queue = [...items];
  await Promise.all(
    Array.from({ length: 4 }, async () => {
      for (let it = queue.shift(); it; it = queue.shift()) {
        try {
          let hits = hitsFor.get(it.id);
          if (!hits) {
            if (!key) throw new Error("hledání nevrátilo výsledek");
            const r = await c.callTool({ name: search.name, arguments: { [key]: it.name, ...(limitKey ? { [limitKey]: 8 } : {}), ...ctx } });
            hits = extractProducts(r.structuredContent ?? r.content);
          }
          const ranked = hits.map((h) => ({ h, s: scoreHit(it, h, allergens) })).sort((a, b) => b.s - a.s);
          const best = ranked[0];
          if (!best || best.s < 2) {
            matches.push({ itemId: it.id, productId: null, productName: null, packInfo: null, priceCzk: null, quantity: 0, note: "nic vhodného nenalezeno", needsReview: true });
            continue;
          }
          const pack = packInUnit(best.h.pack ?? best.h.name, it.unit);
          const quantity = pack ? Math.max(1, Math.ceil(it.qty / pack)) : 1;
          const unsure = best.s < 6 || quantity > 6 || !best.h.available || (allergens.length > 0 && best.s < 8);
          matches.push({
            itemId: it.id,
            productId: best.h.id,
            productName: best.h.name,
            packInfo: best.h.pack,
            priceCzk: best.h.price,
            quantity,
            note: !best.h.available ? "teď nedostupné" : quantity > 6 ? `${quantity} malých balení — zvaž větší` : !pack ? "zkontroluj počet balení" : ranked[1] ? `alternativa: ${ranked[1].h.name}` : null,
            needsReview: unsure,
          });
        } catch (e) {
          matches.push({ itemId: it.id, productId: null, productName: null, packInfo: null, priceCzk: null, quantity: 0, note: `hledání selhalo (${(e as Error).message.slice(0, 60)})`, needsReview: true });
        }
      }
    }),
  );
  const order = new Map(items.map((i, n) => [i.id, n]));
  return { matches: matches.sort((a, b) => order.get(a.itemId)! - order.get(b.itemId)!) };
}

/** Find the cart total in any (possibly stringified) result, e.g. Rohlík `{result:{data:{totalPrice:345.5}}}`. */
function findTotal(v: unknown, depth = 0): number | null {
  if (depth > 8 || v == null) return null;
  if (typeof v === "string") {
    try {
      return findTotal(JSON.parse(v), depth + 1);
    } catch {
      return null;
    }
  }
  if (Array.isArray(v)) {
    for (const x of v) {
      const t = findTotal(x, depth + 1);
      if (t != null) return t;
    }
    return null;
  }
  if (typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  for (const k of ["totalPrice", "total_price", "priceTotal", "total"]) if (k in o) {
    const n = num(o[k]);
    if (n != null) return n;
  }
  for (const x of Object.values(o)) {
    const t = findTotal(x, depth + 1);
    if (t != null) return t;
  }
  return null;
}

export async function applyDirect(c: Client, lines: { productId: string; quantity: number; name: string }[]) {
  const tools = await listSafeTools(c);
  const { add, cart } = pickTools(tools);
  if (!add) throw new UnsupportedTools(`cart tool not recognised: ${tools.map((t) => t.name).join(", ")}`);
  const p = props(add);
  const arrKey = Object.keys(p).find((k) => isType(p[k], "array"));
  const idKeyOf = (pp: Props) => ["productId", "product_id", "id", "productID"].find((k) => k in pp) ?? "productId";
  const qtyKeyOf = (pp: Props) => ["quantity", "qty", "amount", "count"].find((k) => k in pp) ?? "quantity";

  const results: { productId: string; ok: boolean; message: string | null }[] = [];
  const asNum = (pp: Props, k: string, v: string) => (isType(pp[k], "integer") || isType(pp[k], "number") ? Number(v) : v);
  if (arrKey) {
    const ip = p[arrKey].items?.properties ?? {};
    const idK = idKeyOf(ip);
    const qK = qtyKeyOf(ip);
    const r = await c.callTool({ name: add.name, arguments: { [arrKey]: lines.map((l) => ({ [idK]: asNum(ip, idK, l.productId), [qK]: l.quantity })), ...ctxArg(add, "Add reviewed groceries from a meal-plan shopping list to the cart.") } });
    const ok = !r.isError;
    for (const l of lines) results.push({ productId: l.productId, ok, message: ok ? null : JSON.stringify(r.content).slice(0, 200) });
  } else {
    const idK = idKeyOf(p);
    const qK = qtyKeyOf(p);
    for (const l of lines) {
      try {
        const r = await c.callTool({ name: add.name, arguments: { [idK]: asNum(p, idK, l.productId), [qK]: l.quantity, ...ctxArg(add, "Add reviewed groceries from a meal-plan shopping list to the cart.") } });
        results.push({ productId: l.productId, ok: !r.isError, message: r.isError ? JSON.stringify(r.content).slice(0, 200) : null });
      } catch (e) {
        results.push({ productId: l.productId, ok: false, message: (e as Error).message.slice(0, 200) });
      }
    }
  }
  let cartTotalCzk: number | null = null;
  if (cart) {
    try {
      const r = await c.callTool({ name: cart.name, arguments: { ...ctxArg(cart, "Check the cart total after adding groceries.") } });
      cartTotalCzk = findTotal(r.structuredContent ?? r.content);
    } catch {}
  }
  return { results, cartTotalCzk };
}
