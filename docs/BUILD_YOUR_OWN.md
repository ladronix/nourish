# Postav si vlastní Nourish / Build your own Nourish

Nourish je aplikace pro jednoho člověka. Nesdílíš účet s nikým: vezmeš si kód, upravíš ho podle sebe a nasadíš na vlastní Vercel, Neon a Cloudflare, všechno na free tarifech. Nejrychleji to jde s [Claude Code](https://claude.com/claude-code). Do prázdné složky vlož prompt níže a agent tě celou cestou provede.

**Co budeš potřebovat (účty zdarma):** GitHub, Vercel, Cloudflare, a pokud nakupuješ na Rohlíku, i účet na Rohlík.cz. Počítej s 30–60 minutami, většinou jen odpovídáš na otázky.

---

## Prompt (česky)

```text
Chci vlastní osobní nutriční aplikaci podle open-source projektu Nourish:
https://github.com/ladronix/nourish

Je to Next.js 16 PWA pro jednoho majitele. Obsahuje:
- týdenní plánovač s meal prepem;
- lednici s expiracemi;
- nákupní seznam „plán minus zásoby“ s plněním košíku na Rohlíku;
- pokrok s trendem váhy.
AI pro fotky lednice běží zdarma na Cloudflare Workers AI.
Přečti si README.md, docs/DEPLOY.md, AGENTS.md a docs/RESEARCH_AND_PLAN.md, než cokoliv změníš.

Postup:
1. Naklonuj repo do této složky a založ si vlastní git repozitář (soukromý, na mém GitHubu).
2. Udělej se mnou krátký rozhovor. Ptej se po jedné otázce a nabízej rozumné výchozí volby:
   - jak se mám v aplikaci jmenovat, jaký mám cíl (zhubnout / udržet / nabrat) a jakým tempem;
   - výška, váha, rok narození, pohlaví, aktivita;
   - zdravotní omezení. Pokud jsem těhotná, kojím, mám poruchu příjmu potravy, cukrovku na lécích nebo jinou nemoc, aplikace musí zůstat v režimu „konzultuj odborníka“ bez deficitu;
   - alergie, co nejím, styl stravy (vše / vegetarián / vegan…);
   - kolik jídel denně a v kolik, kolik času mám na vaření ve všední den, jestli chci nedělní meal prep;
   - týdenní rozpočet, kde nakupuju (Rohlík / Košík / jinde);
   - jazyk aplikace. Výchozí je čeština; pokud chci jiný, přelož UI texty.
3. Přizpůsob aplikaci:
   - uprav src/db/seed-data.ts: recepty, které odpovídají mému stylu stravy a alergiím, suroviny a časy připomínek;
   - název a branding aplikace (manifest, ikona v src/app/icons, README).
   Doménovou logiku a bezpečnostní model neměň, jen ji rozšiř, pokud je potřeba. Po změnách spusť npm test, typecheck a lint.
4. Nasaď mi to podle docs/DEPLOY.md:
   - Vercel projekt a Neon Postgres (region nejblíž mně) přes Vercel Marketplace;
   - migrace a seed;
   - vygeneruj všechny secrets (SESSION_SECRET, TOKEN_ENC_KEY, CRON_SECRET, VAPID klíče);
   - hash mého hesla: heslo mi vygeneruj dlouhé a ulož ho jen do .secrets/, nikam jinam;
   - Cloudflare worker workers/vision s VISION_SECRET a nastav VISION_WORKER_URL + VISION_SECRET ve Vercelu;
   - APP_ORIGIN nastav na veřejnou URL, která není za Vercel Authentication.
   Před každou akcí, která něco zakládá nebo platí na mých účtech, se mě zeptej.
5. Ověř produkci v prohlížeči:
   - přihlášení;
   - sestavení týdne a „Alternativy týdne“;
   - snědení jídla odečte zásoby;
   - nákupní seznam;
   - sken lednice z galerie;
   - API bez přihlášení vrací 401.
6. Na konci mi napiš:
   - URL a kde najdu heslo;
   - jak si aplikaci přidám na plochu iPhonu (Safari → Sdílet → Přidat na plochu) a zapnu Face ID a notifikace;
   - jak připojím Rohlík (adresu 127.0.0.1 po přihlášení vložím zpět do aplikace);
   - co dalšího můžu volitelně nastavit: externí cron pro připomínky k jídlům, Claude přes AI Gateway pro přesnější rozpoznávání.

Nic necommituj s tajnými údaji (.secrets, .env*). Piš mi česky.
```

---

## Prompt (English)

```text
I want my own personal nutrition app based on the open-source project Nourish:
https://github.com/ladronix/nourish

It is a single-owner Next.js 16 PWA:
- a week planner with meal prep;
- a fridge with expiry dates;
- a "plan minus stock" shopping list with Rohlík cart filling;
- progress with a weight trend.
Fridge-photo AI runs free on Cloudflare Workers AI.
Read README.md, docs/DEPLOY.md, AGENTS.md and docs/RESEARCH_AND_PLAN.md before changing anything.

Steps:
1. Clone the repo here and set up my own private git repository on my GitHub.
2. Interview me briefly, one question at a time, with sensible defaults:
   - my name in the app, my goal (lose / maintain / gain) and pace;
   - height, weight, birth year, sex, activity;
   - health constraints. If I'm pregnant, breastfeeding, have an eating-disorder history, take diabetes medication or have another condition, the app must stay in "consult a professional" mode with no deficit;
   - allergies, dislikes, diet style;
   - meals per day and their times, weekday cooking time, whether I want Sunday meal prep;
   - weekly budget and where I shop;
   - app language. The UI is Czech; translate it if I want another language.
3. Tailor the app:
   - edit src/db/seed-data.ts: recipes matching my diet and allergies, ingredients typical for my country and shops, reminder times;
   - the app name and branding (manifest, icon in src/app/icons, README).
   Keep the domain logic and the security model; extend them only if needed. Run npm test, typecheck and lint after changes.
4. Deploy following docs/DEPLOY.md:
   - a Vercel project and Neon Postgres (nearest region) via Vercel Marketplace;
   - migrations and seed;
   - generate all secrets (SESSION_SECRET, TOKEN_ENC_KEY, CRON_SECRET, VAPID keys);
   - my password hash: generate a long password for me and store it only in .secrets/;
   - the Cloudflare worker workers/vision with VISION_SECRET, then set VISION_WORKER_URL and VISION_SECRET on Vercel;
   - APP_ORIGIN set to a public URL that is not behind Vercel Authentication.
   Ask me before any action that creates or bills something on my accounts.
5. Verify production in a browser:
   - login;
   - building the week and "Alternatives";
   - eating a meal consumes stock;
   - the shopping list;
   - a fridge scan from the gallery;
   - unauthenticated APIs return 401.
6. Finish with:
   - the URL and where my password is;
   - how to add the app to the iPhone home screen and turn on Face ID and notifications;
   - how to connect Rohlík (paste the 127.0.0.1 address back into the app);
   - optional extras: an external cron for meal reminders, Claude via AI Gateway for better photo recognition.

Never commit secrets (.secrets, .env*).
```

---

## Co dostaneš / What you get

- **iPhone PWA:** na ploše, offline, s Face ID a připomínkami.
- **Desktop:** týdenní plánovač s alternativami týdne.
- **Tvoje data:** jen ve tvé databázi, aplikace je jen pro tebe. Obchod nikdy nedostane zdravotní údaje.
- **Free AI:** rozpoznání lednice, účtenek, fotek jídla a import receptů běží zdarma na Cloudflare. Na Claude se přepne jedním nastavením.

Upravuješ si to dál sám, nejlépe opět s Claude Code: „přidej recepty z…“, „chci mít jen 3 jídla denně“, „přidej Košík“.
