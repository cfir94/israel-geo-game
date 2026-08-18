const {chromium}=require('playwright');const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
 const c=await b.newContext({viewport:{width:412,height:900},deviceScaleFactor:2,locale:'he-IL',colorScheme:'dark'});
 await c.addInitScript(()=>{try{localStorage.setItem('israel-geo-game-v1',JSON.stringify({welcomed:1}));}catch(e){}});
 const p=await c.newPage(); const errs=[]; const log=[],fails=[];
 const ok=(n,cond,x='')=>{log.push((cond?'  ✓ ':'  ✗ ')+n+(x?' — '+x:'')); if(!cond)fails.push(n);};
 p.on('pageerror',e=>errs.push('PAGEERROR: '+e.message));
 p.on('console',m=>{if(m.type()==='error'&&!/assets\/icon\.png/.test(m.location().url))errs.push(m.text());});
 await p.goto('http://localhost:8907/index.html',{waitUntil:'load'}); await sleep(1200);

 // מוצאים שאלת ציר זמן ומציגים אותה
 const found = await p.evaluate(()=>{
   for(const d of [1,2,3]) for(let lv=1; lv<=levelCount('periods',d); lv++){
     const qs=buildQuestions('periods',lv,d);
     const i=qs.findIndex(q=>q.kind==='timeline');
     if(i>=0){ startGame('periods',lv,{diff:d}); const j=G.qs.findIndex(q=>q.kind==='timeline');
       G.idx=j; renderQuestion(); return {d,lv,text:G.qs[j].text, n:G.qs[j].tl.items.length}; }
   }
   return null;
 });
 console.log('שאלה שנבחרה:', JSON.stringify(found));
 await sleep(600);

 const ui = await p.evaluate(()=>({
   tlShown: !document.getElementById('timeline').hidden,
   slots: document.querySelectorAll('#tl-slots .tl-slot').length,
   bank: document.querySelectorAll('#tl-bank .tl-chip').length,
   from: document.getElementById('tl-from').textContent,
   to: document.getElementById('tl-to').textContent,
   confirmDisabled: document.getElementById('tl-confirm').disabled,
   ltr: getComputedStyle(document.getElementById('timeline')).direction,
   answersEmpty: document.getElementById('answers').children.length===0
 }));
 ok('הרכיב מוצג', ui.tlShown);
 ok('מספר משבצות = מספר פריטים', ui.slots===found.n, ui.slots+' משבצות');
 ok('כל הפריטים בבנק', ui.bank===found.n, ui.bank+' בבנק');
 ok('שנות הקצה מוצגות', !!ui.from && !!ui.to, ui.from+' → '+ui.to);
 ok('הציר LTR (מוקדם משמאל)', ui.ltr==='ltr', ui.ltr);
 ok('כפתור האישור נעול כשריק', ui.confirmDisabled);
 ok('אזור התשובות הרגיל ריק', ui.answersEmpty);
 await p.screenshot({path:__dirname+'/shots/tl-empty.png'});

 // ממלאים בסדר שגוי בכוונה (הפוך) ובודקים שנכשל
 await p.evaluate(()=>{
   const q=G.qs[G.idx];
   const n=q.tl.items.length;
   for(let s=0;s<n;s++) tlState.placed[s]=n-1-s;   // סדר הפוך
   tlPaint(q);
 });
 await sleep(200);
 const beforeWrong = await p.evaluate(()=>document.getElementById('tl-confirm').disabled);
 ok('כפתור האישור נפתח כשהכול מלא', !beforeWrong);
 await p.click('#tl-confirm'); await sleep(500);
 const wrongRes = await p.evaluate(()=>({
   answered:G.answered, ok:G.results[G.idx].ok,
   badSlots: document.querySelectorAll('#tl-slots .tl-slot.bad').length,
   fb: document.getElementById('feedback').textContent.slice(0,80)
 }));
 ok('סדר הפוך נחשב שגוי', wrongRes.answered && wrongRes.ok===false, 'ok='+wrongRes.ok);
 ok('משבצות שגויות מסומנות', wrongRes.badSlots>0, wrongRes.badSlots+' אדומות');
 await p.screenshot({path:__dirname+'/shots/tl-wrong.png'});

 // עכשיו סדר נכון בשאלה חדשה
 await p.evaluate(()=>{ advanceNow(); });
 await sleep(300);
 await p.evaluate(()=>{
   const j=G.qs.findIndex(q=>q.kind==='timeline');
   if(j>=0){ G.idx=j; renderQuestion(); }
 });
 await sleep(500);
 const hasTl2 = await p.evaluate(()=>G.qs[G.idx].kind==='timeline');
 if(hasTl2){
   await p.evaluate(()=>{
     const q=G.qs[G.idx];
     for(let s=0;s<q.tl.items.length;s++) tlState.placed[s]=s;   // הסדר הנכון
     tlPaint(q);
   });
   await sleep(150);
   await p.click('#tl-confirm'); await sleep(500);
   const rightRes = await p.evaluate(()=>({
     ok:G.results[G.idx].ok,
     okSlots: document.querySelectorAll('#tl-slots .tl-slot.ok').length,
     bankEmpty: document.getElementById('tl-bank').children.length===0,
     fb: document.getElementById('feedback').textContent
   }));
   ok('סדר נכון נחשב נכון', rightRes.ok===true);
   ok('כל המשבצות ירוקות', rightRes.okSlots>0, rightRes.okSlots);
   ok('הבנק התרוקן אחרי התשובה', rightRes.bankEmpty);
   ok('ההסבר כולל תאריכים', /\d/.test(rightRes.fb));
   ok('ההסבר מציין את התקופה', /תקופ/.test(rightRes.fb), rightRes.fb.slice(0,120));
   await p.screenshot({path:__dirname+'/shots/tl-right.png'});
 } else { ok('נמצאה שאלת ציר זמן שנייה', false); }

 console.log(log.join('\n'));
 console.log('\nשגיאות דפדפן: '+(errs.length?errs.join(' | '):'אין'));
 console.log(fails.length?'נכשלו: '+fails.join(', '):'הכול עבר ✓');
 await b.close();
 process.exit(fails.length||errs.length?1:0);
})();
