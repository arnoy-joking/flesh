'use strict';
/* ═══════════════════════════════════════════════════════════════
   ANIME CLASS PLAYER — app.js (core engine)
   Pure logic (testable in Node) + YouTube wrapper + season flow.
   All DOM-heavy rendering lives in ui.js and talks back via Hooks.
   ═══════════════════════════════════════════════════════════════ */

/* ────────────────────────── PURE LOGIC ────────────────────────── */

const RANKS = [
  { k:'E',   t:0,     name:'Cadet'    },
  { k:'D',   t:300,   name:'Apprentice'},
  { k:'C',   t:800,   name:'Fighter'  },
  { k:'B',   t:1600,  name:'Elite'    },
  { k:'A',   t:3000,  name:'Ace'      },
  { k:'S',   t:5000,  name:'Hero'     },
  { k:'SS',  t:8000,  name:'Legend'   },
  { k:'SSS', t:12000, name:'Mythic'   },
];

const TITLE_A = ["The","A","Our","That","One","The Secret","The Final","The Legendary","The Forbidden","The Great","The Lost","The Hidden","The Silent","The Midnight","The Ultimate","A Certain"];
const TITLE_B = ["Journey Begins","Lecture Arc","Note-Taking Technique","Formula Spirit","Midterm Prophecy","Professor's Gambit","Silent Library","All-Nighter Protocol","Focus Unleashed","Chapter Zero","Reference Request","Rival Appears","Curse of the Blank Page","Breakthrough","Confusing Slide","Second Wind","True Potential","Study Spirit","Deadline Approaches","War Council","Memory Palace","Last Boss Energy","Deep Focus","Zero Motivation","Revenge of Revision","Dawn of Understanding","Whisper of Insight","Trial of the Whiteboard","Oath of the Highlighter","Sacred Syllabus","Return of the Snacks","Bonds of the Study Group","Awakening","Climax Approach","Beyond the Bell","Plot Twist","Moment of Truth","Hidden Lesson","Speedrun Mindset","Wall of Text"];

const JP_SUBS = ["序章","開眼","集中","覚醒","修行","逆転","決戦","友情","努力","勝利","宿題","試験","休憩","閃き","根性","博識","絆","突破","疾風","不屈"];

const MISSIONS = [
  "Slay 3 key terms — write down any 3 terms, names or formulas the teacher uses.",
  "Treasure hunt: catch ONE thing that smells like an exam question. Note it.",
  "Timestamp the most confusing moment. Future-you will thank present-you.",
  "Write the episode's core idea in ONE sentence. No cheating with two.",
  "Doodle it: one tiny diagram, arrow-map or sketch from this episode.",
  "Whenever the teacher says “remember this” or “this is important” — write what follows.",
  "Predict the next episode. One line. Seal it in your notes like a prophecy.",
  "Link one idea from this episode to something you already know.",
  "Collector's duty: note every formula, date or definition that appears.",
  "Pick one thing you could explain to a friend in 30 seconds. Mark it.",
];

const BOSSES = [
  { name:"The Forgetting Curve", emoji:"👹", weak:"ACTIVE RECALL",  desc:"It eats unreviewed knowledge. Type what you remember to wound it." },
  { name:"Lord Zzz",             emoji:"💤", weak:"MOMENTUM",        desc:"It whispers “just pause it”. Strike back with what you learned!" },
  { name:"Sir Procrastination",  emoji:"🦥", weak:"STARTING NOW",    desc:"Only defeatable by those who act. Recall something!" },
  { name:"Doubt Demon",          emoji:"😈", weak:"CONFIDENCE",      desc:"Feeds on “I'm not getting this”. Prove it wrong." },
  { name:"The Scroll Eater",     emoji:"🐉", weak:"NOTES",           desc:"Guards the library. Only notes-based attacks hurt it." },
  { name:"Professor Overload",   emoji:"🧠", weak:"SIMPLICITY",      desc:"Casts Wall of Information. Counter with a simple summary." },
];
const FINALE_BOSS = { name:"The Semester Demon", emoji:"👺", weak:"EVERYTHING YOU LEARNED", desc:"Final boss of the season. Unleash everything you remember!" };

