/* שרטוט בכמה קטעים: הרמת אצבע והמשך, ביטול, ניקוי, ושרשור נכון */
const { chromium } = require('playwright');
const OUT = '/tmp/claude-0/-home-user-Click-Solutions/1256c9c9-2e8d-5f05-8089-587c3672dc1d/scratchpad/shots/';
const die = m => { console.log('FAIL: ' + m); process.exitCode = 1; };
const URL = process.env.GAME_URL || 'http://localhost:8907/index.html';

/* מצייר קטע אחד ומרים את האצבע בסוף */
async function stroke(pg, pts) {
  await pg.mouse.move(pts[0][0], pts[0][1]);
  await pg.mouse.down();
  for (const p of pts) await pg.mouse.move(p[0], p[1]);
  await pg.mouse.up();
  await pg.waitForTimeout(60);
}

(async () => {
  const br = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const pg = await br.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true });
  const errs = [];
  pg.on('pageerror', e => errs.push(String(e)));
  pg.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  await pg.goto(URL);
  await pg.waitForTimeout(700);
  if (await pg.locator('#acc-guest').isVisible().catch(() => 0)) {
    await pg.click('#acc-guest'); await pg.waitForTimeout(400);
  }
  await pg.evaluate(() => { SAVE.build = null; persist(); openBuild(); });
  await pg.waitForTimeout(600);

  /* --- מפצלים את הצללית לשלושה קטעים, כמו מי שמרים את האצבע --- */
  const parts = await pg.evaluate(() => {
    const r = document.getElementById('build-canvas').getBoundingClientRect();
    const ring = GEO.israel.map(([lo, la]) => [bProj.x(lo), bProj.y(la)]);
    const wb = GEO.westbank.map(([lo, la]) => [bProj.x(lo), bProj.y(la)]);
    const all = ring.concat(wb).filter((_, i) => i % 4 === 0)
      .map(p => [r.left + p[0], r.top + p[1]]);
    const n = all.length, a = Math.floor(n / 3), b = Math.floor(2 * n / 3);
    /* הקטע האמצעי מצויר הפוך בכוונה – השרשור אמור להתמודד */
    return [all.slice(0, a), all.slice(a, b).reverse(), all.slice(b)];
  });

  await stroke(pg, parts[0]);
  let st = await pg.evaluate(() => ({ segs: bStrokes.length, pts: bStrokes.map(s => s.length) }));
  console.log('אחרי קטע ראשון:', JSON.stringify(st));
  if (st.segs !== 1) die('הקטע הראשון לא נקלט כקטע אחד');

  await stroke(pg, parts[1]);
  st = await pg.evaluate(() => ({ segs: bStrokes.length, pts: bStrokes.map(s => s.length) }));
  console.log('אחרי קטע שני:', JSON.stringify(st));
  if (st.segs !== 2) die('הרמת האצבע מחקה את הקטע הקודם (segs=' + st.segs + ')');

  await stroke(pg, parts[2]);
  st = await pg.evaluate(() => ({ segs: bStrokes.length,
    chained: bChain(bStrokes).length, total: bStrokes.reduce((n, s) => n + s.length, 0) }));
  console.log('אחרי קטע שלישי:', JSON.stringify(st));
  if (st.segs !== 3) die('שלושה קטעים לא נשמרו (segs=' + st.segs + ')');
  if (st.chained !== st.total) die('השרשור איבד נקודות: ' + st.chained + ' מתוך ' + st.total);
  await pg.screenshot({ path: OUT + 'stroke-three.png' });

  /* --- הבדיקה צריכה לעבור בדיוק כמו בקו אחד --- */
  await pg.click('#build-check');
  await pg.waitForTimeout(500);
  const res = await pg.evaluate(() => ({ iou: SAVE.build.outline, stage: SAVE.build.stage }));
  console.log('בדיקה על שלושה קטעים:', JSON.stringify(res));
  if (res.iou < 90) die('שרטוט בשלושה קטעים קיבל ' + res.iou + '% – השרשור לא עבד');
  await pg.screenshot({ path: OUT + 'stroke-check.png' });

  /* --- ביטול קטע אחרון --- */
  await pg.waitForTimeout(3200);
  await pg.evaluate(() => { SAVE.build = null; persist(); openBuild(); });
  await pg.waitForTimeout(600);
  await stroke(pg, parts[0]);
  await stroke(pg, parts[2]);
  let n = await pg.evaluate(() => bStrokes.length);
  await pg.click('#build-undo');
  await pg.waitForTimeout(250);
  let n2 = await pg.evaluate(() => bStrokes.length);
  console.log('ביטול:', n, '→', n2);
  if (n2 !== n - 1) die('ביטול לא הסיר בדיוק קטע אחד');

  /* --- ביטול כשאין מה לבטל --- */
  await pg.click('#build-undo');
  await pg.waitForTimeout(250);
  await pg.click('#build-undo');
  await pg.waitForTimeout(400);
  const t = await pg.evaluate(() => ({ segs: bStrokes.length,
    toast: document.getElementById('toast').textContent }));
  console.log('ביטול על ריק:', JSON.stringify(t));
  if (t.segs !== 0) die('נשארו קטעים אחרי ביטולים');
  if (!/אין מה לבטל/.test(t.toast)) die('אין חיווי כשאין מה לבטל');

  /* --- ניקוי מוחק הכול --- */
  await stroke(pg, parts[0]);
  await stroke(pg, parts[1]);
  await pg.click('#build-clear');
  await pg.waitForTimeout(250);
  if (await pg.evaluate(() => bStrokes.length)) die('ניקוי לא מחק את כל הקטעים');

  /* --- נגיעה בלי תזוזה לא מייצרת קטע --- */
  await pg.mouse.move(parts[0][0][0], parts[0][0][1]);
  await pg.mouse.down();
  await pg.mouse.up();
  await pg.waitForTimeout(250);
  if (await pg.evaluate(() => bStrokes.length)) die('נגיעה בודדת יצרה קטע');

  /* --- בדיקה בלי שרטוט אומרת מה חסר --- */
  await pg.click('#build-check');
  await pg.waitForTimeout(400);
  const t2 = await pg.evaluate(() => document.getElementById('toast').textContent);
  console.log('בדיקה בלי שרטוט:', t2);
  if (!/שרטטו/.test(t2)) die('אין חיווי כשלוחצים בדיקה בלי לצייר');

  /* --- גם בשלב התפרים אפשר לצייר בכמה קטעים --- */
  await pg.evaluate(() => {
    SAVE.build = { stage: 1, outline: 96, seams: {}, rocks: {}, sites: {}, tier: 0 };
    persist(); bNextTask(); bPaintUI(); bDraw();
  });
  await pg.waitForTimeout(500);
  const seamParts = await pg.evaluate(() => {
    const r = document.getElementById('build-canvas').getBoundingClientRect();
    const p = bDensify(bTask.ring.map(([lo, la]) => [bProj.x(lo), bProj.y(la)]), 6)
      .map(q => [r.left + q[0], r.top + q[1]]);
    const h = Math.ceil(p.length / 2);
    return [p.slice(0, h), p.slice(h - 1)];
  });
  await stroke(pg, seamParts[0]);
  await stroke(pg, seamParts[1]);
  const segs = await pg.evaluate(() => bStrokes.length);
  await pg.click('#build-check');
  await pg.waitForTimeout(500);
  const seam = await pg.evaluate(() => Object.keys(SAVE.build.seams).length);
  console.log('תפר בשני קטעים: segs =', segs, '· התקבל =', seam);
  if (segs !== 2) die('שלב התפרים לא קיבל שני קטעים');
  if (!seam) die('תפר שצויר בשני קטעים נדחה');
  await pg.screenshot({ path: OUT + 'stroke-seam.png' });

  if (errs.length) { console.log('שגיאות:'); errs.slice(0, 6).forEach(e => console.log('  ' + e)); process.exitCode = 1; }
  else console.log('אין שגיאות JS');
  await br.close();
  if (!process.exitCode) console.log('\nהכול עבר ✓');
})();
