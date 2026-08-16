/* משחזר את הבאג: הלוח פותח שתי קריאות מאומתות במקביל
   (classWeek + leaderboard). אם שתיהן נתקלות בטוקן שפג יחד,
   שתיהן מנסות לרענן עם אותו refresh_token; ב-Supabase אמיתי
   הראשונה מצליחה ומחליפה אותו, השנייה נדחית עם
   "Invalid Refresh Token: Already Used".

   דורש שרת Supabase מדומה שתומך ב-refresh_token חד-פעמי ובנקודת
   הקצה __expireN (לכפות כמה 401 ברצף) – אינו כלול בריפו הזה,
   ורץ בדרך כלל מול עותק מקומי של המשחק על 8911. */
const { chromium } = require('playwright');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const PORT = process.env.PORT || 8911;
const CLS = 'קמ"ד שרון 26-27';

(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const c = await b.newContext({ viewport: { width: 400, height: 900 }, locale: 'he-IL' });
  const p = await c.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
  await p.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'load' });
  await sleep(1200);

  await p.evaluate(() => { const a = document.querySelector('#account'); if (!a.classList.contains('on')) openAccount(); });
  await sleep(300);
  const mail = 'race' + Date.now() + '@t.co';
  await p.fill('#acc-name', 'בודק מרוץ'); await p.fill('#acc-email', mail); await p.fill('#acc-class', CLS);
  await p.click('#acc-submit'); await sleep(2500);

  const signedIn = await p.evaluate(() => !!Cloud.current());
  if (!signedIn) { console.log('✗ ההרשמה נכשלה, לא ניתן להריץ את הבדיקה'); await b.close(); process.exit(1); }

  // כופים 401 על שתי הקריאות הבאות (classWeek + leaderboard), במקביל
  await fetch(`http://localhost:8910/__expireN`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ n: 2 }) });

  const result = await p.evaluate(async () => {
    try {
      const [week, board] = await Promise.all([Cloud.classWeek(), Cloud.leaderboard('week')]);
      return { ok: true, week, boardLen: board.length };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  console.log('תוצאת שתי הקריאות במקביל אחרי טוקן שפג:');
  console.log(JSON.stringify(result));

  const stillSignedIn = await p.evaluate(() => !!Cloud.current());
  console.log('עדיין מחובר אחרי זה: ' + stillSignedIn);

  console.log('\n' + (result.ok ? 'עבר ✓ – שתי הקריאות המקבילות הצליחו' : 'נכשל ✗ – ' + result.error));
  console.log('שגיאות דפדפן: ' + (errs.length ? errs.join(' | ') : 'אין'));
  await b.close();
  process.exit(result.ok ? 0 : 1);
})();
