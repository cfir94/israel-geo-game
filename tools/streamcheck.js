const {chromium}=require('playwright');const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
 const c=await b.newContext();
 const p=await c.newPage(); const errs=[];
 p.on('pageerror',e=>errs.push(e.message));
 await p.goto('http://localhost:8907/index.html',{waitUntil:'load'}); await sleep(1200);
 const r=await p.evaluate(()=>{
   const dupIds = STREAMS.length - new Set(STREAMS.map(s=>s.id)).size;
   const badQ = STREAM_Q.filter(q=>!STREAM_BY_ID[q.s]).map(q=>q.s);
   const newIds=['gaaton','beitHaEmek','naaman','oren','mearot','dalia','hadera','poleg','evtach'];
   const missing = newIds.filter(id=>!STREAM_BY_ID[id]);
   const badPaths = STREAMS.filter(s=>!Array.isArray(s.path)||s.path.length<2||s.path.some(pt=>pt.length!==2||isNaN(pt[0])||isNaN(pt[1])));
   return {
     total: STREAMS.length, totalQ: STREAM_Q.length,
     dupIds, badQ, missing, badPaths: badPaths.map(s=>s.id)
   };
 });
 console.log(JSON.stringify(r,null,2));
 console.log('שגיאות דפדפן:', errs.length?errs.join(' | '):'אין');
 await b.close();
})();
