"use client";
import { useCallback, useMemo, useState, useTransition } from "react";
import { Search, Plus, Camera, Barcode, Receipt, Trash2, Utensils, PackageOpen, MoveRight } from "lucide-react";
import { addInventory, addInventoryBulk, consumeLot, discardLot, updateLot, type LotInputT } from "@/app/actions/inventory";
import { Sheet } from "./sheet";
import { useToast } from "./toast";
import { PhotoPick } from "./photo-pick";
import { postImage, uid } from "./media";
import { BarcodeScanner, lookupBarcode } from "./barcode-scanner";

export type LotView = { id: number; name: string; emoji: string; qty: number; unit: "g" | "ml" | "ks"; qtyLabel: string; location: "fridge" | "freezer" | "pantry"; expiresOn: string | null; daysLeft: number | null; dueLabel: string; kind: "raw" | "portion"; category: string; opened: boolean; needsReview: boolean; freshPct: number };
export type IngOpt = { id: string; name: string; unit: "g" | "ml" | "ks"; emoji: string; defaultLocation: "fridge" | "freezer" | "pantry"; packSize: number | null; aliases: string[] };

const LOC = { fridge: "Lednice", freezer: "Mrazák", pantry: "Spíž" } as const;
const FILTERS = [
  ["all", "Vše"],
  ["soon", "Brzy spotřebovat"],
  ["fridge", "Lednice"],
  ["freezer", "Mrazák"],
  ["pantry", "Spíž"],
  ["portion", "Hotová jídla"],
  ["review", "Ke kontrole"],
] as const;

type ScanItem = LotInputT & { key: string; include: boolean };

