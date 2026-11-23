"use client";
import { useCallback, useState, useTransition } from "react";
import { Camera, Barcode, PenLine, Plus, Trash2 } from "lucide-react";
import { logFood, deleteLog } from "@/app/actions/log";
import { setMealStatus, setServings } from "@/app/actions/plan";
import { Sheet } from "./sheet";
import { useToast } from "./toast";
import { PhotoPick } from "./photo-pick";
import { postImage } from "./media";
import { BarcodeScanner, lookupBarcode, type BarcodeProduct } from "./barcode-scanner";

type PhotoResult = { description: string; matchedPlannedMealId: number | null; portionFactor: number; items: { name: string; grams: number; kcal: number; protein: number; carbs: number; fat: number; fiber: number }[]; confidence: number };

export function QuickLog({ date, logs }: { date: string; logs: { id: number; name: string; kcal: number; protein: number; source: string }[] }) {
  const [tab, setTab] = useState<null | "quick" | "photo" | "barcode">(null);
  const [pending, start] = useTransition();
  const toast = useToast();

  // quick
  const [q, setQ] = useState({ name: "", kcal: "", protein: "" });
  // photo
  const [photo, setPhoto] = useState<PhotoResult | null>(null);
  const [busy, setBusy] = useState(false);
  // barcode
  const [prod, setProd] = useState<BarcodeProduct | null>(null);
  const [grams, setGrams] = useState("100");

  const close = () => {
    setTab(null);
    setPhoto(null);
    setProd(null);
  };

  const onCode = useCallback(
    async (code: string) => {
      try {
        const p = await lookupBarcode(code);
        setProd(p);
        setGrams(String(p.qty && p.qty < 400 ? p.qty : 100));
      } catch (e) {
        toast((e as Error).message, true);
      }
    },
    [toast],
  );

  async function analyze(f: File) {
    setBusy(true);
    try {
      setPhoto(await postImage<PhotoResult>("/api/ai/meal-photo", f, { date }));
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }

  const photoTotals = photo?.items.reduce((a, i) => ({ kcal: a.kcal + i.kcal, protein: a.protein + i.protein, carbs: a.carbs + i.carbs, fat: a.fat + i.fat, fiber: a.fiber + i.fiber }), { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 });

  return (
    <div className="panel">
      <div className="panel-heading" style={{ marginBottom: 12 }}>
        <div>
          <span className="eyebrow">Mimo plán</span>
          <h3>Zapsat něco navíc</h3>
        </div>
      </div>
      <div className="row" style={{ flexWrap: "wrap" }}>
        <button className="btn btn-sm btn-soft" onClick={() => setTab("photo")}>
          <Camera size={16} /> Fotka
        </button>
        <button className="btn btn-sm btn-soft" onClick={() => setTab("barcode")}>
          <Barcode size={16} /> Čárový kód
        </button>
        <button className="btn btn-sm btn-soft" onClick={() => setTab("quick")}>
          <PenLine size={16} /> Rychle
        </button>
      </div>
      {logs.length > 0 && (
        <ul className="list" style={{ marginTop: 10 }}>
          {logs.map((l) => (
            <li key={l.id}>
              <span className="emoji">{l.source === "photo" ? "📷" : l.source === "barcode" ? "🏷️" : "✏️"}</span>
              <div>
                <strong>{l.name}</strong>
                <small>
                  {Math.round(l.kcal)} kcal · {Math.round(l.protein)} g B
                </small>
              </div>
              <button className="text-btn" onClick={() => start(() => deleteLog(l.id))} aria-label={`Smazat ${l.name}`}>
                <Trash2 size={16} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <Sheet open={tab === "quick"} onClose={close} label="Rychlý zápis">
        <span className="eyebrow">Rychlý zápis</span>
        <h2>Co jsi snědl navíc?</h2>
        <form
          style={{ display: "grid", gap: 12 }}
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              await logFood({ date, name: q.name, kcal: Number(q.kcal) || 0, protein: Number(q.protein) || 0, source: "quick" });
              setQ({ name: "", kcal: "", protein: "" });
              close();
              toast("Zapsáno.");
            });
          }}
        >
          <label className="field">
            <span>Název</span>
            <input className="input" required value={q.name} onChange={(e) => setQ({ ...q, name: e.target.value })} placeholder="Káva s mlékem, jablko…" />
          </label>
          <div className="form-grid">
            <label className="field">
              <span>kcal</span>
              <input className="input" inputMode="numeric" required value={q.kcal} onChange={(e) => setQ({ ...q, kcal: e.target.value })} />
            </label>
            <label className="field">
              <span>Bílkoviny (g)</span>
              <input className="input" inputMode="numeric" value={q.protein} onChange={(e) => setQ({ ...q, protein: e.target.value })} />
            </label>
          </div>
          <div className="chips">
            {[
              ["Káva s mlékem", 40, 2],
              ["Jablko", 80, 0],
              ["Banán", 105, 1],
              ["Hrst ořechů", 180, 5],
              ["Pivo 0,5 l", 215, 2],
              ["Sklenka vína", 125, 0],
            ].map(([n, k, p]) => (
              <button type="button" key={n as string} className="chip" onClick={() => setQ({ name: n as string, kcal: String(k), protein: String(p) })}>
                {n}
              </button>
            ))}
          </div>
          <button className="btn btn-primary" disabled={pending}>
            <Plus size={18} /> Zapsat
          </button>
        </form>
      </Sheet>

      <Sheet open={tab === "photo"} onClose={close} label="Fotka jídla">
        <span className="eyebrow">Foto → makra</span>
        <h2>Vyfoť talíř</h2>
        <p>AI odhadne složení. Pokud fotka odpovídá jídlu z plánu, jen ho odškrtne se správnou porcí. Vše můžeš upravit.</p>
        {!photo && (
          <PhotoPick onFiles={(f) => analyze(f[0])} busy={busy} busyLabel="Analyzuji… (až 1 min)" />
        )}
        {photo && photoTotals && (
          <div style={{ display: "grid", gap: 10 }}>
            <p className="note info" style={{ margin: 0 }}>
              {photo.description} · jistota {Math.round(photo.confidence * 100)} %
            </p>
            <ul className="list">
              {photo.items.map((it, i) => (
                <li key={i}>
                  <span className="emoji">🍽️</span>
                  <div>
                    <strong>{it.name}</strong>
                    <small>
                      ~{Math.round(it.grams)} g · {Math.round(it.kcal)} kcal · {Math.round(it.protein)} g B
                    </small>
                  </div>
                  <span />
                </li>
              ))}
            </ul>
            <div className="between">
              <strong>
                Celkem {Math.round(photoTotals.kcal)} kcal · {Math.round(photoTotals.protein)} g B
              </strong>
            </div>
            {photo.matchedPlannedMealId && (
              <button
                className="btn btn-dark"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    const f = Math.min(2, Math.max(0.5, Math.round((photo.portionFactor || 1) * 4) / 4));
                    if (f !== 1) await setServings(photo.matchedPlannedMealId!, f);
                    await setMealStatus(photo.matchedPlannedMealId!, "eaten");
                    close();
                    toast(`Odškrtnuto jídlo z plánu (${String(f).replace(".", ",")}× porce).`);
                  })
                }
              >
                Odpovídá plánu — odškrtnout
              </button>
            )}
            <button
              className="btn btn-primary"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  await logFood({ date, name: photo.description.slice(0, 150), ...photoTotals, source: "photo", confidence: photo.confidence });
                  close();
                  toast("Zapsáno z fotky.");
                })
              }
            >
              Zapsat jako jídlo navíc
            </button>
          </div>
        )}
      </Sheet>

      <Sheet open={tab === "barcode"} onClose={close} label="Čárový kód">
        <span className="eyebrow">Čárový kód</span>
        <h2>Naskenuj obal</h2>
        {!prod ? (
          <BarcodeScanner onCode={onCode} />
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            <div className="row">
              {prod.image && <img src={prod.image} alt="" width={56} height={56} style={{ borderRadius: 10, objectFit: "cover" }} />}
              <div>
                <strong>{prod.name}</strong>
                <div className="tiny muted">
                  na 100 {prod.unit}: {Math.round(prod.per100.kcal)} kcal · {prod.per100.protein} g B · {prod.per100.carbs} g S · {prod.per100.fat} g T
                </div>
              </div>
            </div>
            <label className="field">
              <span>Snědené množství ({prod.unit === "ml" ? "ml" : "g"})</span>
              <input className="input" inputMode="decimal" value={grams} onChange={(e) => setGrams(e.target.value)} />
            </label>
            <button
              className="btn btn-primary"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const k = (parseFloat(grams.replace(",", ".")) || 0) / 100;
                  await logFood({ date, name: prod.name.slice(0, 150), kcal: prod.per100.kcal * k, protein: prod.per100.protein * k, carbs: prod.per100.carbs * k, fat: prod.per100.fat * k, fiber: prod.per100.fiber * k, source: "barcode" });
                  close();
                  toast("Zapsáno.");
                })
              }
            >
              Zapsat
            </button>
            {prod.source === "openfoodfacts" && <small className="muted">Data: Open Food Facts (ODbL)</small>}
          </div>
        )}
      </Sheet>
    </div>
  );
}
