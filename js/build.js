/* =============================================================
   "בונים את הארץ" – קמפיין בנייה של המפה מאפס.

   ארבעה שלבים, כל אחד נפתח רק אחרי שקודמו הושלם, וההתקדמות
   נשמרת בין ביקורים:
     1. מתאר – משרטטים את קו המתאר של הארץ באצבע.
     2. גבולות – משרטטים את הקווים שמפרידים בין חבלי הארץ.
     3. מסלע – גוררים סוג סלע לכל אזור גיאולוגי, והמפה נצבעת.
     4. אתרים – גוררים אתרים למקומם המדויק, 53 ואז 30 נוספים.

   הכול על קנבס אחד: גם מה שכבר "הרווחת" מצויר בו, גם מה שאתה
   משרטט כרגע, וגם החישוב של הציון נעשה עליו (רסטריזציה והשוואת
   פיקסלים). כך אין תלות במנוע ה-SVG של המפה הרגילה.
   ============================================================= */

const BUILD_TIERS = [1, 2];          /* שכבות האתרים: חובה, ואז הרחבה */
const B_KX = Math.cos(31.5 * Math.PI / 180);

/* ספים – המשתמש ביקש מחמיר לכל האורך */
const B_PASS = {
  /* חפיפת שטחים (IoU) נדרשת למתאר. כויל מול הצללית האמיתית:
     מעקב מדויק נותן 0.96, יד חופשית סבירה 0.81, מעקב אחרי הקו הירוק
     בלבד (בלי יו״ש) 0.75, והזזה של 25 פיקסל 0.64. */
  outline: 0.78,
  /* מרחק ממוצע מהקו הנכון, כחלק מאלכסון הקנבס. 0.025 ≈ 20 פיקסל:
     יד חופשית עם סטייה של 12 פיקסל נותנת 0.015, והזזה של 20 פיקסל
     נופלת. המסך מתקרב לתפר, ולכן הסף נשמר יחסי למה שרואים. */
  seam: 0.025,
  siteKm: 12         /* דיוק נדרש במיקום אתר */
};

/* הקווים שמפרידים בין חבלי הארץ – התפרים שמורה דרך חייב להכיר,
   מצפון לדרום. משתמשים ב-BOUNDS שכבר קיים במשחק. */
const B_SEAMS = ['betHakerem', 'basaltDam', 'taniminB', 'iron', 'milh',
  'dothan', 'yarkonB', 'kfira', 'shikmaB', 'watershed'];

/* חלק מהתפרים הם נחלים, ושם הגבול ב-BOUNDS מתואר בלי גאומטריה –
   הקו עצמו יושב ב-STREAMS. כאן מחברים בין השניים. */
const B_SEAM_STREAM = { taniminB: 'taninim', yarkonB: 'yarkon', shikmaB: 'shikma',
  sorekB: 'sorek', tavorB: 'tavor' };
function bSeamPath(b) {
  if (!b) return null;
  if (b.path && b.path.length > 1) return b.path;
  const s = STREAMS.find(x => x.id === B_SEAM_STREAM[b.id]);
  return s && s.path && s.path.length > 1 ? s.path : null;
}
const bSeamList = () => B_SEAMS.filter(id => bSeamPath(BOUND_BY_ID[id]));

/* מתאר הארץ הוא הצללית החיצונית – ישראל, יהודה ושומרון והגולן
   יחד. מי שמשרטט את צורת הארץ מצייר את הקו החיצוני, לא את הקו הירוק. */
const bOutlineRings = () => [GEO.israel, GEO.westbank, GEO.golan];

const BUILD_STAGES = [
  { id: 'outline', icon: '✏️', name: 'מתאר הארץ',
    tip: 'שרטטו באצבע את קו המתאר של ישראל – מהחרמון ועד אילת, וחזרה לאורך החוף.' },
  { id: 'seams', icon: '📐', name: 'גבולות פנימיים',
    tip: 'שרטטו את הקו שמפריד בין שני חבלי הארץ.' },
  { id: 'rocks', icon: '🪨', name: 'מסלע',
    tip: 'גררו כל סוג סלע אל האזור שבו הוא חשוף.' },
  { id: 'sites', icon: '📍', name: 'אתרים',
    tip: 'גררו כל אתר אל מקומו המדויק על המפה.' }
];
const B_STAGE_BY_ID = Object.fromEntries(BUILD_STAGES.map((s, i) => [s.id, i]));

