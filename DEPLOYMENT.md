# KitanSocialHub — Deployment & Migration Handover

Old backend (READ-ONLY fallback, never modified):
`https://swrqtcayrnndpzkmswrq.backend.onspace.ai`

New backend (owner-controlled Supabase project): configured in `migration/.env/migration-notes.txt..txt` (gitignored).

## Current state
- ✅ Performance work complete (Storage uploads, OptimizedImage, timeouts, retry states, Media Migr admin tool) — see `docs/PERFORMANCE_NOTES.md`.
- ✅ All 34 source tables audited; schema SQL generated from the live old backend.
- ✅ Six public Storage buckets created in the new project: `order-content`, `products`, `documents`, `working-pictures`, `formats`, `website-products`.
- ✅ `order-content` objects copied with exact paths (44/44 existing objects byte-verified; `logo.png` never existed on the old backend).
- ⏳ Data migration + frontend switch run after the schema SQL is applied (Step 1 below).

## Manual steps (in order)

### 1. Apply the schema (REQUIRED — only you can do this)
DDL cannot be run with project API keys; it needs the SQL Editor once.
1. Open https://supabase.com/dashboard and select the new project (`bjbnmanpkmgsrvuoxlgl`).
2. Left sidebar → **SQL Editor** → **New query**.
3. Open `migration/sql/00-ALL-IN-ONE.sql` in a text editor, select all, copy.
4. Paste into the editor and click **Run**. Expect "Success. No rows returned".
   (Idempotent — safe to run again.)

### 2. Finish migration (Z.ai runs this after you confirm Step 1)
`node migration/05-migrate-data.mjs` → `node migration/06-verify.mjs` → `node migration/07-switch-frontend.mjs` → rebuild.

### 3. Deploy Edge Functions (REQUIRED before any payment use)
CLI is installed. In a terminal at the project root:
```
supabase login
supabase link --project-ref bjbnmanpkmgsrvuoxlgl
supabase functions deploy flw-initiate
supabase functions deploy flw-verify
supabase functions deploy flw-webhook
supabase functions deploy kitan-doc-credit
supabase functions deploy order-download
supabase functions deploy hero-sms
supabase functions deploy fivesim
supabase functions deploy jap
```
Then set secrets (dashboard → Edge Functions → Secrets, or `supabase secrets set KEY=...`):
`FLW_SECRET_KEY`, `FLW_WEBHOOK_SECRET`, `SMS_POOL_API_KEY`, `FIVESIM_API_KEY`, `JAP_API_KEY`, `KITANLAB_API_KEY` (+ optional `KITANLAB_CREDITS_URL`).
`SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` are injected automatically.
Secret values: copy from the OnSpace secrets panel if visible, else re-issue from each provider dashboard (Flutterwave, SMSPool, 5SIM, JustAnotherPanel, KitanLab).
**Do NOT test with real payments.**

### 4. Flutterwave webhook (ONLY after cutover, last step)
Flutterwave dashboard → Settings → Webhooks → set URL to
`https://bjbnmanpkmgsrvuoxlgl.supabase.co/functions/v1/flw-webhook` and keep/restore your Secret Hash.

### 5. GitHub + Netlify
1. Create a NEW empty GitHub repo (do not initialize with README).
2. In the project folder:
   ```
   git init
   git add .
   git commit -m "KitanSocialHub — performance + new Supabase backend"
   git remote add origin https://github.com/<you>/<repo>.git
   git branch -M main
   git push -u origin main
   ```
   (`.env`, `migration/.env`, `migration/state` are gitignored — verify with `git status` before pushing.)
3. Netlify → Add new site → Import from GitHub → pick the repo.
   Build command `npm run build`, publish `dist` (from `netlify.toml`).
   Environment variables (Site settings → Environment variables):
   - `VITE_SUPABASE_URL` = new project URL
   - `VITE_SUPABASE_ANON_KEY` = new project publishable key
   (Both public-by-design; NEVER put `sb_secret_`/service-role keys in Netlify or any `VITE_` variable.)

## Known limitations
- Gift orders + tracking updates live in each browser's localStorage (`kitan-orders`) — device-local by design; nothing to migrate server-side.
- `logo.png` (Flutterwave checkout logo) does not exist on the old backend; upload one to the new `order-content` bucket root if you want the checkout logo (optional).
- RLS is intentionally permissive (anon full access) to preserve current app behavior; hardening is a separate future project.
- Edge Function admin actions are unauthenticated in the current code (unchanged behavior).
