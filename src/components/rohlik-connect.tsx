"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "./toast";

/** Start the Rohlík login; for the loopback flow, collect the address the browser ended on. */
export function useRetailerConnect(r: "rohlik") {
  const [busy, setBusy] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const toast = useToast();
  const router = useRouter();

  async function start() {
    setBusy(true);
    // Open the tab synchronously (iOS blocks window.open after an await), then point it at the login page.
    const tab = window.open("about:blank", "_blank");
    try {
      const res = await fetch(`/api/retailers/${r}/connect`, { method: "POST" });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Připojení selhalo.");
      if (j.connected) {
        tab?.close();
        toast("Propojeno.");
        router.refresh();
        return;
      }
      if (tab) tab.location.href = j.url;
      else location.href = j.url;
      setWaiting(true);
    } catch (e) {
      tab?.close();
      toast((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }

  async function finish(pasted: string) {
    setBusy(true);
    try {
      const res = await fetch(`/api/retailers/${r}/callback`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ pasted }) });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Dokončení selhalo.");
      setWaiting(false);
      toast("Rohlík propojen.");
      router.refresh();
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  return { busy, waiting, start, finish, cancel: () => setWaiting(false) };
}

export function ConnectSteps({ c }: { c: ReturnType<typeof useRetailerConnect> }) {
  const [pasted, setPasted] = useState("");
  if (!c.waiting)
    return (
      <button type="button" className="btn btn-dark btn-full" onClick={c.start} disabled={c.busy}>
        {c.busy ? "Otevírám přihlášení…" : "Připojit Rohlík účet"}
      </button>
    );
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <ol className="small" style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 4 }}>
        <li>V nové záložce se přihlas do Rohlíku a povol přístup.</li>
        <li>
          Pak tě to přesměruje na stránku, která <strong>se nenačte</strong> (adresa začíná <code>http://127.0.0.1</code>). To je v pořádku — Rohlík jinou adresu pro vlastní aplikace nepovoluje.
        </li>
        <li>Zkopíruj celou adresu z adresního řádku a vlož ji sem.</li>
      </ol>
      <textarea className="input" rows={3} placeholder="http://127.0.0.1:53682/nourish/rohlik/callback?code=…" value={pasted} onChange={(e) => setPasted(e.target.value)} aria-label="Adresa po přihlášení" />
      <div className="between" style={{ gap: 8 }}>
        <button type="button" className="btn btn-ghost btn-sm" onClick={c.cancel} disabled={c.busy}>
          Zrušit
        </button>
        <button type="button" className="btn btn-primary" onClick={() => c.finish(pasted)} disabled={c.busy || pasted.trim().length < 8}>
          {c.busy ? "Ověřuji…" : "Dokončit propojení"}
        </button>
      </div>
      <small className="tiny muted">Kód platí jen pár minut a jen spolu s klíčem uloženým na serveru (PKCE) — nikomu jinému k ničemu není.</small>
    </div>
  );
}

export function RohlikConnect({ connected, error }: { connected: boolean; error?: string | null }) {
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const c = useRetailerConnect("rohlik");
  return (
    <div className="panel" id="obchody">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">Obchody</span>
          <h3>Propojení košíku</h3>
        </div>
        <span className="retailer-mark rohlik">R</span>
      </div>
      <p className="small muted" style={{ marginTop: -8 }}>
        Rohlík přes oficiální MCP server (OAuth). Nourish umí jen hledat produkty a vkládat do košíku — objednávku a platbu vždy dokončíš ty v obchodě. Obchod dostane jen nákupní seznam, žádné zdravotní údaje.
      </p>
      {error && <p className="note warn">Poslední pokus selhal: {error}</p>}
      {connected ? (
        <div className="between">
          <span className="pill pill-green">Propojeno</span>
          <button
            className="btn btn-sm btn-ghost"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              await fetch("/api/retailers/rohlik/disconnect", { method: "POST" });
              toast("Odpojeno, tokeny smazány.");
              location.reload();
            }}
          >
            Odpojit
          </button>
        </div>
      ) : (
        <ConnectSteps c={c} />
      )}
      <p className="tiny muted" style={{ marginTop: 10 }}>
        Podle podmínek Rohlíku je MCP určené pro tvůj vlastní zákaznický účet.
      </p>
    </div>
  );
}
