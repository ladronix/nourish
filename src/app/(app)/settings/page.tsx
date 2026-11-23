import { headers } from "next/headers";
import { isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { getCatalog, getProfile, getReminders } from "@/lib/server/data";
import { ProfileForm } from "@/components/profile-form";
import { PushSettings, SecuritySettings } from "@/components/security-settings";
import { Staples } from "@/components/staples";
import { rpConfig } from "@/lib/server/auth";
import { RohlikConnect } from "@/components/rohlik-connect";

export const metadata = { title: "Nastavení" };

export default async function SettingsPage() {
  const [profile, reminders, passkeys, tokens, { ingredientRows }, rohlik] = await Promise.all([
    getProfile(),
    getReminders(),
    db.select().from(schema.passkeys),
    db.select().from(schema.apiTokens).where(isNull(schema.apiTokens.revokedAt)),
    getCatalog(),
    db.query.appState.findFirst({ where: (t, { eq }) => eq(t.key, "retailer:rohlik") }),
  ]);
  const { origin } = rpConfig((await headers()).get("host"));
  const { id: _id, onboarded: _o, updatedAt: _u, ...p } = profile;
  return (
    <>
      <section className="intro">
        <div>
          <span className="eyebrow">Nastavení</span>
          <h2>Tvoje pravidla.</h2>
          <p>Profil, cíl, připomínky, zabezpečení a propojení. Data zůstávají jen tvoje.</p>
        </div>
      </section>
      <div className="grid-2">
        <ProfileForm initial={p} dislikeOptions={ingredientRows.map((i) => ({ id: i.id, name: i.name }))} />
        <aside className="stack">
          <SecuritySettings
            passkeys={passkeys.map((k) => ({ id: k.id, deviceName: k.deviceName, createdAt: k.createdAt.toISOString(), lastUsedAt: k.lastUsedAt?.toISOString() ?? null }))}
            tokens={tokens.map((t) => ({ id: t.id, name: t.name, prefix: t.prefix, lastUsedAt: t.lastUsedAt?.toISOString() ?? null }))}
            origin={origin}
          />
          <PushSettings vapidKey={process.env.VAPID_PUBLIC_KEY ?? null} reminders={reminders.map((r) => ({ id: r.id, label: r.label, time: r.time, enabled: r.enabled }))} />
          <RohlikConnect connected={!!rohlik} />
          <Staples items={ingredientRows.map((i) => ({ id: i.id, name: i.name, emoji: i.emoji, unit: i.unit, isStaple: i.isStaple, minStock: i.minStock }))} />
        </aside>
      </div>
    </>
  );
}
