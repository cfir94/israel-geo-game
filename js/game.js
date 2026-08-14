/* =============================================================
   מפת הארץ · משחק מורי הדרך – מנוע המשחק
   ============================================================= */

/* --------------------------------------------- כלי עזר ---- */
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function shuffle(arr, rnd = Math.random) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
const pick = (arr, rnd) => arr[Math.floor(rnd() * arr.length)];

/* --------------------------------------------- שמירה ----
   נשמר ב-localStorage. אם הדפדפן חוסם אותו (גלישה פרטית, או
   דף שמוטמע ב-iframe מוגבל), יורדים ל-sessionStorage ולבסוף
   לזיכרון בלבד – והמשתמש מקבל על כך הודעה במסך ההגדרות.        */
const KEY = 'israel-geo-game-v1';
const DEFAULT_SAVE = {
  coins: 120, xp: 0, stars: {}, best: {},
  sound: 1, haptic: 1, labels: 1, guideQ: 1, theme: 'auto',
  daily: {}, seen: {}
};

const Store = (() => {
  const probe = s => {
    try {
      if (!s) return false;
      s.setItem('__t', '1'); s.removeItem('__t');
      return true;
    } catch (e) { return false; }
  };
  let backend = null, kind = 'memory';
  try { if (probe(window.localStorage)) { backend = window.localStorage; kind = 'local'; } } catch (e) {}
  if (!backend) { try { if (probe(window.sessionStorage)) { backend = window.sessionStorage; kind = 'session'; } } catch (e) {} }
  let mem = null;
  return {
    kind,
    persistent: kind === 'local',
    get() {
      try { return backend ? backend.getItem(KEY) : mem; } catch (e) { return mem; }
    },
    set(v) {
      mem = v;
      try { if (backend) backend.setItem(KEY, v); } catch (e) { /* מלא או חסום */ }
    }
  };
})();

let SAVE = load();

function load() {
  try {
    const raw = Store.get();
    if (!raw) return { ...DEFAULT_SAVE };
    const d = JSON.parse(raw);
    return { ...DEFAULT_SAVE, ...d, stars: d.stars || {}, best: d.best || {}, seen: d.seen || {} };
  } catch (e) { return { ...DEFAULT_SAVE }; }
}
function persist() {
  Store.set(JSON.stringify(SAVE));
  cloudPushSoon();
}

/* --------------------------------------------- סנכרון ענן ----
   כל שמירה מקומית מתזמנת דחיפה לשרת. הדחיפות מקובצות כדי שלא
   נפנה לשרת על כל תשובה בנפרד; אם אין חשבון – לא קורה כלום.  */
let pushTimer = null, syncState = 'idle';

function cloudStats() {
  let stars = 0;
  for (const m in SAVE.stars) for (const l in SAVE.stars[m]) stars += SAVE.stars[m][l];
  return { xp: SAVE.xp || 0, stars };
}

function cloudPushSoon(delay = 1500) {
  if (!Cloud.enabled || !Cloud.current()) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(cloudPushNow, delay);
}

async function cloudPushNow() {
  if (!Cloud.enabled || !Cloud.current()) return;
  clearTimeout(pushTimer);
  setSync('busy');
  try {
    /* קוראים את מה שיש בשרת וממזגים לפני הכתיבה, אחרת מכשיר
       אחד היה מוחק התקדמות שנעשתה בינתיים במכשיר אחר. */
    const remote = await Cloud.pull();
    if (remote) {
      const before = JSON.stringify(SAVE);
      SAVE = Cloud.merge(SAVE, remote);
      if (JSON.stringify(SAVE) !== before) {
        Store.set(JSON.stringify(SAVE));
        renderHUD();
      }
    }
    await Cloud.push(SAVE, cloudStats());
    setSync('ok');
  } catch (e) {
    setSync('err', e.message);
  }
}

function setSync(state, msg) {
  syncState = state;
  const el = $('#acc-sync');
  if (!el) return;
  el.className = 'acc-sync' + (state === 'busy' ? ' busy' : state === 'err' ? ' err' : '');
  el.textContent = state === 'busy' ? 'מסנכרן…'
    : state === 'err' ? ('הסנכרון נכשל – ' + (msg || 'ננסה שוב בשמירה הבאה'))
    : 'מסונכרן ✓';
}

/* שמירה נוספת ברגעים שבהם הדפדפן עלול להשליך את הדף */
['pagehide', 'beforeunload'].forEach(ev => window.addEventListener(ev, () => {
  Store.set(JSON.stringify(SAVE));
  if (Cloud.enabled && Cloud.current()) cloudPushNow();
}));
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') persist();
});

/* מאחד את ההתקדמות שבשרת עם זו שבמכשיר, ושומר את התוצאה בשניהם */
async function cloudSyncIn() {
  if (!Cloud.enabled || !Cloud.current()) return;
  setSync('busy');
  try {
    const remote = await Cloud.pull();
    if (remote) SAVE = Cloud.merge(SAVE, remote);
    Store.set(JSON.stringify(SAVE));
    await Cloud.push(SAVE, cloudStats());
    setSync('ok');
    renderHUD(); renderModes();
  } catch (e) {
    setSync('err', e.message);
  }
}

/* --------------------------------------------- ערכת נושא ---- */
function applyTheme() {
  const t = SAVE.theme || 'auto';
  if (t === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', t);
  const dark = t === 'dark' ||
    (t === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', dark ? '#0a1622' : '#eef2f7');
  $$('#theme-seg button').forEach(b =>
    b.classList.toggle('on', b.dataset.themeOpt === t));
  if (typeof GameMap !== 'undefined' && GameMap.refreshTheme) {
    try { GameMap.refreshTheme(); } catch (e) {}
  }
}

/* --------------------------------------------- אודיו ---- */
let actx = null;
function beep(freq, dur = 0.09, type = 'sine', vol = 0.16) {
  if (!SAVE.sound) return;
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state === 'suspended') actx.resume();
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, actx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + dur);
    o.connect(g); g.connect(actx.destination);
    o.start(); o.stop(actx.currentTime + dur);
  } catch (e) { /* ignore */ }
}
const SFX = {
  good() { beep(660, .08, 'triangle'); setTimeout(() => beep(990, .13, 'triangle'), 80); },
  bad()  { beep(200, .18, 'sawtooth', .1); },
  tap()  { beep(520, .04, 'sine', .07); },
  win()  { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => beep(f, .16, 'triangle'), i * 105)); },
  coin() { beep(880, .06, 'square', .08); setTimeout(() => beep(1320, .09, 'square', .07), 60); }
};
function buzz(ms) { if (SAVE.haptic && navigator.vibrate) try { navigator.vibrate(ms); } catch (e) {} }

/* --------------------------------------------- מצבים ---- */
const MODES = [
  { id: 'locate', name: 'מקם על המפה', icon: '📍', color: '#2ee6c5', tag: 'שם אתר → הנקודה המדויקת',
    desc: 'מקבלים שם של אתר – ולוחצים על המקום המדויק שלו במפה. ככל שקרוב יותר, כך מרוויחים יותר.' },
  { id: 'identify', name: 'מה האתר הזה?', icon: '🔎', color: '#4aa8ff', tag: 'סיכה על המפה → מי זה',
    desc: 'סיכה מהבהבת על המפה. זהו את האתר מבין ארבע אפשרויות – בדיוק כשהתייר שואל "מה רואים שם?".' },
  { id: 'regionOf', name: 'לאיזה אזור שייך?', icon: '🧭', color: '#a78bfa', tag: 'אתר → חבל הארץ שלו',
    desc: 'שם של אתר – ואתם לוחצים על חבל הארץ שבו הוא נמצא. הדרך הטובה להפנים את חלוקת הארץ.' },
  { id: 'regionFind', name: 'אזורי הארץ', icon: '🗺️', color: '#ffce4d', tag: '13 חבלי ארץ על המפה',
    desc: '13 חבלי ארץ, מהחרמון ועד אילת. מקבלים שם של אזור – ומזהים אותו על המפה.' },
  { id: 'trivia', name: 'חידון מורה הדרך', icon: '🎓', color: '#ff6b81', tag: 'ידע, תקופות ואירועים',
    desc: 'שאלות ידע על אתרים, תקופות ואירועים – בדיוק מה שנשאלים בשטח ובבחינות ההסמכה.' },
  { id: 'unesco', name: 'מורשת עולמית', icon: '🏆', color: '#46e08a', tag: 'אתרי אונסק״ו בישראל',
    desc: 'אתרי המורשת העולמית של אונסק״ו – 16 אתרים בשטח המרכיבים עשר הכרזות (כולל "התלים המקראיים" ו"דרך הבשמים"). לזהות, למקם ולדעת למה הם ברשימה.' }
];
MODES.push({ id: 'guide', name: 'סדנת הדרכה', icon: '🎤', color: '#f0abfc', tag: 'מה מספרים בכל אתר',
  desc: 'שלוש שאלות על כל אתר: מה עושים שם, מה נקודת ההדרכה, ומה חשוב לדעת מהשטח.' });
MODES.push({ id: 'rockAt', name: 'איזה סלע כאן?', icon: '🪨', color: '#A6D84A', tag: 'מקום על המפה → הסלע שבו',
  desc: 'מקום מודגש על מפת ישראל – ואתם בוחרים איזה סלע יש שם. אחרי התשובה נחשפת המפה הגיאולוגית המלאה בצבעי התקן, והמקום שנשאלתם עליו מסומן בתוכה. שלוש רמות: אזורי הארץ, מקומות מפורסמים, ואתרים ספציפיים.' });
MODES.push({ id: 'rockWhere', name: 'איפה הסלע הזה?', icon: '⛏️', color: '#d4694a', tag: 'יחידת סלע → האזור במפה',
  desc: 'מקבלים יחידת סלע – ומאתרים על המפה אזור שבו היא חשופה. הדרך להפנים את המפה הגיאולוגית של הארץ.' });
MODES.push({ id: 'geology', name: 'חידון גיאולוגי', icon: '🌋', color: '#8fc45c', tag: 'סלעים, קרקעות ומים',
  desc: 'קארסט, נארי, טרה רוסה מול רנדזינה, אקוויפרים, מכתשים ובזלת – הידע הגיאולוגי שנדרש בהסמכה.' });
MODES.push({ id: 'routes', name: 'דרכים עתיקות', icon: '🐫', color: '#ffce4d', tag: 'דרך הים, דרך האבות ודרך המלך',
  desc: 'דרכי המסחר ההיסטוריות של הארץ: לאתר את התוואי על המפה, לדעת איזה כביש מודרני רץ בו היום, ואיזה אתר שמר על המעבר.' });
MODES.push({ id: 'streams', name: 'נחלים ומעיינות', icon: '💧', color: '#2b86b8', tag: 'הירדן, הנחלים והמקורות',
  desc: 'הנהרות, הנחלים והמעיינות: איפה עובר כל נחל, מהו מקורו ולאן הוא נשפך – כולל שלושת מקורות הירדן.' });
MODES.push({ id: 'folds', name: 'קמר או קער?', icon: '⛰️', color: '#e0714a', tag: 'המבנה שמאחורי הנוף',
  desc: 'צירי הקמרים והקערים שבונים את הארץ – חברון, רמאללה, פריעה, שכם, אמיר, הכרמל, החרמון והגולן. המבנה הוא שקובע איזה סלע יהיה בשטח, וכאן לומדים את הקשר – כולל היפוך התבליט בשומרון.' });
