"use client";
import { useState } from "react";
import { ShoppingCart } from "lucide-react";
import { Sheet } from "./sheet";
import { useToast } from "./toast";

type Match = { itemId: number; productId: string | null; productName: string | null; packInfo: string | null; priceCzk: number | null; quantity: number; note: string | null; needsReview: boolean };

export function CartHandoff({ retailer }: { retailer: "rohlik" }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [matches, setMatches] = useState<(Match & { include: boolean; itemName: string })[] | null>(null);
  const [result, setResult] = useState<{ ok: number; fail: number; total: number | null } | null>(null);
  const toast = useToast();

  async function preview() {
    setOpen(true);
    setBusy(true);
    setResult(null);
    try {
      const r = await fetch(`/api/retailers/${retailer}/preview`, { method: "POST" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      const names = new Map<number, string>(j.items.map((i: { id: number; name: string }) => [i.id, i.name]));
      setMatches(j.matches.map((m: Match) => ({ ...m, include: !!m.productId && !m.needsReview, itemName: names.get(m.itemId) ?? "" })));
    } catch (e) {
      toast((e as Error).message, true);
      setOpen(false);
    } finally {
      setBusy(false);
    }
  }

  async function apply() {
    if (!matches) return;
    setBusy(true);
    try {
      const lines = matches.filter((m) => m.include && m.productId && m.quantity > 0).map((m) => ({ productId: m.productId!, quantity: m.quantity, name: m.productName ?? m.itemName }));
      const r = await fetch(`/api/retailers/${retailer}/apply`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ lines }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      const ok = j.results.filter((x: { ok: boolean }) => x.ok).length;
      setResult({ ok, fail: j.results.length - ok, total: j.cartTotalCzk });
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }

  const total = matches?.filter((m) => m.include).reduce((a, m) => a + (m.priceCzk ?? 0) * m.quantity, 0) ?? 0;

  return (
    <>
      <button className="btn btn-primary btn-full" onClick={preview} disabled={busy}>
        <ShoppingCart size={18} /> Připravit košík na kontrolu
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} label="Kontrola košíku" wide>
        <span className="eyebrow">Rohlík · kontrola před vložením</span>
        <h2>{busy && !matches ? "Hledám produkty…" : result ? "Košík naplněn" : "Zkontroluj produkty"}</h2>
        {busy && !matches && <p>Prohledávám sortiment podle seznamu. Trvá to chvilku (cca 20–60 s).</p>}
        {result && (
          <div style={{ display: "grid", gap: 10 }}>
            <p className="note">
              Přidáno {result.ok} položek{result.fail ? `, ${result.fail} se nepodařilo` : ""}.{result.total ? ` Košík celkem ${Math.round(result.total)} Kč.` : ""} Nic se neobjednalo.
            </p>
            <a className="btn btn-primary" href="https://www.rohlik.cz/kosik" target="_blank" rel="noopener noreferrer">
              Otevřít košík a dokončit v Rohlíku
            </a>
          </div>
        )}
        {matches && !result && (
          <div style={{ display: "grid", gap: 6 }}>
            {matches.map((m, i) => (
              <div key={m.itemId} className="shop-item" style={{ gridTemplateColumns: "auto minmax(0,1fr) 70px", borderBottom: "1px solid var(--line)" }}>
                <input type="checkbox" checked={m.include} disabled={!m.productId} onChange={(e) => setMatches(matches.map((x, j) => (j === i ? { ...x, include: e.target.checked } : x)))} aria-label={`Přidat ${m.itemName}`} />
                <div className="name">
                  <strong style={{ fontSize: 14 }}>{m.productName ?? "Nenalezeno"}</strong>
                  <small>
                    za: {m.itemName}
                    {m.packInfo ? ` · ${m.packInfo}` : ""}
                    {m.priceCzk ? ` · ${m.priceCzk} Kč` : ""}
                    {m.note ? ` · ${m.note}` : ""}
                    {m.needsReview ? " · ⚠︎ zkontroluj" : ""}
                  </small>
                </div>
                <input className="input" style={{ minHeight: 34 }} inputMode="numeric" value={m.quantity} onChange={(e) => setMatches(matches.map((x, j) => (j === i ? { ...x, quantity: Math.max(0, parseInt(e.target.value) || 0) } : x)))} aria-label="Počet" />
              </div>
            ))}
            <div className="between" style={{ marginTop: 8 }}>
              <strong>≈ {Math.round(total)} Kč</strong>
              <button className="btn btn-primary" onClick={apply} disabled={busy || !matches.some((m) => m.include)}>
                {busy ? "Vkládám…" : `Vložit do košíku (${matches.filter((m) => m.include).length})`}
              </button>
            </div>
            <small className="muted">Existující položky v košíku zůstanou. Objednávku a platbu dokončíš v Rohlíku.</small>
          </div>
        )}
      </Sheet>
    </>
  );
}
