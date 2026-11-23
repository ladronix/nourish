import "server-only";
import { generateText, Output } from "ai";
import { z } from "zod";

/**
 * Two backends for photo/recipe extraction:
 * - "cloudflare" (default when VISION_WORKER_URL is set): our private Worker `nourish-vision` on Workers AI — free tier, no card.
 * - "gateway": Vercel AI Gateway (Claude) — better quality, needs a card on the Vercel team. Also used by the cart-agent fallback.
 * Override with AI_PROVIDER=gateway|cloudflare.
 */
export const AI_MODEL = process.env.AI_MODEL ?? "anthropic/claude-sonnet-5.5";
const CF_MODEL = process.env.CF_VISION_MODEL ?? "@cf/meta/llama-4-scout-17b-16e-instruct";
/** Text-only tasks (recipe import) use a faster model; vision needs Scout. */
const CF_TEXT_MODEL = process.env.CF_TEXT_MODEL ?? "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

export function aiProvider(): "cloudflare" | "gateway" {
  const p = process.env.AI_PROVIDER;
  if (p === "gateway" || p === "cloudflare") return p;
  return process.env.VISION_WORKER_URL && process.env.VISION_SECRET ? "cloudflare" : "gateway";
}

export function aiAvailable() {
  if (aiProvider() === "cloudflare") return !!(process.env.VISION_WORKER_URL && process.env.VISION_SECRET);
  return !!(process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN || process.env.VERCEL);
}

type Img = { data: Uint8Array; mediaType: string };

async function cloudflareJson(schema: z.ZodType, system: string, text: string, image?: Img): Promise<unknown> {
  const content: unknown[] = [{ type: "text", text: text + "\n\nOdpověz pouze JSON objektem podle schématu." }];
  if (image) content.push({ type: "image_url", image_url: { url: `data:${image.mediaType};base64,${Buffer.from(image.data).toString("base64")}` } });
  const jsonSchema = z.toJSONSchema(schema, { target: "draft-7", unrepresentable: "any" });
  const res = await fetch(process.env.VISION_WORKER_URL!, {
    method: "POST",
    headers: { authorization: `Bearer ${process.env.VISION_SECRET}`, "content-type": "application/json" },
    body: JSON.stringify({ model: image ? CF_MODEL : CF_TEXT_MODEL, max_tokens: 4000, temperature: 0.1, response_format: { type: "json_schema", json_schema: jsonSchema }, messages: [{ role: "system", content: system }, { role: "user", content: image ? content : (content[0] as { text: string }).text /* text models take a plain string */ }] }),
    signal: AbortSignal.timeout(110_000),
  });
  const j = (await res.json().catch(() => ({}))) as { result?: { response?: unknown; choices?: { message?: { content?: unknown } }[] }; error?: string };
  if (!res.ok) throw new Error(`workers-ai ${res.status}: ${j.error ?? "error"}`);
  let out = j.result?.response ?? j.result?.choices?.[0]?.message?.content;
  if (typeof out === "string") {
    const m = out.match(/\{[\s\S]*\}/);
    out = m ? JSON.parse(m[0]) : null;
  }
  return out;
}

/** Fill nulls for missing nullable/optional keys and clamp obvious ranges so a near-miss from a small model still parses. */
function lenient(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(lenient);
  if (v && typeof v === "object") {
    const o: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) o[k] = x === "null" ? null : lenient(x);
    if (typeof o.confidence === "number") o.confidence = Math.max(0, Math.min(1, o.confidence));
    return o;
  }
  return v;
}

