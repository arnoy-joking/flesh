/* ═══════════════════════════════════════════════════════════════
   E2E tests with a FAKE YouTube IFrame API.
   Verifies the core illusion without real YouTube:
   - dynamic episode splitting for any duration
   - per-episode clock ("05:20 / 20:00", never "85:00 / 360:00")
   - seek clamping inside the episode window
   - episode end detection → EPISODE CLEAR screen
   - boss battle, checklist, XP
   - persistence across reloads
   ═══════════════════════════════════════════════════════════════ */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync, copyFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHOTS = path.join(ROOT, 'tests', 'shots');
mkdirSync(SHOTS, { recursive: true });

let pass = 0, fail = 0;
function rec(name, ok, info = ''){
  if (ok){ pass++; console.log('    ✓', name); }
  else { fail++; console.log('    ✗', name, info ? '— ' + info : ''); }
}
function section(t){ console.log('\n  ▓ ' + t); }

const FAKE_YT = `
window.__FAKE_PLAYERS__ = [];
class FakePlayer {
  constructor(el, opts){
    this.opts = opts;
    this._dur = window.__FAKE_DURATION__ || 7200;
    this._t = 0; this._playing = false; this._state = -1; this._rate = 1;
    this._vol = 100; this._muted = false;
    window.__FAKE_PLAYERS__.push(this);
    setTimeout(()=>{ this._state = 5; opts.events.onReady && opts.events.onReady({target:this}); }, 30);
    if (window.__FAKE_ERROR__){
      const code = window.__FAKE_ERROR__;
      setTimeout(()=>{ opts.events.onError && opts.events.onError({data: code, target:this}); }, 90);
    }
    this._iv = setInterval(()=>{
      if (this._playing){
        this._t = Math.min(this._t + 0.25 * this._rate, this._dur);
        if (this._t >= this._dur - 0.01){
          this._playing = false; this._state = 0;
          opts.events.onStateChange && opts.events.onStateChange({data: 0, target: this});
        }
      }
    }, 250);
  }
  getDuration(){ return window.__FAKE_ERROR__ ? 0 : this._dur; }
  getCurrentTime(){ return this._t; }
  getPlayerState(){ return this._state; }
  getVideoLoadedFraction(){ return 0.6; }
  playVideo(){ if (this._state === 0) this._t = 0; this._playing = true; this._state = 1;
    this.opts.events.onStateChange && this.opts.events.onStateChange({data:1, target:this}); }
  pauseVideo(){ this._playing = false; this._state = 2;
    this.opts.events.onStateChange && this.opts.events.onStateChange({data:2, target:this}); }
  seekTo(t){ this._t = Math.max(0, Math.min(t, this._dur)); }
  setVolume(v){ this._vol = v; } getVolume(){ return this._vol; }
  mute(){ this._muted = true; } unMute(){ this._muted = false; } isMuted(){ return this._muted; }
  setPlaybackRate(r){ this._rate = r; }
  getVideoData(){ return { title: window.__FAKE_TITLE__ || 'Fake Recorded Class — Very Long Lecture', author: 'Prof. Fake', video_id: 'fakevideo001' }; }
  setOption(){}
  destroy(){ clearInterval(this._iv); }
}
window.YT = { Player: FakePlayer, PlayerState: { UNSTARTED:-1, ENDED:0, PLAYING:1, PAUSED:2, BUFFERING:3, CUED:5 } };
`;

async function newPage(browser, { duration = 7200, error = 0, title = '' } = {}){
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.addInitScript(([dur, err, ttl]) => {
    window.__FAKE_DURATION__ = dur;
    window.__FAKE_ERROR__ = err;
    window.__FAKE_TITLE__ = ttl;
  }, [duration, error, title]);
  await page.addInitScript(FAKE_YT);
  page._errors = errors;
  return { ctx, page };
}

async function startSeason(page, url, eplen){
  await page.fill('#input-url', url);
  if (eplen) await page.selectOption('#select-eplen', eplen);
  await page.click('#btn-start');
  await page.waitForSelector('#screen-player.on', { timeout: 6000 });
}

