"use client";
import { useState, useSyncExternalStore } from "react";
import { startAuthentication, browserSupportsWebAuthn } from "@simplewebauthn/browser";
import { Fingerprint, LockKeyhole } from "lucide-react";

const noopSubscribe = () => () => {};

function nextUrl() {
  const n = new URLSearchParams(location.search).get("next");
  return n && n.startsWith("/") && !n.startsWith("//") ? n : "/";
}

export function LoginForm() {
  const [pw, setPw] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const canPasskey = useSyncExternalStore(noopSubscribe, browserSupportsWebAuthn, () => false);

  async function passkey() {
    setErr(null);
    setBusy(true);
    try {
      const o = await fetch("/api/auth/passkey/options", { method: "POST" });
      const opts = await o.json();
      if (!o.ok) throw new Error(opts.error ?? "Passkey není k dispozici.");
      const resp = await startAuthentication({ optionsJSON: opts });
      const v = await fetch("/api/auth/passkey/verify", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(resp) });
      const r = await v.json();
      if (!v.ok) throw new Error(r.error ?? "Ověření selhalo.");
      location.replace(nextUrl());
    } catch (e) {
      const m = (e as Error).message;
      setErr(/NotAllowed|abort|cancel/i.test(m) ? "Přihlášení zrušeno." : m);
    } finally {
      setBusy(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      const r = await fetch("/api/auth/password", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ password: pw }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Přihlášení selhalo.");
      location.replace(nextUrl());
    } catch (e) {
      setErr((e as Error).message);
      setPw("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-card">
      <div className="brand" style={{ padding: "0 0 8px" }}>
        <span className="brand-mark">N</span>
        <span>NOURISH</span>
      </div>
      <div>
        <h2 style={{ fontSize: 26 }}>Vítej zpátky.</h2>
        <p style={{ color: "#b4b5ae", margin: "6px 0 0", fontSize: 14 }}>Soukromý prostor jen pro tebe.</p>
      </div>
      {canPasskey && (
        <button className="btn btn-primary btn-full" onClick={passkey} disabled={busy} type="button">
          <Fingerprint /> Přihlásit Face ID / passkey
        </button>
      )}
      <form onSubmit={submit} style={{ display: "grid", gap: 10 }}>
        <label className="field">
          <span style={{ color: "#c8c9c1" }}>Heslo</span>
          <input className="input" type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} required />
        </label>
        <button className="btn btn-ghost-light btn-full" disabled={busy || !pw} type="submit">
          <LockKeyhole /> Přihlásit heslem
        </button>
      </form>
      {err && (
        <p role="alert" style={{ margin: 0, color: "#ffb4a6", fontSize: 13 }}>
          {err}
        </p>
      )}
      <p style={{ margin: 0, color: "#7f817a", fontSize: 12 }}>Po 5 neúspěšných pokusech se přihlášení na 15 minut zamkne.</p>
    </div>
  );
}
