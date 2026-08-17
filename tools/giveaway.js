/* מאתר שאלות "מה הגבוה/הארוך/הגדול ביותר" שבהן כל מסיח נושא מספר,
   ולכן אפשר לענות בלי לדעת דבר – פשוט לבחור את המספר הקיצוני. */
const fs=require('fs'), vm=require('vm');
const src=['data.js','geology.js','guide.js','routes.js','structure.js','history.js','periods.js']
  .map(f=>fs.readFileSync('js/'+f,'utf8')).join('\n');
const D=vm.runInNewContext(src+`
;({TRIVIA, GEO_TRIVIA: typeof GEO_TRIVIA!=='undefined'?GEO_TRIVIA:[],
   ROUTE_Q: typeof ROUTE_Q!=='undefined'?ROUTE_Q:[],
   STREAM_Q: typeof STREAM_Q!=='undefined'?STREAM_Q:[],
   STRUCT_Q: typeof STRUCT_Q!=='undefined'?STRUCT_Q:[],
   HISTORY_Q: typeof HISTORY_Q!=='undefined'?HISTORY_Q:[],
   PERIOD_Q: typeof PERIOD_Q!=='undefined'?PERIOD_Q:[],
   GUIDE: typeof GUIDE!=='undefined'?GUIDE:(typeof GUIDE_Q!=='undefined'?GUIDE_Q:[])})`,
  {}, {timeout:20000});

const SUP=/הגבוה|הנמוך|הארוך|הגדול|הקטן|העמוק|הרחב|המרבי|ביותר/;
/* "כ-1,020" אינו מינוס: מקף אחרי אות עברית הוא מקף חיבור, לא סימן */
const num=s=>{const m=String(s).replace(/,/g,'').replace(/([\u05d0-\u05ea])-(?=\d)/g,'$1 ')
  .match(/-?\d+(\.\d+)?/g);return m?m.map(Number):[];};

function check(name, rows, get){
  const bad=[];
  (rows||[]).forEach((r,i)=>{
    const o=get(r); if(!o||!o.q||!o.a||!o.w||!o.w.length) return;
    if(!SUP.test(o.q)) return;
    const opts=[o.a,...o.w];
    if(!opts.every(x=>num(x).length)) return;
    /* שאלה שכל תשובותיה כמות בלבד ("כ-43 מ׳") היא שאלה מספרית
       לגיטימית – אין בה שם להסתיר, והמספר הוא התשובה עצמה. */
    const bare=x=>!/[\u05d0-\u05ea]{3,}/.test(String(x).replace(/^כ-?\s*/,'').replace(/מ׳|מטר(ים)?|ק״מ|קמ״ר|%/g,''));
    if(opts.every(bare)) return;
    const vals=opts.map(x=>Math.max(...num(x)));
    const wantHigh=/הגבוה|הארוך|הגדול|העמוק|הרחב|המרבי/.test(o.q);
    const extreme=wantHigh?Math.max(...vals):Math.min(...vals);
    if(vals.filter(v=>v===extreme).length!==1) return;
    bad.push({i,...o, why: vals[0]===extreme
      ? 'המספר הקיצוני הוא התשובה – מסגירה'
      : 'המספר הקיצוני הוא מסיח – מטעה'});
  });
  if(bad.length){
    console.log('\n== '+name+' ('+bad.length+') ==');
    bad.forEach(b=>{console.log('  ['+b.i+'] '+b.q);console.log('      ✔ '+b.a);
      b.w.forEach(x=>console.log('      ✘ '+x));console.log('      → '+b.why);});
  }
  return bad.length;
}
let n=0;
n+=check('TRIVIA', D.TRIVIA, r=>r);
n+=check('GEO_TRIVIA', D.GEO_TRIVIA, r=>r);
n+=check('ROUTE_Q', D.ROUTE_Q, r=>r);
n+=check('STREAM_Q', D.STREAM_Q, r=>r);
n+=check('STRUCT_Q', D.STRUCT_Q, r=>r);
n+=check('HISTORY_Q', D.HISTORY_Q, r=>r);
n+=check('PERIOD_Q', (D.PERIOD_Q||[]).filter(r=>!r.order), r=>r);
const gq=[]; const walk=v=>{if(Array.isArray(v)){if(typeof v[1]==='string'&&typeof v[2]==='string')gq.push(v);else v.forEach(walk);}
  else if(v&&typeof v==='object')Object.values(v).forEach(walk);};
walk(D.GUIDE);
n+=check('GUIDE ('+gq.length+' שאלות)', gq, r=>({q:r[1],a:r[2],w:r.slice(3,6).filter(x=>typeof x==='string')}));
console.log('\nסה״כ: '+n+' שאלות שאפשר לענות עליהן לפי המספר בלבד');
