'use strict';
/* ═══════════════════════════════════════════════════════════════
   ANIME CLASS PLAYER — ui.js (presentation layer)
   Renders everything the core engine emits through Hooks.
   ═══════════════════════════════════════════════════════════════ */

const $  = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
function el(tag, cls, html){
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
}
function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

/* ─────────────── SOUND EFFECTS (WebAudio, no assets) ─────────────── */
const sfx = (() => {
  let ctx = null;
  function ac(){
    if (!settings.sfx) return null;
    try{
      ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
      if (ctx.state === 'suspended') ctx.resume();
      return ctx;
    }catch(e){ return null; }
  }
  function tone(f, at, dur, type = 'triangle', g = 0.06, slide){
    const c = ac(); if (!c) return;
    const t = c.currentTime + at;
    const o = c.createOscillator(), v = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
    v.gain.setValueAtTime(0.0001, t);
    v.gain.exponentialRampToValueAtTime(g, t + 0.015);
    v.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(v); v.connect(c.destination);
    o.start(t); o.stop(t + dur + 0.05);
  }
  function noise(at, dur, g = 0.1){
    const c = ac(); if (!c) return;
    const t = c.currentTime + at;
    const b = c.createBuffer(1, Math.max(1, c.sampleRate * dur | 0), c.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random()*2-1) * (1 - i/d.length);
    const s = c.createBufferSource(); s.buffer = b;
    const v = c.createGain(); v.gain.value = g;
    s.connect(v); v.connect(c.destination); s.start(t);
  }
  return {
    clear(){ [523,659,784,1047].forEach((f,i)=>tone(f, i*.085, .22)); },
    victory(){ [392,523,659,784,1047].forEach((f,i)=>tone(f, i*.09, .25, 'square', .05)); noise(0,.15,.07); },
    finale(){ [523,659,784,1047,1319,1568].forEach((f,i)=>tone(f, i*.11, .3)); },
    hit(){ noise(0,.12,.13); tone(160,0,.12,'sawtooth',.08,60); },
    boss(){ tone(110,0,.5,'sawtooth',.06,80); tone(73,.2,.6,'sawtooth',.05,55); },
    xp(){ tone(880,0,.07,'sine',.05,1174); },
    ach(){ tone(659,0,.1); tone(988,.1,.16); },
    rankup(){ [440,554,659,880,1109].forEach((f,i)=>tone(f, i*.09, .3, 'square', .04)); },
    ready(){ tone(587,0,.09); tone(880,.1,.12); },
    play(){ tone(523,0,.05,'sine',.035); },
    pause(){ tone(392,0,.05,'sine',.035); },
  };
})();

/* ─────────────── TOASTS ─────────────── */
function toast(msg, opts = {}){
  const root = $('#toast-root');
  if (!root) return;
  while (root.children.length >= 5) root.firstChild.remove();
  const t = el('div', 'toast' + (opts.xp ? ' xp' : '') + (opts.ach ? ' ach' : '') + (opts.err ? ' err' : ''), `<span>${msg}</span>`);
  root.appendChild(t);
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 320); }, opts.ms || 3200);
}

/* ─────────────── CONFETTI ─────────────── */
const confettiFx = (() => {
  const cv = $('#fx-confetti');
  let parts = [], running = false, W = 0, H = 0, ctx = null;
  const COLORS = ['#ff3d81','#22d3ee','#ffd23e','#ffffff','#ff8a3d'];
  function size(){
    const r = cv.parentElement.getBoundingClientRect();
    W = cv.width = Math.max(50, r.width | 0);
    H = cv.height = Math.max(50, r.height | 0);
    ctx = cv.getContext('2d');
  }
  function burst(xf = 0.5, n = 110){
    try{ if (matchMedia('(prefers-reduced-motion: reduce)').matches) return; }catch(e){}
    size();
    for (let i = 0; i < n; i++){
      parts.push({ x: W*xf + (Math.random()-.5)*W*0.25, y: -20 - Math.random()*90,
        vx: (Math.random()-.5)*3.6, vy: 1.4 + Math.random()*3.2,
        s: 4 + Math.random()*6, c: COLORS[Math.random()*COLORS.length|0],
        r: Math.random()*Math.PI, vr: (Math.random()-.5)*.25, life: 1 });
    }
    if (!running){ running = true; requestAnimationFrame(step); }
  }
  function step(){
    ctx.clearRect(0, 0, W, H);
    parts = parts.filter(p => p.life > 0 && p.y < H + 40);
    for (const p of parts){
      p.x += p.vx; p.y += p.vy; p.vy += 0.045; p.r += p.vr; p.life -= 0.0042;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r);
      ctx.globalAlpha = Math.max(0, Math.min(1, p.life * 1.5));
      ctx.fillStyle = p.c;
      ctx.fillRect(-p.s/2, -p.s/2, p.s, p.s * 0.62);
      ctx.restore();
    }
    if (parts.length) requestAnimationFrame(step);
    else { running = false; ctx.clearRect(0, 0, W, H); }
  }
  return { burst };
})();
function confettiBurst(xf, n){ confettiFx.burst(xf, n); }

/* ─────────────── HOOK IMPLEMENTATIONS ─────────────── */
let loadErrWake = false;
let lastStart = null;

