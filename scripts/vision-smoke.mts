/** Smoke test: run the fridge scan through the configured AI backend. Usage: npx tsx scripts/vision-smoke.ts <photo.jpg> */
import { readFileSync } from "node:fs";
import { config } from "dotenv";
config({ path: ".env.development.local" });
const { scanInventory, aiProvider } = await import("../src/lib/server/ai");
const img = readFileSync(process.argv[2]);
const t = Date.now();
const out = await scanInventory(new Uint8Array(img), "image/jpeg", "fridge", [{ id: "rajcata", name: "Rajčata", unit: "g" }, { id: "mleko", name: "Mléko polotučné", unit: "ml" }, { id: "vejce", name: "Vejce", unit: "ks" }, { id: "okurka", name: "Okurka salátová", unit: "ks" }], "2026-11-23");
console.log(aiProvider(), (Date.now() - t) / 1000 + "s", JSON.stringify(out, null, 1));
