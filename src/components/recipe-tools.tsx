"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Heart, Link2, ChefHat, CalendarPlus, Archive, Layers } from "lucide-react";
import { toggleFavorite, setArchived, setBatchable } from "@/app/actions/recipes";
import { addMeal } from "@/app/actions/plan";
import { markInboxProcessed } from "@/app/actions/settings";
import { Sheet } from "./sheet";
import { useToast } from "./toast";
import { CookMode, type CookStep } from "./cook-mode";

export function ImportRecipe({ inbox }: { inbox: { id: number; content: string }[] }) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const toast = useToast();
  async function run(payload: { url?: string; text?: string }, inboxId?: number) {
    setBusy(true);
    try {
      const r = await fetch("/api/recipes/import", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      if (inboxId) await markInboxProcessed(inboxId);
      toast("Recept naimportován. Zkontroluj suroviny.");
      router.push(`/recipes/${j.id}`);
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <button className="btn btn-primary" onClick={() => setOpen(true)}>
        <Link2 size={18} /> Import receptu
      </button>
      {inbox.length > 0 && (
        <div className="panel" style={{ gridColumn: "1/-1" }}>
          <span className="eyebrow">Poslané ze Zkratek ({inbox.length})</span>
          <ul className="list">
            {inbox.map((i) => (
              <li key={i.id}>
                <span className="emoji">📥</span>
                <div style={{ overflow: "hidden" }}>
                  <strong style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{i.content}</strong>
                </div>
                <span className="row">
                  <button className="btn btn-xs btn-dark" disabled={busy} onClick={() => run(/^https?:/.test(i.content) ? { url: i.content } : { text: i.content }, i.id)}>
                    Importovat
                  </button>
                  <button className="btn btn-xs btn-ghost" onClick={() => markInboxProcessed(i.id)}>
                    Zahodit
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <Sheet open={open} onClose={() => setOpen(false)} label="Import receptu">
        <span className="eyebrow">Import</span>
        <h2>Odkud recept?</h2>
        <p>Vlož odkaz (čte schema.org data, jinak stránku zpracuje AI) nebo text receptu. Suroviny se napojí na katalog s nutričními hodnotami.</p>
        <div style={{ display: "grid", gap: 10 }}>
          <input className="input" type="url" placeholder="https://…" value={url} onChange={(e) => setUrl(e.target.value)} />
          <button className="btn btn-dark" disabled={busy || !url} onClick={() => run({ url })}>
            {busy ? "Zpracovávám…" : "Importovat z odkazu"}
          </button>
          <textarea className="textarea" placeholder="…nebo vlož text receptu" value={text} onChange={(e) => setText(e.target.value)} />
          <button className="btn btn-soft" disabled={busy || text.length < 30} onClick={() => run({ text })}>
            Importovat text
          </button>
        </div>
      </Sheet>
    </>
  );
}

export function RecipeActions({ id, favorite, archived, batchable, steps, name, mealTypes, startCook }: { id: string; favorite: boolean; archived: boolean; batchable: boolean; steps: CookStep[]; name: string; mealTypes: string[]; startCook: boolean }) {
  const [pending, start] = useTransition();
  const [cook, setCook] = useState(startCook);
  const [plan, setPlan] = useState(false);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [slot, setSlot] = useState(mealTypes[0] ?? "dinner");
  const toast = useToast();
  return (
    <>
      <div className="row" style={{ flexWrap: "wrap" }}>
        <button className="btn btn-primary" onClick={() => setCook(true)} disabled={!steps.length}>
          <ChefHat size={18} /> Vařit
        </button>
        <button className="btn btn-soft" onClick={() => setPlan(true)}>
          <CalendarPlus size={18} /> Do plánu
        </button>
        <button className="btn btn-ghost" aria-pressed={favorite} onClick={() => start(() => toggleFavorite(id))} disabled={pending}>
          <Heart size={18} fill={favorite ? "var(--coral)" : "none"} color={favorite ? "var(--coral)" : "currentColor"} /> {favorite ? "Oblíbené" : "Přidat k oblíbeným"}
        </button>
        <button className="btn btn-ghost" onClick={() => start(() => setBatchable(id, !batchable))} disabled={pending}>
          <Layers size={18} /> {batchable ? "Meal prep: ano" : "Meal prep: ne"}
        </button>
        <button className="btn btn-ghost" onClick={() => start(() => setArchived(id, !archived))} disabled={pending}>
          <Archive size={18} /> {archived ? "Obnovit" : "Nenavrhovat"}
        </button>
      </div>
      {cook && <CookMode title={name} steps={steps} onClose={() => setCook(false)} />}
      <Sheet open={plan} onClose={() => setPlan(false)} label="Přidat do plánu">
        <span className="eyebrow">Přidat do plánu</span>
        <h2>{name}</h2>
        <div className="form-grid" style={{ marginTop: 12 }}>
          <label className="field">
            <span>Den</span>
            <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label className="field">
            <span>Jídlo</span>
            <select className="select" value={slot} onChange={(e) => setSlot(e.target.value)}>
              <option value="breakfast">Snídaně</option>
              <option value="snack_am">Dopolední svačina</option>
              <option value="lunch">Oběd</option>
              <option value="snack">Svačina</option>
              <option value="dinner">Večeře</option>
            </select>
          </label>
        </div>
        <button
          className="btn btn-primary btn-full"
          style={{ marginTop: 14 }}
          disabled={pending}
          onClick={() =>
            start(async () => {
              await addMeal(date, slot as never, id, 1);
              setPlan(false);
              toast("Přidáno do plánu (zamčené).");
            })
          }
        >
          Přidat
        </button>
      </Sheet>
    </>
  );
}