MODES.push({ id: 'bounds', name: 'גבולות ותפרים', icon: '📐', color: '#c084fc', tag: 'מה מפריד בין חבל לחבל',
  desc: 'איפה נגמר הגליל העליון ומתחיל התחתון, מה מפריד בין רמות מנשה לכרמל, ואיפה עובר קו פרשת המים. בדיוק השאלות שנשאלות בבחינה על גבולות חבלי הארץ.' });
const MODE_BY_ID = Object.fromEntries(MODES.map(m => [m.id, m]));

/* מצבים שמחולקים לרמות קושי לפי האתרים */
const BY_DIFF = new Set(['locate', 'identify', 'regionOf', 'guide', 'rockAt']);
const DIFFS = [
  { id: 1, name: 'קל',     sub: 'אתרי חובה' },
  { id: 2, name: 'בינוני', sub: 'הרחבה' },
  { id: 3, name: 'מתקדם',  sub: 'למורה ותיק' }
];
const diffKey = (mode, diff) => BY_DIFF.has(mode) ? mode + ':' + diff : mode;

const RANKS = [
  [0, 'מתלמד'], [400, 'מדריך מתחיל'], [1200, 'מורה דרך'],
  [2600, 'מורה דרך בכיר'], [4800, 'מומחה הארץ'], [8000, 'אלוף המפה']
];
function rankOf(xp) {
  let r = RANKS[0], nx = RANKS[1];
  for (let i = 0; i < RANKS.length; i++) {
    if (xp >= RANKS[i][0]) { r = RANKS[i]; nx = RANKS[i + 1] || null; }
  }
  return { name: r[1], base: r[0], next: nx ? nx[0] : r[0] + 1, lvl: RANKS.indexOf(r) + 1, max: !nx };
}

/* ------------------------------------ מאגר שאלות לפי מצב ---- */
const POOL = SITES.slice().sort((a, b) =>
  (a.lvl - b.lvl) || (hashStr(a.id) - hashStr(b.id)));

function poolFor(diff) { return POOL.filter(s => s.lvl === diff); }
function targetsFor(diff) { return GEO_TARGETS.filter(t => t.t === diff); }

/* כמה אתרים בכל שלב. כשמצב "שאלות הדרכה" פעיל, שלב מיקום מכיל
   פחות אתרים – כי כל אתר גורר אחריו שלוש שאלות נוספות. */
function sitesPerLevel(mode) {
  if (mode === 'routes' || mode === 'streams' || mode === 'folds' || mode === 'bounds') return 6;
  if (mode === 'rockAt') return 6;
  if (mode === 'guide') return 3;
  if (mode === 'locate' && SAVE.guideQ) return 4;
  return GAME_CONFIG.questionsPerLevel;
}

function levelCount(mode, diff = 1) {
  if (mode === 'rockAt') return Math.max(1, Math.ceil(targetsFor(diff).length / sitesPerLevel(mode)));
  if (BY_DIFF.has(mode)) {
    return Math.max(1, Math.min(12, Math.floor(poolFor(diff).length / sitesPerLevel(mode))));
  }
  switch (mode) {
    case 'regionFind': return 8;
    case 'trivia': return Math.floor(TRIVIA.length / GAME_CONFIG.questionsPerLevel);
    case 'unesco': return 5;
    case 'rockAt': return Math.ceil(GEO_AREAS.length / GAME_CONFIG.questionsPerLevel);
    case 'rockWhere': return 6;
    case 'geology': return Math.floor(GEO_TRIVIA.length / GAME_CONFIG.questionsPerLevel);
    case 'routes': return pathLevels('routes');
    case 'streams': return pathLevels('streams');
    case 'folds': return pathLevels('folds');
    case 'bounds': return pathLevels('bounds');
  }
  return 8;
}

function sitesForLevel(level, diff, mode) {
  const pool = BY_DIFF.has(mode) ? poolFor(diff) : POOL;
  const n = sitesPerLevel(mode);
  const start = (level - 1) * n;
  let out = pool.slice(start, start + n);
  if (out.length < n) out = out.concat(pool.slice(0, n - out.length));
  return out;
}

/* ---------- אחוז הדיוק של מיקום על המפה ---------- */
function accuracyPct(km) {
  if (km <= 3) return 100;
  const k = Math.min(1, (km - 3) / 180);
  return Math.max(0, Math.round(100 * (1 - Math.pow(k, 0.6))));
}
function accuracyWord(p) {
  if (p >= 92) return 'בול במקום';
  if (p >= 80) return 'מדויק';
  if (p >= 65) return 'קרוב מאוד';
  if (p >= 45) return 'בערך שם';
  if (p >= 25) return 'צריך לחדד';
  return 'רחוק';
}

/* ---------- שאלת הדרכה כשאלת משחק ---------- */
function guideQuestion(site, row, rnd) {
  const [type, text, ans, w1, w2, w3, why] = row;
  const t = GUIDE_TYPES[type];
  return {
    kind: 'choice', showMap: false, time: 22, site, guide: true, gType: type,
    kicker: t.icon + ' ' + t.name,
    text, sub: site.n,
    options: shuffle([{ label: ans, correct: true }, { label: w1 }, { label: w2 }, { label: w3 }], rnd),
    hint: { text: 'חשבו על מה שהקבוצה באמת רואה ועושה ב' + site.n },
    explain: why || ans
  };
}
function guideRowsFor(site) { return GUIDE_Q[site.id] || []; }

/* ---------- דרכים עתיקות, נהרות ונחלים ---------- */
function pathCenter(it) {
  const n = it.path.length;
  return [it.path.reduce((a, p) => a + p[0], 0) / n,
          it.path.reduce((a, p) => a + p[1], 0) / n];
}
/* מסיחים אמיתיים: התוואים השכנים, כדי שההבחנה תהיה גיאוגרפית ולא מקרית */
function pathDecoys(it, all, k = 4) {
  const c = pathCenter(it);
  return all.filter(x => x.id !== it.id)
    .map(x => { const d = pathCenter(x); return { id: x.id, d: Math.hypot(d[0] - c[0], (d[1] - c[1]) * 1.2) }; })
    .sort((a, b) => a.d - b.d).slice(0, k).map(x => x.id);
}

/* שאלת "איפה עובר התוואי" – התוואים מצוירים בצבע נייטרלי, ולוחצים על הנכון */
function pathLocateQ(it, all, isRoute) {
  const cand = shuffle([it.id, ...pathDecoys(it, all)], mulberry32(hashStr('pl' + it.id)));
  const extra = isRoute
    ? 'התוואי המודרני: ' + it.modern + '. ' + it.guards
    : 'מקור: ' + it.src + ' · שפך: ' + it.out;
  return {
    kind: 'mapPath', showMap: true, mapMode: 'pathPick', time: 26,
    pathKind: isRoute ? 'route' : 'stream',
    targetPath: it.id, candidates: cand,
    kicker: (isRoute ? '🐫 איפה עברה הדרך?' : '💧 איפה עובר הנחל?'),
    text: it.name, sub: isRoute ? (it.alt || '') : (it.kind === 'river' ? 'נהר' : 'נחל'),
    hint: { text: isRoute ? 'תקופה: ' + it.era : 'נשפך אל ' + it.out },
    explain: it.name + ' – ' + it.note + ' ' + extra
  };
}

/* שאלת ידע, ואחריה חשיפת התוואי על המפה */
function pathFactQ(row, it, isRoute, rnd) {
  const extra = isRoute
    ? it.name + ' – ' + it.modern + '. ' + it.guards
    : it.name + ' – מקור: ' + it.src + ', שפך: ' + it.out;
  return {
    kind: 'choice', showMap: true, mapMode: 'pathHidden', time: 24,
    pathKind: isRoute ? 'route' : 'stream', revealPath: it.id,
    kicker: isRoute ? '🐫 דרכים עתיקות' : '💧 נחלים ומעיינות',
    text: row.q, sub: '',
    options: shuffle([{ label: row.a, correct: true }, ...row.w.map(w => ({ label: w }))], rnd),
    hint: { text: isRoute ? 'חשבו על התוואי בשטח: איפה נוח לעבור' : 'חשבו על הטופוגרפיה: לאן המים יורדים' },
    explain: row.e + ' (' + extra + ')'
  };
}

/* ---------- קמרים וקערים ---------- */
/* שאלת האיתור מקבלת שם של מבנה ומבקשת את הציר שלו על המפה */
function foldLocateQ(it, all) {
  const cand = shuffle([it.id, ...pathDecoys(it, all)], mulberry32(hashStr('fl' + it.id)));
  return {
    kind: 'mapPath', showMap: true, mapMode: 'pathPick', time: 26,
    pathKind: 'fold', targetPath: it.id, candidates: cand,
    kicker: '⛰️ איפה עובר הציר?',
    text: it.name, sub: it.unit,
    hint: { text: it.where },
    explain: it.name + ' – ' + it.where + '. מסלע: ' + it.rock + '. ' + it.note
  };
}
/* "קמר או קער" – שתי אפשרויות בלבד, ולכן ההסבר הוא העיקר */
function foldKindQ(it, rnd) {
  const opts = [
    { label: 'קמר – השכבות מתקמרות כלפי מעלה', correct: it.kind === 'anticline' },
    { label: 'קער – השכבות שוקעות כלפי מטה', correct: it.kind === 'syncline' }
  ];
  return {
    kind: 'choice', showMap: true, mapMode: 'pathHidden', time: 20,
    pathKind: 'fold', revealPath: it.id,
    kicker: '⛰️ קמר או קער?',
    text: it.unit + ' – מה המבנה שמתחתיו?', sub: '',
    options: shuffle(opts, rnd),
    hint: { text: 'המסלע מסגיר: ' + it.rock },
    explain: it.name + '. ' + it.note
  };
}
/* מהמבנה לסלע – הקשר שהמשחק בא ללמד */
function foldRockQ(it, all, rnd) {
  /* כמה מבנים חולקים את אותו תיאור מסלע – מסננים כפילויות */
  const seen = new Set([it.rock]);
  const others = all.filter(x => {
    if (x.id === it.id || seen.has(x.rock)) return false;
    seen.add(x.rock); return true;
  });
  const wrong = shuffle(others, rnd).slice(0, 3).map(x => ({ label: x.rock }));
  if (wrong.length < 3) return null;
  return {
    kind: 'choice', showMap: true, mapMode: 'pathHidden', time: 22,
    pathKind: 'fold', revealPath: it.id,
    kicker: '⛰️ מבנה ומסלע',
    text: 'איזה מסלע אופייני ל' + it.unit + '?', sub: '',
    options: shuffle([{ label: it.rock, correct: true }, ...wrong], rnd),
    hint: { text: it.kind === 'anticline' ? 'זהו קמר – ובקמר נחשפות השכבות הקדומות' : 'זהו קער – ובקער נשמרות השכבות הצעירות' },
    explain: it.name + ' – ' + it.rock + '. ' + it.note
  };
}

/* ---------- גבולות ותפרים ---------- */
/* "ל" לפני שם מיודע בולעת את ה"א הידיעה: "הגליל" → "לגליל" */
const leh = s => s[0] === 'ה' ? 'ל' + s.slice(1) : 'ל' + s;
const between = it => 'בין ' + it.a + ' ' + leh(it.b);