Object.assign(Hooks, {
  loadingStatus(t){ const e = $('#load-status'); if (e) e.textContent = t; },
  updateAll(){ renderScreens(); },
  loadError(stage, msg, opts = {}){
    loadErrWake = !!opts.wake;
    if (stage === 'home'){
      S.screen = 'home';
      renderScreens();
      const e = $('#home-error'); e.textContent = msg; e.hidden = false;
      return;
    }
    const e = $('#load-error-msg'); e.textContent = msg;
    $('#load-error').hidden = false;
    $('#load-status').textContent = '';
    const btn = $('#btn-load-retry');
    btn.textContent = loadErrWake ? 'WAKE THE PLAYER ⚔️' : 'RETRY';
    const yt = $('#load-error-yt');
    if (S.videoId){ yt.href = 'https://www.youtube.com/watch?v=' + encodeURIComponent(S.videoId); yt.hidden = false; }
    else yt.hidden = true;
  },
  seasonBuilt(){
    renderScreens();
    updateTopbar(false);
    const ep = S.episodes[S.current];
    updateBanner(ep);
    renderEpisodeList();
    renderRightPanel(ep);
    $('#time-dur').textContent = fmtClock(ep.dur);
    updateSeekUI(0, ep);
    overlaySync();
    updateUnderChips();
    pokeIdle();
  },
  episodeStarted(ep, resume){ onEpisodeStarted(ep, resume); },
  phaseChanged(){ if (S.phase === 'watch') $('#ov-intro').hidden = true; overlaySync(); },
  playingChanged(){
    overlaySync();
    if (S.playing){ nudgeReset(); sfx.play(); crystalSchedule(); }
    else { nudgeArm(); sfx.pause(); $('#player-shell').classList.remove('idle'); }
  },
  tick(rel, ep){ updateSeekUI(rel, ep); },
  episodeClear(c, ep, isFinal){ showClearScreen(c, ep, isFinal); },
  xpGained(n, reason, tally){
    updateTopbar(true);
    if (S.clear && tally && !$('#ov-clear').hidden) appendTally(n, reason);
    else if (!tally) toast(`<b>+${n} XP</b> — ${escapeHtml(reason||'')}`, { xp:true, ms: 2600 });
  },
  achievement(a){ toast(`🏆 Achievement unlocked — <b>${escapeHtml(a.name)}</b>`, { ach:true, ms: 4000 }); sfx.ach(); },
  rankUp(from, to){ showRankUp(to); },
  cancelClear(){ cancelBreakTimers(); boss = null; },
  watchTimeChanged(){ updateUnderChips(); },
  playerError(msg){ toast('⚠️ ' + escapeHtml(msg), { err:true, ms: 6000 }); },
});

/* ─────────────── SCREENS / TOPBAR ─────────────── */
function renderScreens(){
  $('#screen-home').classList.toggle('on', S.screen === 'home');
  $('#screen-loading').classList.toggle('on', S.screen === 'loading');
  $('#screen-player').classList.toggle('on', S.screen === 'player');
  document.body.classList.toggle('on-player', S.screen === 'player');
}

function updateTopbar(pulse){
  const r = rankInfo(G.xp);
  $('#rank-letter').textContent = r.key;
  $('#rank-fill').style.width = r.pct + '%';
  const x = $('#xp-text');
  x.textContent = `${(G.xp || 0).toLocaleString()} XP`;
  if (pulse){ x.classList.remove('pulse'); void x.offsetWidth; x.classList.add('pulse'); }
  $('#streak-num').textContent = G.streak.count || 0;
  const eps = (G.daily.day === todayStr()) ? G.daily.eps : 0;
  $('#daily-num').textContent = `${Math.min(eps,3)}/3`;
  $('#daily-chip').classList.toggle('done', !!(G.daily.claimed && G.daily.day === todayStr()));
  $('#daily-chip').title = G.daily.claimed && G.daily.day === todayStr()
    ? 'Daily quest complete!' : `Daily quest — clear 3 episodes today (${Math.min(eps,3)}/3)`;
}

function updateBanner(ep){
  if (!ep) return;
  $('#banner-jp').textContent = `第${kanjiNum(ep.i+1)}話`;
  $('#banner-num').textContent = `EPISODE ${ep.i+1}`;
  $('#banner-title').textContent = ep.title;
}

function updateUnderChips(){
  if (S.screen !== 'player') return;
  const cc = $('#combo-chip');
  cc.hidden = S.combo < 2;
  if (!cc.hidden) cc.innerHTML = `🔥 <b>COMBO ×${S.combo}</b>`;
  const un = $('#upnext-chip');
  const nx = S.episodes[S.current + 1];
  un.innerHTML = nx
    ? `⏭ <span>UP NEXT · EP ${nx.i+1} — <b>${escapeHtml(nx.title)}</b></span>`
    : `🏁 <span>LAST EPISODE OF THE SEASON</span>`;
  $('#today-chip').innerHTML = `📺 <span>Today ${fmtDur(G.watch[todayStr()] || 0)}</span>`;
  $('#crystal-chip').innerHTML = `💎 <span>${G.st.crystals || 0}</span>`;
  $('#crystal-chip').title = `Focus crystals caught (${G.st.crystals || 0})`;
}

/* ─────────────── HOME ─────────────── */
function renderHomeContinue(){
  const card = $('#continue-card');
  const vid = G.lastVideoId && loadVideo(G.lastVideoId);
  if (!vid || !vid.episodes || !vid.episodes.length){ card.hidden = true; return; }
  card.hidden = false;
  $('#continue-title').textContent = vid.title;
  const w = vid.episodes.filter(e => e.watched).length;
  const cur = Math.min((vid.lastEpIndex || 0) + 1, vid.episodes.length);
  $('#continue-sub').textContent =
    `Season 1 · ${vid.episodes.length} episodes · ${fmtDur(vid.duration)} · ${w} cleared — resume at episode ${cur}`;
}

function startFromHome(){
  if (S.screen === 'loading') return;
  const url = $('#input-url').value.trim();
  const eplen = $('#select-eplen').value;
  const cc = $('#chk-cc').checked;
  settings.eplen = eplen; settings.cc = cc; saveSettings();
  lastStart = { url, opts: { eplen, cc } };
  beginSeason(url, { eplen, cc });
}

/* ─────────────── PLAYER PANELS ─────────────── */
function renderEpisodeList(){
  if (!V) return;
  $('#season-title').textContent = V.title;
  $('#season-title').title = V.title;
  const total = S.episodes.length;
  const isOva = total === 1;
  $('#season-meta').textContent =
    `${total} episode${total > 1 ? 's' : ''} · ${fmtDur(S.duration)} total · ${Math.round(S.epLen/60)}-min episodes${isOva ? ' · OVA' : ''}`;
  const watched = S.episodes.filter(e => e.watched).length;
  $('#season-fill').style.width = (total ? watched/total*100 : 0) + '%';
  $('#season-pct').textContent = `${watched}/${total} watched`;
  const list = $('#episode-list');
  list.innerHTML = '';
  S.episodes.forEach(ep => {
    const resume = (!ep.watched && ep.lastPos > 30)
      ? `<span class="ep-resume">resume ${fmtClock(ep.lastPos)}</span>` : '';
    const card = el('div', 'ep-card' + (ep.i === S.current ? ' active' : '') + (ep.watched ? ' watched' : ''));
    card.dataset.i = ep.i;
    card.innerHTML =
      `<div class="ep-num">${String(ep.i+1).padStart(2,'0')}<span>話</span></div>
       <div class="ep-body">
         <div class="ep-title">${escapeHtml(ep.title)}</div>
         <div class="ep-sub"><span class="ep-dur">${fmtClock(ep.dur)}</span>${resume}</div>
         <div class="ep-bar"><i style="width:${ep.watched ? 100 : clamp((ep.lastPos||0)/ep.dur*100, 0, 100)}%"></i></div>
       </div>
       <div class="ep-badge">${ep.watched ? '✓' : (ep.i === S.current ? '▶' : '·')}</div>`;
    list.appendChild(card);
  });
}

