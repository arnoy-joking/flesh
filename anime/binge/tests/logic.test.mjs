/* Pure-logic tests for Anime Class Player (no browser needed). */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const mod = require('../app.js'); // evaluates core; browser boot is guarded
const ACP = mod.ACP || mod;
if (!ACP) throw new Error('ACP not exported from app.js');

let pass = 0, fail = 0;
function eq(actual, expected, msg){
  const a = JSON.stringify(actual), b = JSON.stringify(expected);
  if (a === b){ pass++; console.log('  ✓', msg); }
  else { fail++; console.error('  ✗', msg, '\n     expected:', b, '\n     actual  :', a); }
}
function ok(cond, msg){ if (cond){ pass++; console.log('  ✓', msg); } else { fail++; console.error('  ✗', msg); } }

console.log('— splitEpisodes —');
eq(ACP.splitEpisodes(2700, 900).map(e => [e.start, e.dur]), [[0,900],[900,900],[1800,900]], '45 min @15 = 3 episodes of 15');
eq(ACP.splitEpisodes(2700, 1200).map(e => e.dur), [1200, 1200, 300], '45 min @20 = 3 episodes (20+20+5)');
eq(ACP.splitEpisodes(21600, 1200).length, 18, '6 h @20 = 18 episodes');
eq(ACP.splitEpisodes(21600, 1200)[17], { i:17, start:20400, dur:1200 }, 'last 6h episode is 20:00 at 5:40:00');
eq(ACP.splitEpisodes(36000, 1200).length, 30, '10 h @20 = 30 episodes');
eq(ACP.splitEpisodes(3600, 1200).map(e => e.dur), [1200,1200,1200], 'exact 1 h = 3 full episodes, no phantom tail');
eq(ACP.splitEpisodes(3601, 1200).map(e => e.dur), [1200,1200,1201], '1 h + 1 s tail merges into previous episode');
eq(ACP.splitEpisodes(600, 1200).map(e => e.dur), [600], '10 min video = single episode');
eq(ACP.splitEpisodes(1200, 1200).map(e => e.dur), [1200], 'exactly 20 min = 1 episode');
eq(ACP.splitEpisodes(1240, 1200).map(e => e.dur), [1240], '20:40 video = single 20:40 episode (tiny tail merged)');
eq(ACP.splitEpisodes(0, 1200), [], 'zero duration → no episodes');
eq(ACP.splitEpisodes(-5, 1200), [], 'negative duration → no episodes');

console.log('— fmtClock / fmtDur —');
eq(ACP.fmtClock(320), '05:20', '05:20 formatting');
eq(ACP.fmtClock(0), '00:00', '00:00');
eq(ACP.fmtClock(1200), '20:00', '20:00');
eq(ACP.fmtClock(3599), '59:59', '59:59');
eq(ACP.fmtClock(3600), '1:00:00', 'hours kick in at 1h');
eq(ACP.fmtClock(3665, true), '1:01:05', 'forced hours');
eq(ACP.fmtClock(7200), '2:00:00', '2h');
eq(ACP.fmtDur(2700), '45m', '45m');
eq(ACP.fmtDur(21600), '6h', '6h');
eq(ACP.fmtDur(24000), '6h 40m', '6h 40m');
eq(ACP.fmtDur(0), '0m', '0m');

console.log('— parseYouTubeId —');
eq(ACP.parseYouTubeId('https://www.youtube.com/watch?v=dQw4w9WgXcQ'), 'dQw4w9WgXcQ', 'watch?v=');
eq(ACP.parseYouTubeId('https://youtu.be/dQw4w9WgXcQ?si=xyz'), 'dQw4w9WgXcQ', 'youtu.be with tracking');
eq(ACP.parseYouTubeId('https://www.youtube.com/embed/dQw4w9WgXcQ'), 'dQw4w9WgXcQ', 'embed');
eq(ACP.parseYouTubeId('https://www.youtube.com/shorts/abcdefghijk'), 'abcdefghijk', 'shorts');
eq(ACP.parseYouTubeId('https://www.youtube.com/live/abcdefghijk?feature=share'), 'abcdefghijk', 'live');
eq(ACP.parseYouTubeId('https://m.youtube.com/watch?v=abcdefghijk'), 'abcdefghijk', 'm.youtube');
eq(ACP.parseYouTubeId('https://www.youtube-nocookie.com/embed/abcdefghijk'), 'abcdefghijk', 'nocookie');
eq(ACP.parseYouTubeId('abcdefghijk'), 'abcdefghijk', 'bare id');
eq(ACP.parseYouTubeId('not a url'), null, 'garbage → null');
eq(ACP.parseYouTubeId('https://vimeo.com/12345'), null, 'vimeo → null');
eq(ACP.parseYouTubeId(''), null, 'empty → null');

