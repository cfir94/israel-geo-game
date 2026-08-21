/* שומר איכות לשאלות: מאתר שאלות שאפשר לענות עליהן בלי לדעת כלום.
   שלוש מלכודות:
     1. "הכי גבוה/ארוך/גדול" כשכל מסיח נושא מספר – בוחרים את הקיצון.
     2. שאלה על סדר כרונולוגי שכל מסיח נושא שנה – ממיינים ובוחרים.
     3. מסיח שהוא המקרה הקיצוני היחיד (ארוך/קצר בהרבה מהשאר). */
const fs = require('fs'), vm = require('vm');
const SRC = '/workspace/israel-geo-game/js/';
const FILES = ['data.js', 'geology.js', 'guide.js', 'routes.js', 'structure.js',
  'history.js', 'periods.js'];
const src = FILES.map(f => fs.readFileSync(SRC + f, 'utf8')).join('\n');
const pick = n => `${n}: typeof ${n}!=='undefined'?${n}:[]`;
const D = vm.runInNewContext(src + ';({' +
  ['TRIVIA', 'GEO_TRIVIA', 'ROUTE_Q', 'STREAM_Q', 'STRUCT_Q', 'GUIDE', 'GUIDE_Q',
   'HISTORY_Q', 'PERIOD_Q'].map(pick).join(',') + '})', {}, { timeout: 20000 });

const pools = Object.entries(D).filter(([, v]) => Array.isArray(v) && v.length);
const num = s => { const m = String(s).match(/-?\d[\d,]*/); return m ? +m[0].replace(/,/g, '') : null; };
/* שנה, כולל לפנה״ס כשלילית */
const year = s => {
  const t = String(s);
  const m = t.match(/(\d{1,4})\s*(?:לפנה״ס|לפנהס|לפני הספירה)/);
  if (m) return -+m[1];
  const m2 = t.match(/\b(\d{3,4})\b/);
  return m2 ? +m2[1] : null;
};
const SUPER = /הגבוה|הנמוך|הארוך|הקצר|הגדול|הקטן|הרחב|העמוק|הראשון|האחרון|ביותר|שיא/;
const ORDER = /קדם|מוקדם|מאוחר|ראשון|לפני|אחרי|סדר כרונולוגי/;

let flags = 0, checked = 0;
pools.forEach(([name, rows]) => {
  rows.forEach((q, i) => {
    /* המבנה במשחק: q = שאלה, a = התשובה הנכונה, w = המסיחים */
    if (typeof q.a !== 'string' || !Array.isArray(q.w)) return;
    const texts = [q.a].concat(q.w);
    if (texts.length < 3) return;
    const t = q.q || '';
    checked++;
    const say = (why, extra) => {
      flags++;
      console.log(`\n[${name}#${i}] ${why}`);
      console.log('  ' + t);
      texts.forEach(x => console.log('    · ' + x));
      if (extra) console.log('  ' + extra);
    };

    const nums = texts.map(num);
    if (SUPER.test(t) && nums.every(n => n !== null)) {
      const want = /הנמוך|הקצר|הקטן/.test(t) ? Math.min(...nums) : Math.max(...nums);
      if (nums[0] === want) say('מספר בכל מסיח בשאלת "הכי" – אפשר לנחש', 'מספרים: ' + nums.join(', '));
    }

    const yrs = texts.map(year);
    if (ORDER.test(t) && yrs.every(y => y !== null) && new Set(yrs).size === yrs.length) {
      say('שנה בכל מסיח בשאלת סדר – אפשר למיין ולנחש', 'שנים: ' + yrs.join(', '));
    }

    /* סוגריים הם הבהרה, לא רמז – מודדים בלעדיהם */
    const lens = texts.map(x => x.replace(/\([^)]*\)/g, '').trim().length);
    const mx = Math.max(...lens), rest = lens.filter(l => l !== mx);
    if (lens[0] === mx && mx >= 26 && mx > Math.max(...rest) * 2.5 && rest.length >= 2) {
      say('התשובה ארוכה פי שניים מכל מסיח – בולטת לעין', 'אורכים: ' + lens.join(', '));
    }
  });
});

console.log(`\nמאגרים: ${pools.map(([n, v]) => n + '=' + v.length).join(' · ')}`);
console.log(`שאלות שנבדקו: ${checked} · חשודות: ${flags}`);
if (flags) process.exitCode = 1;