function boundLocateQ(it, all) {
  const cand = shuffle([it.id, ...pathDecoys(it, all)], mulberry32(hashStr('bl' + it.id)));
  return {
    kind: 'mapPath', showMap: true, mapMode: 'pathPick', time: 26,
    pathKind: 'bound', targetPath: it.id, candidates: cand,
    kicker: '📐 איפה עובר התפר?',
    text: it.name, sub: between(it),
    hint: { text: 'מפריד ' + between(it) },
    explain: it.name + ' – מפריד ' + between(it) + '. ' + it.note
  };
}
/* "מה מפריד בין X ל-Y" – המסיחים הם תפרים אחרים */
function boundWhatQ(it, all, rnd) {
  const wrong = shuffle(all.filter(x => x.id !== it.id), rnd).slice(0, 3).map(x => ({ label: x.name }));
  return {
    kind: 'choice', showMap: true, mapMode: 'pathHidden', time: 22,
    pathKind: 'bound', revealPath: it.id,
    kicker: '📐 מה מפריד ביניהם?',
    text: 'מה מפריד ' + between(it) + '?', sub: '',
    options: shuffle([{ label: it.name, correct: true }, ...wrong], rnd),
    hint: { text: 'חשבו על הקו בשטח – בקעה, נחל או מתלול' },
    explain: it.note
  };
}
/* תפר שכבר יש עליו שאלה כתובה ביד – לא מייצרים לו שאלה אוטומטית */
function boundHasWritten(it) {
  return STRUCT_Q.some(r => r.b === it.id && r.a === it.name);
}

/* שאלת ידע על המבנה או על התפר, עם חשיפת הקו על המפה */
function structFactQ(row, rnd) {
  const it = row.f ? FOLD_BY_ID[row.f] : row.b ? BOUND_BY_ID[row.b] : null;
  return {
    kind: 'choice', showMap: !!it, mapMode: it ? 'pathHidden' : undefined, time: 24,
    pathKind: row.f ? 'fold' : 'bound', revealPath: it ? it.id : undefined,
    kicker: row.f ? '⛰️ מבנה גיאולוגי' : '📐 גבולות ותפרים',
    text: row.q, sub: '',
    options: shuffle([{ label: row.a, correct: true }, ...row.w.map(w => ({ label: w }))], rnd),
    hint: { text: row.f ? 'קמר חושף שכבות קדומות, קער שומר שכבות צעירות' : 'הגבולות בשטח הם בקעות, נחלים ומתלולים' },
    explain: row.e
  };
}

/* סדר קבוע: לומדים תוואי על המפה, ומיד נשאלים עליו */
let _pathPools = {};
function pathPool(mode) {
  if (_pathPools[mode]) return _pathPools[mode];
  const out = [];
  if (mode === 'folds') {
    FOLDS.forEach(it => {
      out.push(() => foldLocateQ(it, FOLDS));
      out.push(rnd => foldKindQ(it, rnd));
      if (foldRockQ(it, FOLDS, mulberry32(1))) out.push(rnd => foldRockQ(it, FOLDS, rnd));
    });
    STRUCT_Q.filter(r => r.f || (!r.f && !r.b)).forEach(r => out.push(rnd => structFactQ(r, rnd)));
    return (_pathPools[mode] = out);
  }
  if (mode === 'bounds') {
    BOUNDS.forEach(it => {
      out.push(() => boundLocateQ(it, BOUNDS));
      if (!boundHasWritten(it)) out.push(rnd => boundWhatQ(it, BOUNDS, rnd));
    });
    STRUCT_Q.filter(r => r.b).forEach(r => out.push(rnd => structFactQ(r, rnd)));
    return (_pathPools[mode] = out);
  }
  const isRoute = mode === 'routes';
  const all = isRoute ? ROUTES : STREAMS;
  const rows = isRoute ? ROUTE_Q : STREAM_Q;
  const key = isRoute ? 'r' : 's';
  all.forEach(it => {
    out.push(() => pathLocateQ(it, all, isRoute));
    rows.filter(x => x[key] === it.id).forEach(row =>
      out.push(rnd => pathFactQ(row, it, isRoute, rnd)));
  });
  return (_pathPools[mode] = out);
}
/* חלוקה אחידה לשלבים – בלי שלב אחרון קטוע */
function pathLevels(mode) {
  return Math.max(1, Math.round(pathPool(mode).length / sitesPerLevel(mode)));
}
function pathSlice(mode, level) {
  const pool = pathPool(mode), lv = pathLevels(mode);
  const l = Math.min(Math.max(1, level), lv);
  return pool.slice(Math.floor((l - 1) * pool.length / lv), Math.floor(l * pool.length / lv));
}

function distractorSites(site, count, rnd) {
  const same = SITES.filter(s => s.r === site.r && s.id !== site.id);
  const near = SITES.filter(s => s.id !== site.id && s.r !== site.r)
    .sort((a, b) => GameMap.haversine(site.lat, site.lon, a.lat, a.lon) -
                    GameMap.haversine(site.lat, site.lon, b.lat, b.lon));
  const bag = shuffle(same, rnd).concat(near.slice(0, 14));
  const out = [];
  for (const s of bag) { if (out.length >= count) break; if (!out.includes(s)) out.push(s); }
  return out;
}

/* ---------- בניית שאלות ---------- */
function buildQuestions(mode, level, diff = 1) {
  const rnd = mulberry32(hashStr(mode + '#' + diff + '#' + level));
  const n = GAME_CONFIG.questionsPerLevel;

  if (mode === 'guide') {
    const out = [];
    sitesForLevel(level, diff, mode).forEach(s =>
      guideRowsFor(s).forEach(row => out.push(guideQuestion(s, row, rnd))));
    return out;
  }

  if (mode === 'locate') {
    return sitesForLevel(level, diff, mode).map(s => ({
      kind: 'mapPoint', showMap: true, site: s, time: 25,
      kicker: 'מקמו על המפה',
      text: s.n,
      sub: CATEGORIES[s.c].icon + ' ' + CATEGORIES[s.c].name,
      target: { lat: s.lat, lon: s.lon },
      hint: { text: 'האזור: ' + REGION_BY_ID[s.r].name, region: s.r },
      explain: s.f
    }));
  }

  if (mode === 'identify') {
    return sitesForLevel(level, diff, mode).map(s => {
      const wrong = distractorSites(s, 3, rnd);
      return {
        kind: 'choice', showMap: true, mapMode: 'pinRegion', site: s, time: 20,
        kicker: 'זיהוי אתר',
        text: 'איזה אתר מסומן בסיכה?',
        sub: '',
        options: shuffle([{ label: s.n, correct: true }, ...wrong.map(w => ({ label: w.n }))], rnd),
        hint: { text: 'האתר נמצא ב' + REGION_BY_ID[s.r].name },
        explain: s.f
      };
    });
  }

  if (mode === 'regionOf') {
    return sitesForLevel(level, diff, mode).map(s => {
      const buddy = SITES.filter(x => x.r === s.r && x.id !== s.id && x.lvl === 1)[0] ||
                    SITES.filter(x => x.r === s.r && x.id !== s.id)[0];
      return {
        kind: 'mapRegion', showMap: true, mapMode: 'regions', site: s, time: 20,
        kicker: 'לאיזה חבל ארץ שייך?',
        text: s.n,
        sub: 'לחצו על האזור הנכון במפה',
        targetRegion: s.r,
        hint: buddy ? { text: 'באותו אזור נמצא גם: ' + buddy.n, pin: buddy } : { text: REGION_BY_ID[s.r].desc },
        explain: s.n + ' – ' + REGION_BY_ID[s.r].name + '. ' + s.f
      };
    });
  }

  if (mode === 'regionFind') {
    const order = shuffle(REGIONS, rnd).slice(0, n);
    return order.map(rg => ({
      kind: 'mapRegion', showMap: true, mapMode: 'regionsBlank', time: 20,
      kicker: 'איפה האזור הזה?',
      text: rg.name,
      sub: 'לחצו על האזור במפה',
      targetRegion: rg.id,
      hint: { text: rg.desc },
      explain: rg.name + ' – ' + rg.desc
    }));
  }

  if (mode === 'trivia') {
    const start = (level - 1) * n;
    const bank = TRIVIA.slice(start, start + n);
    return bank.map(t => ({
      kind: 'choice', showMap: false, time: 22,
      kicker: 'חידון מורה הדרך',
      text: t.q, sub: '',
      options: shuffle([{ label: t.a, correct: true }, ...t.w.map(w => ({ label: w }))], rnd),
      site: t.site ? SITE_BY_ID[t.site] : null,
      hint: t.site ? { text: 'קשור לאתר באזור ' + REGION_BY_ID[SITE_BY_ID[t.site].r].name } : { text: 'חשבו על ההקשר ההיסטורי' },
      explain: t.site && SITE_BY_ID[t.site] ? SITE_BY_ID[t.site].n + ': ' + SITE_BY_ID[t.site].f : t.a
    }));
  }

  if (mode === 'rockAt') {
    const per = sitesPerLevel('rockAt');
    const pool = shuffle(targetsFor(diff), mulberry32(hashStr('rockAt#' + diff)));
    let list = pool.slice((level - 1) * per, (level - 1) * per + per);
    if (!list.length) list = pool.slice(0, per);
    return list.map(t => {
      const rockKey = t.area ? AREA_BY_ID[t.area].rock : t.rock;
      const right = ROCKS[rockKey];
      const wrong = shuffle(Object.keys(ROCKS).filter(k => k !== rockKey), rnd).slice(0, 3);
      const note = t.note || (t.area ? AREA_BY_ID[t.area].note : '');
      return {
        kind: 'choice', showMap: true, mapMode: 'geoProbe', target: t, rock: rockKey, time: 24,
        kicker: '🪨 איזה סלע יש כאן?',
        text: t.name, sub: t.area ? 'האזור המודגש על המפה' : 'הנקודה המודגשת על המפה',
        options: shuffle([{ label: right.name, correct: true },
          ...wrong.map(k => ({ label: ROCKS[k].name }))], rnd),
        hint: { text: 'התקופה: ' + right.period },
        explain: t.name + ' – ' + right.name + ' (' + right.group + ', ' + right.period + '). ' + note
      };
    });
  }

  if (mode === 'rockWhere') {
    const keys = Object.keys(ROCKS).filter(k => GEO_AREAS.some(a => a.rock === k));
    const order = shuffle(keys, mulberry32(hashStr('rockWhere#' + level)));
    const list = [];
    while (list.length < n) list.push(order[list.length % order.length]);
    return list.map(k => {
      const r = ROCKS[k];
      return {
        kind: 'geoArea', showMap: true, mapMode: 'geoBlank', time: 22, rock: k,
        kicker: '⛏️ איפה הסלע הזה?',
        text: r.name, sub: r.group + ' · ' + r.age,
        hint: { text: 'רמז: ' + r.where },
        explain: r.name + ' – ' + r.where + '. ' + r.traits
      };
    });
  }

  if (mode === 'geology') {
    const start = (level - 1) * n;
    return GEO_TRIVIA.slice(start, start + n).map(t => ({
      kind: 'choice', showMap: false, time: 22,
      kicker: '🌋 חידון גיאולוגי', text: t.q, sub: '',
      options: shuffle([{ label: t.a, correct: true }, ...t.w.map(w => ({ label: w }))], rnd),
      hint: { text: 'חשבו על הסלע ועל מה שהוא עושה לנוף' },
      explain: t.a
    }));
  }

  if (mode === 'routes' || mode === 'streams' || mode === 'folds' || mode === 'bounds') {
    return pathSlice(mode, level).map(f => f(rnd));
  }

  if (mode === 'unesco') {
    const qs = [];
    const nonU = SITES.filter(s => !s.u);
    UNESCO_SITES.forEach(s => {
      qs.push({
        kind: 'choice', showMap: false, time: 20, site: s,
        kicker: 'מורשת עולמית', text: 'איזה מהאתרים הוא אתר מורשת עולמית של אונסק״ו?', sub: '',
        options: shuffle([{ label: s.n, correct: true },
          ...shuffle(nonU, rnd).slice(0, 3).map(x => ({ label: x.n }))], rnd),
        hint: { text: 'האתר נמצא ב' + REGION_BY_ID[s.r].name },
        explain: s.n + ': ' + s.f
      });
      qs.push({
        kind: 'mapPoint', showMap: true, time: 25, site: s,
        kicker: 'מורשת עולמית · מיקום', text: s.n, sub: '🏆 אתר מורשת עולמית',
        target: { lat: s.lat, lon: s.lon },
        hint: { text: 'האזור: ' + REGION_BY_ID[s.r].name, region: s.r },
        explain: s.f
      });
      qs.push({
        kind: 'mapRegion', showMap: true, mapMode: 'regions', time: 20, site: s,
        kicker: 'מורשת עולמית · אזור', text: s.n, sub: 'באיזה חבל ארץ?',
        targetRegion: s.r,
        hint: { text: REGION_BY_ID[s.r].desc },
        explain: s.n + ' – ' + REGION_BY_ID[s.r].name
      });
    });
    const all = shuffle(qs, mulberry32(hashStr('unesco-all')));
    const start = (level - 1) * n;
    let out = all.slice(start, start + n);
    if (out.length < n) out = out.concat(all.slice(0, n - out.length));
    return out;
  }
  return [];
}