async function beginPlayback(page){
  await page.waitForSelector('#ov-pause', { state: 'visible', timeout: 4000 });
  await page.click('#ov-pause');
  await page.waitForSelector('#ov-intro', { state: 'visible', timeout: 3000 });
  await page.waitForSelector('#ov-intro', { state: 'hidden', timeout: 6000 });
}

/* ─────────── scenario A: the full illusion flow (2h video) ─────────── */
async function scenarioFull(base, tag){
  section(`A · full flow — 2h video, 20-min episodes (${tag})`);
  const browser = await chromium.launch();
  const { ctx, page } = await newPage(browser, { duration: 7200 });
  try{
    await page.goto(base);
    rec('home screen visible', await page.isVisible('#screen-home.on'));
    await startSeason(page, 'https://www.youtube.com/watch?v=fakevideo001');
    rec('player screen visible', await page.isVisible('#screen-player.on'));

    const n = await page.locator('.ep-card').count();
    rec('2h → 6 episodes', n === 6, `got ${n}`);
    rec('season meta mentions 6 episodes', (await page.textContent('#season-meta')).includes('6 episodes'));
    rec('season title from video data', (await page.textContent('#season-title')).includes('Fake Recorded Class'));
    rec('episode 1 title', (await page.textContent('.ep-card .ep-title')) === 'The Journey Begins',
      await page.textContent('.ep-card .ep-title'));

    rec('time display shows 20:00 total (not 120:00)', (await page.textContent('#time-dur')) === '20:00');
    rec('time display starts at 00:00', (await page.textContent('#time-cur')) === '00:00');

    await beginPlayback(page);
    await page.waitForFunction(() => /^00:0[0-9]$/.test(document.querySelector('#time-cur').textContent), null, { timeout: 6000 });
    rec('clock counts within episode (00:0x)', true);

    // THE CORE ILLUSION — no full-video time anywhere in the stage
    const stageText = await page.textContent('#stage');
    rec('stage does NOT leak total time "120:00"', !stageText.includes('120:00'));
    rec('stage does NOT leak total time "2:00:00"', !stageText.includes('2:00:00'));
    rec('banner says EPISODE 1', (await page.textContent('#banner-num')) === 'EPISODE 1');

    // seek via API (simulating what the seek bar does)
    await page.evaluate(() => window.__ACP__.player.seekTo(600));
    await page.waitForFunction(() => document.querySelector('#time-cur').textContent === '10:00', null, { timeout: 3000 });
    rec('seek to absolute 600s shows as 10:00 (episode-relative)', true);

    // seek bar click at 25%
    const box = await page.locator('#seek').boundingBox();
    await page.mouse.click(box.x + box.width * 0.25, box.y + box.height / 2);
    await page.waitForFunction(() => document.querySelector('#time-cur').textContent === '05:00', null, { timeout: 3000 });
    rec('seek bar click at 25% → 05:00', true);

    // arrow keys ±10s
    await page.keyboard.press('ArrowRight');
    await page.waitForFunction(() => document.querySelector('#time-cur').textContent === '05:10', null, { timeout: 3000 });
    rec('ArrowRight +10s', true);
    await page.keyboard.press('ArrowLeft');
    await page.waitForFunction(() => document.querySelector('#time-cur').textContent === '05:00', null, { timeout: 3000 });
    rec('ArrowLeft -10s', true);

    // pause / resume
    await page.keyboard.press(' ');
    await page.waitForSelector('#ov-pause', { state: 'visible', timeout: 2000 });
    rec('space pauses + pause overlay', true);
    await page.keyboard.press(' ');
    await page.waitForSelector('#ov-pause', { state: 'hidden', timeout: 2000 });
    rec('space resumes', true);

    // jump to episode 3 directly from the list
    await page.click('.ep-card[data-i="2"]');
    await page.waitForFunction(() => document.querySelector('#banner-num').textContent === 'EPISODE 3', null, { timeout: 4000 });
    const t3 = await page.evaluate(() => window.__ACP__.player.getCurrentTime());
    rec('episode 3 starts at its own window (≈2400s)', t3 >= 2399 && t3 <= 2410, `t=${t3}`);
    await page.waitForSelector('#ov-intro', { state: 'hidden', timeout: 6000 });

    // end of episode detection
    await page.evaluate(() => window.__ACP__.player.seekTo(3599.9));
    await page.waitForSelector('#ov-clear', { state: 'visible', timeout: 4000 });
    rec('episode end → EPISODE CLEAR screen', (await page.textContent('#ov-clear')).replace(/\u00a0/g, ' ').includes('EPISODE CLEAR'));
    rec('clear screen names the episode', (await page.textContent('#clear-ep')).includes('EPISODE 3'));
    await page.screenshot({ path: `${SHOTS}/clear-${tag}.png` });

    rec('player actually paused at boundary', !(await page.evaluate(() => window.__ACP__.player.getPlayerState() === 1)));
    rec('XP awarded for clear', (await page.textContent('#xp-text')).trim() === '100 XP',
      await page.textContent('#xp-text'));

    // boss battle
    await page.click('#btn-boss');
    await page.waitForSelector('#ov-boss', { state: 'visible', timeout: 2000 });
    await page.screenshot({ path: `${SHOTS}/boss-${tag}.png` });
    const bossName = await page.textContent('#boss-name');
    rec('boss has a name', bossName && bossName.length > 3, bossName);
    for (let i = 1; i <= 3; i++){
      await page.fill('#boss-input', `recall attack number ${i} — inertia is resistance to change`);
      await page.click('#btn-boss-attack');
    }
    await page.waitForSelector('#boss-verdict', { state: 'visible', timeout: 2000 });
    rec('boss defeated verdict', (await page.textContent('#boss-verdict')).includes('BOSS DEFEATED'));
    await page.waitForSelector('#ov-boss', { state: 'hidden', timeout: 5000 });
    rec('boss overlay auto-closes', true);
    rec('boss checklist row claimed', await page.isVisible('#clear-checklist .chk[data-id="boss"].done'));
    rec('recall attacks saved to notes', (await page.evaluate(() => window.__ACP__.V.episodes[2].notes)).includes('recall attack number 1'));

    // checklist claim
    await page.click('#clear-checklist .chk[data-id="water"]');
    await page.waitForTimeout(300);
    rec('water checklist claimable', await page.isVisible('#clear-checklist .chk[data-id="water"].done'));
    const xpNow = (await page.textContent('#xp-text')).trim();
    rec('XP tally: 100 ep + 50 boss + 10 water = 160', xpNow === '160 XP', xpNow);

    // next episode
    await page.click('#btn-next-ep');
    await page.waitForFunction(() => document.querySelector('#banner-num').textContent === 'EPISODE 4', null, { timeout: 5000 });
    rec('NEXT EPISODE → EPISODE 4', true);
    const t4 = await page.evaluate(() => window.__ACP__.player.getCurrentTime());
    rec('episode 4 window starts ≈3600s', t4 >= 3599 && t4 <= 3615, `t=${t4}`);

    // persistence
    await page.reload();
    await page.waitForSelector('#continue-card', { state: 'visible', timeout: 4000 });
    rec('continue card after reload', true);
    await page.click('#btn-continue');
    await page.waitForSelector('#screen-player.on', { timeout: 6000 });
    await page.waitForFunction(() => document.querySelector('#banner-num').textContent === 'EPISODE 4', null, { timeout: 4000 });
    rec('resume lands on EPISODE 4', true);
    const watched = await page.locator('.ep-card.watched').count();
    rec('1 episode marked watched (only ep 3 was completed)', watched === 1, `got ${watched}`);

    // mission/notes/boss preview panels
    rec('mission panel shows current episode', (await page.textContent('#mission-ep')).includes('EPISODE 4'));
    rec('boss preview populated', (await page.textContent('#boss-prev-name')).length > 3);

    rec('no JS errors (A)', page._errors.length === 0, page._errors.slice(0, 3).join(' | '));
  } finally {
    await ctx.close();
    await browser.close();
  }
}

