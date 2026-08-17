const {chromium}=require('playwright');const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
 const c=await b.newContext();
 const p=await c.newPage(); const errs=[];
 p.on('pageerror',e=>errs.push(e.message));
 p.on('console',m=>{if(m.type()==='error'&&!/assets\/icon\.png/.test(m.location().url))errs.push(m.text());});
 await p.goto('http://localhost:8907/index.html',{waitUntil:'load'}); await sleep(1200);

 const r = await p.evaluate(()=>{
   const out = { periods: PERIODS.length, total: PERIOD_Q.length, byTier: {1:0,2:0,3:0},
     orderCount:0, factCount:0, badOrderIds:[] };
   PERIOD_Q.forEach(q=>{
     out.byTier[q.t]++;
     if(q.order){ out.orderCount++; q.order.forEach(id=>{ if(!PERIOD_BY_ID[id]) out.badOrderIds.push(id); }); }
     else out.factCount++;
   });
   // ודא שהמערך PERIODS באמת בסדר כרונולוגי לפי range (בדיקה ידנית של סדר ה-i)
   out.periodOrder = PERIODS.map(p=>p.id);

   out.levels = {}; [1,2,3].forEach(d=>{ out.levels[d] = levelCount('periods', d); });

   out.questions = [];
   [1,2,3].forEach(d=>{
     for(let lv=1; lv<=levelCount('periods',d); lv++){
       let qs=[]; try{ qs = buildQuestions('periods', lv, d); } catch(e){ out.questions.push({err:e.message, d, lv}); continue; }
       qs.forEach(q => out.questions.push({d, lv, kind:q.kind, opts:q.options.length,
         correct: q.options.filter(o=>o.correct).length, text:q.text.slice(0,40), hasExplain: !!q.explain}));
     }
   });
   return out;
 });
 console.log('תקופות:', r.periods, '· שאלות:', r.total, '(סדר:', r.orderCount, '· עובדה:', r.factCount, ') · לפי רמה:', JSON.stringify(r.byTier));
 console.log('סדר תקופות:', r.periodOrder.join(' < '));
 console.log('שלבים לכל קושי:', JSON.stringify(r.levels));
 console.log('order id-ים שגויים:', r.badOrderIds.length ? r.badOrderIds.join(',') : 'אין');
 const bad = r.questions.filter(q => q.err || (q.opts !== 2 && q.opts !== 4) || q.correct !== 1 || !q.hasExplain);
 console.log('שאלות שנבנו בפועל:', r.questions.length, '· בעייתיות:', bad.length);
 bad.forEach(b => console.log('  ✗', JSON.stringify(b)));
 console.log('שגיאות דפדפן:', errs.length ? errs.join(' | ') : 'אין');
 await b.close();
 process.exit(bad.length || errs.length || r.badOrderIds.length ? 1 : 0);
})();