const ACH_DEFS = [
  { id:'first_ep',   icon:'🌱', name:'The Journey Begins', desc:'Clear your first episode',              test:c=>c.st.episodesCleared>=1 },
  { id:'boss1',      icon:'🗡️', name:'Boss Slayer',        desc:'Defeat your first boss',                test:c=>c.st.bossesDefeated>=1 },
  { id:'boss10',     icon:'💀', name:'Boss Hunter',        desc:'Defeat 10 bosses',                      test:c=>c.st.bossesDefeated>=10 },
  { id:'combo3',     icon:'🔥', name:'On a Roll',          desc:'Reach a ×3 combo',                      test:c=>c.st.bestCombo>=3 },
  { id:'combo5',     icon:'☄️', name:'Unstoppable',        desc:'Reach a ×5 combo',                      test:c=>c.st.bestCombo>=5 },
  { id:'day5',       icon:'🏃', name:'Marathon Arc',       desc:'Clear 5 episodes in one day',           test:c=>c.dailyEps>=5 },
  { id:'day10',      icon:'📺', name:'The Binger',         desc:'Clear 10 episodes in one day',          test:c=>c.dailyEps>=10 },
  { id:'season',     icon:'🏆', name:'Season Finale',      desc:'Complete a full season',                test:c=>c.st.seasonsCompleted>=1 },
  { id:'notes10',    icon:'📜', name:'Scroll Keeper',      desc:'Complete 10 missions',                  test:c=>c.st.missionsDone>=10 },
  { id:'speed',      icon:'⚡', name:'Speed Demon',        desc:'Clear an episode at 1.5× or faster',    test:c=>c.flagSpeed },
  { id:'crystal10',  icon:'💎', name:'Crystal Hoarder',    desc:'Catch 10 focus crystals',               test:c=>c.st.crystals>=10 },
  { id:'hydrate10',  icon:'💧', name:'Hydration Station',  desc:'Claim the water checkbox 10 times',     test:c=>c.st.waterChecks>=10 },
  { id:'rank_b',     icon:'🥉', name:'Rank B',             desc:'Reach Rank B',                          test:c=>c.rankIdx>=3 },
  { id:'rank_s',     icon:'🥇', name:'Rank S',             desc:'Reach Rank S',                          test:c=>c.rankIdx>=5 },
  { id:'night',      icon:'🦉', name:'Night Owl',          desc:'Clear an episode between midnight and 4 AM', test:c=>c.flagNight },
  { id:'comeback',   icon:'🌅', name:'Comeback Kid',       desc:'Return after 2+ days away',             test:c=>c.st.comeback },
];

function clamp(n, a, b){ n = +n; if (isNaN(n)) n = a; return Math.min(b, Math.max(a, n)); }