/* ------------------------------------------------ מצב ---- */
function bSave() {
  if (!SAVE.build) SAVE.build = { stage: 0, outline: 0, seams: {}, rocks: {}, sites: {}, tier: 0 };
  return SAVE.build;
}
const bStageDone = i => bSave().stage > i;

/* --------------------------------------------- הקנבס ---- */
let bCv = null, bCtx = null, bProj = null, bBase = null, bW = 0, bH = 0;
let bStroke = null;      /* השרטוט הנוכחי, בקואורדינטות קנבס */
let bTask = null;        /* המשימה הנוכחית בתוך השלב */
let bDrag = null;        /* גרירה פעילה של שבב */
let bFlash = null;       /* אנימציית משוב קצרה */

function bFit() {
  const host = $('#build-canvas-wrap');
  if (!host || !bCv) return;
  const r = host.getBoundingClientRect();
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  bW = Math.max(80, Math.round(r.width));
  bH = Math.max(80, Math.round(r.height));
  bCv.width = Math.round(bW * dpr);
  bCv.height = Math.round(bH * dpr);
  bCv.style.width = bW + 'px';
  bCv.style.height = bH + 'px';
  bCtx = bCv.getContext('2d');
  bCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  bBase = bMakeProj(bW, bH, 14);
  bApplyProj();
  bDraw();
}

/* חלק מהמשימות קטנות מכדי לעבוד עליהן באצבע: תפר באורך 20 פיקסל,
   או אזור מסלע בגודל ציפורן. במשימות כאלה המסך מתקרב אל המשימה,
   והמפה סביבה נשארת גלויה כדי שאפשר יהיה להתמצא. */
function bApplyProj() {
  bProj = (bTask && bTask.zoom && bTask.zoom.length)
    ? bZoomProj(bBase, bTask.zoom, .55) : bBase;
}

function bZoomProj(base, geoms, frac) {
  let minx = 1e9, maxx = -1e9, miny = 1e9, maxy = -1e9;
  geoms.forEach(g => g.forEach(([lo, la]) => {
    const x = base.x(lo), y = base.y(la);
    if (x < minx) minx = x; if (x > maxx) maxx = x;
    if (y < miny) miny = y; if (y > maxy) maxy = y;
  }));
  const gw = Math.max(1, maxx - minx), gh = Math.max(1, maxy - miny);
  const k = Math.max(1, Math.min(6, Math.min(bW * frac / gw, bH * frac / gh)));
  const cx = (minx + maxx) / 2, cy = (miny + maxy) / 2;
  const ox = bW / 2 - cx * k, oy = bH / 2 - cy * k;
  return {
    x: lo => base.x(lo) * k + ox,
    y: la => base.y(la) * k + oy,
    lon: px => base.lon((px - ox) / k),
    lat: py => base.lat((py - oy) / k),
    s: base.s * k, k
  };
}

function bMakeProj(w, h, pad) {
  let minx = 1e9, maxx = -1e9, miny = 1e9, maxy = -1e9;
  const scan = ring => ring.forEach(([lo, la]) => {
    const x = lo * B_KX, y = -la;
    if (x < minx) minx = x; if (x > maxx) maxx = x;
    if (y < miny) miny = y; if (y > maxy) maxy = y;
  });
  [GEO.israel, GEO.westbank, GEO.golan].forEach(scan);
  const sw = maxx - minx, sh = maxy - miny;
  const s = Math.min((w - pad * 2) / sw, (h - pad * 2) / sh);
  const ox = (w - sw * s) / 2 - minx * s, oy = (h - sh * s) / 2 - miny * s;
  return {
    x: lo => lo * B_KX * s + ox,
    y: la => -la * s + oy,
    lon: px => (px - ox) / s / B_KX,
    lat: py => -(py - oy) / s,
    s, k: 1
  };
}

const bPath = (ctx, ring, close) => {
  ctx.beginPath();
  ring.forEach(([lo, la], i) => {
    const x = bProj.x(lo), y = bProj.y(la);
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  });
  if (close) ctx.closePath();
};

