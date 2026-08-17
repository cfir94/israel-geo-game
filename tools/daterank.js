/* מאתר שאלות שבהן כל האפשרויות הן שנים, ובודק את הדירוג של
   התשובה הנכונה מבין כל השאלות מאותו מאגר. אם התשובה הנכונה
   כמעט תמיד המספר הקטן ביותר (או הגדול ביותר), אפשר לענות נכון
   בלי לדעת כלום – בדיוק הבאג שנמצא בשאלות שיא הגובה. שאלה בודדת
   בקצה התפלגות בריאה היא בסדר; דפוס עקבי הוא הבעיה. */
const fs = require('fs'), vm = require('vm');
const src = ['data.js', 'geology.js', 'guide.js', 'routes.js', 'structure.js', 'history.js', 'periods.js']
  .map(f => fs.readFileSync('js/' + f, 'utf8')).join('\n');
const D = vm.runInNewContext(src + `
;({TRIVIA, HISTORY_Q: typeof HISTORY_Q!=='undefined'?HISTORY_Q:[],
   PERIOD_Q: typeof PERIOD_Q!=='undefined'?(PERIOD_Q.filter(r=>!r.order)):[]})`,
  {}, { timeout: 20000 });

const yr = s => { const m = String(s).match(/\d{3,4}/); return m ? +m[0] : null; };

function check(name, rows) {
  const ranks = [];
  rows.forEach(r => {
    if (!r.a || !r.w) return;
    const opts = [r.a, ...r.w];
    const vals = opts.map(yr);
    if (vals.some(v => v === null)) return;   // לא כל האפשרויות הן שנים
    const sorted = [...vals].sort((a, b) => a - b);
    ranks.push(sorted.indexOf(vals[0]));       // 0 = המוקדם ביותר
  });
  if (!ranks.length) return 0;
  const n = ranks.length;
  const extremeMin = ranks.filter(r => r === 0).length;
  const extremeMax = ranks.filter(r => r === Math.max(...ranks)).length;
  const worst = Math.max(extremeMin, extremeMax) / n;
  console.log(name + ': ' + n + ' שאלות עם אפשרויות-שנים · דירוגים ' + ranks.join(','));
  if (worst > 0.7 && n >= 4) {
    console.log('  ✗ ' + Math.round(worst * 100) + '% מהתשובות בקצה הטווח – דפוס לניצול');
    return 1;
  }
  return 0;
}
let bad = 0;
bad += check('TRIVIA', D.TRIVIA);
bad += check('HISTORY_Q', D.HISTORY_Q);
bad += check('PERIOD_Q', D.PERIOD_Q);
console.log(bad ? '\nנמצא דפוס קיצון בר-ניצול' : '\nאין דפוס קיצון בר-ניצול ✓');
process.exit(bad ? 1 : 0);
