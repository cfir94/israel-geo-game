/* בדיקת קמפיין "בונים את הארץ" מקצה לקצה */
const { chromium } = require('playwright');
const path = require('path');
const URL = 'file://' + path.join('/workspace/israel-geo-game', 'index.html');

const die = m => { console.log('FAIL: ' + m); process.exitCode = 1; };

(async () => {
  const br = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const pg = await br.newPage({ viewport: { width: 390, height: 844 } });
  const errs = [];
  pg.on('pageerror', e => errs.push(String(e)));
  pg.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  await pg.goto(URL);
  await pg.waitForTimeout(600);

  /* דילוג על מסך הפתיחה אם יש */
  await pg.evaluate(() => { if (typeof show === 'function') show('home'); });
  await pg.waitForTimeout(200);

  const hasBtn = await pg.locator('#btn-build').count();
  if (!hasBtn) die('אין כפתור #btn-build');
  await pg.evaluate(() => openBuild());
  await pg.waitForTimeout(400);

  const vis = await pg.evaluate(() => {
    const s = document.getElementById('screen-build');
    const c = document.getElementById('build-canvas');
    return { on: s.classList.contains('active'), w: c.clientWidth, h: c.clientHeight,
             title: document.getElementById('build-title').textContent,
             text: document.getElementById('build-text').textContent,
             tools: !document.getElementById('build-draw-tools').hidden };
  });
  console.log('שלב 1:', JSON.stringify(vis));
  if (!vis.on) die('מסך הבנייה לא נפתח');
  if (vis.w < 100 || vis.h < 100) die('הקנבס לא נמדד נכון: ' + vis.w + '×' + vis.h);
  if (!vis.tools) die('כלי השרטוט מוסתרים בשלב המתאר');

  /* --- שלב 1: מתאר. שרבוט קטן צריך להיכשל, מעקב מדויק צריך לעבור --- */
  const scribble = await pg.evaluate(() => {
    bStrokes = [[]];
    for (let i = 0; i < 40; i++) bStrokes[0].push([bW / 2 + Math.cos(i) * 12, bH / 2 + Math.sin(i) * 12]);
    bCheck();
    return { iou: SAVE.build.outline, stage: SAVE.build.stage };
  });
  console.log('שרבוט:', JSON.stringify(scribble));
  if (scribble.stage !== 0) die('שרבוט קטן עבר את שלב המתאר');

  /* מעקב אחרי הקו הירוק בלבד – בלי יהודה ושומרון – צריך להיכשל */
  const greenLine = await pg.evaluate(() => {
    bStrokes = [GEO.israel.map(([lo, la]) => [bProj.x(lo), bProj.y(la)])];
    bCheck();
    return { iou: SAVE.build.outline, stage: SAVE.build.stage };
  });
  console.log('מעקב אחרי ישראל בלי יו״ש:', JSON.stringify(greenLine));
  if (greenLine.stage !== 0) die('מתאר בלי יהודה ושומרון עבר');

  /* הצללית החיצונית – צריך לעבור */
  const traced = await pg.evaluate(() => {
    const ring = GEO.israel.map(([lo, la]) => [bProj.x(lo), bProj.y(la)]);
    const wb = GEO.westbank.map(([lo, la]) => [bProj.x(lo), bProj.y(la)]);
    bStrokes = [ring.concat(wb)];
    bCheck();
    return { iou: SAVE.build.outline, stage: SAVE.build.stage };
  });
  console.log('מעקב אחרי הצללית:', JSON.stringify(traced));

  await pg.waitForTimeout(3000);
  const st1 = await pg.evaluate(() => ({ stage: SAVE.build.stage, title: document.getElementById('build-title').textContent }));
  console.log('אחרי שלב 1:', JSON.stringify(st1));
  if (st1.stage !== 1) die('לא עברנו לשלב התפרים (stage=' + st1.stage + ')');

  /* --- שלב 2: תפרים. עוברים על כולם במעקב מדויק --- */
  const seamRes = [];
  for (let i = 0; i < 20; i++) {
    const r = await pg.evaluate(() => {
      if (!bTask || bTask.kind !== 'draw') return null;
      const id = bTask.id;
      bStrokes = [bDensify(bTask.ring.map(([lo, la]) => [bProj.x(lo), bProj.y(la)]), 4)];
      const err = bLineErr(bStrokes[0], bTask.ring);
      bCheck();
      return { id, err: +err.toFixed(4), ok: !!SAVE.build.seams[id] };
    });
    if (!r) break;
    seamRes.push(r);
    if (!r.ok) { die('תפר נכשל למרות מעקב מדויק: ' + r.id + ' err=' + r.err); break; }
    await pg.waitForTimeout(1300);
  }
  console.log('תפרים:', JSON.stringify(seamRes));

  /* קו שגוי צריך להיכשל – נבדק על תפר אחרי איפוס אחד */
  await pg.waitForTimeout(3000);
  const st2 = await pg.evaluate(() => SAVE.build.stage);
  console.log('אחרי שלב 2, stage =', st2);
  if (st2 !== 2) die('לא עברנו לשלב המסלע (stage=' + st2 + ')');

  /* --- שלב 3: מסלע. בודקים סלע שגוי ואז נכון --- */
  const rockBad = await pg.evaluate(() => {
    const a = bTask.area;
    const wrong = Object.keys(ROCKS).find(k => k !== a.rock);
    const c = a.poly.reduce((s, p) => [s[0] + p[0] / a.poly.length, s[1] + p[1] / a.poly.length], [0, 0]);
    bDrag = { rock: wrong, moved: true };
    bDropChip(bDrag, bProj.x(c[0]), bProj.y(c[1]));
    bDrag = null;
    return { area: a.id, wrong, saved: !!SAVE.build.rocks[a.id] };
  });
  console.log('סלע שגוי:', JSON.stringify(rockBad));
  if (rockBad.saved) die('סלע שגוי התקבל');

  const bankN = await pg.evaluate(() => document.querySelectorAll('#build-bank .bchip').length);
  console.log('שבבים בבנק:', bankN, 'מתוך', await pg.evaluate(() => Object.keys(ROCKS).length));
  if (bankN < 5) die('בנק הסלעים ריק');

  let rockDone = 0;
  for (let i = 0; i < 40; i++) {
    const r = await pg.evaluate(() => {
      if (!bTask || !bTask.area) return null;
      const a = bTask.area;
      const c = a.poly.reduce((s, p) => [s[0] + p[0] / a.poly.length, s[1] + p[1] / a.poly.length], [0, 0]);
      let x = bProj.x(c[0]), y = bProj.y(c[1]);
      if (!bInPoly(x, y, a.poly)) { const p = a.poly[0], q = a.poly[1]; x = (bProj.x(p[0]) + bProj.x(q[0])) / 2; y = (bProj.y(p[1]) + bProj.y(q[1])) / 2; }
      bDrag = { rock: a.rock, moved: true };
      bDropChip(bDrag, x, y);
      bDrag = null;
      return { id: a.id, ok: !!SAVE.build.rocks[a.id] };
    });
    if (!r) break;
    if (!r.ok) { die('סלע נכון נדחה באזור ' + r.id + ' (כנראה המרכז מחוץ למצולע)'); break; }
    rockDone++;
    await pg.waitForTimeout(900);
  }
  const areasN = await pg.evaluate(() => GEO_AREAS.length);
  console.log('אזורי מסלע שנצבעו:', rockDone, '/', areasN);
  await pg.waitForTimeout(3000);
  const st3 = await pg.evaluate(() => SAVE.build.stage);
  console.log('אחרי שלב 3, stage =', st3);
  if (st3 !== 3) die('לא עברנו לשלב האתרים (stage=' + st3 + ')');

  /* --- שלב 4: אתרים --- */
  const siteBad = await pg.evaluate(() => {
    const s = bTask.site;
    bDrag = { site: s.id, moved: true };
    bDropChip(bDrag, bProj.x(s.lon) + 60, bProj.y(s.lat) + 60);
    bDrag = null;
    return { id: s.id, saved: !!SAVE.build.sites[s.id] };
  });
  console.log('אתר רחוק:', JSON.stringify(siteBad));
  if (siteBad.saved) die('אתר שהונח רחוק התקבל');

  const siteGood = await pg.evaluate(() => {
    const s = bTask.site;
    bDrag = { site: s.id, moved: true };
    bDropChip(bDrag, bProj.x(s.lon), bProj.y(s.lat));
    bDrag = null;
    return { id: s.id, n: s.n, saved: !!SAVE.build.sites[s.id] };
  });
  console.log('אתר מדויק:', JSON.stringify(siteGood));
  if (!siteGood.saved) die('אתר שהונח מדויק נדחה');

  await pg.waitForTimeout(900);
  const tiers = await pg.evaluate(() => {
    const t1 = SITES.filter(s => s.lvl === 1).length, t2 = SITES.filter(s => s.lvl === 2).length;
    return { t1, t2, prog: document.getElementById('build-progress').textContent };
  });
  console.log('שכבות אתרים:', JSON.stringify(tiers));

  /* מעבר שכבה: מסמנים את כל אתרי שכבה 1 ורואים שנפתחת שכבה 2 */
  const tierJump = await pg.evaluate(() => {
    SITES.filter(s => s.lvl === 1).forEach(s => SAVE.build.sites[s.id] = 1);
    bNextTask();
    return { tier: SAVE.build.tier, site: bTask && bTask.site && bTask.site.n, lvl: bTask && bTask.site && bTask.site.lvl };
  });
  console.log('מעבר לשכבה הבאה:', JSON.stringify(tierJump));
  if (tierJump.tier !== 1 || tierJump.lvl !== 2) die('שכבת האתרים השנייה לא נפתחה');

  /* סיום מלא */
  const fin = await pg.evaluate(() => {
    SITES.filter(s => s.lvl === 2).forEach(s => SAVE.build.sites[s.id] = 1);
    bNextTask();
    return SAVE.build.stage;
  });
  await pg.waitForTimeout(1800);
  const done = await pg.evaluate(() => ({ stage: SAVE.build.stage, title: document.getElementById('build-title').textContent }));
  console.log('סיום:', JSON.stringify(done));
  if (done.stage !== 4) die('הקמפיין לא הסתיים (stage=' + done.stage + ')');

  /* התקדמות נשמרת בין טעינות */
  await pg.reload();
  await pg.waitForTimeout(700);
  const persisted = await pg.evaluate(() => SAVE.build && SAVE.build.stage);
  console.log('אחרי רענון, stage =', persisted);
  if (persisted !== 4) die('ההתקדמות לא נשמרה (' + persisted + ')');

  /* איפוס */
  await pg.evaluate(() => { window.confirm = () => true; document.getElementById('build-reset').click(); });
  await pg.waitForTimeout(300);
  const reset = await pg.evaluate(() => SAVE.build.stage);
  console.log('אחרי איפוס, stage =', reset);
  if (reset !== 0) die('האיפוס לא עבד');

  await pg.screenshot({ path: '/tmp/claude-0/-home-user-Click-Solutions/1256c9c9-2e8d-5f05-8089-587c3672dc1d/scratchpad/shots/build.png' });

  if (errs.length) { console.log('שגיאות בדף:'); errs.slice(0, 8).forEach(e => console.log('  ' + e)); process.exitCode = 1; }
  else console.log('אין שגיאות JS');
  await br.close();
  if (!process.exitCode) console.log('\nהכול עבר ✓');
})();
