# 🚀 Deploying Anime Class Player (no Python, no "real" server to run)

Good news: the app is **100% static files** — HTML, CSS and JS. There is no backend, no database, no server code. "Deploying" just means putting the files on any static host (or your own machine) so the app is opened from an **http(s) address**.

> ❗ **Why not just double-click the HTML file?**
> YouTube refuses to play inside pages opened straight from disk. A disk-opened page has no web origin, and YouTube answers with player error 153. The app detects this and tells you — it's a YouTube restriction, not a bug. Any http(s) address fixes it.

---

## Option 1 — Netlify Drop ⭐ (easiest, ~1 minute, free, no account needed to try)

1. Put **`Anime-Class-Player.html`** in a folder and rename it to **`index.html`**
2. Go to **https://app.netlify.com/drop**
3. Drag the folder onto the page
4. You get a public `https://your-name.netlify.app` URL — open it, paste a lecture link, done

(You can also drag the whole `anime-class-player` folder with the unbundled files — `index.html` is already named right.)

## Option 2 — GitHub Pages (free, permanent, needs a GitHub account)

1. Create a repository and upload `index.html`, `style.css`, `app.js`, `ui.js`, and the `assets/` folder
   (or just the single bundled `index.html`)
2. Repo **Settings → Pages** → Source: *Deploy from a branch* → `main` / root
3. Your app lives at `https://<username>.github.io/<repo>/`

## Option 3 — Cloudflare Pages / Vercel

Same idea: create a project, upload the folder, get an https URL. Both have free tiers and drag-and-drop uploads (Cloudflare Pages: *Create project → Direct upload*).

## Option 4 — your own machine (only if you want it local)

Any one-liner serves the folder — these are tiny static file servers, not "real" servers:

```bash
npx serve anime-class-player        # Node installed? that's it
# or
python3 -m http.server 3000         # if you ever feel like it
```

Or VS Code → install the **Live Server** extension → right-click `index.html` → *Open with Live Server*.

---

## Where is my progress saved?

Everything (XP, rank, streaks, episode progress, notes) lives in your **browser's localStorage**, tied to the domain you deploy to. Same browser + same URL = your save is always there. Clearing site data resets it (the app has a "reset all data" button in Settings too).

## Hosting checklist

- ✅ Any static host works (Netlify, GitHub Pages, Cloudflare, Vercel, your school's webspace…)
- ✅ https is automatic on all of the above — YouTube embeds love it
- ❌ Don't open via `file://` (double-click) — YouTube blocks it (error 153)
- ❌ Don't pay for anything. If a host asks for money, you picked the wrong option
