/* קלט אמיתי: שרטוט באצבע וגרירת שבב, וצילום של כל שלב */
const { chromium } = require('playwright');
const OUT = '/tmp/claude-0/-home-user-Click-Solutions/1256c9c9-2e8d-5f05-8089-587c3672dc1d/scratchpad/shots/';
const die = m => { console.log('FAIL: ' + m); process.exitCode = 1; };

(async () => {
  const br = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const pg = await br.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true });
  const errs = [];
  pg.on('pageerror', e => errs.push(String(e)));
  await pg.goto('file:///workspace/israel-geo-game/index.html');
  await pg.waitForTimeout(500);
  /* סוגרים את מסך הפתיחה */
  if (await pg.locator('#acc-guest').isVisible().catch(() => false)) {
    await pg.click('#acc-guest');
    await pg.waitForTimeout(500);
  }
  await pg.evaluate(() => openBuild());
  await pg.waitForTimeout(400);
  await pg.screenshot({ path: OUT + 'build-1-outline.png' });

  /* --- שרטוט המתאר באצבע: עוקבים אחרי הצללית עם רעש קל --- */
  const pts = await pg.evaluate(() => {
    const r = document.getElementById('build-canvas').getBoundingClientRect();
    const ring = GEO.israel.map(([lo, la]) => [bProj.x(lo), bProj.y(la)]);
    const wb = GEO.westbank.map(([lo, la]) => [bProj.x(lo), bProj.y(la)]);
    const all = ring.concat(wb).filter((_, i) => i % 4 === 0);
    return all.map((p, i) => [r.left + p[0] + Math.sin(i / 3) * 4, r.top + p[1] + Math.cos(i / 4) * 4]);
  });
  await pg.mouse.move(pts[0][0], pts[0][1]);
  await pg.mouse.down();
  for (const p of pts) await pg.mouse.move(p[0], p[1]);
  await pg.mouse.up();
  await pg.waitForTimeout(150);
  const drawn = await pg.evaluate(() => bStrokes.length && bStrokes[0].length);
  console.log('נקודות שנקלטו מהעכבר:', drawn, '/', pts.length);
  if (!drawn || drawn < pts.length * .5) die('אירועי המצביע לא נקלטו על הקנבס');

  await pg.click('#build-check');
  await pg.waitForTimeout(400);
  const res = await pg.evaluate(() => ({ iou: SAVE.build.outline, banner: document.getElementById('build-banner').textContent }));
  console.log('מתאר ביד עם רעש 4px:', JSON.stringify(res));
  await pg.screenshot({ path: OUT + 'build-1-check.png' });
  if (res.iou < 78) die('מתאר סביר ביד חופשית נכשל (' + res.iou + '%)');

  await pg.waitForTimeout(2800);
  await pg.screenshot({ path: OUT + 'build-2-seams.png' });
  const z = await pg.evaluate(() => ({ k: +bProj.k.toFixed(2), title: document.getElementById('build-title').textContent,
    text: document.getElementById('build-text').textContent, sub: document.getElementById('build-sub').textContent }));
  console.log('שלב תפרים:', JSON.stringify(z));
  if (!(z.k > 1.2)) die('המסך לא התקרב אל התפר (k=' + z.k + ')');

  /* --- שרטוט תפר באצבע --- */
  const sp = await pg.evaluate(() => {
    const r = document.getElementById('build-canvas').getBoundingClientRect();
    return bDensify(bTask.ring.map(([lo, la]) => [bProj.x(lo), bProj.y(la)]), 8)
      .map((p, i) => [r.left + p[0] + Math.sin(i / 2) * 5, r.top + p[1] + Math.cos(i / 2) * 5]);
  });
  await pg.mouse.move(sp[0][0], sp[0][1]);
  await pg.mouse.down();
  for (const p of sp) await pg.mouse.move(p[0], p[1]);
  await pg.mouse.up();
  await pg.click('#build-check');
  await pg.waitForTimeout(300);
  const seam = await pg.evaluate(() => ({ n: Object.keys(SAVE.build.seams).length,
    banner: document.getElementById('build-banner').textContent }));
  console.log('תפר ביד עם רעש 5px:', JSON.stringify(seam));
  await pg.screenshot({ path: OUT + 'build-2-check.png' });
  if (!seam.n) die('תפר סביר ביד חופשית נכשל');

  /* --- דילוג לשלב המסלע ובדיקת גרירה אמיתית --- */
  await pg.evaluate(() => {
    bSeamList().forEach(id => SAVE.build.seams[id] = 1);
    SAVE.build.stage = 2; persist(); bNextTask();
  });
  await pg.waitForTimeout(300);
  await pg.screenshot({ path: OUT + 'build-3-rocks.png' });
  const rz = await pg.evaluate(() => ({ k: +bProj.k.toFixed(2), chips: document.querySelectorAll('#build-bank .bchip').length,
    area: bTask.area.name, bankVisible: !document.getElementById('build-bank').hidden }));
  console.log('שלב מסלע:', JSON.stringify(rz));
  if (!rz.bankVisible) die('בנק הסלעים מוסתר');

  const dragInfo = await pg.evaluate(() => {
    const a = bTask.area;
    const chip = document.querySelector('.bchip[data-rock="' + a.rock + '"]');
    const cr = chip.getBoundingClientRect();
    const r = document.getElementById('build-canvas').getBoundingClientRect();
    /* מוצאים נקודה שבטוח בתוך המצולע */
    let best = null;
    for (let i = 0; i < a.poly.length; i++) {
      for (let j = i + 1; j < a.poly.length; j++) {
        const x = (bProj.x(a.poly[i][0]) + bProj.x(a.poly[j][0])) / 2;
        const y = (bProj.y(a.poly[i][1]) + bProj.y(a.poly[j][1])) / 2;
        if (bInPoly(x, y, a.poly)) { best = [x, y]; break; }
      }
      if (best) break;
    }
    return { from: [cr.left + cr.width / 2, cr.top + cr.height / 2],
             to: [r.left + best[0], r.top + best[1]], area: a.id, rock: a.rock };
  });
  await pg.mouse.move(dragInfo.from[0], dragInfo.from[1]);
  await pg.mouse.down();
  await pg.mouse.move(dragInfo.from[0] + 20, dragInfo.from[1] - 20);
  await pg.mouse.move((dragInfo.from[0] + dragInfo.to[0]) / 2, (dragInfo.from[1] + dragInfo.to[1]) / 2);
  await pg.mouse.move(dragInfo.to[0], dragInfo.to[1]);
  await pg.screenshot({ path: OUT + 'build-3-drag.png' });
  await pg.mouse.up();
  await pg.waitForTimeout(300);
  const rock = await pg.evaluate(() => ({ done: Object.keys(SAVE.build.rocks).length,
    banner: document.getElementById('build-banner').textContent }));
  console.log('גרירת סלע אמיתית:', JSON.stringify(rock), dragInfo.area, dragInfo.rock);
  await pg.screenshot({ path: OUT + 'build-3-check.png' });
  if (!rock.done) die('גרירת שבב אמיתית לא נקלטה');

  /* --- שלב אתרים --- */
  await pg.evaluate(() => {
    GEO_AREAS.forEach(a => SAVE.build.rocks[a.id] = 1);
    SAVE.build.stage = 3; persist(); bNextTask();
  });
  await pg.waitForTimeout(300);
  await pg.screenshot({ path: OUT + 'build-4-sites.png' });
  const sz = await pg.evaluate(() => ({ k: +bProj.k.toFixed(2), chip: document.querySelector('#build-bank .bchip').textContent,
    tools: !document.getElementById('build-draw-tools').hidden }));
  console.log('שלב אתרים:', JSON.stringify(sz));
  if (sz.k !== 1) die('שלב האתרים לא אמור להתקרב (k=' + sz.k + ')');
  if (sz.tools) die('כלי השרטוט גלויים בשלב האתרים');

  const sd = await pg.evaluate(() => {
    const chip = document.querySelector('#build-bank .bchip');
    const cr = chip.getBoundingClientRect();
    const r = document.getElementById('build-canvas').getBoundingClientRect();
    const s = bTask.site;
    return { from: [cr.left + cr.width / 2, cr.top + cr.height / 2],
             to: [r.left + bProj.x(s.lon), r.top + bProj.y(s.lat)], n: s.n };
  });
  await pg.mouse.move(sd.from[0], sd.from[1]);
  await pg.mouse.down();
  await pg.mouse.move((sd.from[0] + sd.to[0]) / 2, (sd.from[1] + sd.to[1]) / 2);
  await pg.mouse.move(sd.to[0], sd.to[1]);
  await pg.mouse.up();
  await pg.waitForTimeout(300);
  const site = await pg.evaluate(() => ({ done: Object.keys(SAVE.build.sites).length,
    banner: document.getElementById('build-banner').textContent }));
  console.log('גרירת אתר אמיתית:', JSON.stringify(site), sd.n);
  await pg.screenshot({ path: OUT + 'build-4-check.png' });
  if (!site.done) die('גרירת אתר אמיתית לא נקלטה');

  /* מצב בהיר */
  await pg.evaluate(() => { document.documentElement.setAttribute('data-theme', 'light'); if (typeof GameMap !== 'undefined') GameMap.refreshTheme && GameMap.refreshTheme(); bDraw(); });
  await pg.waitForTimeout(250);
  await pg.screenshot({ path: OUT + 'build-light.png' });

  if (errs.length) { console.log('שגיאות:'); errs.slice(0, 6).forEach(e => console.log('  ' + e)); process.exitCode = 1; }
  else console.log('אין שגיאות JS');
  await br.close();
  if (!process.exitCode) console.log('\nקלט אמיתי – הכול עבר ✓');
})();
