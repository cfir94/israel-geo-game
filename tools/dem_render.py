#!/usr/bin/env python3
"""מרנדר את מודל הגובה לתמונת רקע: גוני גובה + הצללת תבליט.

הספים נבחרו לפי מה שמורה דרך צריך לקרוא מהמפה: מתחת לפני הים
(הבקע), מישור החוף, השפלה, גב ההר, והפסגות הגבוהות.
"""
import math, os, sys
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
dem = np.load(os.path.join(HERE, 'dem.npy')).astype(np.float32)
LON0, LON1, LAT0, LAT1, W, H = open(os.path.join(HERE, 'dem.meta')).read().split()
LON0, LON1, LAT0, LAT1 = map(float, (LON0, LON1, LAT0, LAT1))
H, W = dem.shape

# ---- גוני גובה ----
STOPS = [
    (-450, (0x1d, 0x5c, 0x63)),   # קרקעית הבקע
    (-300, (0x24, 0x74, 0x6e)),
    (-150, (0x36, 0x8f, 0x77)),
    (  -1, (0x5f, 0xa8, 0x7f)),
    (   0, (0x7d, 0xb8, 0x72)),   # פני הים – הקפיצה הזאת מכוונת
    ( 100, (0x9d, 0xc4, 0x74)),
    ( 250, (0xc2, 0xd0, 0x7c)),
    ( 400, (0xe0, 0xd5, 0x8a)),
    ( 600, (0xe6, 0xc2, 0x78)),
    ( 800, (0xd8, 0xa4, 0x63)),
    (1000, (0xc2, 0x87, 0x52)),
    (1300, (0xa5, 0x6c, 0x4a)),
    (1600, (0x8a, 0x5a, 0x4c)),
    (1900, (0xa8, 0x96, 0x92)),
    (2300, (0xe8, 0xe6, 0xe8)),   # קו הכפור בחרמון
]

def ramp(e):
    xs = np.array([s[0] for s in STOPS], dtype=np.float32)
    cs = np.array([s[1] for s in STOPS], dtype=np.float32)
    out = np.empty(e.shape + (3,), dtype=np.float32)
    for c in range(3):
        out[..., c] = np.interp(e, xs, cs[:, c])
    return out

# ---- הצללת תבליט ----
# גודל התא במטרים: הרוחב מתכווץ עם הקוסינוס של הרוחב הגאוגרפי
mlat = (LAT1 - LAT0) * 111320.0 / H
latc = math.radians((LAT0 + LAT1) / 2)
mlon = (LON1 - LON0) * 111320.0 * math.cos(latc) / W
gy, gx = np.gradient(dem.astype(np.float32), mlat, mlon)
gy = -gy                      # שורה 0 היא הצפון
AZ, ALT, VE = math.radians(315.0), math.radians(45.0), 1.7
slope = np.arctan(VE * np.hypot(gx, gy))
aspect = np.arctan2(gy, -gx)
shade = (np.sin(ALT) * np.cos(slope) +
         np.cos(ALT) * np.sin(slope) * np.cos(AZ - aspect))
shade = np.clip(shade, 0, 1)
shade = 0.55 + 0.75 * shade   # לא מחשיך עד שחור – זה רקע, לא נושא

# ---- מסכת יבשה ----
# מחוץ לגבול התמונה נחתכת ממילא ב-clip-path של ה-SVG, אבל צובעים
# שם גוון שטוח: גם מונע הצצה של "יבשה ירוקה" בים אם החיתוך יזוז,
# וגם מקטין את הקובץ – שטח אחיד נדחס כמעט לאפס.
import json, re
geo_src = open('/workspace/israel-geo-game/js/geo.js', encoding='utf-8').read()
GEO = json.loads(re.search(r'const GEO = (\{.*\});?\s*$', geo_src, re.S).group(1))
mask_img = Image.new('L', (W, H), 0)
md = __import__('PIL.ImageDraw', fromlist=['ImageDraw']).Draw(mask_img)
for key in ('israel', 'westbank', 'gaza', 'golan'):
    pts = [((lo - LON0) / (LON1 - LON0) * W, (LAT1 - la) / (LAT1 - LAT0) * H)
           for lo, la in GEO[key]]
    md.polygon(pts, fill=255)
# הגולן, עזה ויו"ש הם מצולעים נפרדים ולא נושקים בדיוק – בלי הרחבה
# של פיקסל-שניים נפערים קווי ים דקים בין חבלי ארץ שכנים.
land = np.asarray(mask_img) > 0
grow = land.copy()
for _ in range(2):
    grow[1:, :] |= land[:-1, :]; grow[:-1, :] |= land[1:, :]
    grow[:, 1:] |= land[:, :-1]; grow[:, :-1] |= land[:, 1:]
    land = grow.copy()
print('אחוז יבשה בתמונה:', round(100 * land.mean(), 1))

col = ramp(dem) * shade[..., None]
# מעדנים: רקע שיושב מתחת לסיכות, לתוויות ולהדגשת אזורים
GREY, MIX = np.float32(232.0), np.float32(0.26)
col = col * (1 - MIX) + GREY * MIX
col[~land] = np.array([0xc3, 0xda, 0xf0], dtype=np.float32)   # --sea-2 הבהיר
rgb = np.clip(col, 0, 255).astype(np.uint8)
img = Image.fromarray(rgb, 'RGB')

out_dir = '/workspace/israel-geo-game/assets'
variants = {}
for name, kw in [
    ('topo.png',  dict(format='PNG', optimize=True)),
    ('topo8.png', dict(format='PNG', optimize=True)),
    ('topo.webp', dict(format='WEBP', quality=82, method=6)),
]:
    im = img
    if name.endswith('8.png'):
        im = img.quantize(colors=192, method=Image.MEDIANCUT, dither=Image.FLOYDSTEINBERG)
    buf = os.path.join(HERE, name)
    im.save(buf, **kw)
    variants[name] = os.path.getsize(buf)

print(f'רשת {W}x{H}')
for k, v in sorted(variants.items(), key=lambda t: t[1]):
    print(f'  {k:12} {v/1024:7.1f} KB')