function renderRightPanel(ep){
  const dqEps = (G.daily.day === todayStr()) ? G.daily.eps : 0;
  const dqDone = !!(G.daily.claimed && G.daily.day === todayStr());
  $('#dq-fill').style.width = Math.min(dqEps/3*100, 100) + '%';
  $('#dq-text').textContent = dqDone ? '✅ Daily quest complete — +75 XP claimed' : `Clear 3 episodes today — ${Math.min(dqEps,3)}/3`;
  $('#streak-big').textContent = `${G.streak.count || 0} ${G.streak.count === 1 ? 'day' : 'days'}`;
  if (!ep) return;
  $('#mission-ep').textContent = `EPISODE ${ep.i+1} · ${fmtClock(ep.dur)}`;
  $('#mission-text').textContent = ep.mission;
  $('#boss-prev-emoji').textContent = ep.boss.emoji;
  $('#boss-prev-name').textContent = ep.boss.name;
  $('#boss-prev-desc').textContent = ep.boss.desc;
  if (document.activeElement !== $('#notes-area')) $('#notes-area').value = ep.notes || '';
}

/* ─────────────── SEEK / TIME (the illusion) ─────────────── */
let seekDragging = false;

function updateSeekUI(rel, ep){
  if (seekDragging || !ep) return;
  if (S.phase === 'clear' || S.phase === 'finale') rel = ep.dur;
  else if (rel >= ep.dur - 0.5) rel = ep.dur;
  const pct = clamp(rel/ep.dur*100, 0, 100);
  $('#seek-fill').style.width = pct + '%';
  $('#seek-handle').style.left = pct + '%';
  $('#time-cur').textContent = fmtClock(rel);
}

function updateBuffer(){
  if (S.screen !== 'player' || !player || !playerReady) return;
  const ep = S.episodes[S.current]; if (!ep) return;
  let f = 0;
  try{ f = (player.getVideoLoadedFraction ? player.getVideoLoadedFraction() : 0) || 0; }catch(e){}
  const abs = f * S.duration;
  $('#seek-buffer').style.width = (clamp((abs - ep.start)/ep.dur, 0, 1) * 100) + '%';
}

function overlaySync(){
  const inWatch = (S.phase === 'idle' || S.phase === 'watch' || S.phase === 'intro');
  const showPause = inWatch && !S.playing && !S.buffering && S.screen === 'player';
  $('#ov-pause').hidden = !showPause;
  if (showPause){
    $('#pause-cap').textContent = S.phase === 'idle'
      ? `EPISODE ${Math.max(1, S.current+1)} — tap to begin`
      : 'PAUSED — press space to resume';
  }
  const bp = $('#btn-play');
  bp.textContent = S.playing ? '⏸' : '▶';
  bp.classList.toggle('playing', !!S.playing);
}

function hideAllOverlays(){
  ['#ov-intro','#ov-pause','#ov-nudge','#ov-clear','#ov-boss','#ov-finale'].forEach(s => { const e = $(s); if (e) e.hidden = true; });
}

/* idle cursor / controls auto-hide */
let idleT = null;
function pokeIdle(){
  const sh = $('#player-shell'); if (!sh) return;
  sh.classList.remove('idle');
  clearTimeout(idleT);
  idleT = setTimeout(() => {
    if (S.playing && (S.phase === 'watch' || S.phase === 'intro')) sh.classList.add('idle');
  }, 2600);
}

/* ─────────────── EPISODE START ─────────────── */
function onEpisodeStarted(ep, resume){
  hideAllOverlays();
  crystalReset(); nudgeReset();
  updateBanner(ep);
  renderEpisodeList();
  renderRightPanel(ep);
  $('#time-dur').textContent = fmtClock(ep.dur);
  updateSeekUI(resume || 0, ep);
  document.title = `Ep ${ep.i+1} · ${V ? V.title : 'Class'} — Anime Class Player`;
  $('#intro-jp').textContent = `第${kanjiNum(ep.i+1)}話`;
  $('#intro-num').textContent = `EPISODE ${ep.i+1}`;
  $('#intro-title').textContent = ep.title;
  $('#intro-mission').textContent = `📜 Mission: ${ep.mission}` + (resume > 5 ? ` — resuming at ${fmtClock(resume)}` : '');
  $('#ov-intro').hidden = false;
  overlaySync();
  updateUnderChips();
  pokeIdle();
}

/* ─────────────── EPISODE CLEAR SCREEN ─────────────── */
let breakRAF = null, breakTipT = null, autoNextT = null, autoNextEnd = 0, userAwake = true;

function cancelBreakTimers(){
  cancelAnimationFrame(breakRAF);
  clearInterval(breakTipT);
  clearInterval(autoNextT);
}

function addChkRow(list, id, label, sub, xp){
  const row = el('div', 'chk');
  row.dataset.id = id;
  row.innerHTML = `<div class="chk-box"></div>
    <div class="chk-label">${label}<small>${escapeHtml(sub)}</small></div>
    <div class="chk-xp">+${xp} XP</div>`;
  list.appendChild(row);
  return row;
}

function markChkDone(id){
  const row = $(`#clear-checklist .chk[data-id="${id}"]`);
  if (row && !row.classList.contains('done')){
    row.classList.add('done');
    const b = row.querySelector('.chk-box'); if (b) b.textContent = '✓';
  }
}

function appendTally(n, reason){
  const ul = $('#clear-tally');
  if (!ul || $('#ov-clear').hidden) return;
  ul.appendChild(el('li', null, `<span>${escapeHtml(reason)}</span><b>+${n} XP</b>`));
  while (ul.children.length > 8) ul.firstChild.remove();
}

const BREAK_TIPS = [
  '💧 Hydrate, warrior.',
  '🧘 Stretch those shoulders.',
  '👀 20-20-20: look at something far away.',
  '📵 Do NOT open social media — it resets your focus.',
  '🚶 Walk around a little.',
  '🧠 Let it sink in. Don\'t cram yet.',
];

