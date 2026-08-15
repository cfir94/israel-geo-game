const {chromium}=require('playwright');const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
 const c=await b.newContext({viewport:{width:412,height:900},deviceScaleFactor:2,locale:'he-IL',colorScheme:'dark'});
 await c.addInitScript(()=>{try{localStorage.setItem('israel-geo-game-v1',JSON.stringify({welcomed:1}));}catch(e){}});
 const p=await c.newPage(); const errs=[];
 p.on('pageerror',e=>errs.push(e.message));
 await p.goto('http://localhost:8907/index.html',{waitUntil:'load'}); await sleep(1500);

 // כל שאלות השיא, כפי שהשחקן רואה אותן
 const rows=await p.evaluate(()=>{
   const out=[];
   for(let lv=1; lv<=levelCount('trivia'); lv++){
     buildQuestions('trivia',lv,1).forEach(q=>{
       if(!/הפסגה|הגבוה|הנקודה הגבוהה/.test(q.text)) return;
       out.push({q:q.text, opts:q.options.map(o=>o.label),
         correct:q.options.find(o=>o.correct).label, explain:q.explain});
     });
   }
   return out;
 });
 const NUM=/\d/;
 let bad=0;
 rows.forEach(r=>{
   const withNum=r.opts.filter(o=>NUM.test(o));
   const okOpts=withNum.length===0;
   const okExp=NUM.test(r.explain||'');
   if(!okOpts||!okExp) bad++;
   console.log((okOpts&&okExp?'  ✓ ':'  ✗ ')+r.q);
   console.log('      מסיחים: '+r.opts.join(' | '));
   console.log('      תשובה:  '+r.correct);
   console.log('      הסבר:   '+(r.explain||'(אין)'));
   if(!okOpts) console.log('      ✗ עדיין יש מספר במסיחים');
   if(!okExp)  console.log('      ✗ הגובה לא מופיע בהסבר');
 });
 console.log('\nשאלות שיא שנבדקו: '+rows.length+' · בעייתיות: '+bad);
 console.log('שגיאות דפדפן: '+(errs.length?errs.join(' | '):'אין'));
 await b.close();
 process.exit(bad||errs.length?1:0);
})();
