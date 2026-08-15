/* =============================================================
   הרובד הקבוצתי: כיתה, רצף ימים, אתגר שבועי ופיד.

   הרצף עובד גם בלי חשבון – הוא חלק מהשמירה המקומית. מה שדורש
   חשבון הוא רק מה שקבוצתי מטבעו: הלוח, האתגר, הפיד והמרצה.
   ============================================================= */

/* ---------- תאריכים ----------
   הכול לפי הזמן המקומי של המכשיר ולא UTC, אחרת מי שמשחק ב-01:00
   מאבד רצף. השבוע מתחיל ביום ראשון, כמו בלוח השנה בארץ. */
function dayKey(d = new Date()) {
  const p = n => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}
function dayShift(key, n) {
  const [y, m, d] = key.split('-').map(Number);
  const t = new Date(y, m - 1, d + n);
  return dayKey(t);
}
function daysBetween(a, b) {
  const p = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  return Math.round((p(b) - p(a)) / 86400000);
}
function weekStartKey(d = new Date()) {
  const t = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  t.setDate(t.getDate() - t.getDay());   // 0 = ראשון
  return dayKey(t);
}
/* שבעת ימי השבוע הנוכחי, מראשון עד שבת */
function weekDays() {
  const s = weekStartKey();
  return Array.from({ length: 7 }, (_, i) => dayShift(s, i));
}
const DAY_LETTER = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'];

/* ---------- הרצף ----------
   יום נחשב רק אם סיימתם סיבוב – שלב, אתגר יומי או תרגול. לא
   מספיק לפתוח את המשחק.                                      */
const SHIELD_COST = 150;
const SHIELD_MAX = 2;

/* מחזיר את מה שקרה לרצף, כדי שמסך הסיכום יוכל לספר על זה */
function touchStreak() {
  const today = dayKey();
  const last = SAVE.lastActive || '';
  if (last === today) return { kind: 'same', streak: SAVE.streak || 0 };

  const gap = last ? daysBetween(last, today) : 0;
  let kind = 'start';

  if (!last) {
    SAVE.streak = 1;
  } else if (gap === 1) {
    SAVE.streak = (SAVE.streak || 0) + 1;
    kind = 'grew';
  } else if (gap > 1 && (SAVE.shields || 0) > 0 && gap - 1 <= (SAVE.shields || 0)) {
    /* מגן אחד לכל יום שפוספס – הרצף נשמר ולא מתאפס */
    SAVE.shields -= (gap - 1);
    SAVE.streak = (SAVE.streak || 0) + 1;
    kind = 'saved';
  } else {
    SAVE.streak = 1;
    kind = 'broke';
  }

  SAVE.lastActive = today;
  SAVE.bestStreak = Math.max(SAVE.bestStreak || 0, SAVE.streak);
  return { kind, streak: SAVE.streak, used: kind === 'saved' ? gap - 1 : 0 };
}

/* יומן הפעילות המקומי – נשמר 60 יום אחורה ומסתנכרן לשרת */
function logActivity(xp, questions) {
  SAVE.log = SAVE.log || {};
  const k = dayKey();
  const e = SAVE.log[k] || { xp: 0, q: 0 };
  e.xp += Math.max(0, xp | 0);
  e.q += Math.max(0, questions | 0);
  SAVE.log[k] = e;
  const cutoff = dayShift(dayKey(), -60);
  for (const d in SAVE.log) if (d < cutoff) delete SAVE.log[d];
  return e;
}
function weekTotals() {
  const days = weekDays();
  let xp = 0, q = 0, active = 0;
  days.forEach(d => {
    const e = (SAVE.log || {})[d];
    if (e) { xp += e.xp; q += e.q; if (e.q) active++; }
  });
  return { xp, q, active, days };
}
function playedOn(day) { return !!((SAVE.log || {})[day] || {}).q; }

function buyShield() {
  if ((SAVE.shields || 0) >= SHIELD_MAX) return 'full';
  if ((SAVE.coins || 0) < SHIELD_COST) return 'poor';
  SAVE.coins -= SHIELD_COST;
  SAVE.shields = (SAVE.shields || 0) + 1;
  return 'ok';
}

/* ---------- קוד הכיתה ----------
   קוד הכיתה מושווה כמחרוזת, ולכן כל הבדל בתו אחד יוצר כיתה שנייה
   שאיש לא שם לב אליה. מקלדת עברית מפיקה גרשיים ״ (U+05F4) במקום
   " הרגיל, אייפון הופך מרכאות למסולסלות, ומי שמדביק מוואטסאפ מביא
   רווחים כפולים. מנרמלים הכול לצורה אחת לפני שמירה והשוואה. */
function normClass(s) {
  return String(s || '')
    .replace(/[״“”„«»]/g, '"')  /* ״ ו“ ” „ « » → " */
    .replace(/[׳‘’ʼ]/g, "'")              /* ׳ ו‘ ’ ʼ  → ' */
    .replace(/[‐-―−]/g, '-')                   /* מקפים ארוכים → - */
    .replace(/\s+/g, ' ')
    .trim();
}

/* ---------- אתגר הכיתה ----------
   היעד השבועי נגזר ממי ש**באמת** תרגל השבוע, לא מגודל הרשימה.
   בכיתה של 37 שרק שישה מהם פעילים, יעד לפי הרשימה הוא קיר – אף אחד
   לא מנסה לטפס עליו. לפי הפעילים הוא נשאר בהישג יד, וכשעוד אנשים
   מצטרפים הם מביאים איתם גם את המכסה שלהם וגם את התשובות אליה.
   רצפה של שלושה כדי שהיעד לא יהיה טריוויאלי בתחילת השבוע, ותקרה
   כדי שגם כיתה גדולה ופעילה לא תראה מספר מרתיע. */
const GOAL_PER_HEAD = 40, GOAL_MIN = 120, GOAL_MAX = 600;
function classGoal(active) {
  const n = Math.max(3, active || 0);
  return Math.min(GOAL_MAX, Math.max(GOAL_MIN, Math.round(n * GOAL_PER_HEAD / 20) * 20));
}

/* נושא השבוע – נגזר ממספר השבוע, בלי שהמרצה צריך להגדיר דבר */
function weeklyTopic() {
  const s = weekStartKey();
  const idx = Math.abs(hashStr(s)) % MODES.length;
  return MODES[idx];
}

/* ---------- הנקודה החלשה ----------
   המצב שבו יחס הטעויות הוא הגבוה ביותר. נשמר בשמירה כדי שמבט
   המרצה יוכל להציג אותו בלי לחשוף שום דבר נוסף. */
function weakestMode() {
  const tally = {};
  (SAVE.misses || []).forEach(r => { tally[r.m] = (tally[r.m] || 0) + 1; });
  let best = null, n = 0;
  for (const m in tally) if (tally[m] > n) { n = tally[m]; best = m; }
  return best && MODE_BY_ID[best] ? MODE_BY_ID[best].name : '';
}
