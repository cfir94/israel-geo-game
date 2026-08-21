/* בדיקת שכבת קווי הגובה: בנייה עצלה, דילול לפי זום, ושני המתגים */
const { chromium } = require('playwright');
const OUT = '/tmp/claude-0/-home-user-Click-Solutions/1256c9c9-2e8d-5f05-8089-587c3672dc1d/scratchpad/shots/';
const die = m => { console.log('FAIL: ' + m); process.exitCode = 1; };
const URL = process.env.GAME_URL || 'http://localhost:8907/index.html';

(async () => {
  const br = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const pg = await br.newPage({ viewport: { width: 390, height: 844 } });
  const errs = [];
  pg.on('pageerror', e => errs.push(String(e)));
  pg.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  await pg.goto(URL);
  await pg.waitForTimeout(700);
  if (await pg.locator('#acc-guest').isVisible().catch(() => 0)) {
    await pg.click('#acc-guest'); await pg.waitForTimeout(400);
  }

  /* --- הנתונים עצמם --- */
  const data = await pg.evaluate(() => {
    const lv = CONTOURS.map(r => r[0]);
    const pts = CONTOURS.reduce((s, r) => s + r[1].length, 0);
    let bad = 0, outside = 0;
    CONTOURS.forEach(([, p]) => {
      if (p.length < 2) bad++;
      p.forEach(([lo, la]) => {
        if (lo < 34 || lo > 36.1 || la < 29.3 || la > 33.5) outside++;
      });
    });
    return { lines: CONTOURS.length, pts, step: CONTOUR_STEP, bad, outside,
      min: Math.min(...lv), max: Math.max(...lv),
      levels: [...new Set(lv)].sort((a, b) => a - b).length };
  });
  console.log('נתונים:', JSON.stringify(data));
  if (data.bad) die(data.bad + ' קווים עם פחות משתי נקודות');
  if (data.outside) die(data.outside + ' נקודות מחוץ לתיחום הארץ');
  if (data.step !== 100) die('מרווח לא צפוי: ' + data.step);
  if (data.min > -400 || data.max < 2000) die('טווח הגבהים חסר: ' + data.min + '..' + data.max);

  /* --- בנייה עצלה --- */
  let st = await pg.evaluate(() => ({ on: GameMap.contoursOn(),
    paths: GameMap.layers.contours.querySelectorAll('path').length }));
  console.log('לפני הדלקה:', JSON.stringify(st));
  if (st.paths) die('הנתיבים נבנו בלי שהשכבה הודלקה');

  /* --- מצב שטח --- */
  await pg.evaluate(() => startGame('folds', 0, 1));
  await pg.waitForTimeout(1000);
  st = await pg.evaluate(() => ({
    contours: GameMap.contoursOn(), topo: GameMap.topoOn(),
    paths: GameMap.layers.contours.querySelectorAll('path').length,
    index: GameMap.layers.contours.querySelectorAll('.ct-index path').length,
    minor: GameMap.layers.contours.querySelectorAll('.ct-minor path').length,
    display: GameMap.layers.contours.style.display,
    dense: GameMap.svg.classList.contains('ct-dense'),
    zoom: +GameMap.zoomLevel().toFixed(2)
  }));
  console.log('קמר או קער:', JSON.stringify(st));
  if (!st.contours) die('קווי הגובה לא נדלקו במצב שטח');
  if (st.paths !== data.lines) die('נבנו ' + st.paths + ' נתיבים מתוך ' + data.lines);
  if (!st.index || !st.minor) die('הקווים לא פוצלו לקווי מדד וקווי ביניים');
  if (st.dense) die('בתצוגה מלאה מוצגים גם קווי הביניים');

  const minorVisible = await pg.evaluate(() =>
    getComputedStyle(GameMap.layers.contours.querySelector('.ct-minor')).display);
  console.log('קווי ביניים בתצוגה מלאה:', minorVisible);
  if (minorVisible !== 'none') die('קווי הביניים לא הוסתרו בתצוגה מלאה');
  await pg.screenshot({ path: OUT + 'ct-wide.png' });

  /* --- זום פותח את קווי הביניים --- */
  await pg.evaluate(() => GameMap.zoomBy(4));
  await pg.waitForTimeout(1200);
  st = await pg.evaluate(() => ({ dense: GameMap.svg.classList.contains('ct-dense'),
    zoom: +GameMap.zoomLevel().toFixed(2),
    minor: getComputedStyle(GameMap.layers.contours.querySelector('.ct-minor')).display }));
  console.log('אחרי זום:', JSON.stringify(st));
  if (!st.dense || st.minor === 'none') die('קווי הביניים לא נפתחו בזום (' + st.zoom + ')');
  await pg.screenshot({ path: OUT + 'ct-zoom.png' });

  /* --- שני המתגים --- */
  await pg.evaluate(() => { SAVE.relief = 0; persist(); applyTopo(); });
  await pg.waitForTimeout(400);
  st = await pg.evaluate(() => ({ topo: GameMap.topoOn(), ct: GameMap.contoursOn() }));
  console.log('רק קווי גובה:', JSON.stringify(st));
  if (st.topo || !st.ct) die('כיבוי ההצללה לא השאיר את קווי הגובה לבדם');
  await pg.evaluate(() => GameMap.fitAll(false));
  await pg.waitForTimeout(500);
  await pg.screenshot({ path: OUT + 'ct-only.png' });

  await pg.evaluate(() => { SAVE.relief = 1; SAVE.contours = 0; persist(); applyTopo(); });
  await pg.waitForTimeout(400);
  st = await pg.evaluate(() => ({ topo: GameMap.topoOn(), ct: GameMap.contoursOn(),
    display: GameMap.layers.contours.style.display }));
  console.log('רק הצללה:', JSON.stringify(st));
  if (!st.topo || st.ct) die('כיבוי קווי הגובה לא עבד');
  if (st.display !== 'none') die('שכבת קווי הגובה נשארה מוצגת');

  /* --- שניהם כבויים: הכפתור אומר למה, ולא משנה מצב --- */
  await pg.evaluate(() => { SAVE.relief = 0; SAVE.contours = 0; persist(); applyTopo(); });
  await pg.waitForTimeout(300);
  const before = await pg.evaluate(() => SAVE.topo);
  await pg.click('#topo-toggle');
  await pg.waitForTimeout(500);
  st = await pg.evaluate(() => ({ pref: SAVE.topo,
    toast: document.getElementById('toast').textContent,
    btn: document.getElementById('topo-toggle').classList.contains('on') }));
  console.log('שניהם כבויים:', JSON.stringify(st));
  if (st.pref !== before) die('הכפתור שינה מצב כששתי השכבות כבויות');
  if (!/כבויות/.test(st.toast)) die('לא הוסבר למשתמש למה הכפתור לא עשה דבר');
  if (st.btn) die('הכפתור נראה דולק בלי שום שכבה');

  /* --- התמדה --- */
  await pg.evaluate(() => { SAVE.relief = 1; SAVE.contours = 0; persist(); });
  await pg.reload();
  await pg.waitForTimeout(900);
  st = await pg.evaluate(() => ({ relief: SAVE.relief, contours: SAVE.contours,
    rBox: document.getElementById('opt-relief').checked,
    cBox: document.getElementById('opt-contours').checked }));
  console.log('אחרי רענון:', JSON.stringify(st));
  if (st.contours !== 0 || st.cBox) die('ההעדפה לא נשמרה או שהתיבה לא מסונכרנת');

  /* --- מצב כהה --- */
  await pg.evaluate(() => {
    SAVE.contours = 1; SAVE.relief = 0; persist();
    document.documentElement.setAttribute('data-theme', 'dark');
    startGame('bounds', 0, 1);
  });
  await pg.waitForTimeout(1100);
  const stroke = await pg.evaluate(() =>
    getComputedStyle(GameMap.layers.contours.querySelector('.ct-index path')).stroke);
  console.log('צבע הקו במצב כהה:', stroke);
  if (stroke === 'rgb(107, 81, 54)') die('צבע קווי הגובה לא התחלף במצב כהה');
  await pg.screenshot({ path: OUT + 'ct-dark.png' });

  if (errs.length) { console.log('שגיאות:'); errs.slice(0, 6).forEach(e => console.log('  ' + e)); process.exitCode = 1; }
  else console.log('אין שגיאות JS');
  await br.close();
  if (!process.exitCode) console.log('\nהכול עבר ✓');
})();
