#!/usr/bin/env python3
"""מפיק קווי גובה מהמודל ובונה מהם js/contours.js.

קווי גובה חייבים להישאר חדים בזום, ולכן הם וקטורים ולא תמונה.
שלושת השלבים שקובעים אם זה יהיה שמיש או ענק מדי:

  1. החלקה של המודל לפני הגזירה. מודל גובה גולמי מייצר קווים
     משוננים שכל שן בהם עולה בייטים ולא מוסיפה מידע.
  2. פישוט דאגלס־פויקר לכל קו.
  3. השלכת לולאות קצרות – פסגה בודדת בקוטר שני פיקסלים היא רעש.
"""
import json, math, os, re, sys
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.dirname(HERE)
dem = np.load(os.path.join(HERE, 'dem.npy')).astype(np.float32)
LON0, LON1, LAT0, LAT1, _W, _H = open(os.path.join(HERE, 'dem.meta')).read().split()
LON0, LON1, LAT0, LAT1 = map(float, (LON0, LON1, LAT0, LAT1))
H, W = dem.shape

STEP = int(sys.argv[1]) if len(sys.argv) > 1 else 100     # מרווח בין קווים
SIGMA = float(sys.argv[2]) if len(sys.argv) > 2 else 2.2  # החלקה, בתאי רשת
TOL = float(sys.argv[3]) if len(sys.argv) > 3 else 0.55   # פישוט, בתאי רשת
MINPTS = 5


def gauss1d(a, sigma, axis):
    r = max(1, int(sigma * 3))
    k = np.exp(-0.5 * (np.arange(-r, r + 1) / sigma) ** 2)
    k /= k.sum()
    pad = [(0, 0), (0, 0)]
    pad[axis] = (r, r)
    b = np.pad(a, pad, mode='edge')
    out = np.zeros_like(a)
    for i, w in enumerate(k):
        sl = [slice(None), slice(None)]
        sl[axis] = slice(i, i + a.shape[axis])
        out += w * b[tuple(sl)]
    return out


sm = gauss1d(gauss1d(dem, SIGMA, 0), SIGMA, 1)

# מסכת יבשה – קווי גובה בירדן ובסיני רק מנפחים את הקובץ, והשכבה
# ממילא נחתכת ל-clip-path של הארץ.
geo = json.loads(re.search(r'const GEO = (\{.*\});?\s*$',
                           open(os.path.join(SRC, 'js/geo.js'), encoding='utf-8').read(),
                           re.S).group(1))


def poly_mask(keys, grow=3):
    from PIL import Image, ImageDraw
    im = Image.new('L', (W, H), 0)
    d = ImageDraw.Draw(im)
    for k in keys:
        d.polygon([((lo - LON0) / (LON1 - LON0) * W, (LAT1 - la) / (LAT1 - LAT0) * H)
                   for lo, la in geo[k]], fill=255)
    m = np.asarray(im) > 0
    for _ in range(grow):
        g = m.copy()
        g[1:, :] |= m[:-1, :]; g[:-1, :] |= m[1:, :]
        g[:, 1:] |= m[:, :-1]; g[:, :-1] |= m[:, 1:]
        m = g
    return m


land = poly_mask(('israel', 'westbank', 'gaza', 'golan'))

# ---- marching squares, מווקטר לפי מקרה ----
# פינות התא (i,j): a שמאל-עליון, b ימין-עליון, c ימין-תחתון, d שמאל-תחתון.
# צלעות: T עליונה, R ימנית, B תחתונה, L שמאלית. כל צלע מזוהה חד-ערכית
# כדי שחיבור הקטעים לקו רציף יהיה מדויק ולא תלוי בעיגול קואורדינטות.
CASES = {
    1: [('L', 'B')], 2: [('B', 'R')], 3: [('L', 'R')], 4: [('T', 'R')],
    6: [('T', 'B')], 7: [('L', 'T')], 8: [('T', 'L')], 9: [('T', 'B')],
    11: [('T', 'R')], 12: [('L', 'R')], 13: [('B', 'R')], 14: [('L', 'B')],
}
SADDLE = {5: ([('L', 'T'), ('B', 'R')], [('L', 'B'), ('T', 'R')]),
          10: ([('T', 'R'), ('L', 'B')], [('T', 'L'), ('B', 'R')])}

HW = H * W


def edge_ids(kind, i, j):
    return (i * W + j) if kind == 'h' else (HW + i * W + j)


def contour(level):
    a = sm[:-1, :-1]; b = sm[:-1, 1:]; c = sm[1:, 1:]; d = sm[1:, :-1]
    idx = ((a >= level).astype(np.uint8) * 8 + (b >= level).astype(np.uint8) * 4 +
           (c >= level).astype(np.uint8) * 2 + (d >= level).astype(np.uint8))
    segs = []
    def push(ii, jj, pairs):
        for e1, e2 in pairs:
            segs.append((edge(e1, ii, jj), edge(e2, ii, jj)))
    def edge(name, ii, jj):
        if name == 'T': return edge_ids('h', ii, jj)
        if name == 'B': return edge_ids('h', ii + 1, jj)
        if name == 'L': return edge_ids('v', ii, jj)
        return edge_ids('v', ii, jj + 1)

    for case, pairs in CASES.items():
        ii, jj = np.nonzero(idx == case)
        for k in range(len(ii)):
            push(int(ii[k]), int(jj[k]), pairs)
    for case, (p_hi, p_lo) in SADDLE.items():
        ii, jj = np.nonzero(idx == case)
        if len(ii):
            centre = (a[ii, jj] + b[ii, jj] + c[ii, jj] + d[ii, jj]) / 4
            for k in range(len(ii)):
                push(int(ii[k]), int(jj[k]), p_hi if centre[k] >= level else p_lo)
    return segs


