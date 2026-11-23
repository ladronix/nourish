import "server-only";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/** Block requests to private / link-local / loopback addresses (SSRF guard for recipe import). */
function isPrivate(ip: string) {
  if (ip.includes(":")) {
    const l = ip.toLowerCase();
    return l === "::1" || l.startsWith("fc") || l.startsWith("fd") || l.startsWith("fe80") || l.startsWith("::ffff:127.") || l.startsWith("::ffff:10.") || l.startsWith("::ffff:192.168.");
  }
  const [a, b] = ip.split(".").map(Number);
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
}

export async function safeFetchText(rawUrl: string, maxBytes = 2_000_000): Promise<{ url: string; text: string }> {
  let url = new URL(rawUrl);
  for (let hop = 0; hop < 4; hop++) {
    if (!/^https?:$/.test(url.protocol)) throw new Error("Pouze http(s) odkazy.");
    const host = url.hostname;
    const addrs = isIP(host) ? [{ address: host }] : await lookup(host, { all: true });
    if (addrs.some((a) => isPrivate(a.address))) throw new Error("Nepovolená adresa.");
    const res = await fetch(url, {
      redirect: "manual",
      headers: { "user-agent": "Mozilla/5.0 (compatible; NourishRecipeImport/1.0)", accept: "text/html,application/xhtml+xml" },
      signal: AbortSignal.timeout(10_000),
    });
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      url = new URL(res.headers.get("location")!, url);
      continue;
    }
    if (!res.ok) throw new Error(`Stránka vrátila ${res.status}.`);
    const reader = res.body?.getReader();
    if (!reader) return { url: url.toString(), text: "" };
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > maxBytes) break;
      chunks.push(value);
    }
    return { url: url.toString(), text: new TextDecoder().decode(Buffer.concat(chunks)) };
  }
  throw new Error("Příliš mnoho přesměrování.");
}

/** Extract a schema.org Recipe from JSON-LD, flattened to plain text for the structuring step. */
export function extractRecipeJsonLd(html: string): string | null {
  const blocks = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
  const find = (node: unknown): Record<string, unknown> | null => {
    if (!node || typeof node !== "object") return null;
    if (Array.isArray(node)) {
      for (const n of node) {
        const f = find(n);
        if (f) return f;
      }
      return null;
    }
    const o = node as Record<string, unknown>;
    const t = o["@type"];
    if (t === "Recipe" || (Array.isArray(t) && t.includes("Recipe"))) return o;
    if (o["@graph"]) return find(o["@graph"]);
    return null;
  };
  for (const b of blocks) {
    try {
      const r = find(JSON.parse(b.trim()));
      if (!r) continue;
      const steps = (Array.isArray(r.recipeInstructions) ? r.recipeInstructions : [r.recipeInstructions])
        .flatMap((s: unknown) => {
          if (typeof s === "string") return [s];
          const so = s as Record<string, unknown>;
          if (so?.itemListElement) return (so.itemListElement as Record<string, unknown>[]).map((x) => String(x.text ?? ""));
          return [String(so?.text ?? "")];
        })
        .filter(Boolean);
      return [
        `Název: ${r.name}`,
        `Popis: ${r.description ?? ""}`,
        `Porce: ${r.recipeYield ?? ""}`,
        `Čas přípravy: ${r.prepTime ?? ""}, vaření: ${r.cookTime ?? ""}, celkem: ${r.totalTime ?? ""}`,
        `Suroviny:\n${((r.recipeIngredient as string[]) ?? []).join("\n")}`,
        `Postup:\n${steps.join("\n")}`,
      ].join("\n");
    } catch {
      /* ignore malformed block */
    }
  }
  return null;
}

export function htmlToText(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .slice(0, 20000);
}
