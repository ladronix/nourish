# Nourish OS — research, produktový plán a backend handoff

Aktualizováno: 23. 11. 2026

## 1. Produktová teze

Nourish není kalorická tabulka ani zdravotnický prostředek. Je to osobní „nutrition operating system“, který zmenšuje rozhodovací únavu:

1. ví, co je doma a co je potřeba sníst první,
2. sestaví realistický týdenní jídelní plán podle cíle, preferencí a času,
3. přepočítá plán na meal-prep a jednotlivé porce,
4. odečte zásoby a připraví jen chybějící položky,
5. předá kontrolovatelný košík do Rohlíku nebo Košíku.

North-star metrika není počet zapsaných kalorií, ale **počet dní, kdy uživatel snědl plán bez nutnosti improvizovat**.

## 2. Co už existuje

### Přímé inspirační produkty

- **Samsung Food**: týdenní plán, personalizované recepty, nákupní seznam a předání retailerovi. U Samsung lednic se propojuje i s obsahem lednice. Silný precedent pro tok plán → seznam → doručení.
- **KitchenPal**: inventář lednice/spíže/mrazáku, odhad expirace, recepty podle zásob a nákupní seznam očištěný o to, co už je doma. Silný precedent pro „pantry-first“ logiku.
- **YAZIO**: deník, makra, recepty, cíle a nákupní seznam. Silný precedent pro tracking, ale uživatelsky stále vyžaduje značnou administrativu.

Mezera pro Nourish: spojit nutriční cíl, zásoby, batch cooking a lokální český e-grocery checkout do jednoho klidného pracovního toku.

### Česká e-grocery integrace

- **Rohlík MCP** (`https://mcp.rohlik.cz/mcp`) podporuje OAuth, hledání produktů, správu košíku, recepty, objednávky a seznamy. Dokumentace výslovně říká, že změny košíku má zákazník před dokončením ověřit a jiné než běžné zákaznické použití vyžaduje souhlas Rohlíku.
- **Košík MCP** (`https://mcp.kosik.cz/mcp/`) podporuje bezpečné přihlášení, hledání produktů, manipulaci s košíkem a dokončení objednávky. Košík zároveň zve vývojáře aplikací ke kontaktu přes `ai@kosik.cz`.

Závěr: MVP může realisticky vytvořit nákupní seznam a s uživatelským OAuth naplnit košík. Automatické odeslání/platba bez vědomé kontroly není vhodný výchozí režim.

## 3. Doporučené MVP

### P0 — nezbytné

- profil: cíl, výška, hmotnost, aktivita, preference, alergie, počet jídel, rozpočet,
- nutriční rozsah místo falešně přesného čísla,
- generátor 7denního plánu s možností swapu,
- recepty s porcemi, makry, časem a meal-prep instrukcí,
- inventář s rychlým ručním přidáním, fotkou a importem účtenky/objednávky,
- expirace a „spotřebuj první“,
- agregace surovin a odečet zásob,
- handoff nákupního seznamu do Rohlíku/Košíku,
- explicitní review košíku před checkoutem.

### P1 — po ověření retence

- domácnost a položky pro děti/partnera oddělené od osobního nutričního plánu,
- import aktivity z Apple Health / Google Health Connect / Garmin,
- adaptace cíle podle 14–28denního trendu, nikoli podle jednoho vážení,
- chytré náhrady podle ceny, dostupnosti a alergií,
- voice input („došla vejce“, „zítra jím venku“),
- automatické načtení nákupu zpět do zásob.

### Ne do prvního MVP

- plně autonomní placení,
- diagnostika zdravotního stavu,
- průběžné počítání každého sousta,
- sledování dětí bez samostatných bezpečnostních a věkových pravidel,
- vlastní rozsáhlá databáze potravin, pokud lze začít s ověřeným zdrojem.

## 4. Hlavní uživatelský tok

`profil a cíl → zásoby doma → návrh týdne → swap/odsouhlasení → meal-prep → spotřeba porcí → odečet zásob → doplnění → kontrola košíku → nákup`

Každá ruční akce musí mít rychlou alternativu. Uživatel nemá být správcem skladu.

