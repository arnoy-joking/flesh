/* file:// must fail GRACEFULLY (YouTube blocks embeds on opaque origins, code 153),
   and the bundle served over http must build a season from the real API. */
import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILE = 'file://' + path.join(ROOT, 'Anime-Class-Player.html');
const BUNNY = 'https://www.youtube.com/watch?v=aqz-KE-bpKQ'; // 10:34, embeddable

let pass = 0, fail = 0;
const rec = (n, ok, i = '') => { ok ? (pass++, console.log('  ✓', n)) : (fail++, console.log('  ✗', n, i ? '— ' + i : '')); };
const browser = await chromium.launch();

/* 1 — file:// → friendly code-153 guidance, no crash */
{
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(FILE);
  await page.fill('#input-url', BUNNY);
  await page.click('#btn-start');
  await page.waitForSelector('#load-error', { state: 'visible', timeout: 20000 });
  const msg = await page.textContent('#load-error-msg');
  rec('file:// → clear guidance (YouTube blocks disk-opened pages)', /file:\/\/|static host|web address/i.test(msg), msg.slice(0, 90));
  rec('retry & back still offered', await page.isVisible('#btn-load-retry') && await page.isVisible('#btn-load-home'));
  rec('no JS errors', errors.length === 0, errors.slice(0, 2).join(' | '));
  await page.close();
}

/* 2 — the same bundle over http → real YouTube season builds */
{
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  try{
    await page.goto('http://127.0.0.1:3000/Anime-Class-Player.html');
    await page.fill('#input-url', BUNNY);
    await page.click('#btn-start');
    await page.waitForSelector('#screen-player.on', { timeout: 30000 });
    rec('bundle over http builds a real season', true);
    const dur = await page.textContent('#time-dur');
    rec('duration measured (~10:34)', /^10:3\d$/.test(dur), `time-dur=${dur}`);
    rec('single-episode OVA plan', (await page.locator('.ep-card').count()) === 1);
    rec('video title fetched', (await page.textContent('#season-title')).length > 3);
    rec('no JS errors over http', errors.length === 0, errors.slice(0, 2).join(' | '));
  } catch(e){
    rec('bundle over http flow completed', false, e.message.split('\n')[0]);
  }
  await page.close();
}

await browser.close();
console.log(`\n  ═══ FILE/HTTP SMOKE: ${pass} passed, ${fail} failed ═══`);
process.exit(fail ? 1 : 0);