export function FridgeBoard({ lots, ingredients }: { lots: LotView[]; ingredients: IngOpt[] }) {
  const [filter, setFilter] = useState<(typeof FILTERS)[number][0]>("all");
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<LotView | null>(null);
  const [add, setAdd] = useState<null | "manual" | "barcode" | "scan">(null);
  const [pending, start] = useTransition();
  const toast = useToast();

  const shown = useMemo(
    () =>
      lots.filter((l) => {
        if (q && !l.name.toLowerCase().includes(q.toLowerCase())) return false;
        if (filter === "soon") return l.daysLeft !== null && l.daysLeft <= 3;
        if (filter === "portion") return l.kind === "portion";
        if (filter === "review") return l.needsReview;
        if (filter === "fridge" || filter === "freezer" || filter === "pantry") return l.location === filter;
        return true;
      }),
    [lots, filter, q],
  );

  // manual add
  const [m, setM] = useState<{ ingredientId: string | null; name: string; qty: string; unit: "g" | "ml" | "ks"; location: "fridge" | "freezer" | "pantry"; expiresOn: string }>({ ingredientId: null, name: "", qty: "", unit: "g", location: "fridge", expiresOn: "" });
  const sugg = useMemo(() => {
    const s = m.name.trim().toLowerCase();
    if (s.length < 2 || m.ingredientId) return [];
    return ingredients.filter((i) => i.name.toLowerCase().includes(s) || i.aliases.some((a) => a.toLowerCase().includes(s))).slice(0, 6);
  }, [m.name, m.ingredientId, ingredients]);

  // scan review
  const [scanMode, setScanMode] = useState<"fridge" | "receipt">("fridge");
  const [scan, setScan] = useState<ScanItem[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");

  // barcode
  const onCode = useCallback(
    async (code: string) => {
      try {
        const p = await lookupBarcode(code);
        const ing = p.ingredientId ? ingredients.find((i) => i.id === p.ingredientId) : null;
        setM({ ingredientId: p.ingredientId, name: p.name, qty: String(p.qty ?? ing?.packSize ?? ""), unit: p.unit, location: ing?.defaultLocation ?? "fridge", expiresOn: "" });
        (window as unknown as { __nourishBarcode?: unknown }).__nourishBarcode = { code, per100: p.per100 };
        setAdd("manual");
      } catch (e) {
        toast((e as Error).message, true);
      }
    },
    [ingredients, toast],
  );

  /** Several photos (door, shelves, drawer) are scanned in parallel and merged; duplicates by catalog id / name are summed once. */
  async function runScan(files: File[]) {
    setBusy(true);
    const list = files.slice(0, 6);
    let done = 0;
    setProgress(list.length > 1 ? `0/${list.length}` : "");
    try {
      const results = await Promise.allSettled(
        list.map((f) =>
          postImage<{ items: (LotInputT & { confidence: number })[]; note: string | null }>("/api/ai/inventory-scan", f, { mode: scanMode }).finally(() => {
            done++;
            if (list.length > 1) setProgress(`${done}/${list.length}`);
          }),
        ),
      );
      const ok = results.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
      const failed = results.find((r) => r.status === "rejected") as PromiseRejectedResult | undefined;
      if (!ok.length) throw failed?.reason ?? new Error("Sken se nepovedl.");
      const merged = new Map<string, LotInputT & { confidence: number }>();
      for (const it of ok.flatMap((r) => r.items)) {
        const k = it.ingredientId ?? it.name.toLowerCase().trim();
        const prev = merged.get(k);
        // Same item seen on two photos is usually the same object photographed twice — keep the larger estimate.
        if (!prev || it.qty > prev.qty) merged.set(k, { ...it, confidence: Math.max(it.confidence, prev?.confidence ?? 0) });
      }
      const items = [...merged.values()];
      setScan(items.map((it) => ({ ...it, key: uid(), include: it.confidence >= 0.4, source: scanMode === "receipt" ? "receipt" : "photo" })));
      if (!items.length) toast("Nic jsem nerozpoznal. Zkus jinou fotku.", true);
      else if (failed) toast(`Jedna z fotek se nepovedla: ${(failed.reason as Error).message}`, true);
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setBusy(false);
      setProgress("");
    }
  }

  const reqId = () => uid();

  return (
    <>
      <div className="toolbar">
        <div className="search">
          <Search />
          <input placeholder="Najít surovinu…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Hledat v zásobách" />
        </div>
        <div className="row" style={{ flexWrap: "wrap" }}>
          <button className="btn btn-sm btn-primary" onClick={() => setAdd("manual")}>
            <Plus size={16} /> Přidat
          </button>
          <button className="btn btn-sm btn-soft" onClick={() => setAdd("barcode")}>
            <Barcode size={16} /> Kód
          </button>
          <button className="btn btn-sm btn-soft" onClick={() => (setScanMode("fridge"), setAdd("scan"))}>
            <Camera size={16} /> Foto lednice
          </button>
          <button className="btn btn-sm btn-soft" onClick={() => (setScanMode("receipt"), setAdd("scan"))}>
            <Receipt size={16} /> Účtenka
          </button>
        </div>
      </div>
      <div className="chips" style={{ marginBottom: 14 }}>
        {FILTERS.map(([id, l]) => (
          <button key={id} className="chip" aria-pressed={filter === id} onClick={() => setFilter(id)}>
            {l}
            {id === "review" && lots.some((x) => x.needsReview) ? ` · ${lots.filter((x) => x.needsReview).length}` : ""}
          </button>
        ))}
      </div>

      {shown.length ? (
        <div className="inv-grid">
          {shown.map((l) => (
            <button key={l.id} className={`inv-card ${l.daysLeft !== null && l.daysLeft <= 1 ? "urgent" : l.daysLeft !== null && l.daysLeft <= 3 ? "soon" : ""} ${l.kind === "portion" ? "portion" : ""}`} style={{ textAlign: "left" }} onClick={() => setSel(l)}>
              <div className="visual" aria-hidden>
                {l.emoji}
              </div>
              <span className={`badge pill ${l.daysLeft !== null && l.daysLeft <= 1 ? "pill-coral" : l.daysLeft !== null && l.daysLeft <= 3 ? "pill-amber" : "pill-green"}`}>{l.dueLabel}</span>
              <h3>{l.name}</h3>
              <span className="meta">
                {l.qtyLabel} · {LOC[l.location]}
                {l.opened ? " · otevřeno" : ""}
                {l.needsReview ? " · zkontrolovat" : ""}
              </span>
              <div className="fresh-bar">
                <i style={{ width: `${l.freshPct}%` }} />
              </div>
            </button>
          ))}
        </div>
      ) : (
        <div className="panel empty">
          <h3>{lots.length ? "Nic neodpovídá filtru" : "Lednice je zatím prázdná"}</h3>
          <p>Přidej věci ručně, čárovým kódem, fotkou lednice nebo účtenky. Po nákupu stačí odškrtnout seznam a „Přesunout do lednice“.</p>
        </div>
      )}

      {/* Lot detail */}
      <Sheet open={!!sel} onClose={() => setSel(null)} label="Položka zásob">
        {sel && (
          <>
            <span className="eyebrow">
              {LOC[sel.location]} · {sel.dueLabel}
            </span>
            <h2>
              {sel.emoji} {sel.name}
            </h2>
            <p>{sel.qtyLabel}</p>
            <div className="options">
              <button
                className="option"
                onClick={() =>
                  start(async () => {
                    await consumeLot(sel.id, "all", reqId());
                    setSel(null);
                    toast("Spotřebováno.");
                  })
                }
              >
                <Utensils size={18} /> Spotřebováno celé
              </button>
              {sel.unit !== "ks" || sel.qty > 1 ? (
                <button
                  className="option"
                  onClick={() =>
                    start(async () => {
                      await consumeLot(sel.id, sel.unit === "ks" ? 1 : Math.round(sel.qty / 2), reqId());
                      setSel(null);
                      toast("Odečteno.");
                    })
                  }
                >
                  <Utensils size={18} /> {sel.unit === "ks" ? "Ubrat 1 ks" : "Ubrat polovinu"}
                </button>
              ) : null}
              {!sel.opened && sel.kind === "raw" && (
                <button
                  className="option"
                  onClick={() =>
                    start(async () => {
                      await updateLot(sel.id, { opened: true });
                      setSel(null);
                      toast("Označeno jako otevřené — expirace zkrácena.");
                    })
                  }
                >
                  <PackageOpen size={18} /> Otevřeno
                </button>
              )}
              <button
                className="option"
                onClick={() =>
                  start(async () => {
                    await discardLot(sel.id, reqId());
                    setSel(null);
                    toast("Vyhozeno. Zapíšu do statistiky plýtvání.");
                  })
                }
              >
                <Trash2 size={18} /> Vyhodit
              </button>
            </div>
            <div className="form-grid">
              <label className="field">
                <span>Množství ({sel.unit})</span>
                <input className="input" inputMode="decimal" defaultValue={sel.qty} onBlur={(e) => start(() => updateLot(sel.id, { qty: parseFloat(e.target.value.replace(",", ".")) || 0 }))} />
              </label>
              <label className="field">
                <span>Spotřebovat do</span>
                <input className="input" type="date" defaultValue={sel.expiresOn ?? ""} onChange={(e) => start(() => updateLot(sel.id, { expiresOn: e.target.value || null }))} />
              </label>
              <label className="field">
                <span>Umístění</span>
                <select className="select" defaultValue={sel.location} onChange={(e) => start(() => updateLot(sel.id, { location: e.target.value as LotView["location"] }))}>
                  <option value="fridge">Lednice</option>
                  <option value="freezer">Mrazák</option>
                  <option value="pantry">Spíž</option>
                </select>
              </label>
            </div>
            {sel.needsReview && (
              <button className="btn btn-soft btn-full" style={{ marginTop: 12 }} onClick={() => start(async () => (await updateLot(sel.id, {}), setSel(null)))}>
                <MoveRight size={16} /> Potvrdit položku
              </button>
            )}
          </>
        )}
      </Sheet>

      {/* Manual add */}
      <Sheet open={add === "manual"} onClose={() => setAdd(null)} label="Přidat do zásob">
        <span className="eyebrow">Přidat do zásob</span>
        <h2>Co přibylo?</h2>
        <form
          style={{ display: "grid", gap: 12, marginTop: 10 }}
          onSubmit={(e) => {
            e.preventDefault();
            const bc = (window as unknown as { __nourishBarcode?: { code: string; per100: LotInputT["nutritionPer100"] } }).__nourishBarcode;
            start(async () => {
              await addInventory({ ingredientId: m.ingredientId, name: m.name, qty: parseFloat(m.qty.replace(",", ".")) || 1, unit: m.unit, location: m.location, expiresOn: m.expiresOn || null, barcode: bc?.code ?? null, nutritionPer100: bc?.per100 ?? null, source: bc ? "barcode" : "manual" });
              (window as unknown as { __nourishBarcode?: unknown }).__nourishBarcode = undefined;
              setM({ ingredientId: null, name: "", qty: "", unit: "g", location: "fridge", expiresOn: "" });
              setAdd(null);
              toast("Přidáno. Expiraci jsem odhadl podle typu potraviny.");
            });
          }}
        >
          <label className="field" style={{ position: "relative" }}>
            <span>Surovina</span>
            <input className="input" required value={m.name} onChange={(e) => setM({ ...m, name: e.target.value, ingredientId: null })} placeholder="Kuřecí prsa, vejce, špenát…" autoComplete="off" />
            {sugg.length > 0 && (
              <div className="panel" style={{ position: "absolute", top: "100%", left: 0, right: 0, zIndex: 5, padding: 6, marginTop: 4 }}>
                {sugg.map((s) => (
                  <button type="button" key={s.id} className="cand" style={{ border: 0, gridTemplateColumns: "36px 1fr" }} onClick={() => setM({ ...m, ingredientId: s.id, name: s.name, unit: s.unit, location: s.defaultLocation, qty: m.qty || String(s.packSize ?? "") })}>
                    <span className="emoji">{s.emoji}</span>
                    <span>
                      <strong>{s.name}</strong>
                      <small>{s.unit}</small>
                    </span>
                  </button>
                ))}
              </div>
            )}
            {m.ingredientId ? <small>✓ propojeno s katalogem — plán i nákup s ní počítají</small> : m.name.length > 1 ? <small>Bez propojení s katalogem — plánovač ji nepoužije</small> : null}
          </label>
          <div className="form-grid">
            <label className="field">
              <span>Množství</span>
              <input className="input" inputMode="decimal" required value={m.qty} onChange={(e) => setM({ ...m, qty: e.target.value })} />
            </label>
            <label className="field">
              <span>Jednotka</span>
              <select className="select" value={m.unit} onChange={(e) => setM({ ...m, unit: e.target.value as "g" })}>
                <option value="g">g</option>
                <option value="ml">ml</option>
                <option value="ks">ks</option>
              </select>
            </label>
            <label className="field">
              <span>Umístění</span>
              <select className="select" value={m.location} onChange={(e) => setM({ ...m, location: e.target.value as "fridge" })}>
                <option value="fridge">Lednice</option>
                <option value="freezer">Mrazák</option>
                <option value="pantry">Spíž</option>
              </select>
            </label>
            <label className="field">
              <span>Spotřebovat do</span>
              <input className="input" type="date" value={m.expiresOn} onChange={(e) => setM({ ...m, expiresOn: e.target.value })} />
              <small>prázdné = odhad</small>
            </label>
          </div>
          <button className="btn btn-primary" disabled={pending}>
            <Plus size={18} /> Přidat
          </button>
        </form>
      </Sheet>

      <Sheet open={add === "barcode"} onClose={() => setAdd(null)} label="Skenovat čárový kód">
        <span className="eyebrow">Čárový kód</span>
        <h2>Naskenuj obal</h2>
        {add === "barcode" && <BarcodeScanner onCode={onCode} />}
      </Sheet>

      <Sheet open={add === "scan"} onClose={() => (setAdd(null), setScan(null))} label="Sken zásob" wide>
        <span className="eyebrow">{scanMode === "receipt" ? "Účtenka / objednávka" : "Foto lednice"}</span>
        <h2>{scanMode === "receipt" ? "Vyfoť účtenku nebo potvrzení objednávky" : "Vyfoť otevřenou lednici"}</h2>
        {scanMode !== "receipt" && <p className="small muted">Tip: víc fotek najednou (dveře, police, šuplík) — z galerie jich můžeš vybrat až 6, výsledky se sloučí.</p>}
        <p>AI navrhne položky. Nic se neuloží, dokud to neschválíš — nejisté položky jsou odškrtnuté.</p>
        {!scan && (
          <PhotoPick onFiles={runScan} busy={busy} busyLabel={progress ? `Rozpoznávám ${progress}… (každá fotka ~1 min)` : "Rozpoznávám…"} multiple />
        )}
        {scan && (
          <div style={{ display: "grid", gap: 8 }}>
            {scan.map((it, idx) => (
              <div key={it.key} className="scan-row">
                <input type="checkbox" checked={it.include} onChange={(e) => setScan(scan.map((x, j) => (j === idx ? { ...x, include: e.target.checked } : x)))} aria-label={`Zahrnout ${it.name}`} />
                <div className="name">
                  <input className="input" style={{ minHeight: 34 }} value={it.name} onChange={(e) => setScan(scan.map((x, j) => (j === idx ? { ...x, name: e.target.value } : x)))} />
                  <small>
                    {it.ingredientId ? "✓ katalog" : "mimo katalog"} · {LOC[it.location]} · do {it.expiresOn ?? "?"} · jistota {Math.round((it.confidence ?? 0) * 100)} %
                  </small>
                </div>
                <div className="qty">
                  <input className="input" style={{ minHeight: 34 }} inputMode="decimal" aria-label={`Množství ${it.name}`} value={it.qty} onChange={(e) => setScan(scan.map((x, j) => (j === idx ? { ...x, qty: parseFloat(e.target.value.replace(",", ".")) || 0 } : x)))} />
                  <span className="tiny muted">{it.unit}</span>
                </div>
              </div>
            ))}
            <button
              className="btn btn-primary"
              disabled={pending || !scan.some((s) => s.include)}
              onClick={() =>
                start(async () => {
                  const items = scan.filter((s) => s.include && s.qty > 0).map(({ key: _k, include: _i, ...rest }) => ({ ...rest, confidence: rest.confidence ?? 0.7 }));
                  const r = await addInventoryBulk(items);
                  setScan(null);
                  setAdd(null);
                  toast(`Přidáno ${r.count} položek do zásob.`);
                })
              }
            >
              Uložit vybrané ({scan.filter((s) => s.include).length})
            </button>
          </div>
        )}
      </Sheet>
    </>
  );
}
