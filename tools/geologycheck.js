/* בודק שסיווג הלחיצה במפה תואם לסלע שמוגדר ביעדי השאלות הרגישים.
   רץ בלי דפדפן ומפעיל את אותה פונקציית areaAt של המשחק. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, 'js', file), 'utf8');
const expectedAreas = {
  'רצפת מכתש רמון': 'ramonFloor',
  'המכתש הגדול': 'gadolFloor',
  'המכתש הקטן': 'katanFloor',
  'פארק תמנע': 'timnaSandstone',
  'הקניון האדום': 'redCanyonSandstone',
  'אילת': 'eilatMts',
  'עין נטפים': 'eilatMts',
  'הר שלמה': 'eilatMts'
};

const check = `
(() => {
  GEO_AREAS.forEach(a => { a._poly = offsetRing(a.poly, 0.05); });
  const errors = [];
  const results = [];
  const expectedAreas = ${JSON.stringify(expectedAreas)};
  for (const [name, expectedArea] of Object.entries(expectedAreas)) {
    const target = GEO_TARGETS.find(t => t.name === name && t.rock);
    if (!target) {
      errors.push(name + ': היעד לא נמצא');
      continue;
    }
    const areaId = GameMap.areaAt(target.lon, target.lat);
    const actual = areaId && AREA_BY_ID[areaId] && AREA_BY_ID[areaId].rock;
    results.push({ name, expected: target.rock, actual, areaId });
    if (actual !== target.rock) {
      errors.push(name + ': הוגדר ' + target.rock + ' אך המפה מחזירה ' + (actual || 'ללא סלע'));
    }
    if (areaId !== expectedArea) {
      errors.push(name + ': ציפינו לאזור ' + expectedArea + ' אך המפה מחזירה ' + (areaId || 'ללא אזור'));
    }
  }

  const nubianAreas = GEO_AREAS.filter(a => a.rock === 'nubian');
  if (nubianAreas.length !== 5) {
    errors.push('ציפינו לחמש חשיפות של אבן חול נובית, נמצאו ' + nubianAreas.length);
  }

  /* לכל יחידה קטנה חייבת להיות לפחות נקודה אחת מחוץ למצולע המדויק
     אך בתוך טווח הלחיצה, שממשיכה להיות מסווגת לאותה יחידה. */
  for (const area of GEO_AREAS.filter(a => a.hitPriority)) {
    let forgivingHit = false;
    for (let i = 0; i < area.poly.length && !forgivingHit; i++) {
      for (const fraction of [0.25, 0.5, 0.75]) {
        const point = [
          area.poly[i][0] + (area._poly[i][0] - area.poly[i][0]) * fraction,
          area.poly[i][1] + (area._poly[i][1] - area.poly[i][1]) * fraction
        ];
        if (!pointInPoly(point[0], point[1], area.poly) &&
            GameMap.areaAt(point[0], point[1]) === area.id) {
          forgivingHit = true;
          break;
        }
      }
    }
    if (!forgivingHit) errors.push(area.name + ': אין טווח לחיצה סלחני מחוץ למצולע המדויק');
  }
  return { errors, results };
})()
`;

const source = read('geology.js') + '\n' + read('map.js') + '\n' + check;
const out = vm.runInNewContext(source, { document: {}, Math, Map, Set, Date },
  { timeout: 20000 });

out.results.forEach(r => {
  const mark = r.expected === r.actual ? '✓' : '✗';
  console.log(mark + ' ' + r.name + ' → ' + (r.areaId || 'ללא אזור') + ' (' + (r.actual || 'ללא סלע') + ')');
});

if (out.errors.length) {
  console.log('\nנמצאו בעיות בסיווג הגיאולוגי:');
  out.errors.forEach(e => console.log('  ✗ ' + e));
  process.exitCode = 1;
} else {
  console.log('\nסיווג יעדי הסלעים הרגישים תואם למפה ✓');
}