/* מאגר מעורב לאתגר היומי */
function buildDaily() {
  const key = new Date().toISOString().slice(0, 10);
  const rnd = mulberry32(hashStr('daily-' + key));
  const all = [];
  ['identify', 'regionOf', 'trivia', 'guide'].forEach(m => {
    DIFFS.forEach(d => {
      for (let l = 1; l <= levelCount(m, d.id); l++) all.push(...buildQuestions(m, l, d.id));
    });
  });
  return { key, qs: shuffle(all, rnd).slice(0, 10) };
}

/* --------------------------------------------- מפה ---- */
let mapWrap = null;
function ensureMap() {
  if (mapWrap) return;
  mapWrap = document.createElement('div');
  mapWrap.style.cssText = 'position:absolute;inset:0';
  GameMap.init(mapWrap);
}
function mountMap(hostId) {
  ensureMap();
  const host = document.getElementById(hostId);
  if (mapWrap.parentNode !== host) host.appendChild(mapWrap);
}

/* --------------------------------------------- מסכים ---- */
let currentScreen = 'home';
function show(id) {
  $$('.screen').forEach(s => s.classList.remove('active'));
  $('#screen-' + id).classList.add('active');
  $('#screen-' + id).scrollTop = 0;
  currentScreen = id;
}

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('on');
  clearTimeout(t._t);
  t._t = setTimeout(() => t.classList.remove('on'), 1900);
}

/* --------------------------------------------- HUD ---- */
function totalStarsMax() {
  return MODES.reduce((a, m) => a + (BY_DIFF.has(m.id)
    ? DIFFS.reduce((b, d) => b + levelCount(m.id, d.id), 0)
    : levelCount(m.id)) * 3, 0);
}
function totalStars() {
  let s = 0;
  for (const m in SAVE.stars) for (const l in SAVE.stars[m]) s += SAVE.stars[m][l];
  return s;
}
function renderHUD() {
  $('#hud-coins').textContent = SAVE.coins;
  $('#hud-stars').textContent = totalStars() + '/' + totalStarsMax();
  const r = rankOf(SAVE.xp);
  $('#hud-rank').textContent = r.name;
  $('#xp-label').textContent = 'דרגה ' + r.lvl + ' · ' + r.name;
  if (r.max) {
    $('#xp-next').textContent = SAVE.xp + ' נק׳';
    $('#xp-fill').style.width = '100%';
  } else {
    $('#xp-next').textContent = SAVE.xp + ' / ' + r.next + ' נק׳';
    $('#xp-fill').style.width = Math.min(100, ((SAVE.xp - r.base) / (r.next - r.base)) * 100) + '%';
  }
  $('#cost-fifty').textContent = GAME_CONFIG.fiftyCost;
  $('#cost-hint').textContent = GAME_CONFIG.hintCost;
  $('#cost-skip').textContent = GAME_CONFIG.skipCost;
}

function renderModes() {
  const g = $('#modes-grid');
  g.innerHTML = '';
  MODES.forEach(m => {
    const total = BY_DIFF.has(m.id)
      ? DIFFS.reduce((b, d) => b + levelCount(m.id, d.id), 0)
      : levelCount(m.id);
    const got = (BY_DIFF.has(m.id) ? DIFFS.map(d => diffKey(m.id, d.id)) : [m.id])
      .reduce((a, k) => a + Object.values(SAVE.stars[k] || {}).reduce((x, y) => x + y, 0), 0);
    const b = document.createElement('button');
    b.className = 'mode-card';
    b.style.setProperty('--mc', m.color);
    b.innerHTML = `
      <div class="mode-ico">${m.icon}</div>
      <h3>${m.name}</h3>
      <p>${m.tag}</p>
      <div class="mode-prog">
        <span>★ ${got}/${total * 3}</span>
        <span class="bar"><i style="width:${(got / (total * 3)) * 100}%"></i></span>
      </div>`;
    b.onclick = () => { SFX.tap(); openLevels(m.id); };
    g.appendChild(b);
  });
  $('#site-count').textContent = SITES.length;
}

/* --------------------------------------------- שלבים ---- */
let curMode = null, curDiff = 1;
function openLevels(mode, diff) {
  curMode = mode;
  if (diff) curDiff = diff;
  const m = MODE_BY_ID[mode];
  $('#lv-mode-icon').textContent = m.icon;
  $('#lv-mode-name').textContent = m.name;
  $('#lv-mode-desc').textContent = m.desc;

  const tabs = $('#diff-tabs');
  tabs.innerHTML = '';
  if (BY_DIFF.has(mode)) {
    DIFFS.forEach(d => {
      const b = document.createElement('button');
      b.className = 'diff-tab' + (curDiff === d.id ? ' on' : '');
      b.innerHTML = `${d.name}<small>${poolFor(d.id).length} אתרים · ${d.sub}</small>`;
      b.onclick = () => { SFX.tap(); openLevels(mode, d.id); };
      tabs.appendChild(b);
    });
  }

  const g = $('#levels-grid');
  g.innerHTML = '';
  const total = levelCount(mode, curDiff);
  const stars = SAVE.stars[diffKey(mode, curDiff)] || {};
  for (let i = 1; i <= total; i++) {
    const got = stars[i] || 0;
    const unlocked = i === 1 || (stars[i - 1] || 0) > 0;
    const b = document.createElement('button');
    b.className = 'level-btn' + (unlocked ? (got ? ' done' : '') : ' locked');
    b.innerHTML = unlocked
      ? `<span class="num">${i}</span><span class="st">${'★'.repeat(got).replace(/★/g, '<b>★</b>')}${'☆'.repeat(3 - got)}</span>`
      : `<span class="num">🔒</span><span class="st">נעול</span>`;
    b.onclick = () => {
      if (!unlocked) { SFX.bad(); toast('סיימו את השלב הקודם כדי לפתוח'); return; }
      SFX.tap(); startGame(mode, i, { diff: curDiff });
    };
    g.appendChild(b);
  }
  show('levels');
}

/* --------------------------------------------- משחק ---- */
let G = null;

function startGame(mode, level, opts = {}) {
  clearTimeout(nextTimer);
  const diff = opts.diff || curDiff;
  const qs = opts.daily ? opts.qs : buildQuestions(mode, level, diff);
  G = {
    mode, level, diff, qs, idx: 0, score: 0, correct: 0,
    answered: false, results: [], daily: !!opts.daily,
    used: { fifty: false, hint: false }
  };
  $('#play-score').textContent = '0';
  $('#lifelines').style.display = opts.daily ? 'none' : 'flex';
  show('play');
  renderQuestion();
}

/* נקודות ההתקדמות נבנות מחדש, כי שאלות הדרכה מתווספות תוך כדי */
function renderDots() {
  const dots = $('#qdots');
  dots.innerHTML = G.qs.map((q, i) => {
    const r = G.results[i];
    const cls = r ? (r.ok ? 'ok' : 'bad') : (i === G.idx ? 'now' : '');
    return `<i class="${cls}${q.guide ? ' small' : ''}"></i>`;
  }).join('');
}

let timerRAF = null, timerEnd = 0;
function startTimer(sec) {
  stopTimer();
  const fill = $('#timer-fill');
  fill.classList.remove('warn');
  timerEnd = performance.now() + sec * 1000;
  const step = () => {
    const left = timerEnd - performance.now();
    const k = Math.max(0, left / (sec * 1000));
    fill.style.transform = `scaleX(${k})`;
    if (k < 0.3) fill.classList.add('warn');
    if (left <= 0) { timeUp(); return; }
    timerRAF = requestAnimationFrame(step);
  };
  timerRAF = requestAnimationFrame(step);
}
function stopTimer() { if (timerRAF) cancelAnimationFrame(timerRAF); timerRAF = null; }
function timeLeftRatio(sec) { return Math.max(0, (timerEnd - performance.now()) / (sec * 1000)); }

