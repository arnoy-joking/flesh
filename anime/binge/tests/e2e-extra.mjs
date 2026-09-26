/* Extra scenarios: offline error path, auto-next, finale, replay, resume chip. */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const rec = (name, ok, info = '') => {
  if (ok){ pass++; console.log('  ✓', name); }
  else { fail++; console.log('  ✗', name, info ? '— ' + info : ''); }
};

const FAKE_YT = `
window.__FAKE_PLAYERS__ = [];
class FakePlayer {
  constructor(el, opts){
    this.opts = opts; this._dur = window.__FAKE_DURATION__ || 7200;
    this._born = Date.now();
    this._t = 0; this._playing = false; this._state = -1; this._rate = 1; this._vol = 100; this._muted = false;
    window.__FAKE_PLAYERS__.push(this);
    setTimeout(()=>{ this._state = 5; opts.events.onReady && opts.events.onReady({target:this}); }, 30);
    if (window.__FAKE_ERROR__){
      const code = window.__FAKE_ERROR__;
      setTimeout(()=>{ opts.events.onError && opts.events.onError({data: code, target:this}); }, 90);
    }
    this._iv = setInterval(()=>{ if (this._playing){
      this._t = Math.min(this._t + 0.25 * this._rate, this._dur);
      if (this._t >= this._dur - 0.01){ this._playing = false; this._state = 0;
        opts.events.onStateChange && opts.events.onStateChange({data:0, target:this}); }
    }}, 250);
  }
  getDuration(){
    if (window.__FAKE_AD__){
      const a = window.__FAKE_AD__;
      return (Date.now() - this._born > a.afterMs) ? a.content : a.ad;
    }
    return window.__FAKE_ERROR__ ? 0 : this._dur;
  }
  getCurrentTime(){ return this._t; } getPlayerState(){ return this._state; }
  getVideoLoadedFraction(){ return 0.6; }
  playVideo(){ if (this._state === 0) this._t = 0; this._playing = true; this._state = 1;
    this.opts.events.onStateChange && this.opts.events.onStateChange({data:1, target:this}); }
  pauseVideo(){ this._playing = false; this._state = 2;
    this.opts.events.onStateChange && this.opts.events.onStateChange({data:2, target:this}); }
  seekTo(t){ this._t = Math.max(0, Math.min(t, this._dur)); }
  setVolume(v){} getVolume(){ return 100; } mute(){} unMute(){} isMuted(){ return false; }
  setPlaybackRate(r){ this._rate = r; }
  getVideoData(){ return { title: 'Extra Test Video', author: 'x', video_id: 'extravideo001' }; }
  setOption(){} destroy(){ clearInterval(this._iv); }
}
window.YT = { Player: FakePlayer, PlayerState: { UNSTARTED:-1, ENDED:0, PLAYING:1, PAUSED:2, BUFFERING:3, CUED:5 } };
`;

function startServer(dir, port){
  return spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1'], { cwd: dir, stdio: 'ignore' });
}
async function waitPort(port){
  for (let i = 0; i < 40; i++){
    try{ const r = await fetch(`http://127.0.0.1:${port}/`); if (r.ok) return; }catch(e){}
    await new Promise(r => setTimeout(r, 200));
  }
  throw new Error('no server');
}

