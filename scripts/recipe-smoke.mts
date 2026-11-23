/** Smoke test: recipe text → structure via configured AI backend. */
import { config } from "dotenv";
config({ path: ".env.development.local" });
const { structureRecipe } = await import("../src/lib/server/ai");
const t = Date.now();
try {
  const r = await structureRecipe(process.argv[2] ?? "Ovesná kaše (2 porce): 80 g ovesných vloček, 400 ml mléka, 1 jablko, skořice. Vločky vař 5 minut v mléce, přidej jablko a skořici.", [{ id: "ovesne-vlocky", name: "Ovesné vločky", unit: "g" }, { id: "mleko", name: "Mléko polotučné", unit: "ml" }, { id: "jablko", name: "Jablko", unit: "ks" }]);
  console.log((Date.now() - t) / 1000 + "s", JSON.stringify(r, null, 1)?.slice(0, 3000));
} catch (e) {
  console.error("ERR", (e as Error).message);
}