/* --------------------------------------------- ציור ---- */
function bDraw() {
  if (!bCtx) return;
  const st = bSave();
  const css = getComputedStyle(document.documentElement);
  const col = n => css.getPropertyValue(n).trim() || '#888';
  bCtx.clearRect(0, 0, bW, bH);

  /* רקע ים */
  bCtx.fillStyle = col('--sea-2');
  bCtx.fillRect(0, 0, bW, bH);

  const stage = BUILD_STAGES[Math.min(st.stage, BUILD_STAGES.length - 1)].id;
  const haveOutline = bStageDone(0);

  /* המתאר – מרגע שהרווחת אותו הוא נשאר על המסך. עד אז הקנבס ריק
     לגמרי: גם המדינות השכנות היו מסגירות את הצורה. */
  if (haveOutline) {
    /* השכנות בגוון עמום, אחרת כל מה שמחוץ לגבול נראה כמו ים –
       מטעה במיוחד כשהמסך מתקרב לים המלח או לבקע. */
    bCtx.fillStyle = col('--land-2');
    bCtx.globalAlpha = .6;
    (GEO.neighbours || []).forEach(r => { bPath(bCtx, r, true); bCtx.fill(); });
    bCtx.globalAlpha = 1;

    bCtx.fillStyle = col('--land-1');
    bPath(bCtx, GEO.israel, true); bCtx.fill();
    [GEO.westbank, GEO.golan].forEach(r => { bPath(bCtx, r, true); bCtx.fill(); });

    /* גופי מים כנקודות ייחוס – בלי הכנרת וים המלח אין איך להתמצא */
    bCtx.fillStyle = col('--sea-2');
    [GEO.kinneret, GEO.deadSeaN, GEO.deadSeaS].forEach(r => {
      if (r) { bPath(bCtx, r, true); bCtx.fill(); }
    });
    bCtx.strokeStyle = col('--sea-2'); bCtx.lineWidth = 1.4;
    (GEO.rivers || []).forEach(r => { bPath(bCtx, r, false); bCtx.stroke(); });
  }

  /* מסלע – כל אזור שכבר צבעת */
  if (bStageDone(1)) {
    GEO_AREAS.forEach(a => {
      if (!st.rocks[a.id]) return;
      bCtx.fillStyle = ROCKS[a.rock].color;
      bCtx.globalAlpha = .85;
      bPath(bCtx, a.poly, true); bCtx.fill();
      bCtx.globalAlpha = 1;
    });
  }

  /* קו המתאר עצמו */
  if (haveOutline) {
    bCtx.strokeStyle = col('--teal');
    bCtx.lineWidth = 1.6;
    bPath(bCtx, GEO.israel, true); bCtx.stroke();
  }

  /* תפרים שכבר שרטטת */
  if (bStageDone(0)) {
    B_SEAMS.forEach(id => {
      if (!st.seams[id]) return;
      const b = BOUND_BY_ID[id], p = b && bSeamPath(b); if (!p) return;
      bCtx.strokeStyle = '#c084fc'; bCtx.lineWidth = 2.6;
      bCtx.setLineDash([7, 5]);
      bPath(bCtx, p, false); bCtx.stroke();
      bCtx.setLineDash([]);
    });
  }

  /* אתרים שכבר מיקמת */
  if (bStageDone(2)) {
    SITES.forEach(s => {
      if (!st.sites[s.id]) return;
      bDot(bProj.x(s.lon), bProj.y(s.lat), '#2ee6c5', 3.4);
    });
  }

  /* המטרה הנוכחית של השלב */
  if (bTask) bDrawTask(stage, col);

  /* השרטוט של המשתמש */
  if (bStroke && bStroke.length > 1) {
    bCtx.strokeStyle = '#ffce4d'; bCtx.lineWidth = 3;
    bCtx.lineJoin = bCtx.lineCap = 'round';
    bCtx.beginPath();
    bStroke.forEach((p, i) => i ? bCtx.lineTo(p[0], p[1]) : bCtx.moveTo(p[0], p[1]));
    bCtx.stroke();
  }

  /* משוב אחרי בדיקה: הקו/הצורה הנכונה מוצגת מעל */
  if (bFlash) {
    bCtx.strokeStyle = bFlash.ok ? '#46e08a' : '#ff6b81';
    bCtx.lineWidth = 3; bCtx.setLineDash([]);
    (bFlash.rings || [bFlash.ring]).forEach(r => { bPath(bCtx, r, !!bFlash.close); bCtx.stroke(); });
  }

  /* שבב שנגרר */
  if (bDrag && bDrag.moved) bChipGhost();
}