function showClearScreen(c, ep, isFinal){
  hideAllOverlays();
  crystalReset(); nudgeReset();
  $('#ov-clear').hidden = false;
  $('#clear-ep').textContent = `EPISODE ${ep.i+1} — ${ep.title}`;
  const cb = $('#clear-combo');
  cb.hidden = S.combo < 2;
  cb.textContent = `🔥 COMBO ×${S.combo} — bonus +${Math.min((S.combo-1)*10,50)} XP`;

  const list = $('#clear-checklist'); list.innerHTML = '';
  addChkRow(list, 'mission', '📜 Mission complete', ep.mission, 30);
  addChkRow(list, 'boss', '👹 Boss defeated', `${ep.boss.name} — defeat it with ${ep.boss.weak.toLowerCase()}`, 50);
  addChkRow(list, 'water', '💧 Hydrated', 'A sip of water — the elixir of focus', 10);
  addChkRow(list, 'stretch', '🧘 Moved', 'Stand up, stretch, shake it out', 10);
  addChkRow(list, 'eyes', '👀 20-20-20', 'Eyes on something ~20 ft away for 20 seconds', 10);
  if (c.missionDone) markChkDone('mission');
  if (c.bossDone) markChkDone('boss');
  if (c.water) markChkDone('water');
  if (c.stretch) markChkDone('stretch');
  if (c.eyes) markChkDone('eyes');

  const ul = $('#clear-tally'); ul.innerHTML = '';
  c.tally.forEach(t => ul.appendChild(el('li', null, `<span>${escapeHtml(t.reason)}</span><b>+${t.n} XP</b>`)));

  const nb = $('#btn-next-ep');
  nb.textContent = isFinal ? 'FINISH SEASON 🏆' : 'NEXT EPISODE ▶';
  nb.dataset.base = nb.textContent;
  nb.classList.remove('ready');
  const bb = $('#btn-boss');
  bb.textContent = isFinal ? '👹 FINAL BOSS' : '👹 BOSS BATTLE';
  bb.classList.remove('won');

  renderEpisodeList();
  updateTopbar(false);
  updateUnderChips();
  startBreak(c);
  sfx.clear();
  confettiBurst(0.5, 110);
}

function startBreak(c){
  cancelBreakTimers();
  const arc = $('#break-arc'), tEl = $('#break-time');
  const C = 326.7, total = c.breakTotal;
  let tipI = 0;
  $('#break-tip').textContent = BREAK_TIPS[0];
  breakTipT = setInterval(() => {
    tipI = (tipI + 1) % BREAK_TIPS.length;
    $('#break-tip').textContent = BREAK_TIPS[tipI];
  }, 15000);
  const loop = () => {
    const remain = Math.max(0, c.breakEnds - Date.now());
    arc.style.strokeDashoffset = C * (1 - (remain/1000)/total);
    tEl.textContent = fmtClock(remain/1000);
    if (remain <= 0){ breakDone(); return; }
    breakRAF = requestAnimationFrame(loop);
  };
  loop();
}

function breakDone(){
  cancelAnimationFrame(breakRAF);
  if (S.clear) S.clear.breakDone = true;
  $('#break-time').textContent = '00:00';
  const btn = $('#btn-next-ep');
  btn.classList.add('ready');
  sfx.ready();
  if (settings.autonext && S.clear && S.clear.nextIndex >= 0) startAutoNext();
}

function startAutoNext(){
  userAwake = false;
  autoNextEnd = Date.now() + 5000;
  clearInterval(autoNextT);
  autoNextT = setInterval(() => {
    const btn = $('#btn-next-ep');
    if (userAwake || S.phase !== 'clear' || !S.clear){ clearInterval(autoNextT); if (btn.dataset.base) btn.textContent = btn.dataset.base; return; }
    const left = autoNextEnd - Date.now();
    if (left <= 0){ clearInterval(autoNextT); if (btn.dataset.base) btn.textContent = btn.dataset.base; startEpisode(S.clear.nextIndex); return; }
    btn.textContent = `${btn.dataset.base} · ${Math.ceil(left/1000)}s`;
  }, 200);
}

/* ─────────────── FINALE ─────────────── */
function showFinale(){
  S.phase = 'finale';
  cancelBreakTimers();
  hideAllOverlays();
  $('#ov-finale').hidden = false;
  const watched = S.episodes.filter(e => e.watched).length;
  $('#finale-stats').innerHTML =
    `<div class="fstat"><b>${S.episodes.length}</b><span>episodes</span></div>
     <div class="fstat"><b>${watched}</b><span>cleared</span></div>
     <div class="fstat"><b>${G.st.bossesDefeated}</b><span>bosses felled</span></div>
     <div class="fstat"><b>${fmtDur(G.st.totalWatchSec)}</b><span>watched all-time</span></div>
     <div class="fstat"><b>${rankInfo(G.xp).key}</b><span>rank</span></div>`;
  confettiBurst(0.3, 90); setTimeout(() => confettiBurst(0.6, 90), 700); setTimeout(() => confettiBurst(0.5, 90), 1400);
  sfx.finale();
  renderScreens();
}

/* ─────────────── BOSS BATTLE ─────────────── */
let boss = null, bossRAF = null;

function openBoss(){
  const ep = S.episodes[S.current];
  if (!ep || !S.clear || S.clear.bossDone) return;
  const b = ep.boss;
  boss = { hp: 3, endsAt: Date.now() + 30000, over: false, attacks: 0 };
  $('#boss-emoji').textContent = b.emoji;
  $('#boss-name').textContent = b.name.toUpperCase();
  $('#boss-sub').innerHTML = `Weakness: <b>${escapeHtml(b.weak)}</b> — type things you remember from this episode to attack!`;
  $('#ov-boss').hidden = false;
  $('#boss-verdict').hidden = true;
  $('#boss-verdict').classList.remove('fled');
  $('#boss-log').innerHTML = '';
  $('#boss-input').value = '';
  $$('#boss-hp i').forEach(s => s.classList.remove('dead'));
  sfx.boss();
  bossLoop();
  setTimeout(() => { try{ $('#boss-input').focus(); }catch(e){} }, 60);
}

function bossLoop(){
  cancelAnimationFrame(bossRAF);
  const fill = $('#boss-timer-fill');
  const step = () => {
    if (!boss || boss.over) return;
    const left = boss.endsAt - Date.now();
    fill.style.transform = `scaleX(${clamp(left/30000, 0, 1)})`;
    if (left <= 0){ bossEnd('timeout'); return; }
    bossRAF = requestAnimationFrame(step);
  };
  step();
}

