/* סורק את כל טקסטי המשחק ומאתר שם הר שמופיע עם שני גבהים שונים.
   שני מספרים לאותו הר הם שגיאה עובדתית שהתלמיד ייתקל בה כסתירה. */
const fs=require('fs');
const files=['data.js','geology.js','guide.js','routes.js','structure.js','history.js','periods.js'];
const NAME=/((?:הר|רמת|פסגת)\s+[א-ת׳״'\-]+(?:\s+[א-ת]+)?)[^.]{0,24}?([\d,]{3,6})\s*מ׳/g;
const seen={};
files.forEach(f=>{
  const txt=fs.readFileSync('js/'+f,'utf8');
  let m; while((m=NAME.exec(txt))){
    const name=m[1].trim(), val=m[2].replace(/,/g,'');
    if(+val<50||+val>3000) continue;
    (seen[name] ||= []).push({val,f});
  }
});
let bad=0;
Object.entries(seen).forEach(([name,rows])=>{
  const vals=[...new Set(rows.map(r=>r.val))];
  if(vals.length>1){ bad++;
    console.log('✗ '+name+' מופיע עם '+vals.length+' גבהים שונים:');
    rows.forEach(r=>console.log('    '+r.val+' מ׳  ('+r.f+')'));
  }
});
console.log(bad? '\nסתירות: '+bad : 'אין סתירות בגבהים ✓  ('+Object.keys(seen).length+' שמות נבדקו)');
process.exit(bad?1:0);