/* ─────────── scenario B/C: splitting math in the browser ─────────── */
async function scenarioSplit(browser, base){
  const cases = [
    { dur: 2700, eplen: null,   expect: 3, durs: ['20:00','20:00','05:00'], name: '45 min (auto) → 3 eps 20+20+5' },
    { dur: 2700, eplen: '15',   expect: 3, durs: ['15:00','15:00','15:00'], name: '45 min (15) → 3 eps of 15' },
    { dur: 21600, eplen: null,  expect: 18, durs: null, name: '6 h (auto) → 18 eps' },
    { dur: 36000, eplen: '20',  expect: 30, durs: null, name: '10 h (20) → 30 eps' },
    { dur: 3660, eplen: null,   expect: 3, durs: ['20:00','20:00','21:00'], name: '1h+60s → tail merged, last 21:00' },
    { dur: 640, eplen: null,    expect: 1, durs: ['10:40'], name: '10:40 video → single OVA' },
    { dur: 3600, eplen: '20',   expect: 3, durs: ['20:00','20:00','20:00'], name: 'exactly 1 h → 3 eps, no phantom' },
  ];
  for (const c of cases){
    section('B · ' + c.name);
    const { ctx, page } = await newPage(browser, { duration: c.dur });
    try{
      await page.goto(base);
      await startSeason(page, 'https://youtu.be/fakevideo001', c.eplen);
      const n = await page.locator('.ep-card').count();
      rec(`episode count = ${c.expect}`, n === c.expect, `got ${n}`);
      if (c.durs){
        const durs = await page.$$eval('.ep-card .ep-dur', els => els.map(e => e.textContent));
        rec(`durations ${c.durs.join(',')}`, JSON.stringify(durs) === JSON.stringify(c.durs), durs.join(','));
      }
      if (c.dur === 640) rec('single-episode season flagged as OVA', (await page.textContent('#season-meta')).includes('OVA'));
      rec('no JS errors', page._errors.length === 0, page._errors.slice(0, 2).join(' | '));
    } finally { await ctx.close(); }
  }
}