function bossAttack(){
  if (!boss || boss.over) return;
  const inp = $('#boss-input');
  const txt = inp.value.trim();
  if (txt.length < 6){
    inp.classList.remove('shake-x'); void inp.offsetWidth; inp.classList.add('shake-x');
    inp.focus();
    toast('Write at least a few words — every attack must be a real memory! ⚔️', { ms: 2200 });
    return;
  }
  inp.value = '';
  boss.attacks++;
  boss.hp--;
  const b = S.episodes[S.current].boss;
  const em = $('#boss-emoji');
  em.classList.remove('hit'); void em.offsetWidth; em.classList.add('hit');
  const dmg = $('#boss-dmg');
  const f = el('div', 'dmg-float', '-1 HP');
  f.style.left = (30 + Math.random()*40) + '%';
  dmg.appendChild(f);
  setTimeout(() => f.remove(), 1000);
  const log = $('#boss-log');
  log.prepend(el('div', 'log-line', `⚔️ You strike with <b>${escapeHtml(b.weak)}</b> — “${escapeHtml(txt)}”`));
  while (log.children.length > 3) log.lastChild.remove();
  $$('#boss-hp i').forEach((s, i) => s.classList.toggle('dead', i >= boss.hp));
  sfx.hit();
  appendNote(`⚔️ recall: ${txt}`);
  if (boss.hp <= 0) bossEnd('win');
}

function bossEnd(kind){
  if (!boss || boss.over) return;
  boss.over = true;
  cancelAnimationFrame(bossRAF);
  const v = $('#boss-verdict'), c = S.clear;
  if (kind === 'win'){
    v.hidden = false;
    v.textContent = 'BOSS DEFEATED! 討伐成功';
    v.classList.remove('fled');
    c.bossDone = true;
    G.st.bossesDefeated++;
    awardXP(50, 'Boss defeated', true);
    markChkDone('boss');
    $('#btn-boss').classList.add('won');
    $('#btn-boss').textContent = '👹 BOSS DEFEATED ✓';
    sfx.victory();
    confettiBurst(0.7, 70);
    setTimeout(() => { $('#ov-boss').hidden = true; }, 1700);
  } else if (kind === 'timeout'){
    v.textContent = boss.attacks > 0 ? 'THE BOSS FLED — wounded!' : 'THE BOSS ESCAPED…';
    v.classList.add('fled');
    if (boss.attacks > 0) awardXP(15, 'Partial boss damage', true);
    setTimeout(() => { $('#ov-boss').hidden = true; }, 2000);
  } else {
    $('#ov-boss').hidden = true;
  }
  checkAchievements({});
  saveGlobal();
}

/* ─────────────── NUDGE (sleepy guard) ─────────────── */
let nudgeT = null;
function nudgeReset(){ clearTimeout(nudgeT); const n = $('#ov-nudge'); if (n) n.hidden = true; }
function nudgeArm(){
  if (!settings.guard) return;
  nudgeReset();
  nudgeT = setTimeout(() => {
    if (S.phase === 'watch' && !S.playing) $('#ov-nudge').hidden = false;
  }, 120000);
}

/* ─────────────── FOCUS CRYSTAL ─────────────── */
let crystalT = null, crystalOn = false, crystalHideT = null;
function crystalReset(){
  clearTimeout(crystalT); clearTimeout(crystalHideT);
  crystalT = null; crystalOn = false;
  const c = $('#focus-crystal');
  if (c){ c.hidden = true; c.classList.remove('dying'); }
}
function crystalSchedule(){
  if (!settings.crystal || crystalT || crystalOn) return;
  crystalT = setTimeout(spawnCrystal, 210000 + Math.random()*120000);
}
function spawnCrystal(){
  crystalT = null;
  if (S.phase !== 'watch' || !S.playing || !settings.crystal) return;
  crystalOn = true;
  const c = $('#focus-crystal');
  c.style.left = (8 + Math.random()*80) + '%';
  c.style.top = (12 + Math.random()*68) + '%';
  c.hidden = false;
  crystalHideT = setTimeout(despawnCrystal, 12000);
}
function despawnCrystal(){
  clearTimeout(crystalHideT);
  const c = $('#focus-crystal');
  if (!c || c.hidden){ crystalOn = false; return; }
  c.classList.add('dying');
  setTimeout(() => {
    c.hidden = true; c.classList.remove('dying'); crystalOn = false;
    if (S.phase === 'watch' && S.playing) crystalSchedule();
  }, 520);
}

/* ─────────────── RANK UP FX ─────────────── */
function showRankUp(to){
  $('#rankup-letter').textContent = to;
  const fx = $('#rankup-fx');
  fx.hidden = false;
  sfx.rankup();
  confettiBurst(0.5, 80);
  setTimeout(() => { fx.hidden = true; }, 2400);
}

/* ─────────────── MODALS ─────────────── */
function openModal(html){
  closeModal();
  const m = el('div', 'modal-mask', `<div class="modal">${html}</div>`);
  $('#modal-root').appendChild(m);
  m.addEventListener('click', e => { if (e.target === m) closeModal(); });
  return m;
}
function closeModal(){ const r = $('#modal-root'); if (r) r.innerHTML = ''; }

function openStats(){
  const r = rankInfo(G.xp);
  const today = G.watch[todayStr()] || 0;
  let sp = '';
  if (S.screen === 'player' && V){
    const w = S.episodes.filter(e => e.watched).length;
    sp = `<div class="season-progress-row">
            <div class="spr-label"><span>${escapeHtml(V.title)}</span><span>${w}/${S.episodes.length} episodes</span></div>
            <div class="spr-bar"><i style="width:${(w/S.episodes.length*100)|0}%"></i></div>
          </div>`;
  }
  openModal(`
    <div class="modal-head"><div class="modal-title">STATS<small>戦績</small></div><button class="modal-close">✕</button></div>
    ${sp}
    <div class="stats-grid">
      <div class="stat-card"><b>${r.key}</b><span>rank · ${r.name}</span></div>
      <div class="stat-card"><b>${(G.xp||0).toLocaleString()}</b><span>total XP</span></div>
      <div class="stat-card"><b>${G.st.episodesCleared}</b><span>episodes cleared</span></div>
      <div class="stat-card"><b>${G.st.bossesDefeated}</b><span>bosses felled</span></div>
      <div class="stat-card"><b>${G.st.seasonsCompleted}</b><span>seasons completed</span></div>
      <div class="stat-card"><b>${fmtDur(G.st.totalWatchSec)}</b><span>watched all-time</span></div>
      <div class="stat-card"><b>${fmtDur(today)}</b><span>watched today</span></div>
      <div class="stat-card"><b>×${G.st.bestCombo}</b><span>best combo</span></div>
      <div class="stat-card"><b>${G.st.missionsDone}</b><span>missions done</span></div>
      <div class="stat-card"><b>${G.st.crystals}</b><span>crystals caught</span></div>
      <div class="stat-card"><b>${G.streak.count}</b><span>day streak · best ${G.streak.best}</span></div>
      <div class="stat-card"><b>${Object.keys(G.ach).length}/${ACH_DEFS.length}</b><span>achievements</span></div>
    </div>`);
}