/** Structured extraction through the configured backend. Returns null when the model output can't be validated. */
async function structured<T extends z.ZodType>(schema: T, system: string, text: string, image?: Img): Promise<z.infer<T> | null> {
  if (aiProvider() === "cloudflare") {
    const raw = lenient(await cloudflareJson(schema, system, text, image));
    const p = schema.safeParse(raw);
    if (p.success) return p.data;
    // Salvage list results item by item (one malformed row shouldn't lose the whole scan).
    const shape = (schema as unknown as { shape?: Record<string, z.ZodType> }).shape;
    const itemsSchema = shape?.items as unknown as { element?: z.ZodType } | undefined;
    if (itemsSchema?.element && raw && typeof raw === "object" && Array.isArray((raw as { items?: unknown }).items)) {
      const items = ((raw as { items: unknown[] }).items.map((it) => fillNulls(itemsSchema.element!, it)).map((it) => itemsSchema.element!.safeParse(it)).filter((r) => r.success).map((r) => r.data));
      const whole = schema.safeParse({ ...(raw as object), ...fillNullsTop(shape!, raw as Record<string, unknown>), items });
      if (whole.success) return whole.data;
    }
    console.error("workers-ai schema mismatch", p.error.issues.slice(0, 3));
    return null;
  }
  const { output } = await generateText({
    model: AI_MODEL,
    system,
    output: Output.object({ schema }),
    messages: [{ role: "user", content: image ? [{ type: "text", text }, { type: "file", mediaType: image.mediaType, data: image.data }] : [{ type: "text", text }] }],
  });
  return output as z.infer<T>;
}

/** For an object schema: missing keys that accept null get null. */
function fillNulls(schema: z.ZodType, v: unknown) {
  const shape = (schema as unknown as { shape?: Record<string, z.ZodType> }).shape;
  if (!shape || !v || typeof v !== "object") return v;
  return { ...fillNullsTop(shape, v as Record<string, unknown>), ...(v as object) };
}
function fillNullsTop(shape: Record<string, z.ZodType>, v: Record<string, unknown>) {
  const o: Record<string, unknown> = {};
  for (const [k, s] of Object.entries(shape)) if (v[k] === undefined && s.safeParse(null).success) o[k] = null;
  return o;
}

/** Map AI Gateway failures to a message the owner can act on (instead of "try a sharper photo"). */
export function aiErrorMessage(e: unknown, fallback: string) {
  const m = (e as Error)?.message ?? "";
  if (/credit card|billing|payment required|insufficient|quota|402/i.test(m)) return "AI je vypnutá: Vercel AI Gateway vyžaduje platební kartu u týmu (Vercel → Settings → Billing). Fotka je v pořádku.";
  if (/rate limit|429/i.test(m)) return "AI je chvíli přetížená, zkus to za minutu.";
  return fallback;
}

const SYSTEM_CZ =
  "Jsi pečlivý asistent pro osobní výživu v Česku. Odpovídáš česky. Odhady dělej realisticky podle běžných porcí v ČR a nutričních tabulek (USDA / NutriDatabaze). Když si nejsi jistý, sniž confidence. Nikdy nedávej zdravotní diagnózy.";

export const MealPhotoSchema = z.object({
  description: z.string().describe("Krátký český popis talíře"),
  matchedPlannedMealId: z.number().nullable().describe("ID plánovaného jídla, pokud fotka odpovídá jednomu z kandidátů, jinak null"),
  portionFactor: z.number().describe("Velikost porce vůči plánované porci (1 = stejná), pokud matched"),
  items: z.array(
    z.object({
      name: z.string(),
      grams: z.number(),
      kcal: z.number(),
      protein: z.number(),
      carbs: z.number(),
      fat: z.number(),
      fiber: z.number(),
    }),
  ),
  confidence: z.number().min(0).max(1),
});

