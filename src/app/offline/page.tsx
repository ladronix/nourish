export const metadata = { title: "Offline" };

export default function Offline() {
  return (
    <main className="login">
      <div className="login-card" style={{ textAlign: "center" }}>
        <div className="brand" style={{ justifyContent: "center", padding: 0 }}>
          <span className="brand-mark">N</span>
          <span>NOURISH</span>
        </div>
        <h2>Jsi offline</h2>
        <p className="muted" style={{ color: "#b8b9b2" }}>
          Naposledy otevřené stránky (dnešní plán, nákupní seznam) zůstávají dostupné. Změny půjdou uložit, až bude připojení.
        </p>
      </div>
    </main>
  );
}