function openAch(){
  const grid = ACH_DEFS.map(a => {
    const un = G.ach[a.id];
    return `<div class="ach${un ? '' : ' locked'}">
      <div class="ach-icon">${a.icon}</div>
      <div><div class="ach-name">${a.name}</div>
      <div class="ach-desc">${un ? 'Unlocked ' + new Date(un).toLocaleDateString() : a.desc}</div></div>
    </div>`;
  }).join('');
  openModal(`
    <div class="modal-head"><div class="modal-title">ACHIEVEMENTS<small>称号 · ${Object.keys(G.ach).length}/${ACH_DEFS.length}</small></div><button class="modal-close">✕</button></div>
    <div class="ach-grid">${grid}</div>`);
}

function openSettings(){
  openModal(`
    <div class="modal-head"><div class="modal-title">SETTINGS<small>設定</small></div><button class="modal-close">✕</button></div>
    <div class="setting-row">
      <div><div class="sr-label">Default episode length</div><div class="sr-desc">Used for new seasons. Auto picks 15 min for videos under 30 minutes, 20 min otherwise.</div></div>
      <select id="set-eplen"><option value="auto">Auto</option><option value="15">15 min</option><option value="20">20 min</option></select>
    </div>
    <div class="setting-row">
      <div><div class="sr-label">Auto-play next episode</div><div class="sr-desc">When the 2-minute break ends, the next episode starts after a 5-second countdown (any click cancels it).</div></div>
      <label class="switch"><input type="checkbox" id="set-autonext"><i></i></label>
    </div>
    <div class="setting-row">
      <div><div class="sr-label">Sound effects</div><div class="sr-desc">Chiptune chimes for clears, boss hits and rank-ups.</div></div>
      <label class="switch"><input type="checkbox" id="set-sfx"><i></i></label>
    </div>
    <div class="setting-row">
      <div><div class="sr-label">Focus crystals</div><div class="sr-desc">A golden ⚡ occasionally appears over the video while you watch — catch it for bonus XP.</div></div>
      <label class="switch"><input type="checkbox" id="set-crystal"><i></i></label>
    </div>
    <div class="setting-row">
      <div><div class="sr-label">Sleepy guard</div><div class="sr-desc">If you pause and vanish for 2 minutes, a mascot comes to fetch you back.</div></div>
      <label class="switch"><input type="checkbox" id="set-guard"><i></i></label>
    </div>
    <div class="danger-zone">
      <div class="sr-label">Danger zone</div>
      <div class="sr-desc">Wipe all XP, ranks, streaks, achievements and season progress stored in this browser. No undo.</div>
      <button class="btn btn-ghost small" id="btn-reset-data">RESET ALL DATA</button>
    </div>`);
  $('#set-eplen').value = settings.eplen;
  $('#set-autonext').checked = !!settings.autonext;
  $('#set-sfx').checked = !!settings.sfx;
  $('#set-crystal').checked = !!settings.crystal;
  $('#set-guard').checked = !!settings.guard;
  $('#set-eplen').addEventListener('change', e => { settings.eplen = e.target.value; saveSettings(); });
  $('#set-autonext').addEventListener('change', e => { settings.autonext = e.target.checked; saveSettings(); });
  $('#set-sfx').addEventListener('change', e => { settings.sfx = e.target.checked; saveSettings(); });
  $('#set-crystal').addEventListener('change', e => { settings.crystal = e.target.checked; saveSettings(); if (!settings.crystal) crystalReset(); });
  $('#set-guard').addEventListener('change', e => { settings.guard = e.target.checked; saveSettings(); });
  const rb = $('#btn-reset-data');
  rb.addEventListener('click', () => {
    if (rb.dataset.armed){
      try{
        Object.keys(localStorage).filter(k => k.indexOf('ACP.') === 0).forEach(k => localStorage.removeItem(k));
      }catch(e){}
      location.reload();
    } else {
      rb.dataset.armed = '1';
      rb.textContent = 'CLICK AGAIN TO CONFIRM';
      setTimeout(() => { if (rb.isConnected){ delete rb.dataset.armed; rb.textContent = 'RESET ALL DATA'; } }, 3000);
    }
  });
}

function openHelp(){
  openModal(`
    <div class="modal-head"><div class="modal-title">HELP<small>ヘルプ</small></div><button class="modal-close">✕</button></div>
    <div class="help-sec">HOW THE ILLUSION WORKS</div>
    <div class="help-p">Paste any YouTube link and the app auto-splits it into <b>15–20 minute episodes</b>. The player only ever shows the current episode's clock and progress bar — never the full video length. Nothing is downloaded or cut: it's the same stream, wearing an anime costume.</div>
    <div class="help-sec">SHORTCUTS</div>
    <div class="help-keys">
      <div class="key-row"><kbd>Space</kbd> / <kbd>K</kbd> play / pause</div>
      <div class="key-row"><kbd>←</kbd> / <kbd>→</kbd> ±10 seconds</div>
      <div class="key-row"><kbd>↑</kbd> / <kbd>↓</kbd> volume</div>
      <div class="key-row"><kbd>N</kbd> / <kbd>P</kbd> next / previous episode</div>
      <div class="key-row"><kbd>F</kbd> fullscreen</div>
      <div class="key-row"><kbd>M</kbd> mute</div>
      <div class="key-row"><kbd>?</kbd> this panel</div>
      <div class="key-row"><kbd>Esc</kbd> close panels</div>
    </div>
    <div class="help-sec">STUDY TIPS</div>
    <div class="help-p">• The boss battle is <b>active recall</b> — the most evidence-backed study technique, disguised as combat.<br>
    • Missions force you to process, not just consume.<br>
    • The 2-minute break matters: your brain consolidates during breaks. Water. Stretch. Eyes off screen.<br>
    • Some videos can't be embedded (uploader disabled it / age-restricted) — try another link if that happens.</div>
    <div class="help-sec">PRIVACY</div>
    <div class="help-p">Everything (XP, notes, progress) lives in your browser's local storage. No accounts, no servers, no tracking.</div>`);
}