## 5. Datový model pro backend

### Entity

- `UserProfile`: základní parametry, cíl, aktivita, omezení, preference, časové možnosti.
- `NutritionTarget`: kalorické rozmezí, protein, vláknina, zelenina/ovoce, hydratace, zdroj a datum výpočtu.
- `Household`: členové, role, společné položky, osobní položky.
- `Ingredient`: kanonický název, jednotky, nutriční data, alergeny, kategorie.
- `InventoryLot`: ingredient, množství, jednotka, umístění, datum pořízení, expirace, confidence, zdroj.
- `Recipe`: ingredience, porce, postup, aktivní/celkový čas, makra, tagy, batchability.
- `MealPlan`: týden, dny, jídla, varianty, stav schválení.
- `PrepBatch`: propojené recepty, kroky, vybavení, časová osa, výsledné porce.
- `ConsumptionEvent`: plánovaná/skutečná porce, jednoduchý stav `planned / eaten / skipped / swapped`.
- `ShoppingNeed`: požadované množství minus dostupné/rezervované zásoby.
- `RetailerMapping`: ingredient → retailer product, velikost balení, cena, dostupnost, substituce.
- `CartHandoff`: retailer, OAuth account, položky, cena při vytvoření, stav review.

### Klíčové invarianty

- alergeny a explicitní zákazy nikdy nesmí být automaticky nahrazeny,
- inventář pracuje s confidence; nejistý sken se musí potvrdit,
- surovina rezervovaná v plánu se nesmí odečíst dvakrát,
- ceny a dostupnost se ověřují těsně před handoffem,
- `place_order` musí být oddělená, explicitně potvrzená akce,
- každý automatický zásah má audit log a možnost vrácení.

## 6. Navržené backendové služby

1. **Identity & profile** — přihlášení, osobní data, souhlasy.
2. **Nutrition engine** — cílová rozmezí, validace plánu, agregace živin.
3. **Planning engine** — constraint solver pro preference, čas, cenu, zásoby a opakování.
4. **Inventory service** — loty, expirace, OCR/vision, účtenky, spotřeba.
5. **Recipe service** — normalizace surovin, porcování, meal-prep graf kroků.
6. **Shopping engine** — diff zásob, optimalizace balení, retailer mapping.
7. **Retailer adapters** — samostatné adaptéry Rohlík/Košík přes OAuth + MCP.
8. **Notification service** — prep reminder, expirace, schválení košíku; ne permanentní „streak shame“.
9. **Audit & safety** — zdroj doporučení, změny plánu, explicitní potvrzení citlivých akcí.

## 7. Bezpečnost a nutriční hranice

- Základ UI má podporovat pestrost, přiměřenost, rovnováhu a umírněnost, ne seznam „dokonalých“ potravin.
- Výchozí plán má hlídat alespoň protein, vlákninu, ovoce/zeleninu a pestrou skladbu; makra nejsou jediným skóre kvality.
- Agresivní deficit, velmi nízký energetický příjem, rychlý pokles, těhotenství, kojení, věk pod 18 let, porucha příjmu potravy nebo relevantní diagnóza mají přepnout produkt do režimu „konzultuj odborníka“.
- Cíl se má adaptovat podle trendu a subjektivního hladu/energie; nikdy automaticky neutahovat po jednom dni nebo jednom vážení.
- Dětský profil vyžaduje samostatný návrh a odbornou validaci, ne pouhé zmenšení dospělých porcí.

## 8. Vizuální systém

- Směr: **warm performance wellness**, nikoli nemocniční healthcare.
- Tmavý navigační rám, teplé krémové plochy, korálová pro hlavní akci, zelená pro čerstvost.
- Fotografie jídla jsou konkrétní a chutné; data jsou sekundární a klidná.
- Domovská obrazovka priorizuje „co teď“ před analytikou.
- Jazyk je podporující: „na dobré cestě“, „přestavět den“, ne „selhání“ nebo „zakázané jídlo“.

## 9. Roadmapa

### Fáze A — validační prototyp (aktuální)

