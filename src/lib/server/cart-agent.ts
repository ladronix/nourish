import "server-only";
import { generateText, Output, tool, jsonSchema, stepCountIs, type ToolSet } from "ai";
import { z } from "zod";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { AI_MODEL } from "./ai";
import { listSafeTools, withRetailer, type Retailer } from "./retailer";

const WRITE_TOOL = /(add|update|remove|set|put|insert|change|clear|delete)/i;

async function toolsFor(c: Client, mode: "read" | "cart") {
  const safe = await listSafeTools(c);
  const allowed = safe.filter((t) => (mode === "read" ? !WRITE_TOOL.test(t.name) : true));
  const set: ToolSet = {};
  for (const t of allowed) {
    set[t.name] = tool({
      description: (t.description ?? t.name).slice(0, 1000),
      inputSchema: jsonSchema(t.inputSchema as never),
      execute: async (args) => {
        const r = await c.callTool({ name: t.name, arguments: args as Record<string, unknown> });
        const text = JSON.stringify(r.structuredContent ?? r.content).slice(0, 12000);
        return text;
      },
    });
  }
  return { set, names: allowed.map((t) => t.name) };
}

const PreviewSchema = z.object({
  matches: z.array(
    z.object({
      itemId: z.number(),
      productId: z.string().nullable(),
      productName: z.string().nullable(),
      packInfo: z.string().nullable().describe("gramáž / balení"),
      priceCzk: z.number().nullable(),
      quantity: z.number().int().min(0).describe("počet kusů/balení k přidání do košíku"),
      note: z.string().nullable().describe("např. náhrada, nejistota, nedostupné"),
      needsReview: z.boolean(),
    }),
  ),
});

export type CartPreview = z.infer<typeof PreviewSchema>;

/**
 * Find products for each shopping line. Read-only tools only. Only the minimal shopping need is shared
 * with the retailer — no health profile, goals or diagnoses.
 */
export async function previewCart(r: Retailer, origin: string, items: { id: number; name: string; qty: number; unit: string }[], allergens: string[]) {
  return withRetailer(r, origin, async (c) => {
    const { set } = await toolsFor(c, "read");
    const { output } = await generateText({
      model: AI_MODEL,
      tools: set,
      stopWhen: stepCountIs(30),
      output: Output.object({ schema: PreviewSchema }),
      system:
        "Jsi nákupní asistent. Pro každou položku seznamu najdi pomocí nástrojů obchodu nejvhodnější dostupný produkt (běžná značka, rozumná cena, gramáž blízko potřebě). " +
        "Spočítej počet balení tak, aby pokryl potřebné množství. Nikdy nic nepřidávej do košíku ani neobjednávej. " +
        (allergens.length ? `Produkty nesmí obsahovat alergeny: ${allergens.join(", ")}. Pokud si nejsi jistý, nastav needsReview=true. ` : "") +
        "Když nic vhodného nenajdeš, productId=null a vysvětli v note.",
      prompt: "Nákupní seznam:\n" + items.map((i) => `#${i.id}: ${i.name} — ${i.qty} ${i.unit}`).join("\n"),
    });
    return output;
  });
}

const ApplySchema = z.object({
  results: z.array(z.object({ productId: z.string(), ok: z.boolean(), message: z.string().nullable() })),
  cartTotalCzk: z.number().nullable(),
});

/** Add approved products to the cart. Ordering/payment tools are not available to the model at all. */
export async function applyCart(r: Retailer, origin: string, lines: { productId: string; quantity: number; name: string }[]) {
  return withRetailer(r, origin, async (c) => {
    const { set } = await toolsFor(c, "cart");
    const { output } = await generateText({
      model: AI_MODEL,
      tools: set,
      stopWhen: stepCountIs(40),
      output: Output.object({ schema: ApplySchema }),
      system:
        "Přidej do košíku přesně tyto produkty a množství. Neměň existující položky uživatele v košíku, nic neodebírej, neobjednávej. " +
        "Pokud nástroj umí přidat víc položek najednou, použij ho. Nakonec načti košík a vrať výsledek po položkách.",
      prompt: lines.map((l) => `${l.productId} × ${l.quantity} (${l.name})`).join("\n"),
    });
    return output;
  });
}
