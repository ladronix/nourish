"use client";
import { useEffect, useState, useTransition } from "react";
import { saveProfile, previewTargets, confirmTargets, type ProfileInputT } from "@/app/actions/profile";
import { useToast } from "./toast";

const ACT: [ProfileInputT["activity"], string][] = [
  ["sedentary", "Sedavý"],
  ["light", "Lehký"],
  ["moderate", "Střední"],
  ["active", "Aktivní"],
  ["very_active", "Velmi aktivní"],
];
const ALLERGENS: Record<string, string> = { gluten: "Lepek", crustaceans: "Korýši", eggs: "Vejce", fish: "Ryby", peanuts: "Arašídy", soy: "Sója", milk: "Mléko", nuts: "Ořechy", celery: "Celer", mustard: "Hořčice", sesame: "Sezam", sulphites: "Siřičitany", molluscs: "Měkkýši" };
const DIETS: [string, string][] = [
  ["vegetarian", "Vegetarián"],
  ["vegan", "Vegan"],
  ["low-carb", "Méně sacharidů"],
];
const SAFETY: Record<string, string> = { pregnant: "Těhotenství", breastfeeding: "Kojení", eating_disorder: "Porucha příjmu potravy (i v minulosti)", medical_condition: "Onemocnění ovlivňující výživu", diabetes_medication: "Léky na cukrovku / inzulin" };
const SLOTS: [ProfileInputT["slots"][number]["slot"], string, string, number][] = [
  ["breakfast", "Snídaně", "07:30", 0.25],
  ["snack_am", "Dopolední svačina", "10:00", 0.1],
  ["lunch", "Oběd", "12:30", 0.33],
  ["snack", "Svačina", "16:00", 0.12],
  ["dinner", "Večeře", "19:00", 0.3],
];
const DAYS = ["Ne", "Po", "Út", "St", "Čt", "Pá", "So"];

type Preview = NonNullable<Awaited<ReturnType<typeof previewTargets>>>;