/* ─────────────── NAV ─────────────── */
function goHome(){
  cancelBreakTimers();
  boss = null;
  crystalReset(); nudgeReset();
  hideAllOverlays();
  destroyPlayer();
  S = freshS();
  renderScreens();
  renderHomeContinue();
  updateTopbar(false);
  document.title = 'Anime Class Player — turn boring lectures into anime seasons';
}

function uiNext(){
  if (S.phase === 'clear' && S.clear){
    if (S.clear.nextIndex >= 0) startEpisode(S.clear.nextIndex);
    else showFinale();
    return;
  }
  if (S.current < S.episodes.length - 1) startEpisode(S.current + 1);
  else toast('This is the last episode! 🏁');
}
function uiPrev(){
  if (S.current > 0) startEpisode(S.current - 1);
  else toast('Episode 1 — where the legend begins. 🌱');
}
function nudgeSkip(d){
  if (S.phase !== 'watch' && S.phase !== 'intro') return;
  seekRel(relNow() + d);
}

/* ─────────────── NOTES ─────────────── */
let notesT = null;
function appendNote(txt){
  const ep = S.episodes[S.current]; if (!ep) return;
  ep.notes = (ep.notes ? ep.notes + '\n' : '') + txt;
  if (document.activeElement !== $('#notes-area')) $('#notes-area').value = ep.notes;
  saveVideo(S.videoId, V);
}

/* ─────────────── WIRING ─────────────── */
function applyPanels(){
  document.body.classList.toggle('lc', !!settings.lc);
  document.body.classList.toggle('rc', !!settings.rc);
}

function toggleFullscreen(){
  const sh = $('#player-shell');
  try{
    if (document.fullscreenElement){ document.exitFullscreen(); }
    else if (sh.requestFullscreen){ sh.requestFullscreen().catch(() => toast('Fullscreen was blocked in this view. 😕', { err:true })); }
  }catch(e){ toast('Fullscreen was blocked in this view. 😕', { err:true }); }
}

const SPEEDS = [0.75, 1, 1.25, 1.5, 1.75, 2];
function buildSpeedPop(){
  const pop = $('#speed-pop');
  pop.innerHTML = '';
  SPEEDS.forEach(r => {
    const b = el('button', 'sp-opt', r + '×');
    b.dataset.r = r;
    b.addEventListener('click', () => {
      setRate(r);
      $('#speed-label').textContent = r + '×';
      markSpeedPop();
      closePops();
    });
    pop.appendChild(b);
  });
  markSpeedPop();
}
function markSpeedPop(){
  $$('#speed-pop .sp-opt').forEach(b => b.classList.toggle('cur', +b.dataset.r === +(settings.rate || 1)));
}
function closePops(){
  $('#speed-pop').hidden = true;
  $('#vol-pop').hidden = true;
}
function syncVolUI(){
  $('#vol-range').value = settings.vol;
  $('#btn-volume').textContent = (S.muted || settings.vol === 0) ? '🔇' : (settings.vol < 50 ? '🔉' : '🔊');
}

