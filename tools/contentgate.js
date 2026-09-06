/* איפוס שלבים שהתוכן בהם התחדש: רק מה שהשתנה, פעם אחת, וגם מול הענן */
const { chromium } = require('playwright');
const OUT = '/tmp/claude-0/-home-user-Click-Solutions/1256c9c9-2e8d-5f05-8089-587c3672dc1d/scratchpad/shots/';
const die = m => { console.log('FAIL: ' + m); process.exitCode = 1; };
const URL = process.env.GAME_URL || 'http://localhost:8907/index.html';

/* שמירה של שחקן ותיק שסיים הכול, כפי שהייתה נראית לפני העדכון */
const OLD_SAVE = {
  coins: 500, xp: 900, welcomed: 1,
  stars: {
    regionFind: { 1: 3, 2: 3, 3: 3, 4: 2, 5: 3, 6: 3, 7: 1, 8: 3 },
    trivia: { 1: 3, 2: 2 },
    'locate:1': { 1: 3, 2: 3 }
  },
  best: {
    'regionFind:1': 800, 'regionFind:3': 700, 'regionFind:8': 650,
    'trivia:1': 400, 'locate:1:1': 900
  }
};

(async () => {
  const br = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const errs = [];

  const open = async (seed) => {
    const pg = await br.newPage({ viewport: { width: 390, height: 844 } });
    pg.on('pageerror', e => errs.push(String(e)));
    if (seed !== undefined) {
      /* זורעים פעם אחת בלבד: סקריפט אתחול רץ בכל ניווט, ובלי
         התנאי הזה הוא היה דורס את מה שנשמר בין רענון לרענון. */
      await pg.addInitScript(s => {
        try {
          if (!localStorage.getItem('israel-geo-game-v1')) {
            localStorage.setItem('israel-geo-game-v1', s);
          }
        } catch (e) {}
      }, JSON.stringify(seed));
    }
    await pg.goto(URL);
    await pg.waitForTimeout(800);
    if (await pg.locator('#acc-guest').isVisible().catch(() => 0)) {
      await pg.click('#acc-guest'); await pg.waitForTimeout(400);
    }
    return pg;
  };

  /* --- שחקן ותיק: רק השלבים שהשתנו נפתחים מחדש --- */
  let pg = await open(OLD_SAVE);
  let st = await pg.evaluate(() => ({
    stars: SAVE.stars.regionFind, cver: SAVE.cver, fresh: SAVE.fresh,
    trivia: SAVE.stars.trivia, locate: SAVE.stars['locate:1'],
    best1: SAVE.best['regionFind:1'], best3: SAVE.best['regionFind:3'],
    coins: SAVE.coins, xp: SAVE.xp
  }));
  console.log('אחרי העדכון:', JSON.stringify(st));
  if (st.stars['1'] !== 3 || st.stars['2'] !== 3) die('שלבים 1-2 לא השתנו ואסור היה לאפס אותם');
  for (const lv of [3, 4, 5, 6, 7, 8]) {
    if (st.stars[String(lv)] !== undefined) die('שלב ' + lv + ' לא אופס');
  }
  if (st.best3 !== undefined) die('השיא של שלב 3 לא נמחק');
  if (st.best1 !== 800) die('השיא של שלב 1 נמחק בטעות');
  if (st.cver.regionFind !== 2) die('גרסת התוכן לא עודכנה');
  if (st.fresh.regionFind !== 3) die('המצב לא סומן כחדש');
  if (JSON.stringify(st.trivia) !== JSON.stringify({ 1: 3, 2: 2 })) die('מצב אחר נפגע');
  if (JSON.stringify(st.locate) !== JSON.stringify({ 1: 3, 2: 3 })) die('מצב עם רמות קושי נפגע');
  if (st.coins !== 500 || st.xp !== 900) die('מטבעות או ניסיון אופסו – אסור');

  /* --- התג מופיע על הכרטיס --- */
  const badge = await pg.evaluate(() => {
    const cards = [...document.querySelectorAll('#modes-grid .mode-card')];
    const card = cards.find(c => c.querySelector('h3').textContent.includes('אזורי הארץ'));
    return { has: !!card.querySelector('.mode-new'),
      others: cards.filter(c => c.querySelector('.mode-new')).length };
  });
  console.log('תג "חדש":', JSON.stringify(badge));
  if (!badge.has) die('אין תג "חדש" על המצב שהתעדכן');
  if (badge.others !== 1) die('התג הופיע על ' + badge.others + ' מצבים במקום על אחד');
  await pg.screenshot({ path: OUT + 'gate-badge.png' });

  /* --- הרצה שנייה לא מוחקת כוכבים שהורווחו מאז --- */
  await pg.evaluate(() => { SAVE.stars.regionFind[5] = 3; persist(); });
  await pg.reload();
  await pg.waitForTimeout(900);
  st = await pg.evaluate(() => ({ five: SAVE.stars.regionFind['5'], cver: SAVE.cver.regionFind }));
  console.log('אחרי טעינה שנייה:', JSON.stringify(st));
  if (st.five !== 3) die('הרצה שנייה מחקה כוכבים חדשים – השער אינו חד-פעמי');
  if (st.cver !== 2) die('גרסת התוכן השתנתה בטעות');

  /* --- התג יורד אחרי שמסיימים שלב מהחדשים --- */
  const cleared = await pg.evaluate(() => {
    G = { mode: 'regionFind', level: 4, diff: 1 };
    if (SAVE.fresh['regionFind'] && G.level >= SAVE.fresh['regionFind']) delete SAVE.fresh['regionFind'];
    persist();
    return SAVE.fresh['regionFind'];
  });
  console.log('אחרי שלב 4:', cleared === undefined ? 'התג ירד' : 'התג נשאר');
  if (cleared !== undefined) die('התג לא ירד אחרי שיחקו את התוכן החדש');
  await pg.close();

  /* --- שחקן חדש: אין מה לאפס ואין תג --- */
  pg = await open();
  st = await pg.evaluate(() => ({ cver: SAVE.cver.regionFind, fresh: SAVE.fresh.regionFind,
    badge: !!document.querySelector('#modes-grid .mode-new') }));
  console.log('שחקן חדש:', JSON.stringify(st));
  if (st.cver !== 2) die('שחקן חדש לא קיבל את גרסת התוכן');
  if (st.fresh !== undefined || st.badge) die('שחקן חדש קיבל תג "חדש" בלי סיבה');
  await pg.close();

  /* --- מיזוג מהענן: מכשיר שני שעוד לא עודכן לא מחזיר כוכבים --- */
  pg = await open(OLD_SAVE);
  const merged = await pg.evaluate(() => {
    /* המקומי כבר עבר את השער; המרוחק הוא המכשיר שעוד לא עודכן,
       ובו כל שמונת השלבים עדיין מסומנים כהושלמו. */
    const remote = {
      coins: 10, xp: 10, cver: {},
      stars: { regionFind: { 1: 3, 2: 3, 3: 3, 4: 3, 5: 3, 6: 3, 7: 3, 8: 3 } },
      best: { 'regionFind:7': 999, 'regionFind:1': 400 }
    };
    const out = Cloud.merge(JSON.parse(JSON.stringify(SAVE)), remote);
    return { stars: out.stars.regionFind, cver: out.cver.regionFind,
      best7: out.best['regionFind:7'], best1: out.best['regionFind:1'],
      coins: out.coins };
  });
  console.log('מיזוג מהענן:', JSON.stringify(merged));
  for (const lv of [3, 4, 5, 6, 7, 8]) {
    if (merged.stars[String(lv)] !== undefined) die('מיזוג מהענן החזיר את שלב ' + lv);
  }
  if (merged.stars['1'] !== 3 || merged.stars['2'] !== 3) die('המיזוג איבד שלבים שלא השתנו');
  if (merged.best7 !== undefined) die('מיזוג מהענן החזיר שיא מיושן');
  if (merged.best1 !== 800) die('המיזוג לא שמר את השיא הגבוה בשלב שלא השתנה');
  if (merged.cver !== 2) die('גרסת התוכן אחרי מיזוג אינה הנוכחית');
  if (merged.coins !== 500) die('המיזוג פגע במטבעות');

  await pg.close();

  if (errs.length) { console.log('שגיאות:'); errs.slice(0, 6).forEach(e => console.log('  ' + e)); process.exitCode = 1; }
  else console.log('אין שגיאות JS');
  await br.close();
  if (!process.exitCode) console.log('\nהכול עבר ✓');
})();
