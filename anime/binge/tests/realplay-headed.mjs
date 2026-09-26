/* Real playback verification in a HEADED browser under Xvfb (video decoding works there). */
import { chromium } from 'playwright';
let pass = 0, fail = 0;
const rec = (n, ok, i = '') => { ok ? (pass++, console.log('  ✓', n)) : (fail++, console.log('  ✗', n, i ? '— ' + i : '')); };
const browser = await chromium.launch({ headless: false,
  ignoreDefaultArgs: ['--enable-automation'],
  args: ['--disable-blink-features=AutomationControlled', '--start-maximized'] });
const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
await context.addInitScript(() => { Object.defineProperty(navigator, 'webdriver', { get: () => undefined }); });
const page = await context.newPage();
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
try {
  await page.goto('http://127.0.0.1:3000/');
  await page.fill('#input-url', 'https://www.youtube.com/watch?v=aqz-KE-bpKQ');
  await page.click('#btn-start');
  await page.waitForSelector('#screen-player.on', { timeout: 30000 });
  const dur = await page.textContent('#time-dur');
  rec('season built over real API', /^10:3\d$/.test(dur), `time-dur=${dur}`);
  await page.waitForSelector('#ov-pause', { state: 'visible', timeout: 5000 });
  await page.click('#ov-pause');
  await page.waitForSelector('#ov-intro', { state: 'hidden', timeout: 8000 });
  // wait for the episode clock to advance past 3 seconds of real playback
  let advanced = false, last = '00:00';
  for (let i = 0; i < 30 && !advanced; i++){
    await page.waitForTimeout(500);
    last = await page.textContent('#time-cur');
    advanced = !/^00:0[0-3]$/.test(last);
  }
  rec('REAL video playback advances the episode clock', advanced, `time-cur=${last}`);
  const st = await page.evaluate(() => window.__ACP__.player.getPlayerState());
  rec('player reports PLAYING', st === 1, `state=${st}`);
  await page.screenshot({ path: 'tests/shots/real-playback-headed.png' });
  // seek near the end → episode clear over real playback
  const total = await page.evaluate(() => window.__ACP__.S.episodes[0].dur);
  await page.evaluate(t => window.__ACP__.player.seekTo(t - 2), total);
  await page.waitForSelector('#ov-clear', { state: 'visible', timeout: 10000 });
  rec('end of episode → EPISODE CLEAR (real playback)', true);
  rec('no JS errors', errors.length === 0, errors.slice(0, 2).join(' | '));
} catch(e){
  rec('headed real-playback flow completed', false, e.message.split('\n')[0]);
}
await browser.close();
console.log(`\n  ═══ HEADED REAL PLAY: ${pass} passed, ${fail} failed ═══`);
process.exit(fail ? 1 : 0);
