# Deploying your own Nourish

Nourish is single-tenant: one deployment = one owner. Everything runs on free tiers
(Vercel Hobby, Neon free, Cloudflare Workers AI free) except optional Claude via AI Gateway.

## 1. Vercel + Neon

```bash
npm i -g vercel
vercel link                                   # create a new project
vercel integration add neon                   # or Vercel Dashboard → Storage → Neon (region fra1)
vercel env pull .env.local                    # pulls DATABASE_URL etc.
DATABASE_URL=$DATABASE_URL_UNPOOLED npx drizzle-kit migrate
npm run db:seed                               # 88 ingredients, 31 Czech recipes, default reminders
```

`vercel.json` pins `"framework": "nextjs"` (without it every route 404s on a fresh project) and
region `fra1`.

## 2. Secrets (Vercel → Settings → Environment Variables, Production)

| Variable | How to create |
|---|---|
| `APP_ORIGIN` | Your public URL, e.g. `https://my-nourish.vercel.app`. Passkeys are bound to this host. Use a URL that is **not** behind Vercel Authentication (team aliases often are). |
| `SESSION_SECRET`, `TOKEN_ENC_KEY`, `CRON_SECRET` | `openssl rand -base64 48` each |
| `OWNER_PASSWORD_HASH` | `npm run hash-password -- "a long passphrase"` |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | `npx web-push generate-vapid-keys` |
| `VAPID_SUBJECT` | same as `APP_ORIGIN` |
| `VISION_WORKER_URL`, `VISION_SECRET` | from step 3 |

Keep a copy in a gitignored `.secrets/` folder. Then `vercel deploy --prod`.

## 3. Free AI: Cloudflare Workers AI worker

```bash
cd workers/vision
npm install
echo "VISION_SECRET=$(openssl rand -hex 32)" > ../../.secrets/vision.env
npx cf auth login                             # or CLOUDFLARE_API_TOKEN with Workers edit
npx cf deploy --secrets-file ../../.secrets/vision.env
```

Copy the printed `https://nourish-vision.<you>.workers.dev` into `VISION_WORKER_URL` and the
secret into `VISION_SECRET`. Models: `@cf/meta/llama-4-scout-17b-16e-instruct` for photos
(~60 s per fridge photo), `@cf/meta/llama-3.3-70b-instruct-fp8-fast` for recipe text (~15 s).
Override with `CF_VISION_MODEL` / `CF_TEXT_MODEL`.

Better accuracy: set `AI_PROVIDER=gateway` to use Claude through Vercel AI Gateway (needs a card
on the Vercel team; free credits apply).

Smoke tests (local, `.env.development.local` with the two vars):

```bash
npx tsx --conditions=react-server scripts/vision-smoke.mts fridge.jpg
npx tsx --conditions=react-server scripts/recipe-smoke.mts "recipe text…"
```

## 4. Rohlík cart (optional, Czech customers)

Settings → **Připojit Rohlík účet**. Rohlík's OAuth only accepts loopback redirect URIs for
dynamically registered clients, so after you log in the browser lands on a page that does not
load: `http://127.0.0.1:53682/nourish/rohlik/callback?code=…`. Copy that whole address
into the box in Nourish within a few minutes. The PKCE exchange happens on the server.

Cart filling is deterministic, with no AI:
- `batch_search_products` runs 4 queries per call;
- products are scored by name, pack size, form ("frozen", not jam) and favourites;
- you review the matches;
- `add_items_to_cart` adds the approved ones.

Every call carries a short analytics `context` sentence that contains no personal data.

## 5. Meal reminders

Vercel Hobby cron runs twice a day (07:00 and 17:00 UTC per `vercel.json`). For reminders
10 minutes before each meal, call the tick from an external scheduler every 5–15 minutes:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://<your-app>/api/cron/tick
```

(cron-job.org, a GitHub Actions schedule, or a Cloudflare cron trigger all work.)

## 6. iPhone

Open the URL in Safari → Share → **Add to Home Screen**. Then go to Settings:
1. add **Face ID** (passkey);
2. enable notifications;
3. create Shortcut tokens for Apple Health weight / "I ate it" / share-a-recipe.

## Security model

- `src/proxy.ts` lets only these through without a session: login, auth endpoints, the PWA manifest, the service worker and the offline page, plus token-authenticated endpoints (`/api/shortcuts/*` with a personal token and `/api/cron/*` with `CRON_SECRET`).
- Every server action and route re-checks the session (`requireOwner` / `isOwner`).
- Sessions:
  - a JWT (HS256) in an httpOnly `__Host-` cookie, valid for 30 days;
  - a generation counter in the database makes "sign out everywhere" revoke all sessions and tokens.
- Login rate limits:
  - 5 failures per IP or 25 globally within 15 minutes lock password login;
  - passkeys are exempt from the global lock, so a password flood can't lock the owner out.
- Retailer OAuth tokens are sealed with AES-256-GCM (`TOKEN_ENC_KEY`), and Shortcut tokens are stored as SHA-256.
- Retailer MCP uses an allow-list: only search, product detail, cart read and cart add.
- The vision worker rejects any request without the shared secret (constant-time compare), and its models are allow-listed.
- Headers: CSP (`connect-src 'self'`), HSTS preload, `X-Frame-Options: DENY`, `noindex`.
- Recipe import uses an SSRF guard: public HTTP(S) only, private IPs blocked, size and time limits.
