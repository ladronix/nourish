"use client";
import { useEffect, useState, useSyncExternalStore, useTransition } from "react";
import { startRegistration, browserSupportsWebAuthn } from "@simplewebauthn/browser";
import { Fingerprint, KeyRound, LogOut, Download, Bell, Trash2 } from "lucide-react";
import { createApiToken, revokeApiToken, deletePasskey, logoutEverywhere, updateReminder } from "@/app/actions/settings";
import { useToast } from "./toast";

const noopSubscribe = () => () => {};

function b64ToU8(b64: string) {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const s = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}

export function PushSettings({ vapidKey, reminders }: { vapidKey: string | null; reminders: { id: string; label: string; time: string; enabled: boolean }[] }) {
  const [state, setState] = useState<"unknown" | "unsupported" | "needs-install" | "off" | "on" | "denied">("unknown");
  const [pending, start] = useTransition();
  const toast = useToast();

  useEffect(() => {
    (async () => {
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
        const ios = /iPhone|iPad/.test(navigator.userAgent);
        setState(ios && !matchMedia("(display-mode: standalone)").matches ? "needs-install" : "unsupported");
        return;
      }
      if (Notification.permission === "denied") return setState("denied");
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      setState(sub ? "on" : "off");
      // Re-sync subscription on every visit (iOS can rotate it silently)
      if (sub) fetch("/api/push/subscribe", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(sub.toJSON()) }).catch(() => {});
    })();
  }, []);

  async function enable() {
    if (!vapidKey) return toast("Push není na serveru nakonfigurovaný (VAPID klíče).", true);
    const perm = await Notification.requestPermission();
    if (perm !== "granted") return setState("denied");
    const reg = (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.register("/sw.js"));
    await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToU8(vapidKey) });
    const r = await fetch("/api/push/subscribe", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...sub.toJSON(), test: true }) });
    if (r.ok) {
      setState("on");
      toast("Notifikace zapnuté — poslal jsem zkušební.");
    } else toast("Registrace selhala.", true);
  }

  async function disable() {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    if (sub) {
      await fetch("/api/push/subscribe", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) });
      await sub.unsubscribe();
    }
    setState("off");
  }

  return (
    <div className="panel">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">Připomínky</span>
          <h3>Klidné notifikace</h3>
        </div>
        <Bell />
      </div>
      {state === "needs-install" && <p className="note warn">Na iPhonu fungují notifikace jen z aplikace na ploše: Safari → Sdílet → Přidat na plochu, pak otevři Nourish z plochy.</p>}
      {state === "unsupported" && <p className="note info">Tento prohlížeč push notifikace nepodporuje.</p>}
      {state === "denied" && <p className="note warn">Notifikace jsou zakázané v nastavení systému.</p>}
      {(state === "off" || state === "on") && (
        <div className="setting">
          <div>
            <strong>Push na tomto zařízení</strong>
            <small>{state === "on" ? "Zapnuto" : "Vypnuto"}</small>
          </div>
          <button className="toggle" role="switch" aria-checked={state === "on"} aria-label="Push notifikace" onClick={() => start(() => (state === "on" ? disable() : enable()))} disabled={pending} />
        </div>
      )}
      {reminders.map((r) => (
        <div key={r.id} className="setting">
          <div>
            <strong>{r.label}</strong>
            <small>{r.time === "slot" ? "10 min před každým jídlem z plánu" : r.id === "checkin" ? `neděle ${r.time}` : r.time}</small>
          </div>
          <div className="row">
            {r.time !== "slot" && <input className="input" type="time" defaultValue={r.time} style={{ width: 110, minHeight: 34 }} onBlur={(e) => e.target.value !== r.time && start(() => updateReminder(r.id, { time: e.target.value }))} aria-label={`Čas: ${r.label}`} />}
            <button className="toggle" role="switch" aria-checked={r.enabled} aria-label={r.label} onClick={() => start(() => updateReminder(r.id, { enabled: !r.enabled }))} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function SecuritySettings({ passkeys, tokens, origin }: { passkeys: { id: string; deviceName: string; createdAt: string; lastUsedAt: string | null }[]; tokens: { id: number; name: string; prefix: string; lastUsedAt: string | null }[]; origin: string }) {
  const [pending, start] = useTransition();
  const [newToken, setNewToken] = useState<string | null>(null);
  const can = useSyncExternalStore(noopSubscribe, browserSupportsWebAuthn, () => false);
  const toast = useToast();

  async function addPasskey() {
    try {
      const o = await fetch("/api/passkeys/options", { method: "POST" });
      const opts = await o.json();
      const resp = await startRegistration({ optionsJSON: opts });
      const name = /iPhone/.test(navigator.userAgent) ? "iPhone" : /iPad/.test(navigator.userAgent) ? "iPad" : /Mac/.test(navigator.userAgent) ? "Mac" : "Zařízení";
      const v = await fetch("/api/passkeys/verify", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ response: resp, name }) });
      if (!v.ok) throw new Error((await v.json()).error);
      toast("Passkey přidán. Příště stačí Face ID.");
      location.reload();
    } catch (e) {
      toast((e as Error).message.includes("NotAllowed") ? "Zrušeno." : (e as Error).message, true);
    }
  }

  return (
    <div className="panel">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">Zabezpečení</span>
          <h3>Jen ty a tvoje zařízení</h3>
        </div>
        <KeyRound />
      </div>
      {passkeys.map((p) => (
        <div key={p.id} className="setting">
          <div>
            <strong>
              <Fingerprint size={15} style={{ display: "inline", verticalAlign: -2 }} /> {p.deviceName}
            </strong>
            <small>
              přidáno {p.createdAt.slice(0, 10)}
              {p.lastUsedAt ? ` · naposledy ${p.lastUsedAt.slice(0, 10)}` : ""}
            </small>
          </div>
          <button className="text-btn" onClick={() => confirm("Odebrat tento passkey?") && start(() => deletePasskey(p.id))} aria-label="Odebrat passkey">
            <Trash2 size={16} />
          </button>
        </div>
      ))}
      {can && (
        <button className="btn btn-dark btn-full" style={{ margin: "10px 0" }} onClick={addPasskey}>
          <Fingerprint size={18} /> Přidat Face ID / passkey na tomto zařízení
        </button>
      )}

      <div style={{ marginTop: 14 }}>
        <span className="eyebrow">iOS Zkratky a Apple Health</span>
        {tokens.map((t) => (
          <div key={t.id} className="setting">
            <div>
              <strong>{t.name}</strong>
              <small>
                {t.prefix}… · {t.lastUsedAt ? `použito ${t.lastUsedAt.slice(0, 10)}` : "zatím nepoužito"}
              </small>
            </div>
            <button className="btn btn-xs btn-ghost" onClick={() => start(() => revokeApiToken(t.id))}>
              Zneplatnit
            </button>
          </div>
        ))}
        {newToken ? (
          <div className="note warn" style={{ marginTop: 8, display: "grid" }}>
            <strong>Token se zobrazí jen jednou — ulož ho do Zkratky:</strong>
            <code className="kbd" onClick={() => navigator.clipboard?.writeText(newToken)}>
              {newToken}
            </code>
          </div>
        ) : (
          <button className="btn btn-soft btn-sm" style={{ marginTop: 8 }} disabled={pending} onClick={() => start(async () => setNewToken(await createApiToken("iPhone Zkratky")))}>
            Vytvořit token pro Zkratky
          </button>
        )}
        <details style={{ marginTop: 10 }} className="small">
          <summary style={{ cursor: "pointer", fontWeight: 700 }}>Jak nastavit Zkratky (Siri, Apple Health, sdílení)</summary>
          <ol style={{ paddingLeft: 18, display: "grid", gap: 6 }}>
            <li>
              <strong>Váha z Apple Health</strong>: Zkratky → Automatizace → Denně 8:00 → „Najít vzorky zdraví: Hmotnost, nejnovější 1“ → „Získat obsah URL“ <span className="kbd">POST {origin}/api/shortcuts/weight</span>, hlavička <span className="kbd">Authorization: Bearer TOKEN</span>, JSON <span className="kbd">{`{"kg": Hmotnost}`}</span>.
            </li>
            <li>
              <strong>„Hej Siri, snědl jsem to“</strong>: zkratka s POST na <span className="kbd">/api/shortcuts/log</span> a JSON <span className="kbd">{`{"action":"eat-next"}`}</span> → odškrtne aktuální jídlo z plánu a odečte zásoby.
            </li>
            <li>
              <strong>„Co mám dnes jíst?“</strong>: GET <span className="kbd">/api/shortcuts/today</span> → „Mluvit text“ z pole <span className="kbd">text</span>.
            </li>
            <li>
              <strong>Poslat recept do Nourish</strong>: zkratka v listu Sdílet (vstup URL) → POST <span className="kbd">/api/shortcuts/inbox</span> s <span className="kbd">{`{"url": Vstup}`}</span>. Import najdeš v Receptech.
            </li>
          </ol>
        </details>
      </div>

      <div className="row" style={{ flexWrap: "wrap", marginTop: 16 }}>
        <a className="btn btn-soft btn-sm" href="/api/export">
          <Download size={16} /> Export dat (JSON)
        </a>
        <button
          className="btn btn-ghost btn-sm"
          onClick={async () => {
            await fetch("/api/auth/logout", { method: "POST" });
            if ("caches" in window) for (const k of await caches.keys()) await caches.delete(k);
            location.href = "/login";
          }}
        >
          <LogOut size={16} /> Odhlásit
        </button>
        <button className="btn btn-ghost btn-sm" onClick={() => confirm("Odhlásit všechna zařízení a zneplatnit tokeny Zkratek?") && start(() => logoutEverywhere())}>
          Odhlásit všude
        </button>
      </div>
    </div>
  );
}
