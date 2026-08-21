/* מסך הבנייה: הקנבס חייב להיכנס במלואו למסגרת, והארץ להיכנס במלואה
   לקנבס – בכל גודל מסך, אחרי מעבר שלב ואחרי שינוי גודל חלון. */
const { chromium } = require('playwright');
const OUT = '/tmp/claude-0/-home-user-Click-Solutions/1256c9c9-2e8d-5f05-8089-587c3672dc1d/scratchpad/shots/';
const die = m => { console.log('FAIL: ' + m); process.exitCode = 1; };
const URL = process.env.GAME_URL || 'http://localhost:8907/index.html';

const SIZES = [[390, 844], [390, 760], [412, 732], [360, 640], [320, 568], [768, 1024]];

/* הקנבס בתוך המסגרת, והארץ בתוך הקנבס */
const probe = () => {
  const wr = document.getElementById('build-canvas-wrap').getBoundingClientRect();
  const cr = document.getElementById('build-canvas').getBoundingClientRect();
  const rings = [GEO.israel, GEO.westbank, GEO.golan];
  let minx = 1e9, maxx = -1e9, miny = 1e9, maxy = -1e9;
  rings.forEach(r => r.forEach(([lo, la]) => {
    const x = bProj.x(lo), y = bProj.y(la);
    if (x < minx) minx = x; if (x > maxx) maxx = x;
    if (y < miny) miny = y; if (y > maxy) maxy = y;
  }));
  return {
    canvas: [Math.round(cr.width), Math.round(cr.height)],
    /* חיובי = גלישה מחוץ למסגרת */
    overflow: Math.round(Math.max(cr.top - wr.top < 0 ? wr.top - cr.top : 0,
                                  cr.bottom - wr.bottom, cr.left - wr.left < 0 ? wr.left - cr.left : 0,
                                  cr.right - wr.right)),
    /* חיובי = הארץ חורגת מהקנבס. רלוונטי רק כשאין זום: בשלבי התפרים
       והמסלע המסך מתקרב אל המשימה, ואז חריגה היא ההתנהגות הנכונה. */
    zoom: +bProj.k.toFixed(2),
    outside: Math.round(Math.max(-minx, -miny, maxx - bW, maxy - bH)),
    land: [Math.round(maxx - minx), Math.round(maxy - miny)],
    bWH: [bW, bH]
  };
};

(async () => {
  const br = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const errs = [];

  for (const [w, h] of SIZES) {
    const pg = await br.newPage({ viewport: { width: w, height: h } });
    pg.on('pageerror', e => errs.push(w + 'x' + h + ': ' + e));
    await pg.goto(URL);
    await pg.waitForTimeout(700);
    if (await pg.locator('#acc-guest').isVisible().catch(() => 0)) {
      await pg.click('#acc-guest'); await pg.waitForTimeout(400);
    }
    await pg.evaluate(() => { SAVE.build = null; persist(); });
    await pg.click('#btn-build');
    await pg.waitForTimeout(900);

    let r = await pg.evaluate(probe);
    console.log(String(w + 'x' + h).padEnd(9), 'מתאר:', JSON.stringify(r));
    if (r.overflow > 2) die(w + 'x' + h + ': הקנבס גולש מהמסגרת ב-' + r.overflow + 'px');
    if (r.outside > 1) die(w + 'x' + h + ': הארץ חורגת מהקנבס ב-' + r.outside + 'px');
    if (r.land[1] < r.canvas[1] * 0.6) die(w + 'x' + h + ': הארץ תופסת רק ' + r.land[1] + ' מתוך ' + r.canvas[1]);

    /* מעבר לשלב המסלע – בנק השבבים נכנס וגוזל גובה */
    await pg.evaluate(() => {
      SAVE.build = { stage: 2, outline: 96, seams: {}, rocks: {}, sites: {}, tier: 0 };
      bSeamList().forEach(id => SAVE.build.seams[id] = 1);
      persist(); bNextTask(); bPaintUI();
    });
    await pg.waitForTimeout(800);
    r = await pg.evaluate(probe);
    console.log(String('').padEnd(9), 'מסלע:', JSON.stringify({ canvas: r.canvas, overflow: r.overflow, zoom: r.zoom }));
    if (r.overflow > 2) die(w + 'x' + h + ': אחרי כניסת בנק השבבים הקנבס גולש ב-' + r.overflow + 'px');
    if (!(r.zoom > 1)) die(w + 'x' + h + ': שלב המסלע לא התקרב אל האזור');

    /* חזרה למתאר ואז שינוי גודל חלון – ResizeObserver אמור לתפוס */
    await pg.evaluate(() => { SAVE.build = null; persist(); bNextTask(); bPaintUI(); });
    await pg.waitForTimeout(500);
    await pg.setViewportSize({ width: Math.round(w * 0.85), height: Math.round(h * 0.75) });
    await pg.waitForTimeout(900);
    r = await pg.evaluate(probe);
    console.log(String('').padEnd(9), 'אחרי הקטנה:', JSON.stringify({ canvas: r.canvas, overflow: r.overflow, outside: r.outside }));
    if (r.overflow > 2) die(w + 'x' + h + ': אחרי שינוי גודל הקנבס גולש ב-' + r.overflow + 'px');
    if (r.outside > 1) die(w + 'x' + h + ': אחרי שינוי גודל הארץ חורגת ב-' + r.outside + 'px');

    if (w === 360) await pg.screenshot({ path: OUT + 'fit-small.png' });
    await pg.close();
  }

  if (errs.length) { console.log('שגיאות:'); errs.slice(0, 6).forEach(e => console.log('  ' + e)); process.exitCode = 1; }
  else console.log('אין שגיאות JS');
  await br.close();
  if (!process.exitCode) console.log('\nהכול עבר ✓');
})();