function renderQuestion() {
  const q = G.qs[G.idx];
  G.answered = false;
  G.hintUsed = false;

  renderDots();
  resetPlacement();

  $('#prompt-kicker').textContent = q.kicker;
  $('#prompt-text').textContent = q.text;
  $('#prompt-sub').textContent = q.sub || '';
  $('#feedback').className = 'feedback';
  $('#feedback').innerHTML = '';
  $('#map-hud').innerHTML = '';
  $('#play-legend').hidden = true;
  $('#screen-play').classList.remove('geo-reveal');

  $$('.ll').forEach(b => {
    b.classList.remove('used');
    b.disabled = false;
  });
  if (q.kind !== 'choice') { const f = $('[data-ll="fifty"]'); f.disabled = true; f.classList.add('used'); }

  const shell = $('#map-shell');
  const ans = $('#answers');
  ans.innerHTML = '';

  if (q.showMap) {
    shell.classList.add('on');
    mountMap('map-host');
    GameMap.clearPins();
    GameMap.resetRegionStates();

    GameMap.showGeology(false);
    GameMap.hidePaths();
    if (q.mapMode === 'pathPick') {
      /* כל התוואים המועמדים באותו צבע חיוור – הצבע לא מסגיר את התשובה */
      GameMap.showRegions(false);
      GameMap.showRegionLabels(false);
      GameMap.showPaths(q.candidates, true);
      GameMap.fitPaths(q.candidates, 0.25, false);
      GameMap.setTap(ll => onMapTapPath(ll));
      $('#map-hud').innerHTML = '<span class="tag">👆 לחצו על הקו הנכון</span>';
    } else if (q.mapMode === 'pathHidden') {
      /* המפה נקייה בשלב השאלה; התוואי נחשף רק עם התשובה */
      GameMap.showRegions(false);
      GameMap.showRegionLabels(false);
      GameMap.fitAll(false);
      GameMap.setTap(null);
    } else if (q.mapMode === 'pinRegion') {
      GameMap.showRegions(true, .3);
      GameMap.fitAround(q.site.lat, q.site.lon, 0.95, false);
      GameMap.showRegionLabels(true);
      GameMap.pin({ lat: q.site.lat, lon: q.site.lon, type: 'target', pulse: true });
      GameMap.setTap(null);
    } else if (q.mapMode === 'geoProbe') {
      /* שלב השאלה: המפה נייטרלית לגמרי – רק היעד מודגש, כדי
         שצבע הסלע לא יסגיר את התשובה. */
      GameMap.showRegions(false);
      GameMap.showRegionLabels(false);
      GameMap.resetAreaStates();
      GameMap.showGeology(false);
      GameMap.fitAll(false);
      if (q.target.area) {
        GameMap.probeArea(q.target.area);
      } else {
        GameMap.pin({ lat: q.target.lat, lon: q.target.lon, type: 'probe', pulse: true, label: q.target.name });
      }
      GameMap.setTap(null);
    } else if (q.mapMode === 'geoBlank') {
      GameMap.showRegions(false);
      GameMap.showRegionLabels(false);
      GameMap.showGeology(true, .55);
      GameMap.resetAreaStates();
      GameMap.fitAll(false);
      GameMap.setTap(ll => onMapTapArea(ll));
    } else if (q.mapMode === 'regions' || q.mapMode === 'regionsBlank') {
      GameMap.showRegions(true, .5);
      GameMap.showRegionLabels(false);
      GameMap.fitAll(false);
      GameMap.setTap(ll => onMapTapRegion(ll));
    } else {
      /* mapPoint – מציבים סיכה בגרירה או בלחיצה, ואז מאשרים */
      GameMap.showGeology(false);
      GameMap.showRegions(true, .2);
      GameMap.showRegionLabels(!!SAVE.labels);
      GameMap.fitAll(false);
      GameMap.setTap(ll => placePin(ll));
      $('#dock').classList.add('on');
      showZoomHint();
    }
  } else {
    shell.classList.remove('on');
    GameMap.setTap(null);
  }
  if (q.guide) {
    $('#prompt-kicker').style.color = GUIDE_TYPES[q.gType].color;
  } else {
    $('#prompt-kicker').style.color = '';
  }

  if (q.kind === 'choice') {
    q.options.forEach(o => {
      const b = document.createElement('button');
      b.className = 'ans';
      b.textContent = o.label;
      b.onclick = () => answerChoice(b, o);
      ans.appendChild(b);
    });
  }

  startTimer(q.time || 20);
}

/* ---------- תשובות ---------- */
function gradeStars(scorePct) {
  if (scorePct >= 0.9) return 3;
  if (scorePct >= 0.7) return 2;
  if (scorePct >= 0.45) return 1;
  return 0;
}

function award(q, pts, ok, note) {
  if (G.answered) return;
  G.answered = true;
  stopTimer();
  GameMap.setTap(null);

  const bonus = ok ? Math.round(pts * 0.25 * timeLeftRatio(q.time || 20)) : 0;
  const total = pts + bonus;
  G.score += total;
  if (ok) G.correct++;
  $('#play-score').textContent = G.score;

  G.results[G.idx] = { q, ok, note, pts: total };
  renderDots();

  if (ok) { SFX.good(); buzz(24); } else { SFX.bad(); buzz([28, 60, 28]); }

  if (q.site) SAVE.seen[q.site.id] = (SAVE.seen[q.site.id] || 0) + 1;

  if (q.mapMode === 'geoProbe') revealGeoMap(q);
  if (q.mapMode === 'pathHidden') revealPathMap(q);
  maybeInjectGuide(q);

  /* אין מעבר אוטומטי – ההסבר נשאר על המסך עד שלוחצים "המשך",
     כדי שיהיה זמן לקרוא אותו עד הסוף. */
  const last = G.idx >= G.qs.length - 1;
  const fb = $('#feedback');
  fb.className = 'feedback on ' + (ok ? 'good' : 'bad');
  fb.innerHTML =
    `<div class="fb-head">
       <b>${ok ? '✔ ' + (note || 'נכון!') : '✘ ' + (note || 'לא מדויק')}</b>
       <button class="fb-next" id="fb-next">${last ? 'לסיכום ←' : 'המשך ←'}</button>
     </div>
     <span>${q.explain || ''}</span>`;
  $('#fb-next').onclick = e => { e.stopPropagation(); advanceNow(); };
}

/* אחרי התשובה נחשפת המפה הגיאולוגית המלאה, והיעד מסומן בתוכה */
function revealGeoMap(q) {
  /* בשלב החשיפה מפנים מקום למפה: קווי החיים והאפשרויות שלא
     נבחרו מתקפלים, כדי שהמפה הגיאולוגית תהיה גדולה וקריאה. */
  $('#screen-play').classList.add('geo-reveal');
  /* המפה הגיאולוגית המלאה של הארץ, והיעד מודגש בתוכה */
  GameMap.revealGeology(0.85);
  if (q.target.area) {
    GameMap.markArea(q.target.area);
  } else {
    GameMap.clearPins();
    const id = GameMap.areaAt(q.target.lon, q.target.lat);
    if (id) GameMap.markArea(id);
    GameMap.pin({ lat: q.target.lat, lon: q.target.lon, type: 'correct', label: q.target.name });
  }
  GameMap.fitAll(true);

  const r = ROCKS[q.rock];
  $('#map-hud').innerHTML =
    `<span class="tag"><i class="sw" style="background:${r.color}"></i>${r.name}</span>`;

  /* המקרא המלא יושב מתחת למפה ולא מסתיר אותה */
  const seen = [...new Set(GEO_AREAS.map(a => a.rock))];
  const lg = $('#play-legend');
  lg.hidden = false;
  lg.innerHTML = seen.map(k =>
    `<span class="${k === q.rock ? 'hit' : ''}"><i style="background:${ROCKS[k].color}"></i>${ROCKS[k].name}</span>`
  ).join('');
}

/* ---------- חשיפת תוואי הדרך או הנחל ---------- */
function pathItemOf(q) {
  const id = q.revealPath || q.targetPath;
  if (!id || !PATH_BOOKS[q.pathKind]) return null;
  return pathBook(q)[id];
}
const PATH_BOOKS = {
  route: () => ROUTE_BY_ID, stream: () => STREAM_BY_ID,
  fold: () => FOLD_BY_ID, bound: () => BOUND_BY_ID
};
function pathBook(q) { return PATH_BOOKS[q.pathKind](); }

/* הפרטים שמלווים כל סוג תוואי במקרא */
function pathFacts(kind, it) {
  if (kind === 'route') return [['🛣️', it.modern], ['🏰', it.guards]];
  if (kind === 'stream') return [['⛲', it.src], ['🌊', it.out]];
  if (kind === 'fold') return [[it.kind === 'anticline' ? '⛰️' : '🥣', it.kind === 'anticline' ? 'קמר' : 'קער'],
                               ['🪨', it.rock]].concat(it.peak ? [['📏', it.peak]] : []);
  return [['◀', it.a], ['▶', it.b]];
}

/* המקרא מתחת למפה. בשאלת איתור – שמות כל המועמדים, כדי שיישאר
   בזיכרון מי מהם מי. בשאלת ידע – הפרטים על התוואי שנחשף. */
function pathLegend(q, ids) {
  const target = q.revealPath || q.targetPath;
  const byId = pathBook(q);
  const lg = $('#play-legend');
  lg.hidden = false;
  if (ids && ids.length > 1) {
    /* התשובה ראשונה – המקרא נגלל, וכך היא תמיד בשדה הראייה */
    lg.innerHTML = [target, ...ids.filter(id => id !== target)].map(id =>
      `<span class="${id === target ? 'hit' : ''}"><i style="background:${byId[id].color}"></i>${byId[id].name}</span>`
    ).join('');
    return;
  }
  const it = byId[target];
  lg.innerHTML = `<span class="hit"><i style="background:${it.color}"></i>${it.name}</span>` +
    pathFacts(q.pathKind, it).filter(f => f[1]).map(([ic, tx]) => `<span>${ic} ${tx}</span>`).join('');
}

/* מסמנים בשם רק את התוואי הנכון ואת זה שנבחר בטעות – שאר השמות
   נמצאים במקרא, ועל המפה הם היו נופלים זה על זה ליד המפגשים.
   כל תווית נתלית בנקודה הרחוקה ביותר מזו שכבר הונחה. */
function labelPaths(q, ids) {
  const byId = pathBook(q);
  const target = q.revealPath || q.targetPath;
  const order = [target, ...ids.filter(id => id !== target)];
  const placed = [];
  order.forEach((id, i) => {
    const pts = byId[id].path.map(([lo, la]) => ({ lat: la, lon: lo }));
    const inner = pts.length > 2 ? pts.slice(1, -1) : pts;
    let best = inner[Math.floor(inner.length / 2)];
    if (placed.length) {
      let bd = -1;
      inner.forEach(p => {
        const d = Math.min(...placed.map(o => GameMap.haversine(p.lat, p.lon, o.lat, o.lon)));
        if (d > bd) { bd = d; best = p; }
      });
    }
    placed.push(best);
    GameMap.pin({ lat: best.lat, lon: best.lon, small: true, label: byId[id].name,
      type: id === target ? 'path' : 'pathwrong', labelDy: i % 2 ? 128 : -88 });
  });
}

function revealPathMap(q) {
  const it = pathItemOf(q);
  if (!it) return;
  $('#screen-play').classList.add('geo-reveal');
  GameMap.showPaths([it.id]);
  GameMap.setPathState(it.id, 'correct');
  GameMap.clearPins();
  labelPaths(q, [it.id]);
  /* קמר או תפר בודד קצר מדי כדי למלא את המסך – משאירים הקשר ארצי */
  const wide = q.pathKind === 'fold' || q.pathKind === 'bound' ? 2.4 : 0;
  GameMap.fitPaths([it.id], 0.3, true, wide);
  $('#map-hud').innerHTML =
    `<span class="tag"><i class="sw" style="background:${it.color}"></i>${it.name}</span>`;
  pathLegend(q);
}

/* חשיפת שאלת האיתור: הנכון מודגש, הבחירה השגויה באדום, וכולם בשמם */
function showPathAnswer(q, hit) {
  const byId = pathBook(q);
  GameMap.showPaths(q.candidates);
  GameMap.setPathState(q.targetPath, 'correct');
  if (hit && hit !== q.targetPath) GameMap.setPathState(hit, 'wrong');
  GameMap.clearPins();
  labelPaths(q, hit && hit !== q.targetPath ? [q.targetPath, hit] : [q.targetPath]);
  $('#screen-play').classList.add('geo-reveal');
  $('#map-hud').innerHTML =
    `<span class="tag"><i class="sw" style="background:${byId[q.targetPath].color}"></i>${byId[q.targetPath].name}</span>`;
  pathLegend(q, q.candidates);
}

