/* "אזורי הארץ": שהשלבים באמת מתקדמים בקושי ולא חוזרים על עצמם */
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

  /* --- שלמות המאגר --- */
  const data = await pg.evaluate(() => {
    const ids = new Set(REGIONS.map(r => r.id));
    const bad = REGION_Q.filter(q => !ids.has(q.r)).map(q => q.r);
    const noX = REGION_Q.filter(q => !q.x || q.x.length < 20).length;
    const dupQ = REGION_Q.length - new Set(REGION_Q.map(q => q.q)).size;
    /* שאלת תיאור לא אמורה להכיל את שם החבל שהיא שואלת עליו */
    const leak = REGION_Q.filter(q => {
      const head = REGIONS.find(r => r.id === q.r).name.split(' ו')[0].replace(/^ה/, '');
      return q.t === 2 && q.q.includes(head);
    }).map(q => q.q.slice(0, 40));
    return {
      total: REGION_Q.length,
      t2: REGION_Q.filter(q => q.t === 2).length,
      t3: REGION_Q.filter(q => q.t === 3).length,
      regionsCovered: new Set(REGION_Q.map(q => q.r)).size,
      regions: REGIONS.length, bad, noX, dupQ, leak
    };
  });
  console.log('מאגר:', JSON.stringify({ ...data, leak: data.leak.length }));
  if (data.bad.length) die('מזהי חבל לא קיימים: ' + data.bad.join(', '));
  if (data.noX) die(data.noX + ' שאלות בלי הסבר של ממש');
  if (data.dupQ) die(data.dupQ + ' שאלות כפולות במאגר');
  if (data.leak.length) { console.log('  דליפת שם:'); data.leak.forEach(t => console.log('    ' + t)); die('שאלת תיאור מכילה את שם החבל'); }
  if (data.regionsCovered < data.regions) die('רק ' + data.regionsCovered + ' מתוך ' + data.regions + ' חבלים מכוסים');

  /* --- מבנה השלבים --- */
  const levels = await pg.evaluate(() => {
    const out = [];
    for (let lv = 1; lv <= levelCount('regionFind'); lv++) {
      const qs = buildQuestions('regionFind', lv, 1);
      out.push({
        lv, n: qs.length, kicker: qs[0].kicker, mapMode: qs[0].mapMode,
        texts: qs.map(q => q.text),
        dup: qs.length - new Set(qs.map(q => q.text)).size
      });
    }
    return out;
  });
  console.log('שלבים:', levels.length);
  levels.forEach(l => console.log('  ' + l.lv + ': ' + l.n + ' שאלות · ' + l.mapMode.padEnd(16) + ' · ' + l.kicker + (l.dup ? '  ✗ ' + l.dup + ' כפולות' : '')));

  if (levels.length < 6) die('פחות מדי שלבים: ' + levels.length);
  levels.forEach(l => {
    if (l.dup) die('שלב ' + l.lv + ': ' + l.dup + ' שאלות כפולות באותו שלב');
    if (l.n < 4) die('שלב ' + l.lv + ' בנה רק ' + l.n + ' שאלות');
  });

  /* השלבים הראשונים הם שמות, המתקדמים לא */
  const nameLevels = levels.filter(l => l.kicker.includes('איפה האזור'));
  const advanced = levels.filter(l => !l.kicker.includes('איפה האזור'));
  console.log('שלבי שם:', nameLevels.length, '· שלבים מתקדמים:', advanced.length);
  if (!nameLevels.length) die('אין שלבי בסיס');
  if (advanced.length < 4) die('רק ' + advanced.length + ' שלבים מתקדמים – זה עדיין חזרתי');
  if (nameLevels.some(l => l.lv > advanced[0].lv)) die('שלבי השם אינם ראשונים');
  if (advanced.some(l => l.mapMode !== 'regionsOutline')) die('שלב מתקדם לא עבר למפה בלי צבעי אזורים');

  /* --- אין חזרה בין שלבים מאותו סוג --- */
  ['🔎', '🧭'].forEach(mark => {
    const grp = levels.filter(l => l.kicker.includes(mark));
    const all = grp.flatMap(l => l.texts);
    const uniq = new Set(all).size;
    console.log(mark + ' ' + grp.length + ' שלבים · ' + all.length + ' שאלות · ' + uniq + ' ייחודיות');
    if (grp.length && uniq < all.length * 0.85) {
      die(mark + ': רק ' + uniq + ' ייחודיות מתוך ' + all.length + ' – חזרתי מדי');
    }
  });

  /* --- ההשוואה שהמשתמש התלונן עליה: כמה חזרה יש בסך הכול --- */
  const all = levels.flatMap(l => l.texts);
  console.log('סה״כ ' + all.length + ' שאלות · ' + new Set(all).size + ' ייחודיות');
  if (new Set(all).size < 40) die('רק ' + new Set(all).size + ' שאלות ייחודיות בכל המצב');

  /* --- לחיצה על המפה עדיין עובדת כשהאזורים שקופים --- */
  await pg.evaluate(() => startGame('regionFind', 5, 1));
  await pg.waitForTimeout(1100);
  const play = await pg.evaluate(() => {
    const q = G.qs[G.idx];
    const rg = REGIONS.find(r => r.id === q.targetRegion);
    /* נקודה שבטוח בתוך המצולע */
    let hit = null;
    for (let i = 0; i < rg.poly.length && !hit; i++) {
      for (let j = i + 2; j < rg.poly.length; j++) {
        const lo = (rg.poly[i][0] + rg.poly[j][0]) / 2, la = (rg.poly[i][1] + rg.poly[j][1]) / 2;
        if (GameMap.regionAt(lo, la) === rg.id) { hit = [lo, la]; break; }
      }
    }
    return { target: q.targetRegion, text: q.text.slice(0, 45), mapMode: q.mapMode,
      tintOpacity: GameMap.layers.regions.querySelector('.region').style.opacity,
      hit: !!hit, resolved: hit ? GameMap.regionAt(hit[0], hit[1]) : null };
  });
  console.log('משחק בפועל:', JSON.stringify(play));
  if (play.tintOpacity !== '0') die('צבעי האזורים לא כובו בשלב המתקדם');
  if (!play.hit || play.resolved !== play.target) die('זיהוי הלחיצה על המפה נשבר כשהאזורים שקופים');
  await pg.screenshot({ path: OUT + 'region-advanced.png' });

  if (errs.length) { console.log('שגיאות:'); errs.slice(0, 6).forEach(e => console.log('  ' + e)); process.exitCode = 1; }
  else console.log('אין שגיאות JS');
  await br.close();
  if (!process.exitCode) console.log('\nהכול עבר ✓');
})();
