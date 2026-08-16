const {chromium}=require('playwright');const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
 // מכשיר קטן וצפוף – iPhone SE בערך, עם שורת כתובת גלויה
 const c=await b.newContext({viewport:{width:375,height:600},deviceScaleFactor:2,locale:'he-IL',colorScheme:'dark'});
 await c.addInitScript(()=>{try{localStorage.setItem('israel-geo-game-v1',JSON.stringify({welcomed:1}));}catch(e){}});
 const p=await c.newPage();
 await p.goto('http://localhost:8907/index.html',{waitUntil:'load'}); await sleep(1200);

 // בודקים את כל השאלות של routes ו-streams, בכל הרמות, לא רק הראשונה
 const results=await p.evaluate(()=>{
   const out=[];
   ['routes','streams','folds','bounds'].forEach(mode=>{
     for(let lv=1; lv<=levelCount(mode); lv++){
       let qs=[]; try{qs=buildQuestions(mode,lv,1);}catch(e){continue;}
       qs.filter(q=>q.mapMode==='pathHidden').forEach(q=>out.push({mode,q}));
     }
   });
   return out.length;
 });
 console.log('שאלות pathHidden שנבדקות: '+results);

 await p.evaluate(()=>{ startGame('routes',1); });
 await sleep(700);

 let clipped=0, checked=0;
 for (const mode of ['routes','streams','folds','bounds']) {
 for (let lv=1; lv<=6; lv++) {
   const n = await p.evaluate(({m,lv})=>{ startGame(m,lv); return G.qs.filter(q=>q.mapMode==='pathHidden').length; }, {m:mode,lv});
   for (let i=0;i<n;i++){
     const r = await p.evaluate(({m,lv,i})=>{
       startGame(m,lv);
       const qs=G.qs.filter(q=>q.mapMode==='pathHidden');
       const q=qs[i]; if(!q) return null;
       G.idx=G.qs.indexOf(q);
       award(q, 100, true, 'נכון!');
       const scr=document.getElementById('screen-play');
       const fb=document.getElementById('feedback');
       return { mode:m, lv, clipped: fb.scrollHeight > fb.clientHeight,
         canScroll: scr.scrollHeight > scr.clientHeight,
         fbLen:(q.explain||'').length };
     }, {m:mode, lv, i});
     if(!r) continue;
     checked++;
     if(r.clipped && !r.canScroll){ clipped++; console.log('✗ עדיין נחתך בלי אפשרות גלילה:', JSON.stringify(r)); }
   }
 }
 }
 console.log('נבדקו: '+checked+' · נחתכות בלי גלילה: '+clipped);

 // צילום מסך אמיתי אחרי גלילה ידנית לתחתית
 await p.evaluate(()=>{ startGame('routes',1);
   const q=G.qs.find(x=>x.mapMode==='pathHidden'); G.idx=G.qs.indexOf(q); award(q,100,true,'נכון!'); });
 await sleep(500);
 await p.evaluate(()=>document.getElementById('screen-play').scrollTo({top:9999}));
 await sleep(300);
 await p.screenshot({path:__dirname+'/shots/scroll-fixed.png'});

 await b.close();
 process.exit(clipped?1:0);
})();
