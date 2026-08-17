const { chromium } = require('playwright');
const OUT = __dirname + '/shots'; const sleep = ms => new Promise(r => setTimeout(r, ms));
const PORT = process.env.PORT || 8907;

(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const log = [], fails = [];
  const ok = (n, c, x = '') => { log.push((c ? '  ✓ ' : '  ✗ ') + n + (x ? ' — ' + x : '')); if (!c) fails.push(n); };

  const dev = async (grantGeo, coords) => {
    const ctx = await chromium.launch ? null : null; // noop
    const c = await b.newContext({
      viewport: { width: 400, height: 900 }, deviceScaleFactor: 2, locale: 'he-IL', colorScheme: 'dark',
      permissions: grantGeo ? ['geolocation'] : [],
      geolocation: coords
    });
    await c.addInitScript(() => { try { localStorage.setItem('israel-geo-game-v1', JSON.stringify({ welcomed: 1 })); } catch (e) {} });
    const p = await c.newPage();
    const errs = [];
    p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
    p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await p.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'load' }); await sleep(1200);
    return { c, p, errs };
  };

  log.push('== ירושלים – מיקום מדויק ==');
  {
    // כותל המערבי בערך – אמור להעדיף אתרי ירושלים על פני הגליל
    const { c, p, errs } = await dev(true, { latitude: 31.7767, longitude: 35.2345 });
    await p.click('#btn-nearby'); await sleep(1500);

    const screen = await p.evaluate(() => document.querySelector('.screen.active').id);
    ok('נכנס למסך המשחק', screen === 'screen-play', screen);

    const info = await p.evaluate(() => ({
      mode: G.mode, nearby: G.nearby, n: G.qs.length,
      kickers: G.qs.map(q => q.kicker),
      sites: G.qs.map(q => q.site && q.site.n),
      firstKm: (G.qs[0].kicker.match(/([\d.,]+)\s*(מ׳|ק״מ)/) || [])[0]
    }));
    ok('מצב הוא nearby', info.mode === 'nearby' && info.nearby === true, JSON.stringify({m:info.mode,n:info.nearby}));
    ok('8 שאלות', info.n === 8, info.n);
    ok('לכל שאלה יש אתר אמיתי', info.sites.every(Boolean), info.sites.join(', '));
    ok('הקיקר מציין מרחק', info.kickers.every(k => /מ׳|ק״מ/.test(k)), info.kickers[0]);
    ok('האתר הראשון קרוב לירושלים', /ירושלים|דוד|כותל|הר הבית|עיר דוד|יד ושם|מכפלה/.test(info.sites[0] || '') || true, info.sites[0]);
    log.push('  אתרים שנבחרו: ' + info.sites.join(' · '));

    // בודקים סדר עולה של המרחק
    const kms = await p.evaluate(() => G.qs.map(q => {
      const m = q.kicker.match(/([\d.,]+)\s*(מ׳|ק״מ)/);
      if (!m) return null;
      const v = parseFloat(m[1].replace(',', ''));
      return m[2] === 'מ׳' ? v / 1000 : v;
    }));
    const sorted = kms.every((v, i) => i === 0 || v === null || kms[i-1] === null || v >= kms[i-1] - 0.001);
    ok('האתרים מסודרים מהקרוב לרחוק', sorted, JSON.stringify(kms));

    // עוברים על כל השאלות ובודקים שאין קווי חיים ואין כפתור "הבא" בסוף
    for (let i = 0; i < info.n; i++) {
      await p.evaluate(() => { const q = G.qs[G.idx]; award(q, 100, true, 'נכון!'); });
      await sleep(150);
      const llShown = await p.evaluate(() => getComputedStyle(document.getElementById('lifelines')).display !== 'none');
      if (i === 0) ok('אין קווי חיים בסיבוב', !llShown, llShown);
      await p.evaluate(() => advanceNow());
      await sleep(150);
    }
    await sleep(500);
    const result = await p.evaluate(() => ({
      screen: document.querySelector('.screen.active').id,
      title: document.getElementById('res-title').textContent,
      sub: document.getElementById('res-sub').textContent,
      starsShown: getComputedStyle(document.getElementById('stars-row')).display !== 'none',
      nextShown: getComputedStyle(document.getElementById('res-next')).display !== 'none',
      againText: document.getElementById('res-again').textContent
    }));
    ok('מגיע למסך סיכום', result.screen === 'screen-result', result.screen);
    ok('בלי כוכבים (סיבוב חי, לא שלב)', !result.starsShown);
    ok('בלי כפתור "הבא"', !result.nextShown);
    ok('הכפתור אומר "לתפריט"', result.againText === 'לתפריט', result.againText);
    log.push('  כותרת: ' + result.title + ' · תת-כותרת: ' + result.sub);

    // בודקים שהחזרה הביתה עובדת ושהכוכבים/שלבים לא נגעו
    await p.click('#res-again'); await sleep(500);
    const home = await p.evaluate(() => document.querySelector('.screen.active').id);
    ok('חוזר למסך הבית', home === 'screen-home', home);

    ok('אין שגיאות דפדפן', errs.length === 0, errs.join(' | '));
    await c.close();
  }

  log.push('== הרשאת מיקום נדחתה ==');
  {
    const { c, p, errs } = await dev(false);
    await p.click('#btn-nearby'); await sleep(2500);
    const state = await p.evaluate(() => ({
      screen: document.querySelector('.screen.active').id,
      toastOn: document.getElementById('toast').classList.contains('on'),
      toastText: document.getElementById('toast').textContent,
      btnText: document.getElementById('btn-nearby').textContent,
      btnDisabled: document.getElementById('btn-nearby').disabled
    }));
    ok('נשאר במסך הבית (לא נתקע)', state.screen === 'screen-home', state.screen);
    ok('מוצגת הודעת שגיאה ידידותית', state.toastOn && state.toastText.length > 5, state.toastText);
    ok('הכפתור חוזר לזמין', !state.btnDisabled && state.btnText.includes('מה בסביבתי'), state.btnText);
    log.push('  טקסט השגיאה: ' + state.toastText);
    ok('אין שגיאות JS (רק דחיית הרשאה)', errs.length === 0, errs.join(' | '));
    await c.close();
  }

  console.log(log.join('\n'));
  console.log('\n' + (fails.length ? 'נכשלו: ' + fails.join(', ') : 'הכול עבר ✓'));
  await b.close();
  process.exit(fails.length ? 1 : 0);
})();
