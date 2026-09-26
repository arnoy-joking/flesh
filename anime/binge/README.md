# ⚔️ ANIME CLASS PLAYER
### アニメ・クラス・プレイヤー — turn boring recorded classes into binge-worthy anime seasons

Paste **any** YouTube link — 40 minutes, 2 hours, 6 hours, 10 hours — and it becomes a **season of 15–20 minute anime episodes**, each with its own title card, its own progress bar, its own clock, a mission, and a boss fight.

Your brain thinks it's bingeing an anime. It's actually finishing your lectures.

---

## 🚀 How to use it

**Option 1 — host it anywhere static (recommended):**
The app is pure static files — drag the folder onto **Netlify Drop** (app.netlify.com/drop) or push it to **GitHub Pages** and you get a permanent https URL. No backend, no server to run. Full instructions in **[DEPLOY.md](DEPLOY.md)**.

**Option 2 — single portable file:**
`Anime-Class-Player.html` has everything embedded. Host that one file on any static host (Netlify Drop works — rename it `index.html` first).
> ⚠️ Don't open it by double-clicking from disk: YouTube blocks playback in `file://` pages (player error 153). The app detects this and explains it — it needs an http(s) address.

## ✨ What it does

| | |
|---|---|
| 📺 **The illusion** | The player shows **only** the current episode: `05:20 / 20:00`. You never see `85:00 / 360:00`. Custom controls, custom seek bar, anime title cards (`第五話`) at the start of every episode. |
| 🧮 **Dynamic splitting** | Any duration → 15 or 20-minute episodes (auto or manual). 45 min = 3 episodes, 6 h = 18, 10 h = 30. Tiny remainders merge into the previous episode. |
| 📜 **Missions** | Each episode gets a small study mission (note 3 key terms, timestamp the confusing part, predict the next episode…). |
| 👹 **Boss fights** | After each episode: a 30-second recall battle. Type things you remember → each one deals damage. Beat the boss for bonus XP. (It's active recall in a costume — the most effective study technique there is.) |
| 🏆 **Episode clear** | Auto-pause at the end, "EPISODE CLEAR!" burst, victory checklist, XP tally, and a **2-minute recharge break** with a countdown ring. |
| 🔥 **Gamification** | XP, ranks **E → SSS**, daily quests (3 episodes/day), combos, 16 achievements, streaks, focus crystals that spawn on the video. |
| 🧠 **ADHD-proofing** | Sleepy guard (a mascot fetches you if you pause too long), forced breaks, small winnable units, zero punishing locks — you can always skip, but completing everything pays more. |
| 💾 **Persistence** | Everything (XP, notes, per-episode progress) lives in your browser's localStorage. No accounts, no servers, no tracking. |

## 🎮 Controls

| Key | Action |
|---|---|
| `Space` / `K` | play / pause |
| `←` / `→` | ±10 seconds |
| `↑` / `↓` | volume |
| `N` / `P` | next / previous episode |
| `F` | fullscreen |
| `M` | mute |
| `?` | help panel |

## ⚠️ Honest limitations

- The video is **never downloaded or cut** — it's the same YouTube stream, wearing an anime costume. (That's the point.)
- Videos whose uploader **disabled embedding** (or age-restricted ones) can't be played inside any custom player — the app will tell you and suggest another link.
- Live streams aren't supported.
- Custom controls mean YouTube's own caption toggle is hidden; there's a **CC option** on the start screen that asks YouTube to show captions from the beginning.

## 🛠️ Development

```
anime-class-player/
├── index.html          # app shell
├── style.css           # the anime look
├── app.js              # core engine (pure logic + YouTube wrapper)
├── ui.js               # presentation layer
├── build.py            # → builds Anime-Class-Player.html (single file)
├── assets/hero.jpg     # AI-generated key visual
└── tests/
    ├── logic.test.mjs  # 70 pure-logic tests (node)
    ├── e2e-fake.mjs    # 100 browser E2E tests w/ fake YouTube API (playwright)
    ├── e2e-extra.mjs   # 13 more (offline errors, finale, resume)
    └── shots/          # screenshots captured by the test suite
```

```bash
npm test        # run everything (needs: npm i && npx playwright install chromium)
npm run build   # rebuild the single-file bundle
```

The E2E suite injects a **fake YouTube IFrame API** into the page, so the full illusion — episode math, per-episode clock, seek clamping, end detection, clear screen, boss battle, XP, persistence — is verified in a real browser without depending on YouTube. A separate real-YouTube smoke test verifies the actual API integration (player creation, duration measurement, title fetch).
