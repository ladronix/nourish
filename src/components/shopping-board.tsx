"use client";
import { useState, useTransition } from "react";
import { RefreshCw, Plus, Share2, Copy, ExternalLink, PackagePlus, Trash2 } from "lucide-react";
import { rebuildShopping, toggleShoppingItem, addShoppingItem, removeShoppingItem, moveCheckedToInventory } from "@/app/actions/shopping";
import { useToast } from "./toast";
import { CartHandoff } from "./cart-handoff";

export type ShopItem = { id: number; name: string; qtyLabel: string; category: string; categoryLabel: string; checked: boolean; reason: string; note: string | null; estPriceCzk: number | null; required: number | null; available: number | null; unit: string };

function searchUrl(r: "rohlik" | "kosik", t: string) {
  const q = encodeURIComponent(t);
  return r === "rohlik" ? `https://www.rohlik.cz/hledat?q=${q}` : `https://www.kosik.cz/vyhledavani?search=${q}`;
}

export function ShoppingBoard({ items, preferred, covered, rohlikConnected }: { items: ShopItem[]; preferred: "rohlik" | "kosik" | "none"; covered: number; rohlikConnected: boolean }) {
  const [pending, start] = useTransition();
  const [store, setStore] = useState<"rohlik" | "kosik">(preferred === "kosik" ? "kosik" : "rohlik");
  const [name, setName] = useState("");
  const [days, setDays] = useState(7);
  const toast = useToast();

  const groups = new Map<string, ShopItem[]>();
  for (const it of items) groups.set(it.categoryLabel, [...(groups.get(it.categoryLabel) ?? []), it]);
  const open = items.filter((i) => !i.checked);
  const checked = items.filter((i) => i.checked);
  const total = open.reduce((a, i) => a + (i.estPriceCzk ?? 0), 0);
  const text = [...groups.entries()].map(([g, list]) => `${g}:\n${list.filter((i) => !i.checked).map((i) => `• ${i.name} — ${i.qtyLabel}`).join("\n")}`).filter((s) => s.includes("•")).join("\n\n");

  async function share() {
    try {
      if (navigator.share) await navigator.share({ title: "Nákup", text });
      else {
        await navigator.clipboard.writeText(text);
        toast("Seznam zkopírován.");
      }
    } catch {
      /* cancelled */
    }
  }

  return (
    <div className="shop-layout">
      <div className="panel">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">Doplnění na {days} dní</span>
            <h3>
              {open.length} {open.length === 1 ? "položka" : open.length < 5 ? "položky" : "položek"}
            </h3>
          </div>
          <div className="row">
            <div className="seg" aria-label="Horizont">
              {[3, 4, 7].map((d) => (
                <button key={d} aria-pressed={days === d} onClick={() => setDays(d)}>
                  {d} dní
                </button>
              ))}
            </div>
            <button
              className="btn btn-sm btn-dark"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await rebuildShopping(days);
                  toast(`Hotovo: ${r.lines} k nákupu, ${r.covered} pokryto zásobami${r.staples.length ? `, základy (${r.staples.length}) přeskočeny` : ""}.`);
                })
              }
            >
              <RefreshCw size={15} /> {pending ? "Počítám…" : "Podle plánu"}
            </button>
          </div>
        </div>
        <form
          className="row"
          style={{ marginBottom: 6 }}
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) return;
            start(async () => {
              await addShoppingItem({ name: name.trim() });
              setName("");
            });
          }}
        >
          <input className="input" placeholder="Přidat vlastní položku…" value={name} onChange={(e) => setName(e.target.value)} />
          <button className="btn btn-soft" aria-label="Přidat položku" disabled={pending}>
            <Plus size={18} />
          </button>
        </form>
        {items.length === 0 && (
          <div className="empty">
            <h3>Seznam je prázdný</h3>
            <p>Klikni na „Podle plánu“ — sečtu suroviny z plánu a meal prepu a odečtu, co máš doma.</p>
          </div>
        )}
        {[...groups.entries()].map(([g, list]) => (
          <div key={g} className="shop-group">
            <h4>
              {g} <span>{list.filter((i) => !i.checked).length}</span>
            </h4>
            {list.map((it) => (
              <div key={it.id} className={`shop-item ${it.checked ? "done" : ""}`}>
                <input type="checkbox" checked={it.checked} onChange={() => start(() => toggleShoppingItem(it.id))} aria-label={`Koupeno: ${it.name}`} />
                <div className="name">
                  {it.name}
                  <small>
                    {it.reason === "min_stock" ? "doplnění minimální zásoby" : it.reason === "manual" ? "vlastní" : it.available ? `v plánu ${it.required} ${it.unit}, doma ${it.available} ${it.unit}` : it.note ?? ""}
                  </small>
                </div>
                <em>{it.qtyLabel}</em>
                <span className="row" style={{ gap: 2 }}>
                  <a className="text-btn" href={searchUrl(store, it.name)} target="_blank" rel="noopener noreferrer" aria-label={`Najít ${it.name} v obchodě`}>
                    <ExternalLink size={16} />
                  </a>
                  {it.reason === "manual" && (
                    <button className="text-btn" onClick={() => start(() => removeShoppingItem(it.id))} aria-label={`Odebrat ${it.name}`}>
                      <Trash2 size={16} />
                    </button>
                  )}
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>

      <aside className="checkout">
        <span className="eyebrow" style={{ color: "#8e9087" }}>
          Předat do obchodu
        </span>
        <h3>Vyber preferovaný nákup</h3>
        <button className="store" aria-pressed={store === "rohlik"} onClick={() => setStore("rohlik")}>
          <span className="retailer-mark rohlik">R</span>
          <span>
            <strong>Rohlík</strong>
            <small>{rohlikConnected ? "propojeno přes MCP" : "vyhledání položek · košík přes MCP po připojení"}</small>
          </span>
          <span>{store === "rohlik" ? "✓" : "○"}</span>
        </button>
        <button className="store" aria-pressed={store === "kosik"} onClick={() => setStore("kosik")}>
          <span className="retailer-mark kosik">K</span>
          <span>
            <strong>Košík</strong>
            <small>vyhledání položek</small>
          </span>
          <span>{store === "kosik" ? "✓" : "○"}</span>
        </button>
        <div className="co-rows">
          <div>
            <span>Položky</span>
            <strong>{open.length}</strong>
          </div>
          <div>
            <span>Odhad</span>
            <strong>{total ? `≈ ${Math.round(total).toLocaleString("cs-CZ")} Kč` : "—"}</strong>
          </div>
          <div>
            <span>Pokryto zásobami doma</span>
            <strong className="pos">{covered} surovin</strong>
          </div>
          {store === "rohlik" && total > 0 && total < 749 && (
            <div>
              <span>Do minima Rohlíku</span>
              <strong>~{Math.round(749 - total)} Kč</strong>
            </div>
          )}
        </div>
        <div style={{ display: "grid", gap: 8 }}>
          {store === "rohlik" && rohlikConnected && open.length > 0 && <CartHandoff retailer="rohlik" />}
          {store === "rohlik" && !rohlikConnected && (
            <a className="btn btn-ghost-light btn-full" href="/settings#obchody">
              Připojit Rohlík (vkládání do košíku)
            </a>
          )}
          <button className={`btn ${store === "rohlik" && rohlikConnected ? "btn-ghost-light" : "btn-primary"} btn-full`} onClick={share} disabled={!open.length}>
            <Share2 size={18} /> Sdílet / zkopírovat seznam
          </button>
          <a className="btn btn-ghost-light btn-full" href={store === "rohlik" ? "https://www.rohlik.cz/" : "https://www.kosik.cz/"} target="_blank" rel="noopener noreferrer">
            <ExternalLink size={18} /> Otevřít {store === "rohlik" ? "Rohlík" : "Košík"}
          </a>
          <button className="btn btn-ghost-light btn-full" onClick={() => navigator.clipboard?.writeText(open.map((i) => `${i.name} ${i.qtyLabel}`).join("\n")).then(() => toast("Zkopírováno — vlož do vyhledávání v obchodě."))} disabled={!open.length}>
            <Copy size={18} /> Kopírovat jen názvy
          </button>
        </div>
        {checked.length > 0 && (
          <button
            className="btn btn-full"
            style={{ marginTop: 14, background: "var(--green)", color: "#1d2a1b" }}
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await moveCheckedToInventory();
                toast(`${r.moved} položek přesunuto do lednice s odhadem expirace.`);
              })
            }
          >
            <PackagePlus size={18} /> Koupeno → do lednice ({checked.length})
          </button>
        )}
        <p className="safe-note">Nourish nic neobjedná bez tebe. Cenu, náhrady i čas doručení zkontroluješ v obchodě. Obchod nedostává žádné zdravotní údaje.</p>
      </aside>
    </div>
  );
}