/* ─────────── error paths ─────────── */
async function scenarioErrors(browser, base){
  section('C · error handling');
  {
    const { ctx, page } = await newPage(browser, {});
    try{
      await page.goto(base);
      await page.fill('#input-url', 'definitely not a youtube link');
      await page.click('#btn-start');
      await page.waitForSelector('#home-error', { state: 'visible', timeout: 2000 });
      rec('bad URL → home error, stays on home', await page.isVisible('#screen-home.on'));
      rec('no JS errors (bad url)', page._errors.length === 0, page._errors.slice(0, 2).join(' | '));
    } finally { await ctx.close(); }
  }
  {
    const { ctx, page } = await newPage(browser, { error: 150 });
    try{
      await page.goto(base);
      await page.fill('#input-url', 'https://www.youtube.com/watch?v=fakevideo001');
      await page.click('#btn-start');
      await page.waitForSelector('#load-error', { state: 'visible', timeout: 4000 });
      const msg = await page.textContent('#load-error-msg');
      rec('embed-disabled error is friendly', msg.includes('embedded'), msg);
      rec('no JS errors (embed err)', page._errors.length === 0, page._errors.slice(0, 2).join(' | '));
    } finally { await ctx.close(); }
  }
}

/* ─────────── servers ─────────── */
function startServer(dir, port){
  const proc = spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1'], { cwd: dir, stdio: 'ignore' });
  return proc;
}
async function waitPort(port, timeoutMs = 8000){
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs){
    try{
      const r = await fetch(`http://127.0.0.1:${port}/`);
      if (r.ok) return true;
    }catch(e){}
    await new Promise(r => setTimeout(r, 200));
  }
  throw new Error('server on port ' + port + ' did not start');
}

const BUNDLE_DIR = '/tmp/acp-bundle';

async function main(){
  const srcServer = startServer(ROOT, 8907);
  copyFileSync(path.join(ROOT, 'Anime-Class-Player.html'), (mkdirSync(BUNDLE_DIR, { recursive: true }), path.join(BUNDLE_DIR, 'index.html')));
  const bundleServer = startServer(BUNDLE_DIR, 8908);
  try{
    await waitPort(8907);
    await waitPort(8908);
    const browser = await chromium.launch();
    await scenarioFull('http://127.0.0.1:8907/', 'src');
    await scenarioSplit(browser, 'http://127.0.0.1:8907/');
    await scenarioErrors(browser, 'http://127.0.0.1:8907/');
    await browser.close();
    await scenarioFull('http://127.0.0.1:8908/', 'bundle');
  } finally {
    srcServer.kill();
    bundleServer.kill();
  }
  console.log(`\n  ═══ E2E: ${pass} passed, ${fail} failed ═══`);
  process.exit(fail ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(1); });