function bDot(x, y, color, r) {
  bCtx.beginPath(); bCtx.arc(x, y, r, 0, 7);
  bCtx.fillStyle = color; bCtx.fill();
  bCtx.lineWidth = 1.2; bCtx.strokeStyle = 'rgba(0,0,0,.45)'; bCtx.stroke();
}

function bDrawTask(stage, col) {
  if (stage === 'rocks' && bTask.area) {
    /* האזור המבוקש מודגש בקו, בלי צבע – הצבע הוא התשובה */
    bCtx.strokeStyle = '#ffce4d'; bCtx.lineWidth = 2.4;
    bCtx.setLineDash([6, 4]);
    bPath(bCtx, bTask.area.poly, true); bCtx.stroke();
    bCtx.setLineDash([]);
  }
}

function bChipGhost() {
  bCtx.save();
  bCtx.globalAlpha = .9;
  bCtx.fillStyle = bDrag.color || '#2ee6c5';
  bCtx.beginPath(); bCtx.arc(bDrag.x, bDrag.y, 9, 0, 7); bCtx.fill();
  bCtx.strokeStyle = '#fff'; bCtx.lineWidth = 2; bCtx.stroke();
  bCtx.restore();
}

/* ----------------------------------------- גאומטריה ---- */
function bSegDist(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const L = dx * dx + dy * dy;
  let t = L ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}
function bPolyDist(p, pts) {
  let best = 1e9;
  for (let i = 1; i < pts.length; i++) best = Math.min(best, bSegDist(p, pts[i - 1], pts[i]));
  return best;
}
function bInPoly(x, y, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = bProj.x(ring[i][0]), yi = bProj.y(ring[i][1]);
    const xj = bProj.x(ring[j][0]), yj = bProj.y(ring[j][1]);
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/* חפיפת שטחים בין הצורה שצוירה לצורה האמיתית. שתיהן מרוסטרות
   לרשת מוקטנת, וסופרים פיקסלים – מדד סלחני לצורה, לא לדיוק הקו.
   היעד מורכב מכמה טבעות, והאיחוד ביניהן מתקבל מעצם המילוי לאותו קנבס. */
function bIoU(userPts, rings) {
  const S = 4, cw = Math.max(2, Math.ceil(bW / S)), ch = Math.max(2, Math.ceil(bH / S));
  const mask = draw => {
    const c = document.createElement('canvas'); c.width = cw; c.height = ch;
    const x = c.getContext('2d');
    x.fillStyle = '#fff'; draw(x);
    return x.getImageData(0, 0, cw, ch).data;
  };
  const a = mask(x => {
    x.beginPath();
    userPts.forEach((p, i) => i ? x.lineTo(p[0] / S, p[1] / S) : x.moveTo(p[0] / S, p[1] / S));
    x.closePath(); x.fill();
  });
  const b = mask(x => rings.forEach(ring => {
    x.beginPath();
    ring.forEach(([lo, la], i) => {
      const px = bProj.x(lo) / S, py = bProj.y(la) / S;
      i ? x.lineTo(px, py) : x.moveTo(px, py);
    });
    x.closePath(); x.fill();
  }));
  let inter = 0, uni = 0;
  for (let i = 3; i < a.length; i += 4) {
    const A = a[i] > 128, B = b[i] > 128;
    if (A && B) inter++;
    if (A || B) uni++;
  }
  return uni ? inter / uni : 0;
}

/* מצפיפים את הקו: חלק מהתפרים מוגדרים בשלוש נקודות בלבד, וכיוון
   "מהיעד אל השרטוט" חסר משמעות בלי דגימות לאורכו. */
function bDensify(pts, step) {
  const out = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / step));
    for (let k = 1; k <= n; k++) out.push([a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n]);
  }
  return out;
}

/* מרחק דו-כיווני בין השרטוט לקו האמיתי, מנורמל לאלכסון הקנבס.
   בודקים גם "כיסוי" – שרבוט קצר במקום הנכון לא אמור לעבור. */
function bLineErr(userPts, ring) {
  const tgt = bDensify(ring.map(([lo, la]) => [bProj.x(lo), bProj.y(la)]), 6);
  const mean = arr => arr.reduce((s, v) => s + v, 0) / arr.length;
  const a = mean(userPts.map(p => bPolyDist(p, tgt)));
  const b = mean(tgt.map(p => bPolyDist(p, userPts)));
  return Math.max(a, b) / Math.hypot(bW, bH);
}