function wireAll(){
  /* topbar */
  $('#btn-stats').addEventListener('click', openStats);
  $('#btn-ach').addEventListener('click', openAch);
  $('#btn-settings').addEventListener('click', openSettings);
  $('#btn-help').addEventListener('click', openHelp);
  $('#btn-home').addEventListener('click', goHome);
  $('#logo').addEventListener('click', () => { if (S.screen === 'player') goHome(); });
  $('#btn-panel-left').addEventListener('click', () => { settings.lc = !settings.lc; saveSettings(); applyPanels(); });
  $('#btn-panel-right').addEventListener('click', () => { settings.rc = !settings.rc; saveSettings(); applyPanels(); });
  $('#modal-root').addEventListener('click', e => { if (e.target.closest('.modal-close')) closeModal(); });

  /* home */
  $('#btn-start').addEventListener('click', startFromHome);
  $('#input-url').addEventListener('keydown', e => { if (e.key === 'Enter'){ e.preventDefault(); startFromHome(); } });
  $('#input-url').addEventListener('input', () => { $('#home-error').hidden = true; });
  $('#btn-continue').addEventListener('click', () => { if (G.lastVideoId) beginSeason('', { videoId: G.lastVideoId }); });

  /* loading */
  $('#btn-load-retry').addEventListener('click', () => {
    $('#load-error').hidden = true;
    if (loadErrWake){ retryWake(); return; }
    destroyPlayer();
    S.screen = 'home';              // clear the stale loading state so a retry can actually run
    renderScreens();
    if (lastStart) beginSeason(lastStart.url, lastStart.opts);
    else goHome();
  });
  $('#btn-load-home').addEventListener('click', goHome);

  /* episode list */
  $('#episode-list').addEventListener('click', e => {
    const card = e.target.closest('.ep-card'); if (!card) return;
    const i = +card.dataset.i;
    if (i === S.current && (S.phase === 'watch' || S.phase === 'intro')){ togglePlay(); return; }
    startEpisode(i, resumeFor(i));
  });

  /* video area */
  let clickT = null;
  const catcher = $('#click-catcher');
  catcher.addEventListener('click', () => {
    clearTimeout(clickT);
    clickT = setTimeout(() => togglePlay(), 240);
  });
  catcher.addEventListener('dblclick', () => { clearTimeout(clickT); toggleFullscreen(); });
  $('#ov-pause').addEventListener('click', () => togglePlay());
  $('#ov-intro').addEventListener('click', () => { if (S.phase === 'intro'){ S.phase = 'watch'; Hooks.phaseChanged(); } });
  $('#btn-nudge-back').addEventListener('click', () => { nudgeReset(); togglePlay(); });
  $('#focus-crystal').addEventListener('click', e => {
    e.stopPropagation();
    if (!crystalOn) return;
    G.st.crystals++;
    awardXP(5, 'Focus crystal');
    sfx.xp();
    confettiBurst(0.5, 14);
    checkAchievements({});
    despawnCrystal();
  });
  ['pointermove', 'pointerdown'].forEach(ev => document.addEventListener(ev, pokeIdle, { passive: true }));

  /* controls */
  $('#btn-play').addEventListener('click', togglePlay);
  $('#btn-prev').addEventListener('click', uiPrev);
  $('#btn-next').addEventListener('click', uiNext);
  $('#btn-back10').addEventListener('click', () => nudgeSkip(-10));
  $('#btn-fwd10').addEventListener('click', () => nudgeSkip(10));
  $('#btn-fullscreen').addEventListener('click', toggleFullscreen);
  $('#btn-speed').addEventListener('click', e => { e.stopPropagation(); const p = $('#speed-pop'); const v = $('#vol-pop'); v.hidden = true; p.hidden = !p.hidden; });
  $('#btn-volume').addEventListener('click', e => { e.stopPropagation(); const p = $('#vol-pop'); const s = $('#speed-pop'); s.hidden = true; p.hidden = !p.hidden; });
  $('#vol-range').addEventListener('input', e => { setVolume(+e.target.value); S.muted = false; syncVolUI(); });
  document.addEventListener('pointerdown', e => {
    if (!e.target.closest('.pop-wrap')) closePops();
    userAwake = true;
  });

  /* seek bar */
  const seek = $('#seek');
  const seekFrac = e => { const r = seek.getBoundingClientRect(); return clamp((e.clientX - r.left)/r.width, 0, 1); };
  const showTip = e => {
    const ep = S.episodes[S.current]; if (!ep) return;
    const f = seekFrac(e);
    const tip = $('#seek-tip');
    tip.hidden = false;
    tip.style.left = (f * 100) + '%';
    tip.textContent = fmtClock(f * ep.dur);
  };
  seek.addEventListener('pointerenter', e => { if (!seekDragging) showTip(e); });
  seek.addEventListener('pointerleave', () => { if (!seekDragging) $('#seek-tip').hidden = true; });
  seek.addEventListener('pointerdown', e => {
    if (S.phase !== 'watch' && S.phase !== 'intro') return;
    seekDragging = true;
    seek.classList.add('dragging');
    seek.setPointerCapture(e.pointerId);
    showTip(e);
  });
  seek.addEventListener('pointermove', e => { if (seekDragging) showTip(e); });
  seek.addEventListener('pointerup', e => {
    if (!seekDragging) return;
    seekDragging = false;
    seek.classList.remove('dragging');
    const ep = S.episodes[S.current];
    if (ep) seekRel(seekFrac(e) * ep.dur);
    if (!seek.matches(':hover')) $('#seek-tip').hidden = true;
  });
  seek.addEventListener('pointercancel', () => { seekDragging = false; seek.classList.remove('dragging'); $('#seek-tip').hidden = true; });

  /* clear screen */
  $('#clear-checklist').addEventListener('click', e => {
    const row = e.target.closest('.chk'); if (!row) return;
    const id = row.dataset.id;
    const c = S.clear; if (!c) return;
    if (id === 'boss'){ if (!c.bossDone) openBoss(); return; }
    if (row.classList.contains('done')) return;
    row.classList.add('done');
    const box = row.querySelector('.chk-box'); if (box) box.textContent = '✓';
    if (id === 'mission'){ c.missionDone = true; G.st.missionsDone++; awardXP(30, 'Mission complete', true); checkAchievements({}); }
    else if (id === 'water'){ c.water = true; G.st.waterChecks++; awardXP(10, 'Hydrated', true); checkAchievements({}); }
    else if (id === 'stretch'){ c.stretch = true; awardXP(10, 'Stretched', true); }
    else if (id === 'eyes'){ c.eyes = true; awardXP(10, 'Eyes rested', true); }
    sfx.xp();
  });
  $('#btn-boss').addEventListener('click', () => { if (S.clear && !S.clear.bossDone) openBoss(); });
  $('#btn-next-ep').addEventListener('click', () => {
    const c = S.clear; if (!c) return;
    if (c.nextIndex >= 0) startEpisode(c.nextIndex);
    else showFinale();
  });
  $('#btn-replay').addEventListener('click', () => startEpisode(S.clear ? S.clear.epIndex : S.current));

  /* boss */
  $('#btn-boss-attack').addEventListener('click', bossAttack);
  $('#boss-input').addEventListener('keydown', e => { if (e.key === 'Enter'){ e.preventDefault(); bossAttack(); } });
  $('#btn-boss-flee').addEventListener('click', () => bossEnd('flee'));

  /* finale */
  $('#btn-new-season').addEventListener('click', goHome);
  $('#btn-replay-season').addEventListener('click', () => {
    S.episodes.forEach(e2 => { e2.watched = false; e2.lastPos = 0; });
    saveVideo(S.videoId, V);
    startEpisode(0);
  });

  /* notes */
  $('#notes-area').addEventListener('input', () => {
    clearTimeout(notesT);
    notesT = setTimeout(() => {
      const ep = S.episodes[S.current]; if (!ep) return;
      ep.notes = $('#notes-area').value;
      saveVideo(S.videoId, V);
    }, 500);
  });

  /* keyboard */
  document.addEventListener('keydown', e => {
    if (e.target && e.target.matches && e.target.matches('input, textarea, select, [contenteditable]')) return;
    if (e.key === 'Escape'){ closePops(); closeModal(); return; }
    if (document.querySelector('.modal-mask')) return;
    if (e.key === '?'){ openHelp(); return; }
    if (S.screen !== 'player') return;
    switch (e.key){
      case ' ': case 'k': case 'K': e.preventDefault(); togglePlay(); break;
      case 'ArrowLeft':  e.preventDefault(); nudgeSkip(-10); break;
      case 'ArrowRight': e.preventDefault(); nudgeSkip(10); break;
      case 'ArrowUp':    e.preventDefault(); setVolume(settings.vol + 5); syncVolUI(); break;
      case 'ArrowDown':  e.preventDefault(); setVolume(settings.vol - 5); syncVolUI(); break;
      case 'm': case 'M': toggleMute(); syncVolUI(); break;
      case 'f': case 'F': toggleFullscreen(); break;
      case 'n': case 'N': uiNext(); break;
      case 'p': case 'P': uiPrev(); break;
    }
  });
}

/* ─────────────── BOOT ─────────────── */
function boot(){
  if (!$('#app')) return;
  loadSettings();
  loadGlobal();
  applyPanels();
  renderScreens();
  updateTopbar(false);
  renderHomeContinue();
  buildSpeedPop();
  syncVolUI();
  wireAll();
  setInterval(tick, 250);
  setInterval(updateBuffer, 1000);
  document.addEventListener('fullscreenchange', pokeIdle);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) pokeIdle(); });
}
if (typeof document !== 'undefined' && document.getElementById('app')){
  boot();
}
