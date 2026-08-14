/* =============================================================
   GameMap – מנוע המפה האינטראקטיבית (SVG טהור, ללא ספריות)
   ============================================================= */

const SVGNS = 'http://www.w3.org/2000/svg';

function el(tag, attrs = {}, parent = null) {
  const n = document.createElementNS(SVGNS, tag);
  for (const k in attrs) {
    if (attrs[k] === null || attrs[k] === undefined) continue;
    n.setAttribute(k, attrs[k]);
  }
  if (parent) parent.appendChild(n);
  return n;
}

/* ------------------------------------------------ גאומטריה ---- */
const LAT0 = 31.5;
const KX = Math.cos(LAT0 * Math.PI / 180); // תיקון קנה מידה לאורך

function pointInPoly(lon, lat, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1];
    const xj = poly[j][0], yj = poly[j][1];
    if ((yi > lat) !== (yj > lat) &&
        lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/* הרחבת מצולע כלפי חוץ – סוגרת תפרים בין אזורים סמוכים.
   ההרחבה נעשית במרחב המוקרן כדי שהמרחק יהיה אחיד. */
function offsetRing(ring, d) {
  const pts = ring.map(([lo, la]) => [lo * KX, la]);
  if (pts.length > 2) {
    const a = pts[0], b = pts[pts.length - 1];
    if (Math.abs(a[0] - b[0]) < 1e-9 && Math.abs(a[1] - b[1]) < 1e-9) pts.pop();
  }
  const n = pts.length;
  let area = 0;
  for (let i = 0; i < n; i++) {
    const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % n];
    area += x1 * y2 - x2 * y1;
  }
  const sgn = area > 0 ? 1 : -1;
  const nrm = (p, q) => {
    const dx = q[0] - p[0], dy = q[1] - p[1];
    const L = Math.hypot(dx, dy) || 1;
    return [dy / L * sgn, -dx / L * sgn];
  };
  const out = [];
  for (let i = 0; i < n; i++) {
    const p = pts[i], pm = pts[(i - 1 + n) % n], pp = pts[(i + 1) % n];
    const n1 = nrm(pm, p), n2 = nrm(p, pp);
    let vx = n1[0] + n2[0], vy = n1[1] + n2[1];
    const L = Math.hypot(vx, vy);
    if (L < 1e-6) { vx = n2[0]; vy = n2[1]; }
    else { vx /= L; vy /= L; }
    const cosHalf = Math.max(0.35, Math.hypot(n1[0] + n2[0], n1[1] + n2[1]) / 2);
    const k = d / cosHalf;
    out.push([(p[0] + vx * k) / KX, p[1] + vy * k]);
  }
  out.push(out[0].slice());
  return out;
}

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371, rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad, dLon = (lon2 - lon1) * rad;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/* --------------------------------------------------- המנוע ---- */
const GameMap = (() => {
  let svg, root, layers = {}, box, world, tapHandler = null;
  let pinSeq = 0;
  let regionCenters = {};

  /* --- הגבולות של העולם (bbox של כל השכבות) --- */
  function computeWorld() {
    let minLon = 999, maxLon = -999, minLat = 999, maxLat = -999;
    const scan = ring => ring.forEach(([lo, la]) => {
      if (lo < minLon) minLon = lo; if (lo > maxLon) maxLon = lo;
      if (la < minLat) minLat = la; if (la > maxLat) maxLat = la;
    });
    [GEO.israel, GEO.westbank, GEO.gaza, GEO.golan].forEach(scan);
    const padX = 0.10, padY = 0.10;
    return {
      minLon: minLon - padX, maxLon: maxLon + padX,
      minLat: minLat - padY, maxLat: maxLat + padY
    };
  }

  const SCALE = 1000; // יחידות SVG לכל מעלת רוחב

  function projX(lon) { return (lon - world.minLon) * KX * SCALE; }
  function projY(lat) { return (world.maxLat - lat) * SCALE; }
  function invLon(x) { return x / (KX * SCALE) + world.minLon; }
  function invLat(y) { return world.maxLat - y / SCALE; }

  function pathOf(ring, close = true) {
    let d = '';
    for (let i = 0; i < ring.length; i++) {
      d += (i ? 'L' : 'M') + projX(ring[i][0]).toFixed(1) + ' ' + projY(ring[i][1]).toFixed(1);
    }
    return d + (close ? 'Z' : '');
  }

  /* ------------------------------------------------- init ---- */
  function init(container) {
    world = computeWorld();
    const W = (world.maxLon - world.minLon) * KX * SCALE;
    const H = (world.maxLat - world.minLat) * SCALE;
    box = { x: 0, y: 0, w: W, h: H };

    container.innerHTML = '';
    svg = el('svg', {
      viewBox: `0 0 ${W.toFixed(0)} ${H.toFixed(0)}`,
      preserveAspectRatio: 'xMidYMid meet',
      class: 'gamemap'
    }, container);

    const defs = el('defs', {}, svg);

    /* גרדיאנטים */
    const seaG = el('linearGradient', { id: 'g-sea', x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
    el('stop', { offset: '0%', class: 'sea-1' }, seaG);
    el('stop', { offset: '100%', class: 'sea-2' }, seaG);

    const landG = el('linearGradient', { id: 'g-land', x1: 0, y1: 0, x2: 0.2, y2: 1 }, defs);
    el('stop', { offset: '0%', class: 'land-1' }, landG);
    el('stop', { offset: '100%', class: 'land-2' }, landG);

    const waterG = el('linearGradient', { id: 'g-water', x1: 0, y1: 0, x2: 0.4, y2: 1 }, defs);
    el('stop', { offset: '0%', class: 'water-1' }, waterG);
    el('stop', { offset: '100%', class: 'water-2' }, waterG);

    /* זוהר לסיכות */
    const glow = el('filter', { id: 'f-glow', x: '-80%', y: '-80%', width: '260%', height: '260%' }, defs);
    el('feGaussianBlur', { stdDeviation: 6, result: 'b' }, glow);
    const gm = el('feMerge', {}, glow);
    el('feMergeNode', { in: 'b' }, gm);
    el('feMergeNode', { in: 'SourceGraphic' }, gm);

    const soft = el('filter', { id: 'f-soft', x: '-30%', y: '-30%', width: '160%', height: '160%' }, defs);
    el('feDropShadow', { dx: 0, dy: 6, stdDeviation: 8, 'flood-color': '#000', 'flood-opacity': 0.45 }, soft);

    /* clipPath של היבשה – מגביל את צביעת האזורים לתחומי הארץ */
    const clip = el('clipPath', { id: 'clip-land' }, defs);
    [GEO.israel, GEO.westbank, GEO.gaza, GEO.golan].forEach(r =>
      el('path', { d: pathOf(r) }, clip));

    root = el('g', {}, svg);

    /* ים ורקע */
    el('rect', { x: -50, y: -50, width: W + 100, height: H + 100, fill: 'url(#g-sea)' }, root);

    layers.neighbours = el('g', { class: 'lyr-neighbours' }, root);
    GEO.neighbours.forEach(r => el('path', {
      d: pathOf(r), 'stroke-width': 1, 'vector-effect': 'non-scaling-stroke'
    }, layers.neighbours));

    /* יבשה */
    layers.land = el('g', { class: 'lyr-land' }, root);
    [GEO.israel, GEO.westbank, GEO.gaza, GEO.golan].forEach(r =>
      el('path', { d: pathOf(r), fill: 'url(#g-land)' }, layers.land));

    /* אזורים – מצוירים בסדר הפוך כך שהראשון ברשימה נמצא למעלה,
       בהתאמה לסדר בדיקת הלחיצה ב-regionAt() */
    layers.regions = el('g', { class: 'lyr-regions', 'clip-path': 'url(#clip-land)' }, root);
    REGIONS.forEach(rg => { rg._poly = offsetRing(rg.poly, 0.05); });
    REGIONS.slice().reverse().forEach(rg => {
      const p = el('path', {
        d: pathOf(rg._poly), fill: rg.color, stroke: rg.color,
        'stroke-width': 1.4, 'vector-effect': 'non-scaling-stroke',
        class: 'region', 'data-region': rg.id
      }, layers.regions);
      p.style.opacity = 0;
    });

    /* גוף מים */
    layers.water = el('g', { class: 'lyr-water' }, root);
    [GEO.kinneret, GEO.deadSeaN, GEO.deadSeaS].forEach(r =>
      el('path', {
        d: pathOf(r), fill: 'url(#g-water)', class: 'water-body',
        'stroke-width': 1, 'vector-effect': 'non-scaling-stroke', 'stroke-opacity': 0.6
      }, layers.water));
    GEO.rivers.forEach(r => el('path', {
      d: pathOf(r, false), fill: 'none', class: 'river',
      'stroke-width': 2.4, 'vector-effect': 'non-scaling-stroke',
      'stroke-linecap': 'round', 'stroke-opacity': 0.8
    }, layers.water));

    /* גבולות */
    layers.borders = el('g', { class: 'lyr-borders' }, root);
    el('path', {
      d: pathOf(GEO.israel), fill: 'none', class: 'border-main',
      'stroke-width': 1.9, 'vector-effect': 'non-scaling-stroke', 'stroke-opacity': 0.9
    }, layers.borders);
    [GEO.westbank, GEO.gaza, GEO.golan].forEach(r =>
      el('path', {
        d: pathOf(r), fill: 'none', class: 'border-dash', 'stroke-width': 1.3,
        'vector-effect': 'non-scaling-stroke',
        'stroke-dasharray': '5 4', 'stroke-opacity': 0.55
      }, layers.borders));

    /* שכבה גיאולוגית – מצוירת רק כשמבקשים אותה */
    layers.geo = el('g', { class: 'lyr-geo', 'clip-path': 'url(#clip-land)' }, root);
    if (typeof GEO_AREAS !== 'undefined') {
      /* שתי שכבות משנה, בדיוק לפי הכללים של areaAt():
         מילוי – המצולעים המורחבים, סוגרים את התפרים בין היחידות;
         מדויק – המצולעים עצמם, מצוירים מעליו.
         כך הצבע שרואים בכל נקודה זהה לתשובה שמחזירה בדיקת הלחיצה. */
      GEO_AREAS.forEach(a => { a._poly = offsetRing(a.poly, 0.05); });
      const gFill = el('g', { class: 'geo-fill' }, layers.geo);
      const gEdge = el('g', { class: 'geo-edge' }, layers.geo);
      GEO_AREAS.slice().reverse().forEach(a => {
        el('path', {
          d: pathOf(a._poly), fill: ROCKS[a.rock].color,
          class: 'geo-seam', 'data-seam': a.id
        }, gFill);
        const p = el('path', {
          d: pathOf(a.poly), fill: ROCKS[a.rock].color,
          stroke: 'var(--geo-line)', 'stroke-width': 1,
          'vector-effect': 'non-scaling-stroke', 'stroke-linejoin': 'round',
          class: 'geo-area', 'data-area': a.id
        }, gEdge);
        p.style.opacity = 0;
      });
    }

    /* דרכים עתיקות ונחלים – מצוירים מראש ומוסתרים */
    layers.paths = el('g', { class: 'lyr-paths' }, root);
    pathItems().forEach(({ it, pk }) => {
      const p = el('path', {
        d: pathOf(it.path, false), fill: 'none', stroke: it.color,
        'stroke-width': pk === 'route' ? 4.4 : pk === 'fold' ? 5 : pk === 'bound' ? 4.6 : 3.4,
        'stroke-linecap': 'round', 'stroke-linejoin': 'round',
        'vector-effect': 'non-scaling-stroke',
        class: 'geo-path pk-' + pk, 'data-path': it.id, 'data-pk': pk
      }, layers.paths);
      p.style.opacity = 0;
    });

    layers.labels = el('g', { class: 'lyr-labels' }, root);
    layers.pins = el('g', { class: 'lyr-pins' }, root);
    layers.fx = el('g', { class: 'lyr-fx' }, root);

    /* מרכזי אזורים: מיקום תווית ידני, ואם אין – ממוצע האתרים */
    REGIONS.forEach(rg => {
      if (rg.labelAt) { regionCenters[rg.id] = { lat: rg.labelAt[1], lon: rg.labelAt[0] }; return; }
      const ss = SITES.filter(s => s.r === rg.id);
      regionCenters[rg.id] = {
        lat: ss.reduce((a, s) => a + s.lat, 0) / ss.length,
        lon: ss.reduce((a, s) => a + s.lon, 0) / ss.length
      };
    });

    initGestures();
    return api;
  }

  /* ---------------------------------------------- viewBox ---- */
  let animId = null;
  function setBox(nb, animate = true, dur = 650) {
    if (animId) cancelAnimationFrame(animId);
    const from = { ...box };
    if (!animate) { box = nb; apply(); return; }
    const t0 = performance.now();
    const step = t => {
      const k = Math.min(1, (t - t0) / dur);
      const e = 1 - Math.pow(1 - k, 3);
      box = {
        x: from.x + (nb.x - from.x) * e,
        y: from.y + (nb.y - from.y) * e,
        w: from.w + (nb.w - from.w) * e,
        h: from.h + (nb.h - from.h) * e
      };
      apply();
      if (k < 1) animId = requestAnimationFrame(step);
    };
    animId = requestAnimationFrame(step);
  }
  /* ============================ מחוות: הזזה, פינץ׳, גלגלת ====== */
  const MAX_ZOOM = 14;          // פי כמה אפשר להתקרב ביחס לתצוגה המלאה
  let gest = null, allowPan = true;

  function clampBox(b) {
    const full = fullBox();
    const minW = full.w / MAX_ZOOM;
    let w = Math.min(full.w, Math.max(minW, b.w));
    let h = w * (full.h / full.w);
    /* לא יוצאים מגבולות העולם */
    let x = Math.min(Math.max(b.x, -w * 0.15), full.w - w * 0.85);
    let y = Math.min(Math.max(b.y, -h * 0.15), full.h - h * 0.85);
    return { x, y, w, h };
  }

  /* מתקרב/מתרחק סביב נקודת מסך נתונה */
  function zoomAt(factor, clientX, clientY, animate = false) {
    const p = clientToLatLon(clientX, clientY);
    const nw = box.w / factor;
    const full = fullBox();
    const w = Math.min(full.w, Math.max(full.w / MAX_ZOOM, nw));
    const h = w * (full.h / full.w);
    const rx = (p.x - box.x) / box.w;
    const ry = (p.y - box.y) / box.h;
    setBox(clampBox({ x: p.x - rx * w, y: p.y - ry * h, w, h }), animate, 260);
  }

  function initGestures() {
    const pts = new Map();
    svg.style.touchAction = 'none';

    svg.addEventListener('pointerdown', e => {
      svg.setPointerCapture(e.pointerId);
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 1) {
        gest = { mode: 'maybe-tap', sx: e.clientX, sy: e.clientY, t: performance.now(), box: { ...box } };
      } else if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        gest = {
          mode: 'pinch', box: { ...box },
          d0: Math.hypot(a.x - b.x, a.y - b.y),
          cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2
        };
        gest.anchor = clientToLatLon(gest.cx, gest.cy);
      }
    });

    svg.addEventListener('pointermove', e => {
      if (!pts.has(e.pointerId)) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (!gest) return;

      if (gest.mode === 'pinch' && pts.size >= 2) {
        const [a, b] = [...pts.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (!d || !gest.d0) return;
        const full = fullBox();
        let w = Math.min(full.w, Math.max(full.w / MAX_ZOOM, gest.box.w * (gest.d0 / d)));
        const h = w * (full.h / full.w);
        const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
        /* הנקודה שבין האצבעות נשארת מתחתן */
        const rect = svg.getBoundingClientRect();
        const sx = (cx - rect.left) / rect.width, sy = (cy - rect.top) / rect.height;
        setBox(clampBox({ x: gest.anchor.x - sx * w, y: gest.anchor.y - sy * h, w, h }), false);
        return;
      }

      const dx = e.clientX - gest.sx, dy = e.clientY - gest.sy;
      if (gest.mode === 'maybe-tap' && Math.hypot(dx, dy) > 9) gest.mode = 'pan';
      if (gest.mode === 'pan' && allowPan) {
        const rect = svg.getBoundingClientRect();
        setBox(clampBox({
          x: gest.box.x - dx * (gest.box.w / rect.width),
          y: gest.box.y - dy * (gest.box.h / rect.height),
          w: gest.box.w, h: gest.box.h
        }), false);
      }
    });

    const finish = e => {
      pts.delete(e.pointerId);
      if (gest && gest.mode === 'maybe-tap' && pts.size === 0) {
        const dt = performance.now() - gest.t;
        if (dt < 700 && tapHandler) tapHandler(clientToLatLon(e.clientX, e.clientY), e);
      }
      if (pts.size === 0) gest = null;
      else if (pts.size === 1 && gest && gest.mode === 'pinch') {
        const [a] = [...pts.values()];
        gest = { mode: 'pan', sx: a.x, sy: a.y, t: performance.now(), box: { ...box } };
      }
    };
    svg.addEventListener('pointerup', finish);
    svg.addEventListener('pointercancel', finish);

    svg.addEventListener('wheel', e => {
      e.preventDefault();
      zoomAt(e.deltaY < 0 ? 1.22 : 1 / 1.22, e.clientX, e.clientY);
    }, { passive: false });

    svg.addEventListener('dblclick', e => {
      e.preventDefault();
      zoomAt(2, e.clientX, e.clientY, true);
    });
  }

  function zoomBy(f) {
    const r = svg.getBoundingClientRect();
    zoomAt(f, r.left + r.width / 2, r.top + r.height / 2, true);
  }
  function zoomLevel() { return fullBox().w / box.w; }

  let lastK = -1;
  function apply() {
    svg.setAttribute('viewBox', `${box.x.toFixed(1)} ${box.y.toFixed(1)} ${box.w.toFixed(1)} ${box.h.toFixed(1)}`);
    const k = box.w / fullBox().w;
    if (Math.abs(k - lastK) > 0.004) { lastK = k; rescaleMarkers(markerScale()); }
  }

  /* שמירה על גודל אחיד של סיכות ותוויות בכל רמת זום */
  function rescaleMarkers(k) {
    [layers.pins, layers.labels].forEach(lyr => {
      if (!lyr) return;
      [...lyr.children].forEach(g => {
        const la = +g.dataset.lat, lo = +g.dataset.lon;
        if (isNaN(la)) return;
        g.setAttribute('transform',
          `translate(${projX(lo).toFixed(1)} ${projY(la).toFixed(1)}) scale(${k.toFixed(3)})`);
      });
    });
  }
  function markerScale() { return lastK > 0 ? Math.max(0.55, Math.min(1.15, lastK)) : 1; }
  function fullBox() {
    const W = (world.maxLon - world.minLon) * KX * SCALE;
    const H = (world.maxLat - world.minLat) * SCALE;
    return { x: 0, y: 0, w: W, h: H };
  }
  function fitAll(animate = true) { setBox(fullBox(), animate); }

  function fitBounds(latlons, padRatio = 0.35, animate = true) {
    const xs = latlons.map(p => projX(p.lon));
    const ys = latlons.map(p => projY(p.lat));
    let x0 = Math.min(...xs), x1 = Math.max(...xs);
    let y0 = Math.min(...ys), y1 = Math.max(...ys);
    const full = fullBox();
    let w = Math.max(x1 - x0, 200), h = Math.max(y1 - y0, 200);
    w *= (1 + padRatio * 2); h *= (1 + padRatio * 2);
    /* שמירה על יחס גובה-רוחב של המפה */
    const ar = full.w / full.h;
    if (w / h > ar) h = w / ar; else w = h * ar;
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    setBox({ x: cx - w / 2, y: cy - h / 2, w, h }, animate);
  }

  /* חלון תצוגה סביב נקודה, בגובה של spanLat מעלות */
  function fitAround(lat, lon, spanLat = 0.8, animate = true) {
    const full = fullBox();
    const h = spanLat * SCALE;
    const w = h * (full.w / full.h);
    setBox({ x: projX(lon) - w / 2, y: projY(lat) - h / 2, w, h }, animate);
  }

  function fitRegion(id, animate = true) {
    /* התאמה לחלק היבשתי של האזור בלבד – המצולעים גולשים אל מחוץ לגבול */
    const pts = SITES.filter(s => s.r === id).map(s => ({ lat: s.lat, lon: s.lon }));
    if (pts.length < 2) return fitAll(animate);
    fitBounds(pts, 0.45, animate);
  }

  /* ------------------------------------------ המרות נקודה ---- */
  function clientToLatLon(cx, cy) {
    const pt = svg.createSVGPoint();
    pt.x = cx; pt.y = cy;
    const p = pt.matrixTransform(svg.getScreenCTM().inverse());
    return { lat: invLat(p.y), lon: invLon(p.x), x: p.x, y: p.y };
  }
  function latLonToClient(lat, lon) {
    const pt = svg.createSVGPoint();
    pt.x = projX(lon); pt.y = projY(lat);
    return pt.matrixTransform(svg.getScreenCTM());
  }

  /* מעבר ראשון על המצולעים המדויקים; מצולעי ההרחבה משמשים רק
     כדי לתפוס לחיצות שנפלו בדיוק על התפר בין שני אזורים. */
  function regionAt(lon, lat) {
    for (const rg of REGIONS) if (pointInPoly(lon, lat, rg.poly)) return rg.id;
    for (const rg of REGIONS) if (rg._poly && pointInPoly(lon, lat, rg._poly)) return rg.id;
    return null;
  }
  function onLand(lon, lat) {
    return [GEO.israel, GEO.westbank, GEO.gaza, GEO.golan].some(r => pointInPoly(lon, lat, r));
  }

  /* -------------------------------------------------- סיכות -- */
  function pin(opts) {
    const { lat, lon, type = 'default', label = '', pulse = false, small = false, labelDy = -84 } = opts;
    const k = markerScale();
    const g = el('g', {
      class: `pin pin-${type}` + (pulse ? ' pin-pulse' : ''),
      transform: `translate(${projX(lon).toFixed(1)} ${projY(lat).toFixed(1)}) scale(${k.toFixed(3)})`,
      id: 'pin' + (++pinSeq)
    }, layers.pins);
    g.dataset.lat = lat; g.dataset.lon = lon;
    if (pulse) el('circle', { r: 52, class: 'pin-halo', fill: 'none' }, g);
    el('circle', { r: small ? 30 : 50, class: 'pin-dot', filter: 'url(#f-glow)' }, g);
    el('circle', { r: small ? 12 : 19, class: 'pin-core' }, g);
    if (label) {
      const t = el('text', { y: labelDy, class: 'pin-label', 'text-anchor': 'middle' }, g);
      t.textContent = label;
    }
    return g;
  }

  function line(a, b, cls = '') {
    return el('line', {
      x1: projX(a.lon), y1: projY(a.lat), x2: projX(b.lon), y2: projY(b.lat),
      class: 'guide-line ' + cls, 'vector-effect': 'non-scaling-stroke'
    }, layers.fx);
  }

  function clearPins() { layers.pins.innerHTML = ''; layers.fx.innerHTML = ''; }

  /* ------------------------------------------------ אזורים -- */
  let baseOp = 0.42;
  function regionScale() {
    const v = parseFloat(getComputedStyle(svg).getPropertyValue('--region-op-scale'));
    return isNaN(v) ? 1 : v;
  }
  function showRegions(on, opacity = 0.42) {
    baseOp = opacity;
    const k = regionScale();
    layers.regions.querySelectorAll('.region').forEach(p => {
      p.style.opacity = on ? opacity * k : 0;
    });
  }
  /* נקרא אחרי החלפת ערכת נושא – עוצמת הצבע שונה על רקע בהיר */
  function refreshTheme() {
    const k = regionScale();
    layers.regions.querySelectorAll('.region').forEach(p => {
      if (parseFloat(p.style.opacity) > 0) {
        p.style.opacity = (p.classList.length > 1 ? 0.85 : baseOp) * k;
      }
    });
  }
  function setRegionState(id, state) {
    const p = layers.regions.querySelector(`[data-region="${id}"]`);
    if (!p) return;
    p.setAttribute('class', 'region ' + (state || ''));
    p.style.opacity = (state ? 0.85 : baseOp) * regionScale();
  }
  function resetRegionStates() {
    layers.regions.querySelectorAll('.region').forEach(p => {
      p.setAttribute('class', 'region');
      p.style.opacity = baseOp * regionScale();
    });
  }

  /* ---------------------------------------- שכבה גיאולוגית -- */
  /* צבעי התקן צריכים להיקרא כפי שהם, ולכן השכבה אטומה כמעט לגמרי
     והיבשה שמתחתיה מוסתרת. שקיפות מערבבת את הגוונים ומעכירה אותם. */
  let geoOp = 0.95, geoVisible = false;
  function showGeology(on, opacity = 0.95) {
    geoOp = opacity;
    geoVisible = !!on;
    svg.classList.toggle('geo-on', !!on);
    layers.geo.querySelectorAll('.geo-area').forEach(p => {
      p.setAttribute('class', 'geo-area');
      p.style.opacity = on ? opacity : 0;
    });
    syncSeams(on ? opacity : 0);
  }
  function setAreaState(id, state) {
    const p = layers.geo.querySelector(`[data-area="${id}"]`);
    if (!p) return;
    p.setAttribute('class', 'geo-area ' + (state || ''));
    p.style.opacity = state ? 0.92 : geoOp;
  }
  /* מכבד את מצב התצוגה: כשהשכבה מוסתרת, האיפוס לא מחזיר אותה */
  function resetAreaStates() {
    layers.geo.querySelectorAll('.geo-area').forEach(p => {
      p.setAttribute('class', 'geo-area');
      p.style.opacity = geoVisible ? geoOp : 0;
    });
    syncSeams(geoVisible ? geoOp : 0);
  }
  /* שכבת המילוי חיה יחד עם שכבת הצבע */
  function syncSeams(op) {
    const g = layers.geo.querySelector('.geo-fill');
    if (g) g.style.opacity = op;
  }
  /* הדגשת יעד בלי לחשוף את צבע הסלע – לשלב השאלה */
  function probeArea(id) {
    const p = layers.geo.querySelector(`[data-area="${id}"]`);
    if (!p) return;
    p.setAttribute('class', 'geo-area probe');
    p.style.opacity = 1;
  }
  function revealGeology(opacity = 0.95) {
    geoVisible = true; geoOp = opacity;
    svg.classList.add('geo-on');
    layers.geo.querySelectorAll('.geo-area').forEach(p => {
      if (!p.classList.contains('probe-done')) p.setAttribute('class', 'geo-area');
      p.style.opacity = opacity;
    });
    syncSeams(opacity);
  }
  function markArea(id) {
    const p = layers.geo.querySelector(`[data-area="${id}"]`);
    if (!p) return;
    p.setAttribute('class', 'geo-area found probe-done');
    p.style.opacity = 1;
  }

  function areaAt(lon, lat) {
    for (const a of GEO_AREAS) if (pointInPoly(lon, lat, a.poly)) return a.id;
    for (const a of GEO_AREAS) if (a._poly && pointInPoly(lon, lat, a._poly)) return a.id;
    return null;
  }
  function fitArea(id, animate = true) {
    const a = AREA_BY_ID[id];
    if (!a) return fitAll(animate);
    fitBounds(a.poly.map(([lo, la]) => ({ lat: la, lon: lo })), 0.15, animate);
  }

  /* ------------------------------ דרכים, נהרות ונחלים -------- */
  /* הרשימה והאינדקס נבנים פעם אחת – pathAt נקרא על כל לחיצה */
  let _pathList = null, _pathIx = null, _pathLen = null;
  function pathItems() {
    if (_pathList) return _pathList;
    const g = (src, pk) => (Array.isArray(src) ? src : []).map(it => ({ it, pk }));
    _pathList = g(typeof ROUTES !== 'undefined' && ROUTES, 'route')
      .concat(g(typeof STREAMS !== 'undefined' && STREAMS, 'stream'))
      .concat(g(typeof FOLDS !== 'undefined' && FOLDS, 'fold'))
      .concat(g(typeof BOUNDS !== 'undefined' && BOUNDS, 'bound'));
    _pathIx = Object.fromEntries(_pathList.map(x => [x.it.id, x]));
    return _pathList;
  }
  function pathItem(id) { pathItems(); return _pathIx[id]; }

  /* מציג בדיוק את התוואים המבוקשים. neutral – כולם באותו צבע חיוור,
     כדי שהצבע לא יסגיר איזה תוואי הוא התשובה. */
  function showPaths(ids, neutral = false) {
    const want = new Set(ids || []);
    layers.paths.querySelectorAll('.geo-path').forEach(p => {
      const on = want.has(p.dataset.path);
      p.setAttribute('class', 'geo-path pk-' + p.dataset.pk + (neutral && on ? ' neutral' : ''));
      p.style.opacity = on ? 1 : 0;
    });
  }
  function hidePaths() { showPaths([]); }
  function setPathState(id, state) {
    const p = layers.paths.querySelector(`[data-path="${id}"]`);
    if (!p) return;
    p.setAttribute('class', 'geo-path pk-' + p.dataset.pk + (state ? ' ' + state : ''));
    p.style.opacity = 1;
  }

  /* מרחק נקודה-מקטע במרחב המוקרן, ביחידות SVG */
  function segDist(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay;
    const L = dx * dx + dy * dy;
    let t = L ? ((px - ax) * dx + (py - ay) * dy) / L : 0;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
  }
  function distToPath(lon, lat, item) {
    const px = projX(lon), py = projY(lat);
    let best = Infinity;
    for (let i = 1; i < item.path.length; i++) {
      const a = item.path[i - 1], b = item.path[i];
      const d = segDist(px, py, projX(a[0]), projY(a[1]), projX(b[0]), projY(b[1]));
      if (d < best) best = d;
    }
    return best;
  }
  function pathLen(item) {
    if (!_pathLen) _pathLen = {};
    if (_pathLen[item.id] != null) return _pathLen[item.id];
    let L = 0;
    for (let i = 1; i < item.path.length; i++) {
      const a = item.path[i - 1], b = item.path[i];
      L += Math.hypot(projX(b[0]) - projX(a[0]), projY(b[1]) - projY(a[1]));
    }
    return (_pathLen[item.id] = L);
  }
  /* התוואי הקרוב ביותר ללחיצה, מתוך רשימה נתונה.
     הסף נדיב (כ-25 ק״מ) – התוואים מקורבים ממילא.
     ליד מפגש בין תוואים (יובל שנשפך לנהר, דרך שמסתעפת מדרך)
     בוחרים את התוואי הספציפי – הקצר מביניהם. */
  function pathAt(lon, lat, ids, maxUnits = 230) {
    const cand = [];
    (ids ? ids.map(pathItem) : pathItems()).forEach(x => {
      if (x) cand.push({ id: x.it.id, d: distToPath(lon, lat, x.it), len: pathLen(x.it) });
    });
    if (!cand.length) return null;
    const bd = Math.min(...cand.map(c => c.d));
    if (bd > maxUnits) return null;
    /* הסף צר בכוונה: הכלל חל רק על חפיפה ממשית, לא על קרבה */
    return cand.filter(c => c.d <= bd + 8).sort((a, b) => a.len - b.len)[0].id;
  }
  function pathMid(id) {
    const x = pathItem(id);
    if (!x) return null;
    const p = x.it.path[Math.floor(x.it.path.length / 2)];
    return { lat: p[1], lon: p[0] };
  }
  /* minSpanLat – חלון תצוגה מזערי במעלות רוחב. תוואי קצר לבדו
     ממלא את המסך ומאבד כל הקשר, ולכן מרחיבים סביבו. */
  function fitPaths(ids, pad = 0.22, animate = true, minSpanLat = 0) {
    const pts = [];
    (ids || []).forEach(id => {
      const x = pathItem(id);
      if (x) x.it.path.forEach(([lo, la]) => pts.push({ lat: la, lon: lo }));
    });
    if (!pts.length) return fitAll(animate);
    if (minSpanLat) {
      const las = pts.map(p => p.lat), los = pts.map(p => p.lon);
      const lo0 = Math.min(...las), la1 = Math.max(...las);
      if (la1 - lo0 < minSpanLat) {
        return fitAround((lo0 + la1) / 2, (Math.min(...los) + Math.max(...los)) / 2,
          minSpanLat, animate);
      }
    }
    fitBounds(pts, pad, animate);
  }

  function showRegionLabels(on) {
    layers.labels.innerHTML = '';
    if (!on) return;
    const k = markerScale();
    REGIONS.forEach(rg => {
      const c = regionCenters[rg.id];
      const g = el('g', {
        transform: `translate(${projX(c.lon).toFixed(1)} ${projY(c.lat).toFixed(1)}) scale(${k.toFixed(3)})`
      }, layers.labels);
      g.dataset.lat = c.lat; g.dataset.lon = c.lon;
      const t = el('text', { class: 'region-label', 'text-anchor': 'middle', y: 0 }, g);
      t.textContent = rg.short;
    });
  }

  function setTap(fn) { tapHandler = fn; }

  const api = {
    init, fitAll, fitBounds, fitRegion, fitAround, setBox, fullBox,
    zoomBy, zoomAt, zoomLevel, setPanEnabled: v => { allowPan = v; },
    clientToLatLon, latLonToClient, projX, projY,
    regionAt, onLand, pin, line, clearPins,
    showRegions, setRegionState, resetRegionStates, showRegionLabels,
    showGeology, setAreaState, resetAreaStates, areaAt, fitArea,
    probeArea, revealGeology, markArea,
    showPaths, hidePaths, setPathState, pathAt, pathMid, fitPaths,
    setTap, haversine, regionCenters, refreshTheme,
    get svg() { return svg; },
    get layers() { return layers; }
  };
  return api;
})();