/* ------------------------------------------- משימות ---- */
function bNextTask() {
  const st = bSave();
  bStroke = null; bFlash = null; bTask = null;
  const stage = BUILD_STAGES[st.stage];
  if (!stage) return;

  if (stage.id === 'outline') {
    bTask = { kind: 'draw', rings: bOutlineRings(), close: true,
      text: 'שרטטו את קו המתאר של ישראל', sub: 'מהחרמון בצפון ועד אילת בדרום, וחזרה לאורך חוף הים' };
  } else if (stage.id === 'seams') {
    const left = bSeamList().filter(id => !st.seams[id]);
    if (!left.length) return bStageComplete();
    const b = BOUND_BY_ID[left[0]];
    bTask = { kind: 'draw', id: b.id, ring: bSeamPath(b), close: false, zoom: [bSeamPath(b)],
      text: 'שרטטו את הקו שמפריד ' + bBetween(b), sub: b.name };
  } else if (stage.id === 'rocks') {
    const left = GEO_AREAS.filter(a => !st.rocks[a.id]);
    if (!left.length) return bStageComplete();
    bTask = { kind: 'chip', area: left[0], zoom: [left[0].poly],
      text: 'איזה סלע חשוף כאן?', sub: left[0].name + ' · נותרו ' + left.length };
  } else if (stage.id === 'sites') {
    const pool = bSitePool();
    const left = pool.filter(s => !st.sites[s.id]);
    if (!left.length) {
      if (st.tier < BUILD_TIERS.length - 1) { st.tier++; persist(); return bNextTask(); }
      return bStageComplete();
    }
    bTask = { kind: 'chip', site: left[0],
      text: 'איפה נמצא ' + left[0].n + '?', sub: 'נותרו ' + left.length + ' אתרים בשכבה זו' };
  }
  bApplyProj();
  bPaintUI();
  bDraw();
}

const bBetween = b => 'בין ' + b.a + ' ' + (b.b[0] === 'ה' ? 'ל' + b.b.slice(1) : 'ל' + b.b);
function bSitePool() {
  const st = bSave();
  return SITES.filter(s => s.lvl === BUILD_TIERS[Math.min(st.tier, BUILD_TIERS.length - 1)]);
}

function bStageComplete() {
  const st = bSave();
  st.stage++;
  persist();
  SFX.win(); confetti();
  const nxt = BUILD_STAGES[st.stage];
  bBanner('✓ השלב הושלם!', nxt ? 'נפתח: ' + nxt.icon + ' ' + nxt.name : 'סיימתם את כל הבנייה 🎉');
  setTimeout(() => { bNextTask(); bPaintUI(); }, 1500);
}

/* ------------------------------------------- בדיקה ---- */
function bStrokeLen() {
  let d = 0;
  for (let i = 1; i < bStroke.length; i++)
    d += Math.hypot(bStroke[i][0] - bStroke[i - 1][0], bStroke[i][1] - bStroke[i - 1][1]);
  return d;
}

function bCheck() {
  if (!bTask || bTask.kind !== 'draw') return;
  /* לא סופרים נקודות אלא אורך: תפר קצר מצויר בשבע נקודות ועדיין
     תקף, ואילו נגיעה במקום אחד מייצרת עשרות נקודות בלי שום קו. */
  if (!bStroke || bStroke.length < 3 || bStrokeLen() < 24) {
    SFX.bad(); toast('קודם שרטטו קו על המפה'); return;
  }
  const st = bSave();

  if (BUILD_STAGES[st.stage].id === 'outline') {
    const iou = bIoU(bStroke, bOutlineRings());
    const pct = Math.round(iou * 100);
    st.outline = Math.max(st.outline || 0, pct);
    const ok = iou >= B_PASS.outline;
    bFlash = { rings: bOutlineRings(), close: true, ok };
    bDraw();
    if (ok) { persist(); SFX.good(); bBanner('✓ ' + pct + '% התאמה', 'המתאר נכון – השלב הבא נפתח'); setTimeout(bStageComplete, 900); }
    else { persist(); SFX.bad(); bBanner('✗ ' + pct + '% התאמה', 'צריך ' + Math.round(B_PASS.outline * 100) + '% – הקו הירוק הוא המתאר הנכון'); }
    bPaintUI();
    return;
  }

  /* תפר */
  const err = bLineErr(bStroke, bTask.ring);
  const ok = err <= B_PASS.seam;
  bFlash = { ring: bTask.ring, close: false, ok };
  bDraw();
  if (ok) {
    st.seams[bTask.id] = 1; persist(); SFX.good();
    bBanner('✓ נכון', bTask.sub);
    setTimeout(bNextTask, 1100);
  } else {
    SFX.bad();
    bBanner('✗ לא מדויק', 'הקו הנכון מסומן – נסו שוב');
  }
  bPaintUI();
}

