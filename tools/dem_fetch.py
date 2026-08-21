#!/usr/bin/env python3
"""מוריד אריחי גובה (terrarium) ומרכיב מודל גובה בהיטל של המשחק.

אריחי המקור הם במרקטור, והמפה במשחק היא גלילית פשוטה עם תיקון
cos(31.5) לציר האורך – ולכן דוגמים מחדש לרשת שבה הרוחב ליניארי.
"""
import math, os, io, sys, urllib.request, concurrent.futures as cf
import numpy as np
from PIL import Image

Z = 11
LON0, LON1 = 34.218, 35.895
LAT0, LAT1 = 29.491, 33.330
PAD = 0.02
LON0 -= PAD; LON1 += PAD; LAT0 -= PAD; LAT1 += PAD
CACHE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'demtiles')
os.makedirs(CACHE, exist_ok=True)

def lon2x(lon, z): return (np.asarray(lon, dtype=np.float64) + 180.0) / 360.0 * (1 << z)
def lat2y(lat, z):
    s = np.sin(np.radians(np.asarray(lat, dtype=np.float64)))
    return (0.5 - np.log((1 + s) / (1 - s)) / (4 * np.pi)) * (1 << z)

x0, x1 = int(lon2x(LON0, Z)), int(lon2x(LON1, Z))
y0, y1 = int(lat2y(LAT1, Z)), int(lat2y(LAT0, Z))
tiles = [(x, y) for x in range(x0, x1 + 1) for y in range(y0, y1 + 1)]
print(f'z={Z} אריחים: {len(tiles)}  (x {x0}..{x1}, y {y0}..{y1})')

URL = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'

def get(t):
    x, y = t
    p = os.path.join(CACHE, f'{Z}_{x}_{y}.png')
    if os.path.exists(p) and os.path.getsize(p) > 0:
        return t, p
    for attempt in range(4):
        try:
            with urllib.request.urlopen(URL.format(z=Z, x=x, y=y), timeout=40) as r:
                d = r.read()
            open(p, 'wb').write(d)
            return t, p
        except Exception as e:
            if attempt == 3:
                print('נכשל', t, e, file=sys.stderr)
                return t, None
    return t, None

with cf.ThreadPoolExecutor(max_workers=12) as ex:
    got = list(ex.map(get, tiles))
ok = sum(1 for _, p in got if p)
print(f'הורדו {ok}/{len(tiles)}')

# פסיפס במרקטור
TS = 256
MW, MH = (x1 - x0 + 1) * TS, (y1 - y0 + 1) * TS
mos = np.full((MH, MW), np.nan, dtype=np.float32)
for (x, y), p in got:
    if not p: continue
    a = np.asarray(Image.open(p).convert('RGB')).astype(np.float32)
    e = (a[:, :, 0] * 256 + a[:, :, 1] + a[:, :, 2] / 256) - 32768
    mos[(y - y0) * TS:(y - y0 + 1) * TS, (x - x0) * TS:(x - x0 + 1) * TS] = e
print('פסיפס', mos.shape, 'חורים:', int(np.isnan(mos).sum()))
mos = np.nan_to_num(mos, nan=0.0)

# דגימה מחדש להיטל של המשחק
KX = math.cos(math.radians(31.5))
H = 2048
W = int(round(H * (LON1 - LON0) * KX / (LAT1 - LAT0)))
print('רשת יעד', W, 'x', H)

lons = LON0 + (np.arange(W) + 0.5) / W * (LON1 - LON0)
lats = LAT1 - (np.arange(H) + 0.5) / H * (LAT1 - LAT0)
fx = lon2x(lons, Z) * TS - x0 * TS
fy = lat2y(lats, Z) * TS - y0 * TS

def bilinear(grid, fy, fx):
    y_i = np.clip(np.floor(fy).astype(int), 0, grid.shape[0] - 2)
    x_i = np.clip(np.floor(fx).astype(int), 0, grid.shape[1] - 2)
    ty = (fy - y_i)[:, None]
    tx = (fx - x_i)[None, :]
    g00 = grid[np.ix_(y_i, x_i)]; g01 = grid[np.ix_(y_i, x_i + 1)]
    g10 = grid[np.ix_(y_i + 1, x_i)]; g11 = grid[np.ix_(y_i + 1, x_i + 1)]
    return (g00 * (1 - ty) * (1 - tx) + g01 * (1 - ty) * tx +
            g10 * ty * (1 - tx) + g11 * ty * tx)

dem = bilinear(mos, fy, fx).astype(np.float32)
np.save(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'dem.npy'), dem)
open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'dem.meta'), 'w').write(
    f'{LON0} {LON1} {LAT0} {LAT1} {W} {H}\n')
print('גובה: מינימום', round(float(dem.min())), 'מקסימום', round(float(dem.max())))
for name, la, lo in [('החרמון', 33.302, 35.784), ('מירון', 33.000, 35.404),
                     ('ים המלח', 31.500, 35.470), ('תל אביב', 32.080, 34.780),
                     ('ירושלים', 31.778, 35.235), ('רמון', 30.610, 34.800)]:
    r = int((LAT1 - la) / (LAT1 - LAT0) * H); c = int((lo - LON0) / (LON1 - LON0) * W)
    print(f'  {name}: {round(float(dem[r, c]))} מ׳')