/* לחיצה על אחד התוואים המועמדים */
function onMapTapPath(ll) {
  if (G.answered) return;
  const q = G.qs[G.idx];
  const hit = GameMap.pathAt(ll.lon, ll.lat, q.candidates);
  if (!hit) { toast('לחצו על אחד הקווים שעל המפה'); return; }
  const ok = hit === q.targetPath;
  const byId = pathBook(q);
  showPathAnswer(q, hit);
  award(q, ok ? 100 : 0, ok, ok ? 'נכון – ' + byId[hit].name : 'זה ' + byId[hit].name);
}

/* אחרי מיקום על המפה – שלוש שאלות הדרכה על אותו אתר */
function maybeInjectGuide(q) {
  if (!SAVE.guideQ || G.daily) return;
  if (q.kind !== 'mapPoint' || q.guide || q.guideDone) return;
  const site = q.site;
  if (!site) return;
  const rows = guideRowsFor(site);
  if (!rows.length) return;
  q.guideDone = true;
  const rnd = mulberry32(hashStr('gq' + site.id + G.level));
  const added = rows.map(r => guideQuestion(site, r, rnd));
  G.qs.splice(G.idx + 1, 0, ...added);
  renderDots();
}

/* המעבר לשאלה הבאה הוא ידני בלבד. scheduleNext משמש רק לדילוג,
   שבו אין מה לקרוא. */
let nextTimer = null;
function scheduleNext(ms) {
  clearTimeout(nextTimer);
  nextTimer = setTimeout(nextQuestion, ms);
}
function advanceNow() {
  if (!G || !G.answered) return;
  clearTimeout(nextTimer);
  nextQuestion();
}

function answerChoice(btn, opt) {
  if (G.answered) return;
  const q = G.qs[G.idx];
  const all = $$('#answers .ans');
  all.forEach(b => b.disabled = true);
  if (opt.correct) {
    btn.classList.add('correct');
    award(q, 100, true, 'נכון!');
  } else {
    btn.classList.add('wrong');
    all.forEach((b, i) => { if (q.options[i].correct) b.classList.add('correct'); });
    const right = q.options.find(o => o.correct).label;
    award(q, 0, false, 'התשובה: ' + right);
  }
}

/* --------- הצבת הסיכה, אישור, ואחוזי דיוק --------- */
let placedLL = null;

function resetPlacement() {
  placedLL = null;
  $('#dock').classList.remove('on');
  $('#dock-pin').classList.remove('placed');
  $('#btn-confirm').classList.remove('on');
  $('#dock-hint').textContent = 'גררו את הסיכה אל המקום הנכון במפה';
  const b = $('#acc-badge');
  b.className = 'acc-badge';
  $('#acc-fill').style.strokeDashoffset = 327;
  $('#acc-pct').textContent = '0';
  $('#acc-word').textContent = '';
}

function placePin(ll) {
  if (!G || G.answered) return;
  const q = G.qs[G.idx];
  if (q.kind !== 'mapPoint') return;
  if (!GameMap.onLand(ll.lon, ll.lat) && !placedLL) {
    /* מותר להניח גם בים, אבל נרמז שזה כנראה לא הכוונה */
    $('#dock-hint').textContent = 'הנחתם מחוץ ליבשה – אפשר לגרור שוב';
  } else {
    $('#dock-hint').textContent = 'אפשר לגרור שוב כדי לדייק, או לאשר';
  }
  placedLL = { lat: ll.lat, lon: ll.lon };
  GameMap.clearPins();
  GameMap.pin({ lat: ll.lat, lon: ll.lon, type: 'answer', pulse: true });
  $('#dock-pin').classList.add('placed');
  $('#btn-confirm').classList.add('on');
  SFX.tap(); buzz(12);
}