async function main(){
  const server = startServer(ROOT, 8911);
  try{
    await waitPort(8911);
    const browser = await chromium.launch();

    /* 1 — offline / sandboxed-preview error path */
    console.log('\n  ▓ offline error path (like the in-app file preview)');
    {
      const ctx = await browser.newContext({ viewport: { width: 1500, height: 900 } });
      await ctx.route('**://www.youtube.com/**', r => r.abort());
      await ctx.route('**://youtube.com/**', r => r.abort());
      const page = await ctx.newPage();
      await page.addInitScript(FAKE_YT.replace('window.YT =', 'window.__NOFAKE__ =')); // no fake: force API load
      await page.goto('http://127.0.0.1:8911/');
      await page.fill('#input-url', 'https://www.youtube.com/watch?v=aqz-KE-bpKQ');
      await page.click('#btn-start');
      await page.waitForSelector('#load-error', { state: 'visible', timeout: 15000 });
      const msg = await page.textContent('#load-error-msg');
      rec('blocked network → helpful error', msg.includes('sandboxed') || msg.includes('network') || msg.includes('browser'), msg.slice(0, 80));
      rec('retry + back buttons offered', await page.isVisible('#btn-load-retry') && await page.isVisible('#btn-load-home'));
      await ctx.close();
    }

    /* 2 — auto-next, finale, replay, resume chip */
    console.log('\n  ▓ auto-next / finale / replay / resume');
    {
      const ctx = await browser.newContext({ viewport: { width: 1500, height: 900 } });
      const page = await ctx.newPage();
      const errors = [];
      page.on('pageerror', e => errors.push(String(e)));
      await page.addInitScript(d => { window.__FAKE_DURATION__ = d; }, 1200); // 20 min → 1 episode @20
      await page.addInitScript(FAKE_YT);
      await page.goto('http://127.0.0.1:8911/');
      await page.fill('#input-url', 'https://youtu.be/extravideo001');
      await page.selectOption('#select-eplen', '20');
      await page.click('#btn-start');
      await page.waitForSelector('#screen-player.on', { timeout: 6000 });
      rec('single episode season', (await page.locator('.ep-card').count()) === 1);
      await page.click('#ov-pause'); // play (user gesture)
      await page.waitForSelector('#ov-intro', { state: 'hidden', timeout: 6000 });
      // finish the episode
      await page.evaluate(() => window.__ACP__.player.seekTo(1199.9));
      await page.waitForSelector('#ov-clear', { state: 'visible', timeout: 4000 });
      rec('clear screen for single-ep season', true);
      // compress the break: 1s left, autonext on by default
      await page.evaluate(() => { window.__ACP__.S.clear.breakEnds = Date.now() + 1000; });
      await page.waitForFunction(() => document.querySelector('#btn-next-ep').classList.contains('ready'), null, { timeout: 6000 });
      rec('break timer completes → NEXT pulses', true);
      rec('break time shows 00:00', (await page.textContent('#break-time')).trim() === '00:00');
      await page.waitForFunction(() => /FINISH SEASON/.test(document.querySelector('#btn-next-ep').textContent), null, { timeout: 6000 });
      rec('single-ep season → FINISH SEASON label', true);
      await page.click('#btn-next-ep');
      await page.waitForSelector('#ov-finale', { state: 'visible', timeout: 4000 });
      rec('finale screen', (await page.textContent('#ov-finale')).replace(/\u00a0/g, ' ').includes('SEASON COMPLETE'));
      const xp1 = await page.textContent('#xp-text');
      rec('season bonus XP (100 + 200 = 300)', xp1.trim() === '300 XP', xp1);
      await page.screenshot({ path: path.join(ROOT, 'tests', 'shots', 'finale.png') });
      // replay season
      await page.click('#btn-replay-season');
      await page.waitForFunction(() => document.querySelector('#banner-num').textContent === 'EPISODE 1', null, { timeout: 5000 });
      rec('replay season restarts at ep 1', true);
      rec('watched badge cleared', (await page.locator('.ep-card.watched').count()) === 0);
      await ctx.close();
    }

    /* 3 — resume chip on partially watched episode */
    console.log('\n  ▓ resume chip');
    {
      const ctx = await browser.newContext({ viewport: { width: 1500, height: 900 } });
      const page = await ctx.newPage();
      await page.addInitScript(d => { window.__FAKE_DURATION__ = d; }, 3600); // 3 eps
      await page.addInitScript(FAKE_YT);
      await page.goto('http://127.0.0.1:8911/');
      await page.fill('#input-url', 'https://youtu.be/extravideo001');
      await page.click('#btn-start');
      await page.waitForSelector('#screen-player.on', { timeout: 6000 });
      // watch 40s of ep 1, then pause & save position
      await page.click('#ov-pause');
      await page.waitForSelector('#ov-intro', { state: 'hidden', timeout: 6000 });
      await page.evaluate(() => { window.__ACP__.player.seekTo(700); });
      await page.waitForTimeout(600);
      // persist position directly (simulates the periodic save after ≥5s of watching)
      await page.evaluate(() => {
        window.__ACP__.S.episodes[0].lastPos = 700;
        localStorage.setItem('ACP.v.' + window.__ACP__.S.videoId, JSON.stringify(window.__ACP__.V));
      });
      await page.reload();
      await page.waitForSelector('#continue-card', { state: 'visible', timeout: 4000 });
      await page.click('#btn-continue');
      await page.waitForSelector('#screen-player.on', { timeout: 6000 });
      rec('resume chip visible in list', await page.isVisible('.ep-resume'));
      const chip = await page.textContent('.ep-resume');
      rec('resume chip shows saved position', chip.includes('11:40'), chip);
      await ctx.close();
    }

    /* 4 — RETRY works after a load error (user-reported bug) */
    console.log('\n  ▓ retry after error');
    {
      const ctx = await browser.newContext({ viewport: { width: 1500, height: 900 } });
      const page = await ctx.newPage();
      await page.addInitScript(d => { window.__FAKE_DURATION__ = d; window.__FAKE_ERROR__ = 150; }, 7200);
      await page.addInitScript(FAKE_YT);
      await page.goto('http://127.0.0.1:8911/');
      await page.fill('#input-url', 'https://youtu.be/extravideo001');
      await page.click('#btn-start');
      await page.waitForSelector('#load-error', { state: 'visible', timeout: 15000 });
      rec('error screen shown after failure', true);
      // clear the error so the retry can succeed
      await page.evaluate(() => { window.__FAKE_ERROR__ = 0; });
      await page.click('#btn-load-retry');
      await page.waitForSelector('#screen-player.on', { timeout: 8000 });
      rec('RETRY actually retries and builds the season', true);
      const players = await page.evaluate(() => window.__FAKE_PLAYERS__.length);
      rec('a second player instance was created', players === 2, `got ${players}`);
      rec('season built with 6 episodes', (await page.locator('.ep-card').count()) === 6);
      const ytHref = await page.getAttribute('#load-error-yt', 'href');
      rec('error screen had a YouTube escape link', ytHref && ytHref.includes('extravideo001'), String(ytHref));
      await ctx.close();
    }

    /* 5 — ad guard: pre-roll ad must not become the season duration */
    console.log('\n  ▓ ad guard');
    {
      const ctx = await browser.newContext({ viewport: { width: 1500, height: 900 } });
      const page = await ctx.newPage();
      // 30-second ad reading for the first 3s, then the real 2h duration appears
      await page.addInitScript(a => { window.__FAKE_AD__ = a; }, { ad: 30, content: 7200, afterMs: 3000 });
      await page.addInitScript(FAKE_YT);
      await page.goto('http://127.0.0.1:8911/');
      await page.fill('#input-url', 'https://youtu.be/extravideo001');
      await page.click('#btn-start');
      await page.waitForSelector('#screen-player.on', { timeout: 20000 });
      rec('ad duration ignored — 2h content → 6 episodes', (await page.locator('.ep-card').count()) === 6,
        `got ${await page.locator('.ep-card').count()}`);
      rec('episode clock is 20:00, not the ad 00:30', (await page.textContent('#time-dur')) === '20:00');
      await ctx.close();
    }
    {
      const ctx = await browser.newContext({ viewport: { width: 1500, height: 900 } });
      const page = await ctx.newPage();
      // short ad → genuinely short video (90s): must resolve to the real content length
      await page.addInitScript(a => { window.__FAKE_AD__ = a; }, { ad: 15, content: 90, afterMs: 1500 });
      await page.addInitScript(FAKE_YT);
      await page.goto('http://127.0.0.1:8911/');
      await page.fill('#input-url', 'https://youtu.be/extravideo001');
      await page.click('#btn-start');
      await page.waitForSelector('#screen-player.on', { timeout: 20000 });
      rec('short ad + short video → single OVA of real length', (await page.textContent('#time-dur')) === '01:30',
        await page.textContent('#time-dur'));
      await ctx.close();
    }
    {
      // self-heal: a long ad produced a bogus 45s season; the true 2h duration
      // only becomes visible after playback started → season must rebuild live
      const ctx = await browser.newContext({ viewport: { width: 1500, height: 900 } });
      const page = await ctx.newPage();
      await page.addInitScript(d => { window.__FAKE_DURATION__ = d; }, 45);
      await page.addInitScript(FAKE_YT);
      await page.goto('http://127.0.0.1:8911/');
      await page.fill('#input-url', 'https://youtu.be/extravideo001');
      await page.selectOption('#select-eplen', '20');
      await page.click('#btn-start');
      // a <3min reading waits out the ad-check window (by design) before building
      await page.waitForSelector('#screen-player.on', { timeout: 50000 });
      rec('bogus 45s season initially built', (await page.textContent('#time-dur')) === '00:45');
      await page.click('#ov-pause');
      await page.waitForSelector('#ov-intro', { state: 'hidden', timeout: 6000 });
      // now the ad ends and the player reports the real 2h duration
      await page.evaluate(() => { window.__FAKE_AD__ = { ad: 45, content: 7200, afterMs: 0 }; });
      await page.waitForFunction(() => document.querySelectorAll('.ep-card').length === 6, null, { timeout: 10000 });
      rec('season rebuilt live into 6 episodes', true);
      rec('clock now 20:00', (await page.textContent('#time-dur')) === '20:00');
      rec('no clear-screen interruption', !(await page.isVisible('#ov-clear')));
      const st = await page.evaluate(() => window.__ACP__.player.getPlayerState());
      rec('playback continues through the rebuild', st === 1, `state=${st}`);
      await ctx.close();
    }

    await browser.close();
  } finally {
    server.kill();
  }
  console.log(`\n  ═══ EXTRA: ${pass} passed, ${fail} failed ═══`);
  process.exit(fail ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(1); });
