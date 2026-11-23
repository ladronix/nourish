# Nourish OS — handoff pro backendového agenta

Aktualizováno: 23. 11. 2026

## Účel tohoto dokumentu

Tento soubor je startovní bod pro dalšího agenta. Produktový kontext, research a bezpečnostní hranice jsou detailněji v `docs/RESEARCH_AND_PLAN.md`. Existující UI je validační prototyp; nesmí být považováno za hotovou aplikaci ani za zdroj skutečných uživatelských dat.

## Stav projektu

> **Aktualizace 23. 11. 2026:** Plán níže je implementovaný jako Next.js 16 + Drizzle + Neon aplikace v kořeni repozitáře a nasazený na Vercel. Aktuální stav je v `README.md`, nasazení a zabezpečení v `docs/DEPLOY.md`. Sekce níže popisují původní výchozí bod.


### Hotové

- Responzivní statický prototyp v `dist/`.
- Pět navržených oblastí: Dnes, Plán, Lednice, Nákup a Pokrok.
- Vizuální systém a hlavní copy produktu.
- Klikací demonstrace stavů: navigace, dokončení jídla, výběr dne a retailera, úprava dne, přepočet plánu a košíku.
- Research trhu, produktová teze, MVP scope, entity, bezpečnostní invarianty a roadmapa.
- Privátní Sites konfigurace v `.openai/hosting.json`.
- Projektový hero asset v `dist/assets/meal-prep-hero.png`.

### Pouze demo

- Veškerá data, data jídel, množství, ceny, makra, expirace, progress a jméno uživatele jsou natvrdo v HTML.
- `dist/app.js` manipuluje jen DOMem a zobrazuje toast zprávy. Nevolá žádné API a nic neukládá.
- „Synchronizace“, sken lednice, přestavění plánu, meal-prep průvodce a naplnění košíku jsou simulace.
- Stav se po reloadu ztratí.
- Rohlík ani Košík nejsou připojené. Text „propojeno“ v prototypu je pouze ukázka cílového stavu.
- Nutriční hodnoty a doporučení nejsou vypočtené ani odborně validované pro konkrétního uživatele.

## Doporučený technický směr

Začít jako **modulární monolit**, ne jako sada mikroslužeb. Domény oddělit rozhraními, ale provozovat je v jednom backendu, dokud neexistuje měřitelný důvod ke štěpení.

Pragmatická výchozí varianta:

- TypeScript backend s REST/JSON API a generovanou OpenAPI specifikací.
- PostgreSQL jako autoritativní databáze; transakce jsou důležité pro rezervace zásob a výpočet nákupních potřeb.
- Objektové úložiště pro fotografie lednice a účtenek.
- Background jobs/outbox pro zpracování snímků, přepočet plánu, notifikace a retailer synchronizaci.
- OAuth tokeny retailerů držet pouze server-side, šifrovaně; nikdy v browseru ani v repozitáři.
- Aktuální statický prototyp nejdřív ponechat jako UI referenci. Napojovat ho po jednotlivých vertikálních řezech, ne přepisem všeho naráz.

Stack není produktovým rozhodnutím. Pokud hostující prostředí vyžaduje Worker/D1 nebo jinou databázi, zachovat níže uvedené doménové hranice a invarianty.

## Doporučené pořadí implementace

1. **Kontrakt a lokální základ** — API skeleton, databáze, migrace, seed, health endpoint, OpenAPI.
2. **Profil a cíle** — profil, preference, alergie a bezpečné nutriční rozmezí s verzovaným zdrojem výpočtu.
3. **Recepty a ingredience** — kanonické suroviny, jednotky, konverze, porce, nutriční data a alergeny.
4. **Inventář** — ruční CRUD lotů, expirace, lokace a confidence. Foto/OCR až po ověření ručního toku.
5. **Plán týdne** — deterministický generátor nad omezenou seed databází; teprve poté AI návrhy a swapy.
6. **Spotřeba a rezervace** — `planned/eaten/skipped/swapped`, idempotentní odečet a rezervace zásob.
7. **Shopping diff** — požadované množství minus použitelné a rezervované zásoby, s auditovatelným výsledkem.
8. **Retailer sandbox adapter** — nejdřív fake adapter se stejným rozhraním, potom OAuth a reálné MCP integrace.
9. **Vision/import** — fotografie lednice, účtenky a import uskutečněné objednávky až po stabilizaci inventáře.
10. **Pokrok a adaptace** — trendové metriky, až budou existovat kvalitní dlouhodobá data.

## Doménové a API hranice

### Profile & Safety

Vlastní: `UserProfile`, `NutritionTarget`, preference, alergie, souhlasy a bezpečnostní flagy.