function showAccuracy(pct) {
  const b = $('#acc-badge');
  b.className = 'acc-badge on' + (pct >= 65 ? '' : pct >= 35 ? ' mid' : ' low');
  $('#acc-word').textContent = accuracyWord(pct);
  const t0 = performance.now();
  const step = now => {
    const k = Math.min(1, (now - t0) / 900);
    $('#acc-pct').textContent = Math.round(pct * (1 - Math.pow(1 - k, 3)));
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
  requestAnimationFrame(() => {
    $('#acc-fill').style.strokeDashoffset = 327 * (1 - pct / 100);
  });
}

function confirmPlacement() {
  if (!G || G.answered || !placedLL) return;
  const q = G.qs[G.idx];
  const ll = placedLL;
  const d = GameMap.haversine(ll.lat, ll.lon, q.target.lat, q.target.lon);
  const pct = accuracyPct(d);

  GameMap.clearPins();
  GameMap.pin({ lat: ll.lat, lon: ll.lon, type: 'answer' });
  GameMap.pin({ lat: q.target.lat, lon: q.target.lon, type: 'correct', label: q.site ? q.site.n : '' });
  GameMap.line(ll, { lat: q.target.lat, lon: q.target.lon });
  showAccuracy(pct);

  $('#dock').classList.remove('on');
  $('#map-hud').innerHTML = `<span class="tag">${Math.round(d)} ק״מ מהיעד</span>`;
  award(q, pct, pct >= 70, accuracyWord(pct) + ' · ' + pct + '% דיוק');
}

function onMapTapRegion(ll) {
  if (G.answered) return;
  const q = G.qs[G.idx];
  const hit = GameMap.regionAt(ll.lon, ll.lat);
  if (!hit) { toast('לחצו בתוך שטח המפה'); return; }
  const ok = hit === q.targetRegion;
  GameMap.setRegionState(q.targetRegion, 'correct');
  if (!ok) GameMap.setRegionState(hit, 'wrong');
  if (q.site) GameMap.pin({ lat: q.site.lat, lon: q.site.lon, type: 'correct', label: q.site.n });
  $('#map-hud').innerHTML = `<span class="tag">${REGION_BY_ID[q.targetRegion].name}</span>`;
  award(q, ok ? 100 : 0, ok, ok ? 'נכון!' : 'זה ' + REGION_BY_ID[hit].name + ', והתשובה: ' + REGION_BY_ID[q.targetRegion].name);
}

function onMapTapArea(ll) {
  if (G.answered) return;
  const q = G.qs[G.idx];
  const hit = GameMap.areaAt(ll.lon, ll.lat);
  if (!hit) { toast('לחצו בתוך שטח המפה'); return; }
  const ok = AREA_BY_ID[hit].rock === q.rock;
  /* מדגישים את כל האזורים שבהם הסלע הזה חשוף */
  GEO_AREAS.filter(a => a.rock === q.rock).forEach(a => GameMap.setAreaState(a.id, 'correct'));
  if (!ok) GameMap.setAreaState(hit, 'wrong');
  $('#map-hud').innerHTML = `<span class="tag">${ROCKS[q.rock].name}</span>`;
  award(q, ok ? 100 : 0, ok,
    ok ? 'נכון – ' + AREA_BY_ID[hit].name
       : 'ב' + AREA_BY_ID[hit].name + ' יש ' + ROCKS[AREA_BY_ID[hit].rock].name);
}

function timeUp() {
  const q = G.qs[G.idx];
  if (G.answered) return;
  if (q.kind === 'choice') {
    $$('#answers .ans').forEach((b, i) => {
      b.disabled = true;
      if (q.options[i].correct) b.classList.add('correct');
    });
    award(q, 0, false, 'נגמר הזמן! התשובה: ' + q.options.find(o => o.correct).label);
  } else if (q.kind === 'mapPoint') {
    if (placedLL) return confirmPlacement();
    GameMap.pin({ lat: q.target.lat, lon: q.target.lon, type: 'correct', label: q.site ? q.site.n : '' });
    $('#dock').classList.remove('on');
    award(q, 0, false, 'נגמר הזמן – לא הונחה סיכה');
  } else if (q.kind === 'mapPath') {
    showPathAnswer(q, null);
    award(q, 0, false, 'נגמר הזמן! ' + pathBook(q)[q.targetPath].name);
  } else if (q.kind === 'geoArea') {
    GEO_AREAS.filter(a => a.rock === q.rock).forEach(a => GameMap.setAreaState(a.id, 'correct'));
    award(q, 0, false, 'נגמר הזמן! ' + ROCKS[q.rock].where);
  } else {
    GameMap.setRegionState(q.targetRegion, 'correct');
    award(q, 0, false, 'נגמר הזמן! ' + REGION_BY_ID[q.targetRegion].name);
  }
}

function nextQuestion() {
  clearTimeout(nextTimer);
  G.idx++;
  if (G.idx >= G.qs.length) finishGame();
  else renderQuestion();
}

/* ---------- קווי חיים ---------- */
function useLifeline(type) {
  if (!G || G.answered) return;
  const q = G.qs[G.idx];
  const cost = { fifty: GAME_CONFIG.fiftyCost, hint: GAME_CONFIG.hintCost, skip: GAME_CONFIG.skipCost }[type];
  if (SAVE.coins < cost) { SFX.bad(); toast('אין מספיק מטבעות'); return; }

  if (type === 'fifty') {
    if (q.kind !== 'choice') return;
    const btns = $$('#answers .ans');
    const wrongIdx = q.options.map((o, i) => o.correct ? -1 : i).filter(i => i >= 0);
    shuffle(wrongIdx).slice(0, 2).forEach(i => btns[i].classList.add('dim'));
  } else if (type === 'hint') {
    const h = q.hint || { text: 'אין רמז' };
    $('#map-hud').innerHTML = `<span class="tag">💡 ${h.text}</span>`;
    if (!q.showMap) {
      const fb = $('#feedback');
      fb.className = 'feedback on';
      fb.innerHTML = `<b>💡 רמז</b><span>${h.text}</span>`;
    }
    if (h.region) GameMap.setRegionState(h.region, 'correct');
    if (h.pin) GameMap.pin({ lat: h.pin.lat, lon: h.pin.lon, type: 'atlas', label: h.pin.n });
  } else if (type === 'skip') {
    stopTimer();
    G.answered = true;
    G.results[G.idx] = { q, ok: false, note: 'דילוג', pts: 0, skipped: true };
    renderDots();
    scheduleNext(250);
  }

  SAVE.coins -= cost; persist(); renderHUD(); SFX.coin();
  const b = $(`[data-ll="${type}"]`);
  if (type !== 'skip') { b.classList.add('used'); b.disabled = true; }
}

/* ---------- סיום ---------- */
function finishGame() {
  stopTimer();
  const maxScore = G.qs.length * 125;
  const misses0 = G.results.filter(r => r && !r.ok).length;
  const pct = G.score / maxScore;
  const stars = G.daily ? 0 : gradeStars(G.correct / G.qs.length);

  let coins = G.correct * GAME_CONFIG.coinsCorrect;
  if (!G.daily && G.correct === G.qs.length) coins += GAME_CONFIG.coinsPerfect;
  SAVE.coins += coins;
  SAVE.xp += G.score;

  if (G.daily) {
    SAVE.daily = { key: G.dailyKey, score: G.score, correct: G.correct };
  } else {
    const key = diffKey(G.mode, G.diff);
    SAVE.stars[key] = SAVE.stars[key] || {};
    SAVE.stars[key][G.level] = Math.max(SAVE.stars[key][G.level] || 0, stars);
    SAVE.best[key + ':' + G.level] = Math.max(SAVE.best[key + ':' + G.level] || 0, G.score);
  }
  persist();

  const sr = $('#stars-row');
  sr.style.display = G.daily ? 'none' : 'flex';
  $$('#stars-row .star').forEach((s, i) => {
    s.classList.remove('on');
    if (i < stars) setTimeout(() => { s.classList.add('on'); SFX.coin(); }, 380 + i * 300);
  });

  const titles = ['נמשיך להתאמן', 'לא רע בכלל!', 'יפה מאוד!', 'מושלם! 🎉'];
  $('#res-title').textContent = G.daily
    ? (G.correct >= 8 ? 'אתגר יומי – מצוין!' : 'אתגר יומי הושלם')
    : titles[stars];
  $('#res-sub').textContent = G.daily
    ? 'חזרו מחר לאתגר חדש'
    : MODE_BY_ID[G.mode].name + ' · ' +
      (BY_DIFF.has(G.mode) ? DIFFS[G.diff - 1].name + ' · ' : '') + 'שלב ' + G.level;
  $('#res-score').textContent = G.score;
  $('#res-correct').textContent = G.correct + '/' + G.qs.length;
  $('#res-coins').textContent = '+' + coins;

  const rv = $('#res-review');
  const misses = G.results.filter(r => r && !r.ok);
  rv.innerHTML = misses.length
    ? '<div class="sec-title" style="margin:6px 0 10px">כדאי לחזור על:</div>' + misses.map(r => `
        <div class="rv"><span class="mk">${r.q.site ? CATEGORIES[r.q.site.c].icon : '📌'}</span>
        <div><b>${r.q.site ? r.q.site.n : r.q.text}</b><p>${(r.q.explain || '').slice(0, 150)}</p></div></div>`).join('')
    : '<div class="rv"><span class="mk">🏅</span><div><b>ללא טעויות</b><p>סיבוב מושלם – אתם מוכנים לשטח.</p></div></div>';

  const hasNext = !G.daily && G.level < levelCount(G.mode, G.diff) && stars > 0;
  $('#res-next').style.display = hasNext ? 'block' : 'none';
  $('#res-again').textContent = G.daily ? 'לתפריט' : 'שוב';

  if (stars === 3 || (G.daily && G.correct >= 8)) { SFX.win(); confetti(); }
  else if (stars > 0) SFX.coin();

  renderHUD();
  show('result');
}

function confetti() {
  const box = document.createElement('div');
  box.className = 'confetti';
  const colors = ['#2ee6c5', '#ffce4d', '#4aa8ff', '#ff6b81', '#a78bfa', '#46e08a'];
  for (let i = 0; i < 70; i++) {
    const s = document.createElement('i');
    s.style.left = Math.random() * 100 + '%';
    s.style.top = '-20px';
    s.style.background = colors[i % colors.length];
    s.style.animationDuration = (1.6 + Math.random() * 1.6) + 's';
    s.style.animationDelay = (Math.random() * .5) + 's';
    s.style.transform = `rotate(${Math.random() * 360}deg)`;
    box.appendChild(s);
  }
  document.body.appendChild(box);
  setTimeout(() => box.remove(), 3800);
}

/* --------------------------------------------- אטלס ---- */
let atlasFilter = 'all';
function openAtlas() {
  show('atlas');
  mountMap('atlas-host');
  GameMap.showRegions(true, .35);
  GameMap.showRegionLabels(true);
  GameMap.fitAll(false);
  GameMap.setTap(null);
  renderAtlasChips();
  renderAtlasList();
}
function renderAtlasChips() {
  const c = $('#atlas-chips');
  c.innerHTML = '';
  const mk = (id, label) => {
    const b = document.createElement('button');
    b.className = 'chip' + (atlasFilter === id ? ' on' : '');
    b.textContent = label;
    b.onclick = () => { atlasFilter = id; SFX.tap(); renderAtlasChips(); renderAtlasList(); };
    c.appendChild(b);
  };
  mk('all', 'הכול (' + SITES.length + ')');
  mk('geo', '🪨 מפה גיאולוגית');
  mk('unesco', '🏆 מורשת עולמית');
  REGIONS.forEach(r => mk(r.id, r.short));
}
function renderAtlasList() {
  const list = $('#atlas-list');
  const legend = $('#geo-legend');

  /* ---- מצב לימוד גיאולוגי ---- */
  if (atlasFilter === 'geo') {
    legend.hidden = false;
    GameMap.clearPins();
    GameMap.resetRegionStates();
    GameMap.showRegions(false);
    GameMap.showRegionLabels(false);
    GameMap.showGeology(true, .7);
    GameMap.fitAll(true);
    GameMap.setTap(ll => {
      const id = GameMap.areaAt(ll.lon, ll.lat);
      if (id) openRock(AREA_BY_ID[id]);
    });
    legend.innerHTML = Object.entries(ROCKS).map(([k, r]) =>
      `<button data-rock="${k}"><i style="background:${r.color}"></i>${r.name}</button>`).join('');
    legend.querySelectorAll('button').forEach(b => b.onclick = () => {
      const k = b.dataset.rock;
      GameMap.resetAreaStates();
      GEO_AREAS.filter(a => a.rock === k).forEach(a => GameMap.setAreaState(a.id, 'correct'));
      legend.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
      const first = GEO_AREAS.find(a => a.rock === k);
      if (first) openRock(first);
    });
    list.innerHTML = GEO_AREAS.map(a =>
      `<button class="site-row" data-area="${a.id}">
         <span class="ico"><span style="display:inline-block;width:13px;height:13px;border-radius:4px;background:${ROCKS[a.rock].color}"></span></span>
         <span><b>${a.name}</b><small>${ROCKS[a.rock].name}</small></span>
       </button>`).join('');
    list.querySelectorAll('.site-row').forEach(b => b.onclick = () => {
      const a = AREA_BY_ID[b.dataset.area];
      GameMap.resetAreaStates();
      GameMap.setAreaState(a.id, 'correct');
      GameMap.fitArea(a.id, true);
      openRock(a);
    });
    return;
  }
  legend.hidden = true;
  GameMap.showGeology(false);
  GameMap.setTap(null);

  let arr = SITES;
  if (atlasFilter === 'unesco') arr = UNESCO_SITES;
  else if (atlasFilter !== 'all') arr = SITES.filter(s => s.r === atlasFilter);

  GameMap.clearPins();
  GameMap.resetRegionStates();
  if (atlasFilter !== 'all' && atlasFilter !== 'unesco') {
    GameMap.setRegionState(atlasFilter, 'correct');
    GameMap.fitRegion(atlasFilter, true);
  } else {
    GameMap.fitAll(true);
  }
  arr.forEach(s => GameMap.pin({ lat: s.lat, lon: s.lon, type: 'atlas' }));

  list.innerHTML = '';
  arr.forEach(s => {
    const b = document.createElement('button');
    b.className = 'site-row';
    b.innerHTML = `<span class="ico">${CATEGORIES[s.c].icon}</span>
      <span><b>${s.n}</b><small>${REGION_BY_ID[s.r].name}</small></span>
      ${s.u ? '<span class="u">🏆</span>' : ''}`;
    b.onclick = () => openSheet(s);
    list.appendChild(b);
  });
}

/* כרטיס יחידת סלע */
function openRock(area) {
  const r = ROCKS[area.rock];
  SFX.tap();
  $('#sheet-ico').textContent = '🪨';
  $('#sheet-name').textContent = area.name;
  $('#sheet-meta').textContent = r.name + ' · ' + r.group;
  $('#sheet-fact').innerHTML = `<div class="rock-card">
    <div class="rock-row"><b>גיל</b><span>${r.age}</span></div>
    <div class="rock-row"><b>מאפיינים</b><span>${r.traits}</span></div>
    <div class="rock-row"><b>קרקע</b><span>${r.soil}</span></div>
    <div class="rock-row"><b>מים</b><span>${r.water}</span></div>
    <div class="rock-row"><b>איפה עוד</b><span>${r.where}</span></div>
    <div class="rock-row"><b>הערה</b><span>${area.note}</span></div>
  </div>`;
  $('#sheet-tags').innerHTML = '';
  $('#sheet').classList.add('on');
}

function openSheet(s) {
  SFX.tap();
  $('#sheet-ico').textContent = CATEGORIES[s.c].icon;
  $('#sheet-name').textContent = s.n;
  $('#sheet-meta').textContent = REGION_BY_ID[s.r].name + ' · ' + CATEGORIES[s.c].name;
  $('#sheet-fact').textContent = s.f;
  const tags = [];
  if (s.u) tags.push('🏆 מורשת עולמית');
  tags.push('דרגה ' + s.lvl);
  tags.push(s.lat.toFixed(3) + '°N, ' + s.lon.toFixed(3) + '°E');
  if (SAVE.seen[s.id]) tags.push('נשאלתם ' + SAVE.seen[s.id] + ' פעמים');
  $('#sheet-tags').innerHTML = tags.map(t => `<span class="tag-s">${t}</span>`).join('');
  $('#sheet').classList.add('on');

  if (currentScreen === 'atlas') {
    GameMap.clearPins();
    GameMap.pin({ lat: s.lat, lon: s.lon, type: 'target', pulse: true, label: s.n });
    GameMap.fitBounds([{ lat: s.lat - .35, lon: s.lon - .35 }, { lat: s.lat + .35, lon: s.lon + .35 }], .05, true);
  }
}

let zoomHintShown = false;
function showZoomHint() {
  if (zoomHintShown) return;
  zoomHintShown = true;
  const h = $('#zoom-hint');
  h.classList.add('on');
  setTimeout(() => h.classList.remove('on'), 4200);
}

/* --------------------------------------------- חשבון ---- */
let accTab = 'in';

function openAccount() {
  SFX.tap();
  renderAccount();
  $('#account').classList.add('on');
}

function renderAccount() {
  const me = Cloud.current();
  const note = $('#acc-note');

  if (!Cloud.enabled) {
    $('#acc-out').hidden = true;
    $('#acc-in').hidden = true;
    note.textContent = 'החשבונות אינם מוגדרים בעותק הזה. ההתקדמות נשמרת במכשיר בלבד. ' +
      'להפעלה: מלאו את js/config.js לפי ההוראות ב-README.';
    return;
  }
  note.textContent = '';

  if (me) {
    $('#acc-out').hidden = true;
    $('#acc-in').hidden = false;
    const nm = me.display_name || me.email || 'מחובר';
    $('#acc-initial').textContent = (nm.trim()[0] || '?').toUpperCase();
    $('#acc-who-name').textContent = nm;
    $('#acc-who-mail').textContent = me.email || '';
    const st = cloudStats();
    $('#acc-xp').textContent = st.xp;
    $('#acc-stars').textContent = st.stars;
    setSync(syncState);
  } else {
    $('#acc-out').hidden = false;
    $('#acc-in').hidden = true;
    $('#acc-err').textContent = '';
    setAccTab(accTab);
  }
}

function setAccTab(tab) {
  accTab = tab;
  $$('#acc-tabs button').forEach(b => b.classList.toggle('on', b.dataset.accTab === tab));
  $('#fld-name').hidden = tab !== 'up';
  $('#acc-title').textContent = tab === 'up' ? 'חשבון חדש' : 'התחברות';
  $('#acc-submit').textContent = tab === 'up' ? 'יצירת חשבון' : 'התחברות';
  $('#acc-pass').setAttribute('autocomplete', tab === 'up' ? 'new-password' : 'current-password');
  $('#acc-err').textContent = '';
}

async function submitAccount() {
  const email = $('#acc-email').value.trim();
  const pass = $('#acc-pass').value;
  const name = $('#acc-name').value.trim();
  const err = $('#acc-err');
  err.textContent = '';

  if (!email || !pass) { err.textContent = 'צריך אימייל וסיסמה'; return; }
  if (accTab === 'up' && pass.length < 6) { err.textContent = 'הסיסמה צריכה להיות באורך 6 תווים לפחות'; return; }
  if (accTab === 'up' && !name) { err.textContent = 'צריך שם לתצוגה'; return; }

  const btn = $('#acc-submit');
  btn.disabled = true;
  btn.textContent = 'רגע…';
  try {
    if (accTab === 'up') await Cloud.signUp(email, pass, name);
    else await Cloud.signIn(email, pass);
    await cloudSyncIn();
    renderAccount();
    renderHUD();
    updateAccountChip();
    SFX.coin();
  } catch (e) {
    err.textContent = friendlyAuthError(e);
    SFX.bad();
  } finally {
    btn.disabled = false;
    btn.textContent = accTab === 'up' ? 'יצירת חשבון' : 'התחברות';
  }
}

function friendlyAuthError(e) {
  const m = (e && e.message || '').toLowerCase();
  if (e && e.needsConfirm) return e.message;
  if (m.includes('invalid login')) return 'אימייל או סיסמה שגויים';
  if (m.includes('already registered') || m.includes('already been registered')) return 'האימייל הזה כבר רשום – נסו להתחבר';
  if (m.includes('failed to fetch') || m.includes('networkerror')) return 'אין חיבור לשרת. בדקו אינטרנט, או שהפרויקט בהשהיה';
  if (m.includes('password')) return 'הסיסמה קצרה מדי';
  return e.message || 'משהו השתבש';
}

function updateAccountChip() {
  const btn = $('#btn-account');
  const me = Cloud.enabled && Cloud.current();
  btn.classList.toggle('linked', !!me);
  btn.textContent = me ? ((me.display_name || me.email || '?').trim()[0] || '?').toUpperCase() : '👤';
  $('#board-row').hidden = !me;
}

function doSignOut() {
  Cloud.signOut();
  updateAccountChip();
  renderAccount();
  toast('יצאת מהחשבון. ההתקדמות נשארה במכשיר');
}

/* ------------------------------------------ לוח הקבוצה ---- */
async function openBoard() {
  show('board');
  const list = $('#board-list');
  list.innerHTML = '<div class="board-empty">טוען…</div>';
  try {
    const rows = await Cloud.leaderboard();
    const me = Cloud.current();
    if (!rows.length) {
      list.innerHTML = '<div class="board-empty">עדיין אין תוצאות.<br>סיימו שלב וההתקדמות תופיע כאן.</div>';
      return;
    }
    list.innerHTML = rows.map((r, i) => `
      <div class="board-row ${i < 3 ? 'top' + (i + 1) : ''} ${me && r.display_name === me.display_name ? 'me' : ''}">
        <span class="rank">${i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}</span>
        <b>${escapeHtml(r.display_name)}</b>
        <span class="sc">${r.xp} נק׳ · ${r.stars} ★</span>
      </div>`).join('');
  } catch (e) {
    list.innerHTML = '<div class="board-empty">לא הצלחנו לטעון את הלוח.<br>' + escapeHtml(friendlyAuthError(e)) + '</div>';
  }
}

function escapeHtml(t) {
  return String(t == null ? '' : t).replace(/[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* ------------------------------------------ גרירת סיכה ---- */
let drag = null;

function initDragPin() {
  const pin = $('#dock-pin');
  pin.addEventListener('pointerdown', startDrag);
  pin.addEventListener('keydown', e => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    const q = G && G.qs[G.idx];
    if (q && q.kind === 'mapPoint') {
      toast('אפשר גם ללחוץ ישירות על המפה כדי להניח את הסיכה');
    }
  });
}

function startDrag(e) {
  if (!G || G.answered) return;
  const q = G.qs[G.idx];
  if (!q || q.kind !== 'mapPoint') return;
  e.preventDefault();
  const ghost = document.createElement('div');
  ghost.className = 'drag-ghost';
  ghost.innerHTML = $('#dock-pin').innerHTML;
  document.body.appendChild(ghost);
  drag = { ghost };
  moveDrag(e);
  window.addEventListener('pointermove', moveDrag, { passive: false });
  window.addEventListener('pointerup', endDrag);
  window.addEventListener('pointercancel', endDrag);
}

function overMap(x, y) {
  const r = $('#map-shell').getBoundingClientRect();
  return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
}

function moveDrag(e) {
  if (!drag) return;
  e.preventDefault();
  drag.x = e.clientX; drag.y = e.clientY;
  drag.ghost.style.left = e.clientX + 'px';
  drag.ghost.style.top = e.clientY + 'px';
  $('#map-shell').classList.toggle('drop-ready', overMap(e.clientX, e.clientY));
}

function endDrag() {
  if (!drag) return;
  window.removeEventListener('pointermove', moveDrag);
  window.removeEventListener('pointerup', endDrag);
  window.removeEventListener('pointercancel', endDrag);
  $('#map-shell').classList.remove('drop-ready');
  const { x, y, ghost } = drag;
  ghost.remove();
  drag = null;
  if (x !== undefined && overMap(x, y)) {
    placePin(GameMap.clientToLatLon(x, y));
  }
}

/* --------------------------------------------- אירועים ---- */
function bind() {
  $$('[data-back]').forEach(b => b.onclick = () => { SFX.tap(); goHome(); });
  $('#btn-quit').onclick = () => {
    stopTimer();
    if (G && G.daily) goHome(); else openLevels(curMode || 'locate');
  };
  $('#btn-atlas').onclick = () => { SFX.tap(); openAtlas(); };
  $('#btn-daily').onclick = () => {
    SFX.tap();
    const d = buildDaily();
    if (SAVE.daily && SAVE.daily.key === d.key) {
      toast('כבר שיחקתם היום · שיא: ' + SAVE.daily.score + ' נק׳');
    }
    startGame('daily', 0, { daily: true, qs: d.qs });
    G.dailyKey = d.key;
  };
  $('#res-again').onclick = () => {
    SFX.tap();
    if (G.daily) goHome(); else startGame(G.mode, G.level, { diff: G.diff });
  };
  $('#res-next').onclick = () => { SFX.tap(); startGame(G.mode, G.level + 1, { diff: G.diff }); };
  $$('.ll').forEach(b => b.onclick = () => useLifeline(b.dataset.ll));
  $('#feedback').onclick = advanceNow;
  $('#btn-confirm').onclick = () => { SFX.tap(); confirmPlacement(); };
  initDragPin();

  $('#sheet-close').onclick = () => { $('#sheet').classList.remove('on'); if (currentScreen === 'atlas') renderAtlasList(); };
  $('#sheet').onclick = e => { if (e.target.id === 'sheet') $('#sheet-close').click(); };

  $('#btn-account').onclick = openAccount;
  $('#account-close').onclick = () => $('#account').classList.remove('on');
  $('#account').onclick = e => { if (e.target.id === 'account') $('#account').classList.remove('on'); };
  $('#acc-guest').onclick = () => { $('#account').classList.remove('on'); };
  $$('#acc-tabs button').forEach(b => b.onclick = () => { SFX.tap(); setAccTab(b.dataset.accTab); });
  $('#acc-submit').onclick = submitAccount;
  $('#acc-pass').addEventListener('keydown', e => { if (e.key === 'Enter') submitAccount(); });
  $('#acc-signout').onclick = doSignOut;
  $('#acc-board').onclick = () => { $('#account').classList.remove('on'); openBoard(); };
  $('#btn-board').onclick = () => { SFX.tap(); openBoard(); };
  $('#board-refresh').onclick = () => { SFX.tap(); openBoard(); };

  $('#btn-settings').onclick = () => { SFX.tap(); $('#settings').classList.add('on'); };
  $('#settings-close').onclick = () => $('#settings').classList.remove('on');
  $('#settings').onclick = e => { if (e.target.id === 'settings') $('#settings').classList.remove('on'); };
  $('#opt-sound').onchange = e => { SAVE.sound = e.target.checked ? 1 : 0; persist(); };
  $('#opt-haptic').onchange = e => { SAVE.haptic = e.target.checked ? 1 : 0; persist(); };
  $$('#theme-seg button').forEach(b => b.onclick = () => {
    SAVE.theme = b.dataset.themeOpt; persist(); applyTheme(); SFX.tap();
  });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if ((SAVE.theme || 'auto') === 'auto') applyTheme();
  });

  $('#zoom-in').onclick = () => { GameMap.zoomBy(1.7); SFX.tap(); };
  $('#zoom-out').onclick = () => { GameMap.zoomBy(1 / 1.7); SFX.tap(); };
  $('#zoom-reset').onclick = () => { GameMap.fitAll(true); SFX.tap(); };

  $('#opt-labels').onchange = e => { SAVE.labels = e.target.checked ? 1 : 0; persist(); };
  $('#opt-guideq').onchange = e => {
    SAVE.guideQ = e.target.checked ? 1 : 0; persist(); renderModes();
    toast(SAVE.guideQ ? 'שאלות ההדרכה פעילות' : 'שאלות ההדרכה כבויות');
  };
  $('#btn-reset').onclick = () => {
    if (!confirm('לאפס את כל ההתקדמות?')) return;
    SAVE = { ...DEFAULT_SAVE, stars: {}, best: {}, seen: {}, daily: {} };
    persist(); renderHUD(); renderModes();
    $('#settings').classList.remove('on');
    toast('ההתקדמות אופסה');
  };

  window.addEventListener('keydown', e => {
    if (e.key === 'Escape') { goHome(); return; }
    if ((e.key === 'Enter' || e.key === ' ') && G && G.answered &&
        $('#screen-play').classList.contains('active')) {
      e.preventDefault();
      advanceNow();
    }
  });
}

function goHome() {
  stopTimer();
  clearTimeout(nextTimer);
  GameMap.setTap(null);
  renderHUD();
  renderModes();
  show('home');
}

/* --------------------------------------------- הפעלה ---- */
function boot() {
  applyTheme();
  ensureMap();
  if (Cloud.enabled) {
    Cloud.loadSession();
    if (Cloud.current()) cloudSyncIn();
  }
  updateAccountChip();
  if (!Store.persistent) {
    const n = $('#storage-note');
    n.classList.add('warn');
    n.textContent = Store.kind === 'session'
      ? 'הדפדפן חוסם שמירה קבועה כאן – ההתקדמות תישמר רק עד סגירת הלשונית. פתחו את המשחק בכתובת שלו כדי שיישמר.'
      : 'הדפדפן חוסם שמירה במכשיר – ההתקדמות לא תישמר. פתחו את המשחק בכתובת שלו במקום בתוך מסגרת מוטמעת.';
  }
  $('#opt-sound').checked = !!SAVE.sound;
  $('#opt-haptic').checked = !!SAVE.haptic;
  $('#opt-labels').checked = !!SAVE.labels;
  $('#opt-guideq').checked = !!SAVE.guideQ;
  bind();
  renderHUD();
  renderModes();
  show('home');
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
