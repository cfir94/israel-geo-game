/* בדיקת שכבת התבליט: הרשמה, כיוונון, יישור גאוגרפי והתמדה */
const { chromium } = require('playwright');
const OUT = '/tmp/claude-0/-home-user-Click-Solutions/1256c9c9-2e8d-5f05-8089-587c3672dc1d/scratchpad/shots/';
const die = m => { console.log('FAIL: ' + m); process.exitCode = 1; };

(async () => {
  const br = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const pg = await br.newPage({ viewport: { width: 390, height: 844 } });
  const errs = [];
  pg.on('pageerror', e => errs.push(String(e)));
  pg.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  await pg.goto('file:///workspace/israel-geo-game/index.html');
  await pg.waitForTimeout(600);
  if (await pg.locator('#acc-guest').isVisible().catch(() => 0)) {
    await pg.click('#acc-guest'); await pg.waitForTimeout(400);
  }

  /* --- יישור: מרכז התמונה חייב לשבת בדיוק על ההיטל של המפה --- */
  const align = await pg.evaluate(() => {
    const im = GameMap.layers.topo.querySelector('image');
    if (!im) return null;
    const g = { x: +im.getAttribute('x'), y: +im.getAttribute('y'),
                w: +im.getAttribute('width'), h: +im.getAttribute('height') };
    /* נקודות ביקורת: מחשבים איפה הן על המפה, ואיפה הן בתוך התמונה */
    const B = { minLon: 34.198, maxLon: 35.915, minLat: 29.471, maxLat: 33.350 };
    const pts = { 'ראש הנקרה': [35.109, 33.090], 'אילת': [34.948, 29.553],
                  'ים המלח': [35.470, 31.500], 'תל אביב': [34.780, 32.080] };
    const out = {};
    for (const [n, [lo, la]] of Object.entries(pts)) {
      const mx = GameMap.projX(lo), my = GameMap.projY(la);
      const ix = g.x + (lo - B.minLon) / (B.maxLon - B.minLon) * g.w;
      const iy = g.y + (B.maxLat - la) / (B.maxLat - B.minLat) * g.h;
      out[n] = { dx: +(mx - ix).toFixed(3), dy: +(my - iy).toFixed(3) };
    }
    return { rect: g, out };
  });
  if (!align) die('שכבת התבליט לא נוצרה');
  else {
    console.log('מלבן התמונה:', JSON.stringify(align.rect));
    console.log('סטייה בין ההיטל לתמונה (פיקסלים בעולם):');
    let worst = 0;
    for (const [n, d] of Object.entries(align.out)) {
      console.log('  ' + n.padEnd(12), 'dx=' + d.dx, 'dy=' + d.dy);
      worst = Math.max(worst, Math.abs(d.dx), Math.abs(d.dy));
    }
    if (worst > 0.6) die('התמונה לא מיושרת להיטל (סטייה מרבית ' + worst + ')');
  }

  /* --- ברירת מחדל: כבוי במסך הבית --- */
  let st = await pg.evaluate(() => ({ on: GameMap.topoOn(), pref: SAVE.topo,
    href: GameMap.layers.topo.querySelector('image').getAttribute('href') }));
  console.log('בבית:', JSON.stringify(st));
  if (st.on) die('התבליט דולק כברירת מחדל במסך הבית');
  if (st.href) die('התמונה נטענה בלי שהודלקה – טעינה עצלה לא עובדת');

  /* --- מצב שטח: קמר או קער --- */
  await pg.evaluate(() => startGame('folds', 0, 1));
  await pg.waitForTimeout(900);
  st = await pg.evaluate(() => ({ on: GameMap.topoOn(),
    cls: GameMap.svg.classList.contains('topo-on'),
    land: getComputedStyle(GameMap.layers.land).opacity,
    href: GameMap.layers.topo.querySelector('image').getAttribute('href') }));
  console.log('קמר או קער:', JSON.stringify(st));
  if (!st.on) die('התבליט לא נדלק במצב "קמר או קער"');
  if (st.land !== '0') die('היבשה לא הוסתרה מתחת לתבליט (opacity=' + st.land + ')');
  if (!st.href) die('התמונה לא נטענה כשהתבליט נדלק');
  await pg.waitForTimeout(700);
  await pg.screenshot({ path: OUT + 'topo-folds.png' });

  /* --- מצב סלע: חייב להיות כבוי --- */
  await pg.evaluate(() => startGame('rockAt', 0, 1));
  await pg.waitForTimeout(800);
  st = await pg.evaluate(() => ({ on: GameMap.topoOn() }));
  console.log('איזה סלע כאן:', JSON.stringify(st));
  if (st.on) die('התבליט דולק במצב הסלע ומתנגש עם המפה הגיאולוגית');

  /* --- נחלים --- */
  await pg.evaluate(() => startGame('streams', 0, 1));
  await pg.waitForTimeout(900);
  if (!await pg.evaluate(() => GameMap.topoOn())) die('התבליט לא נדלק במצב הנחלים');
  await pg.screenshot({ path: OUT + 'topo-streams.png' });

  /* --- הכפתור שעל המפה --- */
  await pg.click('#topo-toggle');
  await pg.waitForTimeout(400);
  st = await pg.evaluate(() => ({ on: GameMap.topoOn(), pref: SAVE.topo,
    btn: document.getElementById('topo-toggle').classList.contains('on') }));
  console.log('אחרי לחיצה על הכפתור:', JSON.stringify(st));
  if (st.on || st.pref !== 'off') die('הכפתור לא כיבה את התבליט');
  if (st.btn) die('הכפתור נשאר מסומן אחרי כיבוי');
  await pg.click('#topo-toggle');
  await pg.waitForTimeout(400);
  st = await pg.evaluate(() => ({ on: GameMap.topoOn(), pref: SAVE.topo }));
  console.log('אחרי לחיצה שנייה:', JSON.stringify(st));
  if (!st.on || st.pref !== 'on') die('הכפתור לא הדליק בחזרה');

  /* --- "תמיד" חל גם על מצב שאינו מצב שטח --- */
  await pg.evaluate(() => startGame('rockAt', 0, 1));
  await pg.waitForTimeout(800);
  if (!await pg.evaluate(() => GameMap.topoOn())) die('"תמיד" לא גובר על ברירת המחדל של מצב הסלע');

  /* --- "כבויה" חל גם על מצב שטח --- */
  await pg.evaluate(() => { SAVE.topo = 'off'; persist(); });
  await pg.evaluate(() => startGame('bounds', 0, 1));
  await pg.waitForTimeout(800);
  if (await pg.evaluate(() => GameMap.topoOn())) die('"כבויה" לא גובר על מצב השטח');

  /* --- מצבי האזורים: צבע חבל הארץ הוא נושא השאלה, ולכן כבוי --- */
  await pg.evaluate(() => { SAVE.topo = 'auto'; persist(); });
  for (const m of ['regionFind', 'regionOf']) {
    await pg.evaluate(mm => startGame(mm, 0, 1), m);
    await pg.waitForTimeout(800);
    if (await pg.evaluate(() => GameMap.topoOn())) die('התבליט דולק ב-' + m + ' ומכתים את צבעי האזורים');
  }
  console.log('מצבי האזורים: כבוי ✓');

  /* --- חזרה לאוטומטי, ובדיקת האטלס --- */
  await pg.evaluate(() => { SAVE.topo = 'auto'; persist(); show('home'); openAtlas(); });
  await pg.waitForTimeout(900);
  if (!await pg.evaluate(() => GameMap.topoOn())) die('התבליט לא נדלק באטלס');
  await pg.screenshot({ path: OUT + 'topo-atlas.png' });

  /* --- התמדה בין טעינות --- */
  await pg.evaluate(() => { SAVE.topo = 'on'; persist(); });
  await pg.reload();
  await pg.waitForTimeout(800);
  const pref = await pg.evaluate(() => SAVE.topo);
  console.log('אחרי רענון, ההעדפה =', pref);
  if (pref !== 'on') die('ההעדפה לא נשמרה');

  /* --- מצב כהה --- */
  await pg.evaluate(() => { SAVE.topo = 'auto'; persist(); document.documentElement.setAttribute('data-theme', 'dark'); startGame('folds', 0, 1); });
  await pg.waitForTimeout(1000);
  const filt = await pg.evaluate(() => getComputedStyle(GameMap.layers.topo).filter);
  console.log('פילטר במצב כהה:', filt);
  if (filt === 'none') die('התבליט לא מוכהה במצב כהה');
  await pg.screenshot({ path: OUT + 'topo-dark.png' });

  if (errs.length) { console.log('שגיאות:'); errs.slice(0, 6).forEach(e => console.log('  ' + e)); process.exitCode = 1; }
  else console.log('אין שגיאות JS');
  await br.close();
  if (!process.exitCode) console.log('\nהכול עבר ✓');
})();