Minimální API:

- `GET /v1/profile`
- `PUT /v1/profile`
- `POST /v1/nutrition-targets/preview`
- `POST /v1/nutrition-targets/confirm`

Nutriční cíl musí obsahovat `calculation_version`, `source`, `valid_from` a rozsahy, ne jen jedno číslo.

### Catalog & Recipes

Vlastní: `Ingredient`, jednotky/konverze, alergeny, `Recipe`, porce a nutriční agregace.

- `GET /v1/ingredients?query=`
- `GET /v1/recipes`
- `GET /v1/recipes/{id}`
- `POST /v1/recipes/{id}/scale`

Kanonický ingredient ID musí být oddělený od Rohlík/Košík product ID.

### Inventory

Vlastní: `InventoryLot`, lokace, množství, expirace, confidence, rezervace a audit pohybu.

- `GET /v1/inventory`
- `POST /v1/inventory/lots`
- `PATCH /v1/inventory/lots/{id}`
- `POST /v1/inventory/lots/{id}/consume`
- `POST /v1/inventory/scans` — pozdější async workflow

Každý pohyb má idempotency key. Zásobu odečítat přes ledger/pohyb, ne přepisem množství bez historie.

### Planning

Vlastní: `MealPlan`, `PlannedMeal`, varianty, constraints, schválení a swapy.

- `POST /v1/meal-plans/generate`
- `GET /v1/meal-plans/{id}`
- `POST /v1/meal-plans/{id}/confirm`
- `POST /v1/planned-meals/{id}/swap`
- `POST /v1/planned-meals/{id}/status`

Generátor má vracet i vysvětlení: které constrainty splnil, co využil ze zásob a které položky zůstaly nepokryté.

### Prep

Vlastní: `PrepBatch`, kroky, závislosti, vybavení, časová osa a výsledné porce.

- `POST /v1/prep-batches/from-plan/{mealPlanId}`
- `GET /v1/prep-batches/{id}`
- `POST /v1/prep-batches/{id}/steps/{stepId}/complete`

### Shopping

Vlastní: `ShoppingNeed`, agregace, odečet zásob, tolerance jednotek a stav rozhodnutí uživatele.

- `POST /v1/shopping-lists/from-plan/{mealPlanId}`
- `GET /v1/shopping-lists/{id}`
- `PATCH /v1/shopping-lists/{id}/items/{itemId}`

Výsledek diffu má u každé položky uvést `required`, `available`, `reserved`, `missing` a použitou konverzi jednotek.

### Retailer Gateway

Vlastní: propojení účtu, `RetailerMapping`, produktové kandidáty, `CartHandoff` a audit externích volání.

- `GET /v1/retailers/connections`
- `POST /v1/retailers/{retailer}/oauth/start`
- `GET /v1/retailers/{retailer}/oauth/callback`
- `POST /v1/cart-handoffs/preview`
- `POST /v1/cart-handoffs/{id}/apply`
- `GET /v1/cart-handoffs/{id}`

Interní adapter contract:

```ts
interface RetailerAdapter {
  searchProducts(query: NormalizedNeed): Promise<ProductCandidate[]>;
  getAvailability(productIds: string[]): Promise<Availability[]>;
  previewCart(items: CartItemInput[]): Promise<CartPreview>;
  applyCart(previewId: string, idempotencyKey: string): Promise<CartResult>;
}
```

Objednání/platba není součástí výchozího kontraktu. Pokud někdy přibude, musí být oddělené od `applyCart` a vyžadovat novou explicitní autorizaci uživatele.

## Klíčové stavové přechody

- `MealPlan`: `draft → generated → confirmed → active → completed|cancelled`
- `PlannedMeal`: `planned → eaten|skipped|swapped`
- `InventoryScan`: `uploaded → processing → needs_review|accepted|failed`
- `ShoppingList`: `draft → reviewed → handed_off`
- `CartHandoff`: `previewed → approved → applying → applied|partial|failed|expired`

Přechody vynucovat na serveru. U externích akcí používat idempotency key a ukládat sanitizovaný audit requestu/odpovědi.

## Rizika integrace Rohlík / Košík