export async function analyzeMealPhoto(image: Uint8Array, mediaType: string, candidates: { id: number; name: string; kcal: number }[], hint?: string) {
  return structured(
    MealPhotoSchema,
    SYSTEM_CZ,
              `Odhadni složení a makra jídla na fotce. Rozlož ho na položky s gramy.\n` +
              (candidates.length ? `Dnešní plánovaná jídla (kandidáti): ${candidates.map((c) => `#${c.id} ${c.name} (~${Math.round(c.kcal)} kcal)`).join("; ")}.\nPokud jídlo zjevně odpovídá kandidátovi, vrať jeho ID a poměr porce.\n` : "") +
              (hint ? `Poznámka uživatele: ${hint}\n` : ""),
    { data: image, mediaType },
  );
}

export const InventoryScanSchema = z.object({
  items: z.array(
    z.object({
      name: z.string().describe("Český název potraviny"),
      ingredientId: z.string().nullable().describe("ID z katalogu, pokud odpovídá, jinak null"),
      qty: z.number(),
      unit: z.enum(["g", "ml", "ks"]),
      location: z.enum(["fridge", "freezer", "pantry"]),
      expiresOn: z.string().nullable().describe("YYYY-MM-DD pokud je datum čitelné, jinak null"),
      priceCzk: z.number().nullable(),
      confidence: z.number().min(0).max(1),
    }),
  ),
  note: z.string().nullable(),
});

export async function scanInventory(image: Uint8Array, mediaType: string, mode: "fridge" | "receipt", catalog: { id: string; name: string; unit: string }[], today: string) {
  return structured(
    InventoryScanSchema,
    SYSTEM_CZ,
              (mode === "fridge"
                ? "Na fotce je lednice / spíž. Vypiš VŠECHNY potraviny, které jsou vidět (dveře, police, šuplíky) — i ty, které v katalogu nejsou (pak ingredientId null). U balených výrobků čti etikety (např. mléko, jogurt, cottage, smetana, majonéza, omáčky ve sklenicích). Množství: kusy (ks) u zeleniny/vajec, jinak gramáž balení. Nejisté položky dej s nízkou confidence."
                : "Na fotce je účtenka / potvrzení objednávky z obchodu (např. Rohlík, Košík, Albert, Lidl). Vypiš jen potraviny s množstvím (gramáž z názvu) a cenou. Nepotraviny vynech.") +
              `\nDnes je ${today}. Namapuj položky na katalog, pokud odpovídají (použij přesné ID):\n` +
              catalog.map((c) => `${c.id}: ${c.name} [${c.unit}]`).join("\n") +
              "\nJednotky převeď na jednotku katalogu. Umístění odhadni (lednice/mrazák/spíž).",
    { data: image, mediaType },
  );
}

export const RecipeImportSchema = z.object({
  name: z.string(),
  description: z.string(),
  servings: z.number().int().min(1).max(12),
  prepMin: z.number().int(),
  cookMin: z.number().int(),
  mealTypes: z.array(z.enum(["breakfast", "snack_am", "lunch", "snack", "dinner"])).min(1),
  batchable: z.boolean(),
  fridgeDays: z.number().int(),
  freezerOk: z.boolean(),
  tags: z.array(z.string()),
  emoji: z.string(),
  steps: z.array(z.object({ text: z.string(), timerMin: z.number().nullable() })),
  ingredients: z.array(
    z.object({
      original: z.string(),
      ingredientId: z.string().nullable().describe("ID z katalogu nebo null"),
      newIngredient: z
        .object({ id: z.string().describe("slug bez diakritiky"), name: z.string(), category: z.string(), unit: z.enum(["g", "ml", "ks"]), gramsPerPiece: z.number().nullable(), kcal: z.number(), protein: z.number(), carbs: z.number(), fat: z.number(), fiber: z.number(), allergens: z.array(z.string()), plant: z.number() })
        .nullable()
        .describe("Pouze když ingredientId je null; nutriční hodnoty na 100 g"),
      qty: z.number().describe("Množství v jednotce katalogové/nové suroviny pro CELÝ recept"),
      optional: z.boolean(),
    }),
  ),
});

export async function structureRecipe(source: string, catalog: { id: string; name: string; unit: string }[]) {
  return structured(
    RecipeImportSchema,
    SYSTEM_CZ,
      "Převeď recept do struktury pro aplikaci. Přelož do češtiny. Kroky stručně, u kroků s časem vyplň timerMin. " +
      "Suroviny namapuj na katalog (ID), jinak navrhni novou surovinu s nutričními hodnotami na 100 g. " +
      "Alergeny používej z: gluten, crustaceans, eggs, fish, peanuts, soy, milk, nuts, celery, mustard, sesame, sulphites, lupin, molluscs. " +
      "Kategorie: zelenina, ovoce, maso, ryby, mlecne, pecivo, trvanlive, lusteniny, orechy, mrazene, koreni, napoje, ostatni. plant = 1 pro rostlinu, 0.25 bylinka/koření, 0 jinak.\n\n" +
      "KATALOG:\n" +
      catalog.map((c) => `${c.id}: ${c.name} [${c.unit}]`).join("\n") +
      "\n\nRECEPT:\n" +
      source.slice(0, 18000),
  );
}