export function ProfileForm({ initial, dislikeOptions }: { initial: ProfileInputT; dislikeOptions: { id: string; name: string }[] }) {
  const [p, setP] = useState<ProfileInputT>(initial);
  const [pv, setPv] = useState<Preview | null>(null);
  const [pending, start] = useTransition();
  const toast = useToast();
  const set = <K extends keyof ProfileInputT>(k: K, v: ProfileInputT[K]) => setP((x) => ({ ...x, [k]: v }));
  const toggleArr = (k: "allergens" | "dietTags" | "safetyFlags" | "dislikes", v: string) => set(k, p[k].includes(v) ? p[k].filter((x) => x !== v) : [...p[k], v]);

  useEffect(() => {
    const t = setTimeout(() => {
      previewTargets(p)
        .then(setPv)
        .catch(() => setPv(null));
    }, 350);
    return () => clearTimeout(t);
  }, [p]);

  const slotOn = (s: string) => p.slots.find((x) => x.slot === s);
  const [dq, setDq] = useState("");

  return (
    <form
      id="profile"
      className="panel"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await saveProfile(p);
          if (!r.ok) return toast(r.error, true);
          await confirmTargets();
          toast("Profil uložen, nový cíl platí od dneška. Přestav týden, ať se plán přizpůsobí.");
        });
      }}
      style={{ display: "grid", gap: 18 }}
    >
      <div className="panel-heading" style={{ marginBottom: 0 }}>
        <div>
          <span className="eyebrow">Profil a cíl</span>
          <h3>Podle tebe, ne podle průměru</h3>
        </div>
      </div>
      <div className="form-grid">
        <label className="field">
          <span>Jméno / oslovení</span>
          <input className="input" value={p.name} onChange={(e) => set("name", e.target.value)} placeholder="Martine" />
        </label>
        <label className="field">
          <span>Pohlaví (pro výpočet)</span>
          <select className="select" value={p.sex} onChange={(e) => set("sex", e.target.value as "male")}>
            <option value="male">Muž</option>
            <option value="female">Žena</option>
          </select>
        </label>
        <label className="field">
          <span>Rok narození</span>
          <input className="input" inputMode="numeric" value={p.birthYear} onChange={(e) => set("birthYear", Number(e.target.value) || 1990)} />
        </label>
        <label className="field">
          <span>Výška (cm)</span>
          <input className="input" inputMode="decimal" value={p.heightCm} onChange={(e) => set("heightCm", Number(e.target.value.replace(",", ".")) || 0)} />
        </label>
        <label className="field">
          <span>Hmotnost (kg)</span>
          <input className="input" inputMode="decimal" value={p.weightKg} onChange={(e) => set("weightKg", Number(e.target.value.replace(",", ".")) || 0)} />
        </label>
      </div>
      <div className="field">
        <span>Aktivita</span>
        <div className="seg">
          {ACT.map(([id, l]) => (
            <button type="button" key={id} aria-pressed={p.activity === id} onClick={() => set("activity", id)}>
              {l}
            </button>
          ))}
        </div>
      </div>
      <div className="form-grid">
        <div className="field">
          <span>Cíl</span>
          <div className="seg">
            {(
              [
                ["lose", "Zhubnout"],
                ["maintain", "Udržet"],
                ["gain", "Nabrat"],
              ] as const
            ).map(([id, l]) => (
              <button type="button" key={id} aria-pressed={p.goal === id} onClick={() => set("goal", id)}>
                {l}
              </button>
            ))}
          </div>
        </div>
        {p.goal !== "maintain" && (
          <label className="field">
            <span>Tempo (kg/týden)</span>
            <select className="select" value={p.goalRateKgWeek} onChange={(e) => set("goalRateKgWeek", Number(e.target.value))}>
              {(p.goal === "lose" ? [0.25, 0.4, 0.5, 0.75] : [0.1, 0.2, 0.3]).map((v) => (
                <option key={v} value={v}>
                  {String(v).replace(".", ",")} kg
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="field">
          <span>Bílkoviny (g/kg)</span>
          <select className="select" value={p.proteinGPerKg} onChange={(e) => set("proteinGPerKg", Number(e.target.value))}>
            {[1.2, 1.4, 1.6, 1.8, 2.0, 2.2].map((v) => (
              <option key={v} value={v}>
                {String(v).replace(".", ",")} g/kg
              </option>
            ))}
          </select>
        </label>
      </div>

      {pv && (
        <div className={`note ${pv.consultProfessional || pv.warnings.length ? "warn" : ""}`}>
          <div>
            <strong>
              Cíl: {pv.kcalMin.toLocaleString("cs-CZ")}–{pv.kcalMax.toLocaleString("cs-CZ")} kcal · bílkoviny {pv.proteinMin}–{pv.proteinMax} g · vláknina ≥ {pv.fiberMin} g · voda ~{(pv.waterMl / 1000).toFixed(1).replace(".", ",")} l
            </strong>
            <div className="tiny">
              Klidový výdej {pv.bmr} kcal · celkový výdej ~{pv.tdee} kcal (Mifflin-St Jeor × aktivita). Po 2–3 týdnech vážení ho check-in zpřesní podle reality.
            </div>
            {pv.warnings.map((w) => (
              <div key={w} className="tiny" style={{ marginTop: 4 }}>
                ⚠︎ {w}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="field">
        <span>Jídla během dne</span>
        <div style={{ display: "grid", gap: 6 }}>
          {SLOTS.map(([id, l, defTime, share]) => {
            const s = slotOn(id);
            return (
              <div key={id} className="row" style={{ flexWrap: "wrap" }}>
                <button type="button" className="toggle" role="switch" aria-checked={!!s} aria-label={l} onClick={() => set("slots", s ? p.slots.filter((x) => x.slot !== id) : [...p.slots, { slot: id, time: defTime, share }])} />
                <span style={{ minWidth: 140 }}>{l}</span>
                {s && <input className="input" type="time" value={s.time} onChange={(e) => set("slots", p.slots.map((x) => (x.slot === id ? { ...x, time: e.target.value } : x)))} style={{ width: 120, minHeight: 36 }} />}
              </div>
            );
          })}
        </div>
      </div>

      <div className="field">
        <span>Alergeny a nesnášenlivosti (nikdy v plánu)</span>
        <div className="chips" style={{ flexWrap: "wrap" }}>
          {Object.entries(ALLERGENS).map(([id, l]) => (
            <button type="button" key={id} className="chip" aria-pressed={p.allergens.includes(id)} onClick={() => toggleArr("allergens", id)}>
              {l}
            </button>
          ))}
        </div>
      </div>
      <div className="field">
        <span>Stravování</span>
        <div className="chips">
          {DIETS.map(([id, l]) => (
            <button type="button" key={id} className="chip" aria-pressed={p.dietTags.includes(id)} onClick={() => toggleArr("dietTags", id)}>
              {l}
            </button>
          ))}
        </div>
      </div>
      <div className="field">
        <span>Nejím / nechci v plánu</span>
        <div className="chips" style={{ flexWrap: "wrap" }}>
          {p.dislikes.map((id) => (
            <button type="button" key={id} className="chip on" onClick={() => toggleArr("dislikes", id)}>
              {dislikeOptions.find((d) => d.id === id)?.name ?? id} ×
            </button>
          ))}
        </div>
        <input className="input" placeholder="Přidat surovinu…" value={dq} onChange={(e) => setDq(e.target.value)} />
        {dq.length > 1 && (
          <div className="chips" style={{ flexWrap: "wrap" }}>
            {dislikeOptions
              .filter((d) => d.name.toLowerCase().includes(dq.toLowerCase()) && !p.dislikes.includes(d.id))
              .slice(0, 8)
              .map((d) => (
                <button
                  type="button"
                  key={d.id}
                  className="chip"
                  onClick={() => {
                    toggleArr("dislikes", d.id);
                    setDq("");
                  }}
                >
                  + {d.name}
                </button>
              ))}
          </div>
        )}
      </div>
      <div className="form-grid">
        <label className="field">
          <span>Max. vaření ve všední den (min)</span>
          <input className="input" inputMode="numeric" value={p.maxCookMinutesWeekday} onChange={(e) => set("maxCookMinutesWeekday", Number(e.target.value) || 30)} />
        </label>
        <label className="field">
          <span>Meal prep den</span>
          <select className="select" value={p.prepDay} onChange={(e) => set("prepDay", Number(e.target.value))}>
            {DAYS.map((d, i) => (
              <option key={i} value={i}>
                {d}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Rozpočet / týden (Kč)</span>
          <input className="input" inputMode="numeric" value={p.budgetWeekCzk ?? ""} onChange={(e) => set("budgetWeekCzk", e.target.value ? Number(e.target.value) : null)} placeholder="bez limitu" />
        </label>
        <label className="field">
          <span>Obchod</span>
          <select className="select" value={p.preferredRetailer} onChange={(e) => set("preferredRetailer", e.target.value as "rohlik")}>
            <option value="rohlik">Rohlík</option>
            <option value="kosik">Košík</option>
            <option value="none">Jiný / kamenný</option>
          </select>
        </label>
      </div>
      <div className="field">
        <span>Zdravotní okolnosti (přepne na bezpečný režim „konzultuj odborníka“)</span>
        <div className="chips" style={{ flexWrap: "wrap" }}>
          {Object.entries(SAFETY).map(([id, l]) => (
            <button type="button" key={id} className="chip" aria-pressed={p.safetyFlags.includes(id)} onClick={() => toggleArr("safetyFlags", id)}>
              {l}
            </button>
          ))}
        </div>
      </div>
      <button className="btn btn-primary" disabled={pending}>
        {pending ? "Ukládám…" : "Uložit profil a potvrdit cíl"}
      </button>
    </form>
  );
}