1. **Partner permission a podmínky použití** — technicky dostupné MCP neznamená automaticky oprávnění použít ho v produktu. Rohlík uvádí omezení na běžné zákaznické použití; před produkcí je nutné písemné potvrzení. Košík zve vývojáře ke kontaktu přes `ai@kosik.cz`.
2. **OAuth lifecycle** — expirace/revokace tokenu, více účtů, chybné callbacky a bezpečné šifrované uložení.
3. **Nestabilní sortiment** — produkt, cena, gramáž a dostupnost se mohou změnit mezi plánem a handoffem.
4. **Substituce a alergeny** — automatická náhrada nesmí porušit alergii, zákaz ani nutriční constraint. Nejasnost musí skončit `needs_review`.
5. **Jednotky a balení** — recept chce gramy, retailer prodává kus/balení/proměnnou hmotnost. Nutné verzované konverze a vysvětlení zaokrouhlení.
6. **Částečné selhání** — některé položky mohou být přidány a jiné ne. Adapter musí vrátit položkový výsledek a bezpečně zvládnout retry bez duplikace.
7. **Session/cart ownership** — aplikace nesmí předpokládat prázdný košík; je třeba rozlišit položky Nourish a existující položky uživatele.
8. **Rate limits a změny nástrojů** — MCP capability discovery, timeouty, retry s backoffem a contract testy proti sandboxu.
9. **Finální kontrola** — UI musí zobrazit aktuální cenu, náhrady, chybějící položky a cílový obchod před aplikací košíku.
10. **Soukromí** — retailer nesmí dostat zdravotní profil ani diagnózu; pouze minimální nákupní potřeby potřebné pro vyhledání produktů.

## První konkrétní sprint

Cíl sprintu: **funkční vertikální řez „profil + ruční zásoby + dnešní plán“ bez AI a bez retaileru**.

### Výstupy

1. Inicializovaný backend, lokální spuštění, `.env.example`, migrační nástroj a CI pro testy.
2. Databázové tabulky pro uživatele, profil, ingredience, recepty, inventory lots, meal plan a planned meals.
3. Seed s přibližně 20 kanonickými surovinami a 6–8 recepty z prototypu.
4. API pro `GET/PUT profile`, inventory CRUD, `GET recipes`, vytvoření a načtení jednoduchého plánu.
5. Deterministický plánovač, který respektuje alergeny, počet jídel, kalorické rozmezí a minimální protein.
6. Shopping diff jako čistá doménová funkce s jednotkovými testy; zatím bez externího obchodu.
7. Frontendová obrazovka Dnes napojená na API místo hardcoded dat alespoň pro jméno, cíl, jídla a progress.
8. Integrační test: seed → přidání zásob → vytvoření plánu → označení jídla jako snědené → idempotentní pohyb zásoby.

### Definition of done

- Čerstvý checkout lze spustit podle README bez skrytých kroků.
- Migrace a seed jsou opakovatelné.
- API má OpenAPI dokumentaci a konzistentní chybový formát.
- Alergenní ingredient se nikdy nedostane do plánu v testech.
- Opakovaný consumption request neodečte zásobu dvakrát.
- UI po reloadu načte stejný stav z backendu.
- Žádný secret, OAuth token ani osobní údaj není v logu nebo repozitáři.

## Co ve složce je

- `.openai/hosting.json` — identita a statický output privátního Site.
- `dist/index.html` — kompletní statické obrazovky a hardcoded demo obsah.
- `dist/styles.css` — responzivní vizuální systém.
- `dist/app.js` — čistě klientské demo interakce.
- `dist/assets/meal-prep-hero.png` — obrazový asset použitý prototypem.
- `docs/RESEARCH_AND_PLAN.md` — produktový research, MVP, entity, bezpečnost a roadmapa.
- `README.md` — stručný vstup do projektu.
- `AGENT_HANDOFF.md` — tento technický handoff.

## Co chybí před implementací

- Volba runtime/frameworku, databáze a autentizačního řešení.
- Backend source tree, package manifest, lockfile, migrace, testy a CI.
- Rozhodnutí o autoritativním zdroji nutričních dat a licenci receptů/fotografií.
- Přesné osobní parametry a cílové nutriční rozsahy uživatele.
- OAuth registrace, sandbox/partner přístup a písemné podmínky pro Rohlík a Košík.
- Datová a privacy pravidla: retention fotografií/účtenek, export, výmaz a souhlasy.
- Threat model pro osobní a potenciálně zdravotní data.
- Telemetrický plán, definice analytických událostí a měření north-star metriky.
- Eval dataset pro plánování, jednotkové konverze, alergeny, substituce a partial-failure scénáře.
- Copy/UX pro prázdné, loading, offline, chybové a `needs_review` stavy.
- Odborná nutriční validace a samostatná pravidla, pokud bude někdy přidán dětský profil.

Tyto chybějící body neblokují první lokální sprint, kromě volby stacku a zdroje seed nutričních dat. Reálné retailer napojení je blokované partner/OAuth přístupem a nemá se obcházet automatizací webového rozhraní.
