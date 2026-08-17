const { chromium } = require('playwright');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const PORT = process.env.PORT || 8907;

(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const log = [], fails = [];
  const ok = (n, c, x = '') => { log.push((c ? '  ✓ ' : '  ✗ ') + n + (x ? ' — ' + x : '')); if (!c) fails.push(n); };

  const c = await b.newContext({
    viewport: { width: 400, height: 900 }, deviceScaleFactor: 2, locale: 'he-IL',
    permissions: ['geolocation'], geolocation: { latitude: 32.0853, longitude: 34.7818 } // תל אביב
  });
  await c.addInitScript(() => { try { localStorage.setItem('israel-geo-game-v1', JSON.stringify({ welcomed: 1 })); } catch (e) {} });
  const p = await c.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'load' }); await sleep(1200);
  await p.click('#btn-nearby'); await sleep(1500);

  // שאלה 1: kind mapPoint (locate) – מצפה לגרירת סיכה
  {
    const s = await p.evaluate(() => ({ kind: G.qs[0].kind, dockVisible: !document.getElementById('dock').hidden && getComputedStyle(document.getElementById('dock')).display !== 'none' }));
    ok('שאלה 1 מסוג mapPoint', s.kind === 'mapPoint', s.kind);
    await p.screenshot({ path: __dirname + '/shots/nearby-q1-locate.png' });
    // עונים בגרירה אמיתית: קליק במרכז המפה בערך
    const mapBox = await p.locator('#map-host').boundingBox();
    await p.mouse.move(mapBox.x + mapBox.width * 0.55, mapBox.y + mapBox.height * 0.4);
    await p.mouse.down();
    await p.mouse.move(mapBox.x + mapBox.width * 0.55, mapBox.y + mapBox.height * 0.4, { steps: 3 });
    await p.mouse.up();
    await sleep(300);
    await p.click('#btn-confirm').catch(() => {});
    await sleep(500);
    const answered = await p.evaluate(() => G.answered);
    ok('אפשר לענות על שאלת המיקום בפועל (גרירת סיכה)', answered === true, 'G.answered=' + answered);
    await p.evaluate(() => advanceNow()); await sleep(300);
  }

  // שאלה 2: kind choice (identify) – מצפה לכפתורי בחירה עם 4 אפשרויות
  {
    const s = await p.evaluate(() => ({ kind: G.qs[1].kind, n: document.querySelectorAll('.ans').length }));
    ok('שאלה 2 מסוג choice', s.kind === 'choice', s.kind);
    ok('4 כפתורי תשובה מוצגים', s.n === 4, s.n);
    await p.screenshot({ path: __dirname + '/shots/nearby-q2-identify.png' });
    await p.click('.ans'); await sleep(500);
    const answered = await p.evaluate(() => G.answered);
    ok('אפשר לענות בלחיצה על כפתור', answered === true);
    await p.evaluate(() => advanceNow()); await sleep(300);
  }

  // שאלה 3: kind mapRegion (regionOf) – מצפה ללחיצה על אזור במפה
  {
    const s = await p.evaluate(() => ({ kind: G.qs[2].kind, mapMode: G.qs[2].mapMode }));
    ok('שאלה 3 מסוג mapRegion', s.kind === 'mapRegion', s.kind);
    await p.screenshot({ path: __dirname + '/shots/nearby-q3-region.png' });
    const mapBox = await p.locator('#map-host').boundingBox();
    await p.mouse.click(mapBox.x + mapBox.width * 0.5, mapBox.y + mapBox.height * 0.55);
    await sleep(500);
    const answered = await p.evaluate(() => G.answered);
    ok('אפשר לענות בלחיצה על המפה', answered === true, 'G.answered=' + answered);
  }

  console.log(log.join('\n'));
  console.log('\n' + (fails.length ? 'נכשלו: ' + fails.join(', ') : 'הכול עבר ✓'));
  console.log('שגיאות דפדפן: ' + (errs.length ? errs.join(' | ') : 'אין'));
  await b.close();
  process.exit(fails.length || errs.length ? 1 : 0);
})();
