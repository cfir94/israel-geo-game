const {chromium}=require('playwright');const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
 const c=await b.newContext({viewport:{width:412,height:900},deviceScaleFactor:2,locale:'he-IL',colorScheme:'dark',
   hasTouch:true, isMobile:true});
 await c.addInitScript(()=>{try{localStorage.setItem('israel-geo-game-v1',JSON.stringify({welcomed:1}));}catch(e){}});
 const p=await c.newPage(); const errs=[]; const log=[],fails=[];
 const ok=(n,cond,x='')=>{log.push((cond?'  ✓ ':'  ✗ ')+n+(x?' — '+x:'')); if(!cond)fails.push(n);};
 p.on('pageerror',e=>errs.push('PAGEERROR: '+e.message));
 p.on('console',m=>{if(m.type()==='error'&&!/assets\/icon\.png/.test(m.location().url))errs.push(m.text());});
 await p.goto('http://localhost:8907/index.html',{waitUntil:'load'}); await sleep(1200);

 const openTl = async () => p.evaluate(()=>{
   for(const d of [1,2,3]) for(let lv=1; lv<=levelCount('periods',d); lv++){
     const qs=buildQuestions('periods',lv,d);
     if(qs.some(q=>q.kind==='timeline')){ startGame('periods',lv,{diff:d});
       G.idx=G.qs.findIndex(q=>q.kind==='timeline'); renderQuestion();
       return G.qs[G.idx].tl.items.map(i=>i.label); }
   }
 });

 const labels = await openTl(); await sleep(500);
 console.log('פריטים (בסדר הנכון):', labels.join(' → '));

 // --- לחיצה ---
 const firstChip = await p.locator('#tl-bank .tl-chip').first();
 const tapLabel = await firstChip.textContent();
 await firstChip.click(); await sleep(300);
 const afterTap = await p.evaluate(()=>({
   placed: tlState.placed.slice(), bank: document.querySelectorAll('#tl-bank .tl-chip').length,
   inSlot0: (document.querySelector('#tl-slots .tl-slot')||{}).textContent
 }));
 ok('לחיצה מציבה במשבצת הראשונה הפנויה', afterTap.placed[0]!==null, 'משבצת 1: '+afterTap.inSlot0);
 ok('הפריט ירד מהבנק', afterTap.bank===labels.length-1, afterTap.bank+' נשארו');

 // לחיצה על שבב שהוצב מחזירה אותו לבנק
 await p.locator('#tl-slots .tl-chip').first().click(); await sleep(300);
 const afterUntap = await p.evaluate(()=>({placed:tlState.placed.slice(), bank:document.querySelectorAll('#tl-bank .tl-chip').length}));
 ok('לחיצה על שבב מוצב מחזירה אותו לבנק', afterUntap.placed[0]===null && afterUntap.bank===labels.length);

 // --- גרירה אמיתית מהבנק למשבצת 3 ---
 const chip = p.locator('#tl-bank .tl-chip').first();
 const dragLabel = (await chip.textContent()).trim();
 const cb = await chip.boundingBox();
 const lastSlot = p.locator('#tl-slots .tl-slot').last();
 const sb = await lastSlot.boundingBox();
 await p.mouse.move(cb.x+cb.width/2, cb.y+cb.height/2);
 await p.mouse.down();
 await p.mouse.move(cb.x+cb.width/2+20, cb.y+cb.height/2-20, {steps:5});
 const flying = await p.evaluate(()=>document.querySelectorAll('.tl-chip.flying').length);
 ok('נוצר שבב מרחף בזמן גרירה', flying===1, flying+'');
 await p.mouse.move(sb.x+sb.width/2, sb.y+sb.height/2, {steps:8});
 const over = await p.evaluate(()=>document.querySelectorAll('#tl-slots .tl-slot.over').length);
 ok('המשבצת שמתחת לאצבע מודגשת', over===1, over+'');
 await p.mouse.up(); await sleep(300);
 const afterDrag = await p.evaluate(()=>({
   placed: tlState.placed.slice(),
   lastText: document.querySelectorAll('#tl-slots .tl-slot')[tlState.placed.length-1].textContent.trim(),
   flying: document.querySelectorAll('.tl-chip.flying').length
 }));
 ok('גרירה הציבה במשבצת שאליה נגררה', afterDrag.placed[labels.length-1]!==null, 'משבצת אחרונה: '+afterDrag.lastText);
 ok('הגרירה הציבה את השבב הנכון', afterDrag.lastText===dragLabel, dragLabel);
 ok('לא נשאר שבב מרחף', afterDrag.flying===0);

 await p.screenshot({path:__dirname+'/shots/tl-dragged.png'});

 // --- גרירה בין משבצות = החלפה ---
 await openTl(); await sleep(400);
 await p.evaluate(()=>{ const q=G.qs[G.idx]; tlState.placed[0]=0; tlState.placed[1]=1; tlPaint(q); });
 await sleep(200);
 const s0 = await p.locator('#tl-slots .tl-slot').nth(0).boundingBox();
 const s1 = await p.locator('#tl-slots .tl-slot').nth(1).boundingBox();
 await p.mouse.move(s0.x+s0.width/2, s0.y+s0.height/2);
 await p.mouse.down();
 await p.mouse.move(s1.x+s1.width/2, s1.y+s1.height/2, {steps:8});
 await p.mouse.up(); await sleep(300);
 const swapped = await p.evaluate(()=>tlState.placed.slice(0,2));
 ok('גרירה בין משבצות מחליפה מקומות', swapped[0]===1 && swapped[1]===0, JSON.stringify(swapped));

 console.log(log.join('\n'));
 console.log('\nשגיאות דפדפן: '+(errs.length?errs.join(' | '):'אין'));
 console.log(fails.length?'נכשלו: '+fails.join(', '):'הכול עבר ✓');
 await b.close();
 process.exit(fails.length||errs.length?1:0);
})();