console.log('— pickEpLen / autoEpLen —');
eq(ACP.pickEpLen('15', 99999), 900, 'choice 15');
eq(ACP.pickEpLen('20', 99999), 1200, 'choice 20');
eq(ACP.pickEpLen('auto', 1800), 900, 'auto: ≤30 min → 15');
eq(ACP.pickEpLen('auto', 1801), 1200, 'auto: >30 min → 20');
eq(ACP.pickEpLen(undefined, 7200), 1200, 'default → auto behavior');

console.log('— rankInfo —');
eq(ACP.rankInfo(0).key, 'E', '0 XP = E');
eq(ACP.rankInfo(299).key, 'E', '299 XP = E');
eq(ACP.rankInfo(300).key, 'D', '300 XP = D');
eq(ACP.rankInfo(12000).key, 'SSS', '12000 XP = SSS');
eq(ACP.rankInfo(400).pct, 20, '400 XP → 20% into D');
eq(ACP.rankInfo(99999).next, null, 'SSS has no next');
eq(ACP.rankInfo(5000).key, 'S', '5000 XP = S');

console.log('— kanjiNum —');
eq(ACP.kanjiNum(1), '一', '1 → 一');
eq(ACP.kanjiNum(5), '五', '5 → 五');
eq(ACP.kanjiNum(10), '十', '10 → 十');
eq(ACP.kanjiNum(14), '十四', '14 → 十四');
eq(ACP.kanjiNum(20), '二十', '20 → 二十');
eq(ACP.kanjiNum(21), '二十一', '21 → 二十一');
eq(ACP.kanjiNum(99), '九十九', '99 → 九十九');
eq(ACP.kanjiNum(100), '100', '100+ falls back to arabic');

console.log('— makeSeasonPlan —');
{
  const p1 = ACP.makeSeasonPlan(21600, 1200, 'videoAAAAAAA');
  const p2 = ACP.makeSeasonPlan(21600, 1200, 'videoAAAAAAA');
  eq(p1.length, 18, '18 episodes for 6h');
  ok(p1.every((e, i) => e.i === i), 'sequential indices');
  ok(p1.every(e => e.start === e.i * 1200 && e.dur === 1200), 'correct windows');
  eq(p1[0].title, 'The Journey Begins', 'ep 1 title fixed');
  eq(p1[17].title, 'The Final Review', 'finale title fixed');
  eq(p1[17].boss.name, 'The Semester Demon', 'finale boss');
  ok(p1.slice(1, 17).every(e => e.title.length > 3), 'middle titles generated');
  ok(p1.every(e => typeof e.mission === 'string' && e.mission.length > 10), 'missions assigned');
  eq(p1.map(e => e.title).join('|'), p2.map(e => e.title).join('|'), 'titles deterministic per video');
  ok(p1.every(e => e.jp && e.jp.length >= 1), 'jp subtitles assigned');
  const p3 = ACP.makeSeasonPlan(600, 900, 'videoBBBBBBB');
  eq(p3.length, 1, 'short video single episode');
  eq(p3[0].dur, 600, 'single episode full length');
}

console.log('— misc —');
eq(ACP.daysBetween('2026-09-24', '2026-09-26'), 2, 'daysBetween');
ok(ACP.MISSIONS.length >= 8, 'mission pool size');
ok(ACP.ACH_DEFS.every(a => typeof a.test === 'function'), 'achievement tests callable');
ok(ACP.ACH_DEFS.every(a => !G_ach_dupe(ACP.ACH_DEFS, a)), 'achievement ids unique');
function G_ach_dupe(list, a){ return list.filter(x => x.id === a.id).length > 1; }

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