/* הצבת שבב (סלע או אתר) בנקודה על הקנבס. מקבלים את השבב במפורש
   ולא דרך bDrag, כי הגרירה כבר הסתיימה כשמגיעים לכאן. */
function bDropChip(chip, x, y) {
  const st = bSave();
  if (!bTask || bTask.kind !== 'chip') return;

  if (bTask.area) {
    const rock = chip.rock;
    if (!bInPoly(x, y, bTask.area.poly)) { SFX.bad(); toast('גררו אל תוך האזור המסומן'); return; }
    if (rock === bTask.area.rock) {
      st.rocks[bTask.area.id] = 1; persist(); SFX.good();
      bBanner('✓ ' + ROCKS[rock].name, bTask.area.name);
      setTimeout(bNextTask, 800);
    } else {
      SFX.bad();
      bBanner('✗ לא ' + ROCKS[rock].name, 'נסו סלע אחר');
      bPaintUI();
    }
    return;
  }

  const s = bTask.site;
  const km = GameMap.haversine(bProj.lat(y), bProj.lon(x), s.lat, s.lon);
  if (km <= B_PASS.siteKm) {
    st.sites[s.id] = 1; persist(); SFX.good();
    bBanner('✓ ' + s.n, Math.round(km) + ' ק״מ מהמקום המדויק');
    setTimeout(bNextTask, 800);
  } else {
    SFX.bad();
    bFlash = null;
    bDraw();
    bDot(bProj.x(s.lon), bProj.y(s.lat), '#ff6b81', 5);
    bBanner('✗ ' + Math.round(km) + ' ק״מ מהיעד', 'צריך עד ' + B_PASS.siteKm + ' ק״מ – הנקודה האדומה היא המקום');
    bPaintUI();
  }
}

/* --------------------------------------------- מסך ---- */
function bBanner(title, sub) {
  const el = $('#build-banner');
  el.innerHTML = '<b>' + escapeHtml(title) + '</b><span>' + escapeHtml(sub || '') + '</span>';
  el.classList.add('on');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('on'), 2600);
}

function bPaintUI() {
  const st = bSave();
  const stage = BUILD_STAGES[Math.min(st.stage, BUILD_STAGES.length - 1)];
  const done = st.stage >= BUILD_STAGES.length;

  $('#build-steps').innerHTML = BUILD_STAGES.map((s, i) => {
    const cls = st.stage > i ? 'done' : (st.stage === i ? 'now' : '');
    return '<span class="bstep ' + cls + '">' + (st.stage > i ? '✓' : s.icon) + '</span>';
  }).join('');

  $('#build-title').textContent = done ? '🎉 הארץ בנויה' : stage.icon + ' ' + stage.name;
  $('#build-text').textContent = done ? 'השלמתם את כל ארבעת השלבים.' : (bTask ? bTask.text : stage.tip);
  $('#build-sub').textContent = done ? '' : (bTask ? bTask.sub || '' : '');

  const drawing = bTask && bTask.kind === 'draw';
  $('#build-draw-tools').hidden = !drawing;
  $('#build-bank').hidden = !(bTask && bTask.kind === 'chip');
  if (bTask && bTask.kind === 'chip') bPaintBank();
  $('#build-progress').textContent = bProgressText();
}

function bProgressText() {
  const st = bSave();
  const stage = BUILD_STAGES[Math.min(st.stage, BUILD_STAGES.length - 1)];
  if (st.stage >= BUILD_STAGES.length) return 'הושלם';
  if (stage.id === 'outline') return st.outline ? 'שיא: ' + st.outline + '%' : '';
  if (stage.id === 'seams') return Object.keys(st.seams).length + '/' + bSeamList().length;
  if (stage.id === 'rocks') return Object.keys(st.rocks).length + '/' + GEO_AREAS.length;
  const pool = bSitePool();
  return pool.filter(s => st.sites[s.id]).length + '/' + pool.length;
}

