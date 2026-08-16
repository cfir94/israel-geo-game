/* משחזר את המקרה השני: refresh_token שנפסל לגמרי (לא מרוץ –
   פשוט לא קיים יותר בשרת, כמו התחברות לאותו חשבון ממכשיר אחר
   שסובבה את הטוקן). בלי הטיפול, זה נשאר תקוע לנצח על אותה
   שגיאה בכל טעינה. עם הטיפול, הסשן מתנקה והמשחק חוזר להתנהג
   כמו לפני התחברות – בלי צורך לנקות localStorage ידנית.

   דורש שרת Supabase מדומה עם נקודת הקצה __expire – אינו כלול
   בריפו הזה, ורץ בדרך כלל מול עותק מקומי של המשחק על 8911. */
const { chromium } = require('playwright');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const PORT = process.env.PORT || 8911;

(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const c = await b.newContext({ viewport: { width: 400, height: 900 }, locale: 'he-IL' });
  const p = await c.newPage();
  await p.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'load' });
  await sleep(1200);

  await p.evaluate(() => { const a = document.querySelector('#account'); if (!a.classList.contains('on')) openAccount(); });
  await sleep(300);
  const mail = 'dead' + Date.now() + '@t.co';
  await p.fill('#acc-name', 'בודק טוקן מת'); await p.fill('#acc-email', mail); await p.fill('#acc-class', 'קמ"ד שרון 26-27');
  await p.click('#acc-submit'); await sleep(2500);

  // מזייפים refresh_token שאינו קיים בשרת. Cloud מחזיק סשן בזיכרון,
  // ולכן צריך רענון דף כדי ש-loadSession() יטען את הגרסה המזויפת
  await p.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem('israel-geo-game-session'));
    raw.refresh_token = 'rt_no-such-token-on-server';
    localStorage.setItem('israel-geo-game-session', JSON.stringify(raw));
  });
  await p.reload({ waitUntil: 'load' }); await sleep(1200);
  await fetch(`http://localhost:8910/__expire`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });

  const first = await p.evaluate(async () => {
    try { await Cloud.pull(); return { ok: true }; }
    catch (e) { return { ok: false, error: e.message, stillHasSession: !!Cloud.current() }; }
  });
  console.log('קריאה ראשונה עם טוקן מת: ' + JSON.stringify(first));

  // קריאה נוספת: בלי הטיפול, זו הייתה חוזרת ומנסה לרענן עם אותו
  // טוקן מת שוב ושוב, ותקועה על אותה שגיאה בכל טעינה. עם הסשן
  // שכבר התנקה, pull() פשוט לא עושה כלום – אין חשבון, אין קריאה.
  const second = await p.evaluate(async () => {
    const res = await Cloud.pull();
    return { returned: res, hasSession: !!Cloud.current() };
  });
  console.log('קריאה שנייה (אחרי שהסשן כבר התנקה): ' + JSON.stringify(second));

  const ok = !first.ok && first.stillHasSession === false
    && second.returned === null && second.hasSession === false;
  console.log('\n' + (ok
    ? 'עבר ✓ – הסשן התנקה אחרי כישלון אמיתי, ולא נשאר תקוע'
    : 'נכשל ✗'));
  await b.close();
  process.exit(ok ? 0 : 1);
})();