function hashStr(s){
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++){ h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function mulberry32(seed){
  let a = seed >>> 0;
  return function(){
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const KJ = ['','一','二','三','四','五','六','七','八','九'];
function kanjiNum(n){
  n = Math.round(+n);
  if (!Number.isFinite(n) || n < 1 || n >= 100) return String(n);
  if (n < 10) return KJ[n];
  const t = Math.floor(n/10), o = n % 10;
  return (t > 1 ? KJ[t] : '') + '十' + (o ? KJ[o] : '');
}

/* mm:ss, or h:mm:ss when >= 1h or forceH */
function fmtClock(sec, forceH){
  sec = Math.max(0, Math.floor(+sec || 0));
  const h = Math.floor(sec/3600), m = Math.floor((sec%3600)/60), s = sec%60;
  const mm = String(m).padStart(2,'0'), ss = String(s).padStart(2,'0');
  return (h > 0 || forceH) ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/* human duration: "6h 40m" */
function fmtDur(sec){
  sec = Math.max(0, Math.round(+sec || 0));
  const h = Math.floor(sec/3600), m = Math.round((sec%3600)/60);
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
}

function parseYouTubeId(input){
  if (!input || typeof input !== 'string') return null;
  const s = input.trim();
  if (/^[\w-]{11}$/.test(s)) return s;
  try {
    const u = new URL(s);
    const host = u.hostname.replace(/^www\.|^m\./,'');
    if (host === 'youtu.be') return (u.pathname.slice(1).split('/')[0]) || null;
    if (host === 'youtube.com' || host === 'youtube-nocookie.com' || host === 'music.youtube.com'){
      if (u.pathname === '/watch') return u.searchParams.get('v');
      const m = u.pathname.match(/^\/(embed|shorts|live|v)\/([^/?#]+)/);
      if (m) return m[2];
    }
  } catch(e){ /* not a URL */ }
  return null;
}

/* Split any duration into episodes. Tiny tails (< minTail) merge into the previous episode. */
function splitEpisodes(duration, epLenSec, minTail = 90){
  const eps = [];
  if (!(duration > 0) || !(epLenSec > 0)) return eps;
  let count = Math.ceil(duration / epLenSec);
  if (count < 1) count = 1;
  for (let i = 0; i < count; i++){
    const start = i * epLenSec;
    const dur = Math.min(epLenSec, duration - start);
    if (dur <= 0) break;
    eps.push({ i, start, dur });
  }
  const n = eps.length;
  if (n >= 2 && eps[n-1].dur < Math.min(minTail, epLenSec)){
    eps[n-2].dur += eps[n-1].dur;
    eps.pop();
  }
  return eps;
}

function autoEpLen(duration){ return (duration <= 1800) ? 15*60 : 20*60; }
function pickEpLen(choice, duration){
  if (choice === '15') return 15*60;
  if (choice === '20') return 20*60;
  return autoEpLen(duration);
}

/* Deterministic per-video season plan: titles, missions, bosses */
function makeSeasonPlan(duration, epLenSec, videoId){
  const parts = splitEpisodes(duration, epLenSec);
  const last = parts.length - 1;
  return parts.map((p, idx) => {
    const rng = mulberry32(hashStr(videoId + '#' + idx));
    const isFinal = idx === last && parts.length > 1;
    let title;
    if (idx === 0 && parts.length > 1) title = 'The Journey Begins';
    else if (isFinal) title = 'The Final Review';
    else title = TITLE_A[rng()*TITLE_A.length|0] + ' ' + TITLE_B[rng()*TITLE_B.length|0];
    const jp = JP_SUBS[rng()*JP_SUBS.length|0];
    const mission = MISSIONS[rng()*MISSIONS.length|0];
    const boss = isFinal ? FINALE_BOSS : BOSSES[rng()*BOSSES.length|0];
    return { i: idx, start: p.start, dur: p.dur, title, jp, mission, boss, watched:false, lastPos:0, notes:'' };
  });
}

function rankInfo(xp){
  xp = Math.max(0, +xp || 0);
  let idx = 0;
  for (let i = 0; i < RANKS.length; i++) if (xp >= RANKS[i].t) idx = i;
  const cur = RANKS[idx], next = RANKS[idx+1] || null;
  const into = next ? xp - cur.t : 0;
  const need = next ? next.t - cur.t : 1;
  return { idx, key: cur.k, name: cur.name, next: next ? next.k : null, nextAt: next ? next.t : null,
           pct: next ? Math.min(100, Math.round(into/need*100)) : 100 };
}

function daysBetween(a, b){
  const [ay,am,ad] = a.split('-').map(Number), [by,bm,bd] = b.split('-').map(Number);
  return Math.round((Date.UTC(by,bm-1,bd) - Date.UTC(ay,am-1,ad)) / 86400000);
}

const ACP = { clamp, hashStr, mulberry32, kanjiNum, fmtClock, fmtDur, parseYouTubeId, splitEpisodes,
  autoEpLen, pickEpLen, makeSeasonPlan, rankInfo, daysBetween, RANKS, TITLE_A, TITLE_B, JP_SUBS,
  MISSIONS, BOSSES, FINALE_BOSS, ACH_DEFS };

/* ────────────────────────── STATE ────────────────────────── */

const DEFAULT_SETTINGS = { eplen:'auto', autonext:true, sfx:true, crystal:true, guard:true, cc:false, vol:85, rate:1, lc:false, rc:false };
let settings = { ...DEFAULT_SETTINGS };

const K_SET = 'ACP.set', K_G = 'ACP.g';
const vKey = id => 'ACP.v.' + id;

function freshG(){
  return { v:1, xp:0,
    st:{ episodesCleared:0, bossesDefeated:0, missionsDone:0, waterChecks:0, crystals:0, bestCombo:0,
         seasonsCompleted:0, totalWatchSec:0, comeback:false },
    streak:{ last:'', count:0, best:0 },
    daily:{ day:'', eps:0, claimed:false },
    ach:{}, watch:{}, lastVideoId:null };
}
let G = freshG();

function freshS(){
  return {
    screen:'home',          // home | loading | player
    phase:'idle',           // idle | intro | watch | clear | finale
    videoId:null, url:'', duration:0, epLen:0,
    episodes:[], current:-1,
    playing:false, buffering:false, muted:false,
    combo:0, lastClearAt:0,
    clear:null,
    _lastT:null, watchAccum:0, _lastOpts:null,
  };
}
let S = freshS();
let V = null;               // persisted state of the current video/season
let player = null, playerReady = false;
let lastYTError = null;

const Hooks = {
  loadingStatus(){}, updateAll(){}, seasonBuilt(){}, loadError(){},
  episodeStarted(){}, phaseChanged(){}, tick(){}, playingChanged(){},
  episodeClear(){}, xpGained(){}, achievement(){}, rankUp(){},
  cancelClear(){}, watchTimeChanged(){}, playerError(){},
};

/* ────────────────────────── PERSISTENCE ────────────────────────── */

const sleep = ms => new Promise(r => setTimeout(r, ms));

function lsGet(k){ try{ return (typeof localStorage !== 'undefined') ? localStorage.getItem(k) : null; }catch(e){ return null; } }
function lsSet(k, v){ try{ if (typeof localStorage !== 'undefined') localStorage.setItem(k, v); }catch(e){} }

function loadSettings(){
  try{ Object.assign(settings, JSON.parse(lsGet(K_SET) || '{}')); }catch(e){}
}
function saveSettings(){ lsSet(K_SET, JSON.stringify(settings)); }

function loadGlobal(){
  let raw = null; try{ raw = JSON.parse(lsGet(K_G) || 'null'); }catch(e){}
  if (!raw || typeof raw !== 'object') return;
  const f = freshG();
  G = { ...f, ...raw,
    st:     { ...f.st,     ...(raw.st||{}) },
    streak: { ...f.streak, ...(raw.streak||{}) },
    daily:  { ...f.daily,  ...(raw.daily||{}) },
    ach:    raw.ach && typeof raw.ach === 'object' ? raw.ach : {},
    watch:  raw.watch && typeof raw.watch === 'object' ? raw.watch : {},
  };
}
function saveGlobal(){ lsSet(K_G, JSON.stringify(G)); }

function loadVideo(id){
  if (!id) return null;
  try{ const v = JSON.parse(lsGet(vKey(id)) || 'null'); return (v && typeof v === 'object') ? v : null; }catch(e){ return null; }
}
function saveVideo(id, v){ if (id && v) lsSet(vKey(id), JSON.stringify(v)); }

function todayStr(d = new Date()){
  const p = n => String(n).padStart(2,'0');
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`;
}
function pruneWatch(){
  const days = Object.keys(G.watch).sort();
  while (days.length > 120) delete G.watch[days.shift()];
}

/* ────────────────────────── YOUTUBE WRAPPER ────────────────────────── */

function networkHint(){
  return "Couldn't load the YouTube player. This usually means the page environment blocked it — a sandboxed preview (use the live server link instead), a strict extension, or a connection hiccup. Note: the app must be opened from a web address (http/https), not straight from disk.";
}
function mapYTError(c){
  if (c === 2)   return "YouTube says this video ID is invalid — double-check the link.";
  if (c === 5)   return "Playback error — try reloading.";
  if (c === 100) return "This video is private or doesn't exist anymore.";
  if (c === 101 || c === 150) return "This video can't be embedded (the uploader disabled it, or it's age-restricted). Try a different link.";
  if (c === 153) return "YouTube refuses to play inside pages opened straight from disk (file://). The app needs to be opened from a web address (http/https) — any free static host works, see DEPLOY.md.";
  return "YouTube player error (code " + c + ").";
}

function loadYTApi(){
  return new Promise((resolve, reject) => {
    if (window.YT && window.YT.Player){ resolve(); return; }
    const to = setTimeout(() => reject(new Error('YT_API_TIMEOUT')), 9000);
    window.onYouTubeIframeAPIReady = () => { clearTimeout(to); resolve(); };
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    s.onerror = () => { clearTimeout(to); reject(new Error('YT_API_NETWORK')); };
    document.head.appendChild(s);
  });
}

function handleYTState(st){
  if (st === 0 && S.phase === 'watch') finishEpisode();
  S.playing = (st === 1);
  S.buffering = (st === 3);
  Hooks.playingChanged();
}

function createYTPlayer(videoId, ccOn){
  return new Promise((resolve, reject) => {
    // (re)create the mount node (YT.Player replaces it with an iframe)
    const shell = document.getElementById('player-shell');
    const old = document.getElementById('yt-mount');
    if (old) old.remove();
    const mount = document.createElement('div');
    mount.id = 'yt-mount';
    shell.insertBefore(mount, shell.firstChild);

    const pv = {
      autoplay:0, controls:0, disablekb:1, rel:0, playsinline:1,
      iv_load_policy:3, fs:0, cc_load_policy: ccOn ? 1 : 0,
    };
    if (typeof location !== 'undefined' && location.protocol && location.protocol.indexOf('http') === 0){
      pv.origin = location.origin;
    }
    let settled = false;
    try {
      const p = new window.YT.Player('yt-mount', {
        videoId,
        playerVars: pv,
        events: {
          onReady: e => { if (!settled){ settled = true; resolve(e.target); } },
          onError: e => {
            lastYTError = mapYTError(e.data);
            if (!settled){ settled = true; reject(new Error(lastYTError)); }
            else if (S.screen === 'loading') Hooks.loadError('loading', lastYTError, {});
            else Hooks.playerError(lastYTError);
          },
          onStateChange: e => handleYTState(e.data),
        },
      });
    } catch(e){
      reject(new Error('Player creation failed: ' + (e && e.message)));
    }
  });
}

/* Get duration; prime with muted playback if metadata hasn't loaded yet.
   Ad guard: while a pre-roll ad plays, getDuration() returns the AD's length,
   not the video's. Any suspiciously short first reading is re-checked for a
   while so the ad can finish and reveal the real duration. */
const AD_SUSPECT = 180;   // readings below this (3 min) get re-checked — ads are shorter
const AD_WAIT_MS = 40000; // how long to watch for the true duration to appear

async function confirmDuration(p, first){
  const t0 = Date.now();
  let best = first, lastChange = t0;
  while (Date.now() - t0 < AD_WAIT_MS){
    await sleep(250);
    if (lastYTError) break;
    let cur = 0; try{ cur = p.getDuration() || 0; }catch(e){}
    if (cur > 0 && Math.abs(cur - best) > 1){
      best = cur; lastChange = Date.now();
      if (best >= AD_SUSPECT) break;          // real content duration revealed
    } else if (best !== first && Date.now() - lastChange > 2500){
      break;                                  // changed earlier, stable now — good enough
    }
  }
  return best;
}

async function measureDuration(p){
  lastYTError = null;
  let d = 0;
  try{ d = p.getDuration() || 0; }catch(e){}
  if (d >= AD_SUSPECT) return d;   // long reading -> trustworthy, no priming needed
  try{ p.mute(); p.playVideo(); }catch(e){}
  for (let i = 0; i < 32 && d <= 0; i++){
    await sleep(250);
    if (lastYTError) throw new Error(lastYTError);
    try{ d = p.getDuration() || 0; }catch(e){}
    if (d > 0) break;
  }
  if (d > 0 && d < AD_SUSPECT){
    Hooks.loadingStatus('Almost there — checking the video…');
    d = await confirmDuration(p, d);
  }
  try{ p.pauseVideo(); p.seekTo(0, true); p.unMute(); p.setVolume(settings.vol != null ? settings.vol : 85); }catch(e){}
  return d;
}

function destroyPlayer(){
  try{ if (player && player.destroy) player.destroy(); }catch(e){}
  player = null; playerReady = false; lastYTError = null;
}

/* ────────────────────────── SEASON FLOW ────────────────────────── */

async function beginSeason(url, opts = {}){
  const videoId = opts.videoId || parseYouTubeId(url);
  if (!videoId){
    Hooks.loadError('home', "That doesn't look like a YouTube link. Paste something like https://www.youtube.com/watch?v=… (any length — 40 minutes or 10 hours).");
    return false;
  }
  if (S.screen === 'loading') return false; // already busy
  S = freshS();
  S.videoId = videoId; S.url = url.trim(); S._lastOpts = opts;
  S.screen = 'loading';
  Hooks.updateAll();
  Hooks.loadingStatus('Summoning the YouTube player…');
  try{ await loadYTApi(); }
  catch(e){ Hooks.loadError('loading', networkHint(), {}); return false; }
  Hooks.loadingStatus('Opening the battlefield…');
  let ccOn = !!opts.cc;
  if (opts.videoId){ const v = loadVideo(videoId); ccOn = !!(v && v.cc); }
  let p;
  try{ p = await createYTPlayer(videoId, ccOn); }
  catch(e){ Hooks.loadError('loading', (e && e.message) || 'Player failed to load.', {}); return false; }
  player = p; playerReady = true;
  Hooks.loadingStatus('Measuring the video length…');
  let dur = 0;
  try{ dur = await measureDuration(p); }catch(e){ Hooks.loadError('loading', e.message, {}); return false; }
  if (!dur || dur < 1){
    Hooks.loadError('loading',
      "The player needs one tap before it reveals the video's length (browser autoplay rules). Tap the button below.",
      { wake:true });
    return false;
  }
  return completeSeason(p, dur, opts);
}

/* After a wake tap: unmuted-gesture play, then re-measure. */
async function retryWake(){
  const p = player;
  if (!p) return false;
  Hooks.updateAll();
  Hooks.loadingStatus('Waking the player…');
  try{ p.mute(); p.playVideo(); }catch(e){}
  for (let i = 0; i < 24; i++){
    await sleep(250);
    if (lastYTError){ Hooks.loadError('loading', lastYTError, {}); return false; }
    let d = 0; try{ d = p.getDuration() || 0; }catch(e){}
    if (d > 0){
      if (d < AD_SUSPECT){
        Hooks.loadingStatus('Almost there — checking the video…');
        d = await confirmDuration(p, d);
      }
      try{ p.pauseVideo(); p.seekTo(0, true); p.unMute(); }catch(e){}
      return completeSeason(p, d, S._lastOpts || {});
    }
  }
  Hooks.loadError('loading', "Still no luck reading the video. Check the link and your connection, then hit retry.", {});
  return false;
}

async function completeSeason(p, dur, opts){
  const videoId = S.videoId;
  // ad insurance: if the true (longer) duration has revealed itself by now, use it
  try{ const d2 = p.getDuration ? (p.getDuration() || 0) : 0; if (d2 > dur + 5) dur = d2; }catch(e){}
  let v = opts.videoId ? loadVideo(videoId) : null;
  if (v){
    // video changed length since last time → rebuild the plan
    if (Math.abs(dur - v.duration) > 5){
      v.duration = dur;
      v.episodes = makeSeasonPlan(dur, v.epLen, videoId);
      v.lastEpIndex = 0;
    }
  } else {
    const epLenSec = pickEpLen(opts.eplen != null ? opts.eplen : settings.eplen, dur);
    v = { v:1, videoId, url:S.url, title:'Recorded Class', duration:dur, epLen:epLenSec, cc:!!opts.cc,
          createdAt:Date.now(), lastEpIndex:0, episodes:makeSeasonPlan(dur, epLenSec, videoId) };
    try{ const t = p.getVideoData().title; if (t) v.title = String(t).slice(0, 90); }catch(e){}
  }
  V = v; saveVideo(videoId, V);
  G.lastVideoId = videoId; saveGlobal();
  S.duration = v.duration; S.epLen = v.epLen; S.episodes = v.episodes;
  S.current = clamp(v.lastEpIndex || 0, 0, S.episodes.length - 1);
  S.screen = 'player'; S.phase = 'idle';
  Hooks.seasonBuilt();
  return true;
}

/* ────────────────────────── EPISODE CONTROL ────────────────────────── */

function resumeFor(i){
  const ep = S.episodes[i];
  if (!ep || ep.watched) return 0;
  if (ep.lastPos > 30 && ep.lastPos < ep.dur - 10) return ep.lastPos;
  return 0;
}

function startEpisode(i, resumeSec){
  if (!S.episodes.length || !player) return;
  i = clamp(i, 0, S.episodes.length - 1);
  const resume = clamp(resumeSec || 0, 0, S.episodes[i].dur - 1);
  Hooks.cancelClear();
  S.current = i;
  const ep = S.episodes[i];
  V.lastEpIndex = i; saveVideo(S.videoId, V);
  try{
    player.seekTo(ep.start + resume, true);
    if (player.setPlaybackRate) player.setPlaybackRate(settings.rate || 1);
    if (player.setVolume) player.setVolume(settings.vol != null ? settings.vol : 85);
    player.playVideo();
  }catch(e){}
  S.phase = 'intro';
  clearTimeout(startEpisode._t);
  startEpisode._t = setTimeout(() => {
    if (S.phase === 'intro'){ S.phase = 'watch'; Hooks.phaseChanged(); }
  }, 2600);
  Hooks.episodeStarted(ep, resume);
}

function relNow(){
  const ep = S.episodes[S.current];
  if (!ep || !player) return 0;
  let t = 0; try{ t = player.getCurrentTime() || 0; }catch(e){}
  return clamp(t - ep.start, 0, ep.dur);
}

function seekRel(t){
  const ep = S.episodes[S.current];
  if (!ep || !player) return;
  const tt = clamp(t, 0, ep.dur - 0.5);
  try{ player.seekTo(ep.start + tt, true); }catch(e){}
}

function togglePlay(){
  if (S.screen !== 'player' || !player) return;
  if (S.phase === 'idle'){ startEpisode(S.current, resumeFor(S.current)); return; }
  if (S.phase !== 'watch' && S.phase !== 'intro') return;
  try{
    if (S.playing) player.pauseVideo();
    else player.playVideo();
  }catch(e){}
}

function setVolume(v){
  settings.vol = clamp(Math.round(v), 0, 100);
  saveSettings();
  try{ if (player && player.setVolume) player.setVolume(settings.vol); }catch(e){}
}
function setRate(r){
  settings.rate = r;
  saveSettings();
  try{ if (player && player.setPlaybackRate) player.setPlaybackRate(r); }catch(e){}
}
function toggleMute(){
  if (!player) return;
  try{
    if (player.isMuted && player.isMuted()){ player.unMute(); if (player.setVolume) player.setVolume(settings.vol); S.muted = false; }
    else { player.mute(); S.muted = true; }
  }catch(e){}
}

function isNight(){ const h = new Date().getHours(); return h >= 0 && h < 4; }

/* ────────────────────────── FINISH & XP ────────────────────────── */

function bumpDaily(){
  const t = todayStr();
  if (G.daily.day !== t) G.daily = { day:t, eps:0, claimed:false };
  G.daily.eps++;
  if (G.daily.eps >= 3 && !G.daily.claimed){
    G.daily.claimed = true;
    awardXP(75, 'Daily quest complete', true);
  }
}
function bumpStreak(){
  const t = todayStr();
  if (G.streak.last === t) return;
  const y = todayStr(new Date(Date.now() - 86400000));
  if (G.streak.last === y){ G.streak.count++; }
  else {
    if (G.streak.last && daysBetween(G.streak.last, t) >= 2) G.st.comeback = true;
    G.streak.count = 1;
  }
  G.streak.last = t;
  if (G.streak.count > (G.streak.best || 0)) G.streak.best = G.streak.count;
}

function finishEpisode(){
  const ep = S.episodes[S.current];
  if (!ep || S.phase === 'clear' || S.phase === 'finale') return;
  S.phase = 'clear';
  S.playing = false;
  const isFinal = S.current >= S.episodes.length - 1;
  try{
    player.pauseVideo();
    player.seekTo(Math.max(0, ep.start + ep.dur - 0.12), true);
  }catch(e){}
  ep.watched = true; ep.lastPos = ep.dur;
  V.lastEpIndex = S.current; saveVideo(S.videoId, V);

  const now = Date.now();
  S.combo = (S.lastClearAt && now - S.lastClearAt < 45*60*1000) ? S.combo + 1 : 1;
  S.lastClearAt = now;
  if (S.combo > (G.st.bestCombo || 0)) G.st.bestCombo = S.combo;

  bumpDaily(); bumpStreak();

  S.clear = {
    epIndex: S.current,
    missionDone:false, bossDone:false, water:false, stretch:false, eyes:false,
    tally:[],
    breakTotal: 120,
    breakEnds: Date.now() + 120000,
    breakDone:false,
    nextIndex: isFinal ? -1 : S.current + 1,
  };

  G.st.episodesCleared++;
  awardXP(100, 'Episode clear', true);
  if (S.combo >= 2) awardXP(Math.min((S.combo - 1) * 10, 50), `Combo ×${S.combo} bonus`, true);
  if (isFinal){ G.st.seasonsCompleted++; awardXP(200, 'Season complete', true); }

  checkAchievements({
    flagSpeed: (settings.rate || 1) >= 1.5,
    flagNight: isNight(),
    dailyEps: (G.daily.day === todayStr()) ? G.daily.eps : 0,
    rankIdx: rankInfo(G.xp).idx,
  });
  saveGlobal();
  Hooks.episodeClear(S.clear, ep, isFinal);
}

function awardXP(n, reason, tally){
  n = Math.round(+n || 0);
  if (n <= 0) return;
  const prevRank = rankInfo(G.xp).idx;
  G.xp += n;
  if (tally && S.clear) S.clear.tally.push({ n, reason });
  const r = rankInfo(G.xp);
  saveGlobal();
  Hooks.xpGained(n, reason, !!tally);
  if (r.idx > prevRank){
    Hooks.rankUp(RANKS[prevRank].k, r.key);
    checkAchievements({ rankIdx: r.idx });
  }
}

function checkAchievements(extra = {}){
  const ctx = {
    st: G.st,
    dailyEps: (G.daily.day === todayStr()) ? G.daily.eps : 0,
    rankIdx: rankInfo(G.xp).idx,
    ...extra,
  };
  for (const a of ACH_DEFS){
    if (G.ach[a.id]) continue;
    let ok = false;
    try{ ok = !!a.test(ctx); }catch(e){}
    if (ok){ G.ach[a.id] = Date.now(); saveGlobal(); Hooks.achievement(a); }
  }
}

/* ────────────────────────── TICK ────────────────────────── */

let tickCount = 0;
function tick(){
  tickCount++;
  if (S.screen !== 'player' || !player || !playerReady) return;
  const ep = S.episodes[S.current];
  if (!ep) return;

  let t = 0, st = -9;
  try{ t = player.getCurrentTime() || 0; st = player.getPlayerState(); }catch(e){}
  const wasPlaying = S.playing;
  S.playing = (st === 1);
  S.buffering = (st === 3);
  if (S.playing !== wasPlaying) Hooks.playingChanged();

  const rel = clamp(t - ep.start, 0, ep.dur);

  // watch-time accounting (video-seconds actually consumed)
  if (S.playing){
    if (S._lastT != null && t > S._lastT && t - S._lastT < 3) S.watchAccum += (t - S._lastT);
    S._lastT = t;
  } else S._lastT = null;
  if (S.watchAccum >= 5){
    const add = Math.floor(S.watchAccum);
    S.watchAccum -= add;
    G.st.totalWatchSec += add;
    const day = todayStr();
    G.watch[day] = (G.watch[day] || 0) + add;
    if ((tickCount & 63) === 0) pruneWatch();
    saveGlobal();
    Hooks.watchTimeChanged();
  }

  // periodic position save
  if (S.playing && (tickCount % 20) === 0 && S.phase === 'watch'){
    ep.lastPos = rel;
    saveVideo(S.videoId, V);
  }

  // ad self-heal: if a long pre-roll ad fooled the measurement into a tiny
  // single-episode season, rebuild the plan as soon as the true duration appears
  if ((tickCount & 7) === 0 && S.phase === 'watch' && S.episodes.length === 1
      && S.episodes[0].dur < AD_SUSPECT && S.episodes[0].start === 0){
    let real = 0; try{ real = player.getDuration() || 0; }catch(e){}
    if (real > S.duration + 30){
      S.duration = real;
      V.duration = real;
      V.episodes = makeSeasonPlan(real, V.epLen, S.videoId);
      S.episodes = V.episodes;
      S.current = 0; V.lastEpIndex = 0;
      saveVideo(S.videoId, V);
      Hooks.seasonBuilt();
    }
  }

  // episode end detection — the whole illusion hinges on this
  if (S.phase === 'watch' && (S.playing || S.buffering) && t >= ep.start + ep.dur - 0.35){
    finishEpisode();
    return;
  }
  Hooks.tick(rel, ep);
}

/* ────────────────────────── EXPORTS / DEBUG ────────────────────────── */

if (typeof window !== 'undefined'){
  window.__ACP__ = {
    get S(){ return S; }, get G(){ return G; }, get V(){ return V; },
    get player(){ return player; },
    ACP, startEpisode, togglePlay, seekRel, awardXP, beginSeason,
  };
}
if (typeof module !== 'undefined' && module.exports){
  module.exports = { ACP, splitEpisodes, fmtClock, fmtDur, parseYouTubeId, rankInfo,
    makeSeasonPlan, pickEpLen, autoEpLen, kanjiNum, RANKS, ACH_DEFS, MISSIONS, BOSSES };
}
