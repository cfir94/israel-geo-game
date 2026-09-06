/* בודק שסדר השאלות אינו מוסר את התשובה לשאלה הבאה.
   רץ בלי דפדפן: טוען את מאגרי התוכן ואת חלק בניית השאלות ב-VM. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, 'js', file), 'utf8');
const files = ['data.js', 'geology.js', 'guide.js', 'routes.js', 'structure.js',
  'history.js', 'periods.js', 'regionq.js'];

let game = read('game.js');
game = game.slice(0, game.indexOf('/* ------------------------------------ תרגול טעויות'));

const stubs = `
const document = {
  querySelector() { return null; }, querySelectorAll() { return []; },
  addEventListener() {}, documentElement: { removeAttribute() {}, setAttribute() {} }
};
const window = { localStorage: null, sessionStorage: null, addEventListener() {} };
const navigator = {};
function matchMedia() { return { matches: false, addEventListener() {} }; }
const Cloud = { enabled: false, current() { return null; } };
const GameMap = { haversine(a, b, c, d) { return Math.hypot(a - c, b - d); } };
`;

const check = `
(() => {
  const errors = [];
  const pathModes = new Set(['routes', 'streams', 'folds', 'bounds']);
  const fingerprint = q => [q.kind, q.text, questionAnswer(q)].join('|');
  const label = (mode, diff, level, pos) =>
    mode + (BY_DIFF.has(mode) ? ':' + diff : '') + ' שלב ' + level + ', שאלה ' + pos;

  SAVE.guideQ = 0;
  for (const mode of MODES.map(m => m.id)) {
    const diffs = BY_DIFF.has(mode) ? [1, 2, 3] : [1];
    for (const diff of diffs) {
      for (let level = 1; level <= levelCount(mode, diff); level++) {
        const raw = buildQuestionsRaw(mode, level, diff);
        const qs = buildQuestions(mode, level, diff);
        const again = buildQuestions(mode, level, diff);
        const a = raw.map(fingerprint).sort();
        const b = qs.map(fingerprint).sort();
        if (JSON.stringify(a) !== JSON.stringify(b)) {
          errors.push(label(mode, diff, level, 0) + ': הערבוב שינה את מאגר השאלות');
        }
        if (JSON.stringify(qs.map(fingerprint)) !== JSON.stringify(again.map(fingerprint))) {
          errors.push(label(mode, diff, level, 0) + ': סדר השאלות אינו יציב');
        }
        if (mode === 'guide') continue;
        for (let i = 1; i < qs.length; i++) {
          if (sharesQuestionKey(qs[i - 1], qs[i])) {
            errors.push(label(mode, diff, level, i + 1) + ': אותו נושא מופיע ברצף');
          }
          if (revealsNextAnswer(qs[i - 1], qs[i])) {
            errors.push(label(mode, diff, level, i + 1) + ': התשובה נחשפה במשוב הקודם');
          }
        }
      }
    }
  }

  /* במצבי התוואי דורשים שתי שאלות מלאות בין חזרות, גם כשהחזרה
     חוצה את הגבול בין שני שלבים. */
  for (const mode of pathModes) {
    const qs = pathSequence(mode);
    for (let i = 0; i < qs.length; i++) {
      for (let back = 1; back <= 2 && i - back >= 0; back++) {
        if (sharesQuestionKey(qs[i - back], qs[i])) {
          errors.push(mode + ': הנושא חזר אחרי ' + back + ' שאלות בלבד');
        }
      }
      const key = questionPrimaryKey(qs[i], i);
      const first = qs.findIndex((q, j) => questionPrimaryKey(q, j) === key);
      if (key.startsWith('path:') && first === i && qs[i].kind !== 'mapPath') {
        errors.push(mode + ': שאלת ידע הופיעה לפני שאלת האיתור של ' + key);
      }
    }
  }

  /* אחרי שאלת מיקום מוצגת עובדת האתר. גם ממנה, וגם בין שלוש שאלות
     ההדרכה, אסור להעתיק תשובה ישירות למסך הבא. */
  for (const site of SITES) {
    let prior = site.f || '';
    for (const row of orderedGuideRows(site, prior)) {
      const answer = String(row[2] || '');
      if (answer.length >= 5 && prior.includes(answer)) {
        errors.push('הדרכה · ' + site.n + ': התשובה נחשפה במשוב הקודם');
      }
      prior = String(row[6] || row[2] || '');
    }
  }

  return errors;
})()
`;

const source = stubs + files.map(read).join('\n') + '\n' + game + '\n' + check;
const errors = vm.runInNewContext(source, { setTimeout, clearTimeout, Date, Math, Map, Set },
  { timeout: 30000 });

if (errors.length) {
  console.log('נמצאו בעיות בסדר השאלות:');
  errors.forEach(e => console.log('  ✗ ' + e));
  process.exitCode = 1;
} else {
  console.log('סדר השאלות תקין: אין תשובה עוקבת שנחשפת מראש ✓');
}