- klikací UI, rozhovory s 5–8 uživateli, test porozumění hlavní obrazovce,
- potvrdit, že uživatel chápe rozdíl mezi plánem, zásobami a retailer košíkem.

### Fáze B — closed alpha

- autentizace, profil, databáze receptů, ruční zásoby, generování plánu,
- sandbox retailer adapter a ruční export seznamu,
- telemetrie: time-to-first-plan, plánované vs. snědené porce, swapy, odpad.

### Fáze C — private beta

- foto/receipt ingestion, Rohlík/Košík OAuth, skutečné naplnění košíku,
- meal-prep orchestrátor, notifikace, historie a adaptace plánu.

### Fáze D — family mode

- domácnost, více porcí a preferencí, společný košík, dětská pravidla po odborné validaci.

## 10. Ověřené zdroje

- Rohlík MCP: https://www.rohlik.cz/mcp-docs
- Košík MCP: https://www.kosik.cz/stranky/mcp-server
- Samsung Food Meal Planner: https://support.samsungfood.com/hc/en-us/articles/35369657798548-Getting-Started-with-Meal-Planner
- KitchenPal FAQ: https://kitchenpal.ai/faq
- YAZIO Pro support: https://help.yazio.com/hc/en-us/articles/208847005-How-does-Yazio-Pro-support-my-goals
- WHO Healthy Diet: https://www.who.int/news-room/fact-sheets/detail/healthy-diet
- EFSA Dietary Reference Values: https://www.efsa.europa.eu/en/topics/topic/dietary-reference-values
- NHS healthy eating when trying to lose weight: https://www.nhs.uk/better-health/lose-weight/healthy-eating-when-trying-to-lose-weight/

## 11. Doplněno 23. 11. 2026 — implementace a rozšíření z průzkumu

Plán byl implementován jako Next.js 16 aplikace (viz README). Průzkum zahraničních aplikací přidal do MVP:

| Funkce | Inspirace | Stav |
|---|---|---|
| Adaptivní odhad výdeje z trendu hmotnosti a příjmu, týdenní check-in bez známkování | MacroFactor | hotovo (`lib/domain/trend.ts`) |
| Vyhlazený trend hmotnosti místo denního čísla (τ = 10 dní) | Hacker's Diet, Happy Scale | hotovo |
| „Snědeno podle plánu“ jedním klepnutím, foto → makra porovnané s plánem | MacroFactor AI, Cal AI | hotovo (AI vyžaduje AI Gateway) |
| Základy, které se nekupují, a minimální zásoby | Paprika, Grocy | hotovo |
| Upřednostnění receptů podle toho, co expiruje | Grocy „due score“ | hotovo v plánovači i v Receptech |
| Odhad expirace z tabulky trvanlivosti | USDA FoodKeeper | hotovo (`shelf_days` na surovině) |
| Zbytky a porce z meal prepu jako zásoby s expirací | Eat This Much | hotovo |
| Import receptu z URL (schema.org → AI) | Mealie, Paprika | hotovo |
| Bílkoviny rozložené na jídla (~0,4 g/kg) | Schoenfeld & Aragon 2018 | hotovo (tip na Dnes) |
| 30 rostlin týdně | ZOE / Plant Points | hotovo |
| Režim vaření (wake lock, souběžné časovače) | Paprika | hotovo |
| Nákup po uličkách, minimální objednávka Rohlíku | Plan to Eat, Mealime | hotovo |
| Apple Health a Siri přes iOS Zkratky, sdílení receptů místo share target | Foodnoms | hotovo (`/api/shortcuts/*`) |
| Statistika plýtvání v Kč | NoWaste | hotovo |
| Rohlík MCP (OAuth 2.1 + DCR) — vyhledání a vložení do košíku po kontrole | Rohlík MCP | hotovo; objednávka vždy v obchodě |

Další kroky (P2): mikroživiny a „doporuč potraviny“ (Cronometer), načtení doručené objednávky z historie Rohlíku přímo do zásob, sezónní tabulka ČR podrobněji, Košík MCP (vyžaduje confidential client — kód je připravený, `RETAILERS.kosik`), kroky z Apple Health pro rychlejší adaptaci.