def edge_point(eid, level):
    if eid < HW:
        i, j = divmod(eid, W)
        v0, v1 = sm[i, j], sm[i, j + 1]
        t = 0.5 if v1 == v0 else (level - v0) / (v1 - v0)
        return (j + t, float(i))
    i, j = divmod(eid - HW, W)
    v0, v1 = sm[i, j], sm[i + 1, j]
    t = 0.5 if v1 == v0 else (level - v0) / (v1 - v0)
    return (float(j), i + t)


def join(segs):
    """מחבר קטעים לקווים רציפים לפי זהות הצלע, לא לפי מרחק."""
    nbr = {}
    for u, v in segs:
        nbr.setdefault(u, []).append(v)
        nbr.setdefault(v, []).append(u)
    seen = set()
    lines = []
    ends = [k for k, v in nbr.items() if len(v) == 1]
    for start in ends + list(nbr.keys()):
        if start in seen or start not in nbr:
            continue
        line = [start]; seen.add(start); cur = start; prev = None
        while True:
            nxt = None
            for cand in nbr[cur]:
                if cand != prev and cand not in seen:
                    nxt = cand; break
            if nxt is None:
                break
            line.append(nxt); seen.add(nxt); prev, cur = cur, nxt
        if len(line) >= 2:
            lines.append(line)
    return lines


def rdp(pts, tol):
    if len(pts) < 3:
        return pts
    keep = np.zeros(len(pts), dtype=bool)
    keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    P = np.asarray(pts, dtype=np.float64)
    while stack:
        i0, i1 = stack.pop()
        if i1 <= i0 + 1:
            continue
        p0, p1 = P[i0], P[i1]
        seg = p1 - p0
        L = math.hypot(*seg)
        sub = P[i0 + 1:i1]
        if L < 1e-9:
            dist = np.hypot(sub[:, 0] - p0[0], sub[:, 1] - p0[1])
        else:
            dist = np.abs(seg[0] * (p0[1] - sub[:, 1]) - (p0[0] - sub[:, 0]) * seg[1]) / L
        k = int(np.argmax(dist))
        if dist[k] > tol:
            keep[i0 + 1 + k] = True
            stack.append((i0, i0 + 1 + k)); stack.append((i0 + 1 + k, i1))
    return [pts[i] for i in np.nonzero(keep)[0]]


def to_lonlat(pts):
    return [(round(float(LON0 + (x + 0.5) / W * (LON1 - LON0)), 4),
             round(float(LAT1 - (y + 0.5) / H * (LAT1 - LAT0)), 4)) for x, y in pts]


def split_on_land(pts):
    """שומר רק את הקטעים שנופלים בתחומי הארץ, ומפצל היכן שיצאו."""
    runs, cur = [], []
    for x, y in pts:
        i, j = int(round(y)), int(round(x))
        ok = 0 <= i < H and 0 <= j < W and land[i, j]
        if ok:
            cur.append((x, y))
        else:
            if len(cur) >= MINPTS: runs.append(cur)
            cur = []
    if len(cur) >= MINPTS: runs.append(cur)
    return runs


lo = int(math.floor(sm.min() / STEP)) * STEP
hi = int(math.ceil(sm.max() / STEP)) * STEP
levels = [v for v in range(lo, hi + STEP, STEP) if sm.min() < v < sm.max()]

out, npts, nlines = [], 0, 0
for lv in levels:
    segs = contour(lv)
    if not segs:
        continue
    for line in join(segs):
        pts = [edge_point(e, lv) for e in line]
        for run in split_on_land(pts):
            s = rdp(run, TOL)
            if len(s) < MINPTS:
                continue
            out.append((lv, to_lonlat(s)))
            npts += len(s); nlines += 1

body = ',\n'.join('[%d,%s]' % (lv, json.dumps([[x, y] for x, y in pts], separators=(',', ':')))
                  for lv, pts in out)
js = ('/* ============================================================\n'
      '   קווי גובה – נוצר אוטומטית ב-tools/dem_contours.py, אין לערוך ביד.\n'
      f'   מרווח {STEP} מ׳ · {nlines} קווים · {npts} נקודות.\n'
      '   כל רשומה: [גובה במטרים, [[lon,lat], ...]].\n'
      '   ============================================================ */\n'
      f'const CONTOUR_STEP = {STEP};\n'
      f'const CONTOURS = [\n{body}\n];\n')
path = os.path.join(SRC, 'js/contours.js')
open(path, 'w', encoding='utf-8').write(js)
print(f'מרווח {STEP} מ׳ · סיגמא {SIGMA} · סבילות {TOL}')
print(f'  גבהים: {levels[0]}..{levels[-1]} ({len(levels)} קווים)')
print(f'  {nlines} קווים · {npts} נקודות · {os.path.getsize(path)/1024:.0f} KB')