/* בנק השבבים: סוגי סלע, או שם האתר הנוכחי */
function bPaintBank() {
  const bank = $('#build-bank');
  bank.innerHTML = '';
  if (bTask.area) {
    Object.keys(ROCKS).forEach(k => {
      const b = document.createElement('button');
      b.className = 'bchip';
      b.dataset.rock = k;
      b.innerHTML = '<i style="background:' + ROCKS[k].color + '"></i>' + ROCKS[k].name;
      bank.appendChild(b);
    });
  } else {
    const b = document.createElement('button');
    b.className = 'bchip site';
    b.dataset.site = bTask.site.id;
    b.innerHTML = '<i style="background:#2ee6c5"></i>' + bTask.site.n;
    bank.appendChild(b);
  }
}

/* ------------------------------------------ קלט ---- */
function bInit() {
  bCv = $('#build-canvas');
  if (!bCv) return;

  /* שרטוט על הקנבס */
  bCv.addEventListener('pointerdown', e => {
    if (!bTask || bTask.kind !== 'draw') return;
    bCv.setPointerCapture(e.pointerId);
    bFlash = null;
    bStroke = [[e.offsetX, e.offsetY]];
    bDraw();
  });
  bCv.addEventListener('pointermove', e => {
    if (!bStroke || !bTask || bTask.kind !== 'draw') return;
    e.preventDefault();
    const last = bStroke[bStroke.length - 1];
    if (Math.hypot(e.offsetX - last[0], e.offsetY - last[1]) < 2.5) return;
    bStroke.push([e.offsetX, e.offsetY]);
    bDraw();
  });
  const endStroke = () => { if (bStroke) { bPaintUI(); bDraw(); } };
  bCv.addEventListener('pointerup', endStroke);
  bCv.addEventListener('pointercancel', endStroke);

  /* גרירת שבב מהבנק אל הקנבס */
  const screen = $('#screen-build');
  screen.addEventListener('pointerdown', e => {
    const chip = e.target.closest('.bchip');
    if (!chip || !bTask || bTask.kind !== 'chip') return;
    const r = bCv.getBoundingClientRect();
    bDrag = {
      chip, moved: false, sx: e.clientX, sy: e.clientY,
      rock: chip.dataset.rock, site: chip.dataset.site,
      color: chip.dataset.rock ? ROCKS[chip.dataset.rock].color : '#2ee6c5',
      x: e.clientX - r.left, y: e.clientY - r.top
    };
    screen.setPointerCapture(e.pointerId);
  });
  screen.addEventListener('pointermove', e => {
    if (!bDrag) return;
    if (!bDrag.moved && Math.hypot(e.clientX - bDrag.sx, e.clientY - bDrag.sy) < 7) return;
    bDrag.moved = true;
    e.preventDefault();
    const r = bCv.getBoundingClientRect();
    bDrag.x = e.clientX - r.left; bDrag.y = e.clientY - r.top;
    bDrag.chip.classList.add('dragging');
    bDraw();
  });
  const endDrag = e => {
    if (!bDrag) return;
    const d = bDrag; bDrag = null;
    d.chip.classList.remove('dragging');
    if (!d.moved) { bDraw(); return; }
    const r = bCv.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    bDraw();
    if (x >= 0 && y >= 0 && x <= bW && y <= bH) bDropChip(d, x, y);
  };
  screen.addEventListener('pointerup', endDrag);
  screen.addEventListener('pointercancel', endDrag);

  $('#build-clear').onclick = () => { SFX.tap(); bStroke = null; bFlash = null; bDraw(); };
  $('#build-check').onclick = () => { SFX.tap(); bCheck(); };
  $('#build-reset').onclick = () => {
    if (!confirm('לאפס את כל התקדמות הבנייה ולהתחיל מחדש?')) return;
    SAVE.build = { stage: 0, outline: 0, seams: {}, rocks: {}, sites: {}, tier: 0 };
    persist(); bNextTask(); bPaintUI(); bDraw();
  };
  window.addEventListener('resize', () => { if (currentScreen === 'build') bFit(); });
}

function openBuild() {
  bSave();
  show('build');
  requestAnimationFrame(() => {
    bFit();
    bNextTask();
    bPaintUI();
    bDraw();
  });
}
