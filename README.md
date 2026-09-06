# Flësh — PWA + Supabase sync

A study app (flashcards, math, chemistry, graphs) that is a **progressive web app** (works offline / installable)
and can **sync to your own Supabase** so your decks follow you across devices.

> Your **other app's data is untouched** — Flësh stores everything in **one new table** (`flesh_state`),
> each user owns a single row, and RLS keeps it private per account.

---

## 1) One-time Supabase setup (required for cloud sync)

Open your Supabase dashboard → **SQL Editor** → New query → paste the contents of **`sql_setup.sql`** → Run.

It does **only** the following (never touches your other tables):

- creates table `public.flesh_state` (one row per user, `payload` = whole app state as JSON),
- adds 4 RLS policies scoped to that table (`owner = auth.uid()`),
- a tiny `updated_at` trigger.

Verify: **Table Editor → `flesh_state`** exists, and **Authentication → Policies** shows RLS = ON with 4 policies.

### Email sign-in settings
Sign-in uses **email + password** via Supabase Auth (the secure, built-in method — a username-only login can't be
isolated per user with the public key).
In **Authentication → Providers → Email**, either turn **off "Confirm email"** (fastest for a personal app)
or keep it on and your confirmation emails will be sent.
"Unique name" is collected at sign-up and stored as the user's name/metadata.

---

## 2) Configure your project (already done)
In `index.html` near the top of the `<script>`:

```js
const SUPABASE_URL  = 'https://bnlstzibpceptcjifixy.supabase.co';
const SUPABASE_ANON = 'sb_publishable_kFc5yTFXgTH8w-SWsd2BOg_t5PTF455';
const CLOUD_TABLE   = 'flesh_state';
```

These are already filled in for your project. Only ever put the **anon/publishable** key here — never `service_role`.

---

## 3) Deploy (so the PWA works)

Service workers + install require **HTTPS from a real host** (not `file://`).
Upload the whole `/home/user/flesh/` folder (keep the `lib/`, `icons/`, `sw.js`, `manifest.webmanifest` alongside
`index.html`) to any static host:

- **Netlify:** drag the folder into the deploy drop-zone.
- **Vercel:** `vercel` with the folder as the project root.
- **GitHub Pages:** push the folder to a repo's `gh-pages`/Pages source.

Local test: `python3 -m http.server` in the folder (fine for testing; install prompt needs HTTPS).

---

## How it behaves

- **Signed out / offline:** works exactly as before — all data in this browser's localStorage.
- **Sign in** (bottom-right pill → Sign in): the **cloud copy is treated as the source of truth** and is downloaded
  to this device. Every change is then auto-synced (debounced) whenever you're online; if offline, changes are saved
  locally and pushed automatically on reconnect.
- The **pill dot**: green = synced, amber = syncing/pending, gray = offline/not signed in.

## Files
- `index.html` — the app
- `sql_setup.sql` — **run this once in Supabase**
- `sw.js`, `manifest.webmanifest`, `icons/` — PWA
- `lib/` — self-hosted KaTeX, Chart.js and fonts (so it works fully offline)
- `README.md` — this file
