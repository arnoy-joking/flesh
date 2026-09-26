/* ═══════════════════════════════════════════════════════════════
   REAL YouTube smoke test (best effort — depends on network and
   YouTube allowing headless playback). Uses Big Buck Bunny (10:34,
   embeddable, CC-BY) — expect 1 episode of ~10:34.
   ═══════════════════════════════════════════════════════════════ */
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

function startServer(dir, port){
  return spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1'], { cwd: dir, stdio: 'ignore' });
}
async function waitPort(port, timeoutMs = 8000){
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs){
    try{ const r = await fetch(`http://127.0.0.1:${port}/`); if (r.ok) return; }catch(e){}
    await new Promise(r => setTimeout(r, 200));
  }
  throw new Error('server did not start');
}

const BUNNY = 'https://www.youtube.com/watch?v=aqz-KE-bpKQ'; // 10:34

async function main(){
  const server = startServer(ROOT, 8909);
  try{
    await waitPort(8909);
    const browser = await chromium.launch({ args: ['--autoplay-policy=user-gesture-required'] });
    const page = await browser.newPage({ viewport: { width: 1500, height: 900 } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    await page.goto('http://127.0.0.1:8909/');
    await page.fill('#input-url', BUNNY);
    await page.click('#btn-start');

    // duration measurement over real YouTube (may need muted-play priming)
    await page.waitForSelector('#screen-player.on', { timeout: 30000 });
    rec('season built from real video', true);

    const dur = await page.textContent('#time-dur');
    rec('per-episode clock is mm:ss (~10:34)', /^10:3\d$/.test(dur), `time-dur=${dur}`);
    const n = await page.locator('.ep-card').count();
    rec('short video → single episode (OVA)', n === 1, `got ${n}`);
    const title = await page.textContent('#season-title');
    rec('video title fetched', title.length > 3, title);

    // real playback (click = user gesture)
    await page.waitForSelector('#ov-pause', { state: 'visible', timeout: 5000 });
    await page.click('#ov-pause');
    await page.waitForTimeout(2500); // intro card
    let advanced = false;
    for (let i = 0; i < 20 && !advanced; i++){
      await page.waitForTimeout(500);
      const cur = await page.textContent('#time-cur');
      advanced = !/^00:0[0-1]$/.test(cur) && cur !== '00:00';
    }
    rec('real playback advances the episode clock', advanced, await page.textContent('#time-cur'));
    await page.screenshot({ path: path.join(ROOT, 'tests', 'shots', 'real-play.png') });

    // jump to the end of the (single) episode → clear screen
    const total = await page.evaluate(() => window.__ACP__.S.episodes[0].dur);
    await page.evaluate(t => window.__ACP__.player.seekTo(t - 1), total);
    await page.waitForSelector('#ov-clear', { state: 'visible', timeout: 8000 });
    rec('real end-of-episode → EPISODE CLEAR', true);
    const nextLabel = await page.textContent('#btn-next-ep');
    rec('single-episode season → FINISH SEASON button', /FINISH SEASON/.test(nextLabel), nextLabel);

    await page.click('#btn-next-ep');
    await page.waitForSelector('#ov-finale', { state: 'visible', timeout: 4000 });
    rec('finale screen appears', (await page.textContent('#ov-finale')).includes('SEASON COMPLETE'));
    await page.screenshot({ path: path.join(ROOT, 'tests', 'shots', 'real-finale.png') });

    rec('no JS errors', errors.length === 0, errors.slice(0, 3).join(' | '));
    await browser.close();
  } catch(e){
    console.error('  ⚠ REAL-YT TEST INCOMPLETE (best-effort):', e.message && e.message.split('\n')[0]);
    console.error('    (headless YouTube playback can be blocked; fake-YT suite is the source of truth)');
  } finally {
    server.kill();
  }
  console.log(`\n  ═══ REAL-YT: ${pass} passed, ${fail} failed ═══`);
}
main();
