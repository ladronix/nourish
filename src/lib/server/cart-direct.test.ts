import { describe, expect, it, vi } from "vitest";
vi.mock("./retailer", () => ({ listSafeTools: async (c: { tools: unknown[] }) => c.tools }));
vi.mock("./cart-agent", () => ({}));
import { extractProducts, packInUnit, pickTools, previewDirect, applyDirect, scoreHit } from "./cart-direct";

const tool = (name: string, properties: Record<string, unknown>, required: string[] = []) => ({ name, inputSchema: { type: "object", properties, required } });

describe("cart-direct", () => {
  it("recognises search + cart tools by name and schema", () => {
    const t = pickTools([tool("get_cart_content", {}), tool("search_products", { keyword: { type: "string" } }), tool("add_to_cart", { products: { type: "array" } }), tool("search_recipes", { q: { type: "string" } })] as never);
    expect(t.search?.name).toBe("search_products");
    expect(t.add?.name).toBe("add_to_cart");
    expect(t.cart?.name).toBe("get_cart_content");
  });
  it("extracts products from nested / stringified results", () => {
    const content = [{ type: "text", text: JSON.stringify({ data: { products: [{ productId: 123, productName: "Kuřecí prsní řízky 500 g", price: { amount: 139.9 }, textualAmount: "500 g", inStock: true }, { id: "x2", name: "Kuřecí stehna", price: "89,90" }] } }) }];
    const p = extractProducts(content);
    expect(p.map((x) => x.id)).toEqual(["123", "x2"]);
    expect(p[0].price).toBeCloseTo(139.9);
    expect(p[1].price).toBeCloseTo(89.9);
  });
  it("parses pack sizes into shopping units", () => {
    expect(packInUnit("1,5 l", "ml")).toBe(1500);
    expect(packInUnit("0.25 kg", "g")).toBe(250);
    expect(packInUnit("10 ks", "ks")).toBe(10);
    expect(packInUnit("500 g", "ml")).toBeNull();
  });
  it("prefers the matching, available product and penalises allergens", () => {
    const item = { name: "Kuřecí prsa", qty: 600, unit: "g" };
    const good = { id: "1", name: "Kuřecí prsa 600 g", price: 150, pack: "600 g", available: true, raw: {} };
    const off = { id: "2", name: "Hovězí mleté 500 g", price: 120, pack: "500 g", available: true, raw: {} };
    expect(scoreHit(item, good, [])).toBeGreaterThan(scoreHit(item, off, []));
    expect(scoreHit({ name: "Arašídové máslo", qty: 1, unit: "ks" }, { ...good, name: "Arašídové máslo" }, ["arašíd"])).toBeLessThan(0);
  });
  it("previews and applies against a fake MCP client", async () => {
    const calls: { name: string; arguments: Record<string, unknown> }[] = [];
    const client = {
      tools: [tool("search_products", { keyword: { type: "string" }, limit: { type: "integer" } }), tool("add_to_cart", { products: { type: "array", items: { type: "object", properties: { productId: { type: "integer" }, quantity: { type: "integer" } } } } })],
      callTool: async (a: { name: string; arguments: Record<string, unknown> }) => {
        calls.push(a);
        if (a.name === "search_products") return { content: [{ type: "text", text: JSON.stringify([{ productId: 7, productName: "Řecký jogurt bílý 400 g", price: 45, textualAmount: "400 g" }]) }] };
        return { content: [{ type: "text", text: "ok" }] };
      },
    };
    const pv = await previewDirect(client as never, [{ id: 1, name: "Řecký jogurt", qty: 900, unit: "g" }], []);
    expect(pv.matches[0]).toMatchObject({ productId: "7", quantity: 3 });
    expect(calls[0].arguments).toEqual({ keyword: "Řecký jogurt", limit: 8 });
    const ap = await applyDirect(client as never, [{ productId: "7", quantity: 3, name: "jogurt" }]);
    expect(ap.results[0].ok).toBe(true);
    expect(calls[1].arguments).toEqual({ products: [{ productId: 7, quantity: 3 }] });
  });
  it("handles Rohlík batch_search_products (queries[] + context) and add_items_to_cart", async () => {
    const calls: { name: string; arguments: Record<string, unknown> }[] = [];
    const ctx = { context: { type: "string" } };
    const client = {
      tools: [
        tool("batch_search_products", { queries: { type: "array", items: { type: "object", properties: { keyword: { type: "string" } } } }, ...ctx }, ["queries"]),
        tool("add_items_to_cart", { items: { type: "array", items: { type: "object", properties: { productId: { type: "integer" }, quantity: { type: "number" } } } }, ...ctx }, ["items"]),
        tool("get_cart", { ...ctx }),
      ],
      callTool: async (a: { name: string; arguments: Record<string, unknown> }) => {
        calls.push(a);
        if (a.name === "batch_search_products") {
          const qs = a.arguments.queries as { keyword: string }[];
          const results = qs.map((q, i) => ({ query: q, products: [{ productId: 100 + i, productName: i === 0 ? "Kuřecí prsní řízky od českého výrobce" : "Milko Řecký jogurt 0 % bílý kbelík", textualAmount: i === 0 ? "cca 490 g" : "1 kg", inStock: true, price: i === 0 ? 111.62 : 119.9, favourite: false }] }));
          return { content: [{ type: "text", text: JSON.stringify({ success: true, results }) }] };
        }
        if (a.name === "get_cart") return { content: [{ type: "text", text: JSON.stringify({ totalPrice: { amount: 345.5 } }) }] };
        return { content: [{ type: "text", text: "{\"success\":true}" }] };
      },
    };
    const pv = await previewDirect(client as never, [{ id: 1, name: "Kuřecí prsa", qty: 900, unit: "g" }, { id: 2, name: "Řecký jogurt", qty: 800, unit: "g" }], []);
    expect(calls[0].arguments).toMatchObject({ queries: [{ keyword: "Kuřecí prsa" }, { keyword: "Řecký jogurt" }] });
    expect(typeof calls[0].arguments.context).toBe("string");
    expect(pv.matches.map((m) => [m.productId, m.quantity])).toEqual([["100", 2], ["101", 1]]);
    const ap = await applyDirect(client as never, [{ productId: "100", quantity: 2, name: "kuře" }]);
    expect(calls.at(-2)!.arguments).toMatchObject({ items: [{ productId: 100, quantity: 2 }] });
    expect(ap.cartTotalCzk).toBeCloseTo(345.5);
  });
});
