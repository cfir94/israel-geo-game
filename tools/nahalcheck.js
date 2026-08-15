const {chromium}=require('playwright');const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
 const c=await b.newContext({viewport:{width:412,height:900},deviceScaleFactor:2,locale:'he-IL'});
 await c.addInitScript(()=>{try{localStorage.setItem('israel-geo-game-v1',JSON.stringify({welcomed:1}));}catch(e){}});
 const p=await c.newPage(); const errs=[];
 p.on('pageerror',e=>errs.push(e.message));
 await p.goto('http://localhost:8907/index.html',{waitUntil:'load'}); await sleep(1500);
 const rows=await p.evaluate(()=>{
   const out=[];
   ['trivia','streams','guide'].forEach(m=>{
     for(const d of [1,2,3])
     for(let lv=1; lv<=levelCount(m,d); lv++){
       let qs=[]; try{qs=buildQuestions(m,lv,d);}catch(e){continue;}
       qs.forEach(q=>{
         const all=(q.options||[]).map(o=>o.label).join(' ');
         if(!/צין|פארן|בשור/.test(q.text+' '+all+' '+(q.explain||''))) return;
         if(out.some(o=>o.q===q.text&&o.mode===m))return;
         out.push({mode:m, q:q.text, correct:(q.options||[]).find(o=>o.correct)?.label,
                   opts:(q.options||[]).map(o=>o.label), explain:q.explain});
       });
     }
   });
   return out;
 });
 let bad=0;
 rows.forEach(r=>{
   const txt=r.q+' | '+r.correct+' | '+(r.explain||'');
   // התשובה הנכונה לעולם לא טוענת שצין הוא הארוך
   const wrong = /צין/.test(r.correct||'') && /הארוך/.test(r.correct||'')
     || /נחל צין/.test(r.correct||'') && /הארוך בנגב|הארוך בישראל/.test(r.q||'');
   if(wrong){bad++;}
   console.log((wrong?'  ✗ ':'  ✓ ')+'['+r.mode+'] '+r.q);
   console.log('       ✔ '+r.correct);
   console.log('       הסבר: '+(r.explain||'(אין)').slice(0,150));
 });
 console.log('\nשאלות שנוגעות לצין/פארן/בשור: '+rows.length+' · שגויות: '+bad);
 console.log('שגיאות דפדפן: '+(errs.length?errs.join(' | '):'אין'));
 await b.close(); process.exit(bad||errs.length?1:0);
})();
