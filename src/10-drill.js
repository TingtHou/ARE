
/* ================= ENDLESS PRACTICE (#drill) =================
   Pick PA, PPD or PDD and answer one question after another until you finish. Questions and objectives you miss
   come up more often; with ChatGPT or Claude in the page, about one in three questions is newly written for your
   weakest objectives (saved to My material, so later sessions have a bigger pool). Answers count like Practice:
   misses go into the Mistakes schedule. */
const DRILL_RECENT=8, DRILL_NEW_EVERY=3;
let DR=null;   // the running session
const drillPool=d=>ITEMS.filter(q=>q.d===d);
/* miss rate per objective, from every answer so far */
function objMiss(d){
  const o={}; drillPool(d).forEach(q=>{const a=S.ans[q.id];if(!a)return;const x=o[q.o]=o[q.o]||{n:0,miss:0};x.n++;if(!a.ok)x.miss++;});
  Object.values(o).forEach(x=>{x.rate=x.n?x.miss/x.n:0;}); return o;
}
function drillWeight(q,om,now){
  const a=S.ans[q.id], m=S.mist[q.id]; let w=1;
  if(!a)w*=2; else if(!a.ok)w*=5;
  if(m&&!m.fixed){w+=4;if(m.due<=now)w+=3;}
  if(a&&a.ok&&now-a.at<DAY)w*=0.3;
  if(DR&&DR.rightIds.has(q.id))w*=0.3;
  const x=om[q.o]; if(x)w*=1+2*x.rate;
  return w;
}
function drillPick(d){
  const now=Date.now(), om=objMiss(d), pool=drillPool(d);
  const keep=Math.min(DRILL_RECENT,Math.max(0,pool.length-3));
  const recent=new Set(DR.recent.slice(-keep));
  const cand=pool.filter(q=>!recent.has(q.id)); if(!cand.length)return pool[0]||null;
  const ws=cand.map(q=>drillWeight(q,om,now)), tot=ws.reduce((a,b)=>a+b,0);
  let r=Math.random()*tot; for(let i=0;i<cand.length;i++){r-=ws[i];if(r<=0)return cand[i];}
  return cand[cand.length-1];
}
/* the objective to write new questions for: weakest first, then the least covered */
function drillTargetObj(d){
  const om=objMiss(d), objs=divOutline(d).flatMap(s=>s.objs); if(!objs.length)return null;
  const count=o=>ITEMS.filter(q=>q.o===o).length;
  const ws=objs.map(o=>{const x=om[o];return (x?1+4*x.rate*Math.min(x.miss,4):1)+3/(1+count(o));});
  const tot=ws.reduce((a,b)=>a+b,0); let r=Math.random()*tot;
  for(let i=0;i<objs.length;i++){r-=ws[i];if(r<=0)return objs[i];} return objs[0];
}
async function drillWrite(d){
  const o=drillTargetObj(d); if(!o)return [];
  const ex=styleExamples(o,d).map(q=>JSON.stringify(Object.assign({division:q.d,objective:q.o.split(' ')[1]||''},packOf(q)))).join('\n');
  const have=ITEMS.filter(q=>q.o===o).slice(-12).map(q=>'- '+strip(q.s).slice(0,140)).join('\n');
  const prompt='Write 3 new ARE '+d+' practice questions on objective '+o+' ('+objTitle(o)+'), each in a different format where it fits. Leave "points" and "cards" empty. Use division "'+d+'" and objective "'+o.split(' ')[1]+'".\n'+
    FORMAT_RULES+'\nUse "num" only for real calculations.\nMatch the style, depth and tone of these example questions from the student\'s bank (don\'t copy them):\n'+(ex||'(none)')+
    (have?'\nDon\'t repeat these existing questions on this objective:\n'+have:'')+'\nTitle: "'+o+' · endless practice".';
  const j=await aiJson({system:AI_SYS,messages:[{role:'user',content:prompt}],effort:'medium',maxTokens:16000,schema:PACK_SCHEMA,signal:DR&&DR.ctl.signal});
  const probs=[], out=[];
  (j.questions||[]).forEach((x,k)=>{const p=packQuestion(Object.assign({},x,{division:d,objective:x.objective&&/\d+\.\d+/.test(x.objective)?d+' '+(String(x.objective).match(/\d+\.\d+/)[0]):o}),'New question '+(k+1),probs);
    if(!p)return; const id=newUid()+k; customSet('items',id,Object.assign(itemFromPack(p),{at:Date.now(),gen:'drill'})); const it=ITEM(id); if(it)out.push(it);});
  return out;
}
function drillRefill(){
  if(!DR||!DR.useAi||DR.writing||DR.fresh.length>=2||!aiReady())return;
  DR.writing=true;
  drillWrite(DR.d).then(list=>{if(!DR)return;DR.fresh.push(...list);DR.made+=list.length;DR.aiNote='';})
    .catch(e=>{if(!DR||e&&e.aborted)return;DR.aiNote=(e&&e.message)||'Couldn’t write new questions right now.';DR.aiFails++;if(DR.aiFails>=3)DR.useAi=false;})
    .finally(()=>{if(DR){DR.writing=false;paintDrillBar();}});
}

/* ---------- screens ---------- */
function initDrill(){
  if(DR&&DR.ctl)DR.ctl.abort(); DR=null;
  const ai=aiReady(), hist=S.drill||{};
  view.innerHTML='<div class="eyebrow">Study · until you stop</div><h1 class="t">Endless practice</h1>'+
    '<p class="lede">Pick a division and answer one question after another. Questions you miss, and objectives where you miss often, come up more. Answers count like Practice: misses go into your Mistakes schedule.</p>'+
    '<div class="drillpick">'+DIVS.map(d=>{const pool=drillPool(d), om=objMiss(d), h=hist[d];
      const weak=Object.entries(om).filter(([,x])=>x.miss).sort((a,b)=>b[1].rate*b[1].miss-a[1].rate*a[1].miss).slice(0,3).map(([o])=>o);
      return '<button type="button" class="drillcard" data-dstart="'+d+'"><span class="pill '+d.toLowerCase()+'">'+d+'</span><b>'+esc((EXAMS.find(e=>e.d===d)||{n:d}).n)+'</b>'+
        '<span class="small">'+pool.length+' questions'+(h?' · last time '+(h.lastAnswered?Math.round(h.lastCorrect/h.lastAnswered*100)+'% of '+h.lastAnswered:'—'):'')+'</span>'+
        (weak.length?'<span class="small dvweak">Weak: '+weak.join(', ')+'</span>':'')+'</button>';}).join('')+'</div>'+
    (ai?'<label class="pass" style="margin:12px 0"><input type="checkbox" id="drAi" checked> Mix in new questions written by '+AI_NAME()+' (about 1 in '+DRILL_NEW_EVERY+', aimed at your weak objectives; they are saved to My material)</label>'
       :'<p class="small" style="margin:12px 0">Connect ChatGPT on this site (or use the claude.ai link) to mix in newly written questions. <a href="#aihelp">AI setup</a></p>');
  view.onclick=e=>{const b=e.target.closest('[data-dstart]');if(b)startDrill(b.dataset.dstart,ai&&!!($('#drAi')||{}).checked);};
}
function startDrill(d,useAi){
  DR={d,useAi,ctl:new AbortController(),recent:[],rightIds:new Set(),fresh:[],writing:false,made:0,aiFails:0,aiNote:'',n:0,ok:0,streak:0,best:0,sinceNew:0,missedObjs:{},cur:null,answered:false,started:Date.now()};
  view.innerHTML='<div class="drillhd" id="drHd"></div><div id="drQ"></div>';
  view.onclick=e=>{const b=e.target.closest('[data-dr]');if(!b)return;
    if(b.dataset.dr==='next')drillNext();
    if(b.dataset.dr==='finish')finishDrill();
    if(b.dataset.dr==='learn'){const it=ITEM(b.dataset.id);if(it)learnLoop(b.closest('.drsum')||view,it);}
    if(b.dataset.dr==='again')startDrill(d,useAi);
    if(b.dataset.dr==='menu')initDrill();};
  document.onkeydown=e=>{if(curPage!=='drill'||!DR){document.onkeydown=null;return;}
    if(e.key==='Enter'&&DR.answered&&!e.target.closest('input,textarea,select')){e.preventDefault();drillNext();}};
  drillRefill(); drillNext();
}
function paintDrillBar(){
  const h=$('#drHd'); if(!h||!DR)return;
  const acc=DR.n?Math.round(DR.ok/DR.n*100)+'%':'—';
  h.innerHTML='<span class="pill '+DR.d.toLowerCase()+'">'+DR.d+'</span><span><b>'+DR.n+'</b> answered</span><span><b>'+DR.ok+'</b> right</span><span><b>'+acc+'</b></span><span>streak <b>'+DR.streak+'</b></span>'+
    (DR.cur&&DR.cur.gen==='drill'?'<span class="chip c-ok">new</span>':'')+(DR.writing?'<span class="small">writing new questions…</span>':DR.aiNote?'<span class="small" title="'+esc(DR.aiNote)+'">bank questions only for now</span>':'')+
    '<button type="button" class="btn sm" data-dr="finish">Finish</button>';
}
function drillNext(){
  if(!DR)return;
  // about one in three is new, when a newly written question is waiting
  let it=null;
  if(DR.fresh.length&&DR.sinceNew>=DRILL_NEW_EVERY-1){it=DR.fresh.shift();DR.sinceNew=0;}
  if(!it){it=drillPick(DR.d);DR.sinceNew++;}
  if(!it){$('#drQ').innerHTML='<div class="panel empty">There are no '+DR.d+' questions yet. Add some on My material, or connect ChatGPT to have them written.</div>';return;}
  const raw=(S.custom&&S.custom.items&&S.custom.items[it.id])||{};
  DR.cur=Object.assign({},it,{gen:raw.gen}); DR.answered=false;
  DR.recent.push(it.id); if(DR.recent.length>40)DR.recent.shift();
  const q=$('#drQ'); q.innerHTML='';
  const el=itemEl(it,it.id,{live:true,fresh:true,drill:true,onResult:ok=>{
    DR.n++; DR.answered=true;
    if(ok){DR.ok++;DR.streak++;DR.best=Math.max(DR.best,DR.streak);DR.rightIds.add(it.id);}
    else{DR.streak=0;(DR.missedObjs[it.o]=DR.missedObjs[it.o]||[]).push(it.id);}
    paintDrillBar();
    q.insertAdjacentHTML('beforeend','<div class="row drnext"><button type="button" class="btn pri" data-dr="next">Next question →</button><span class="small">or press Enter</span></div>');
    drillRefill();
  }});
  el.id='dr-'+it.id; q.appendChild(el);
  paintDrillBar(); window.scrollTo(0,0);
  drillRefill();
}
function finishDrill(){
  if(!DR)return; const d=DR.d, s=DR;
  if(s.ctl)s.ctl.abort();
  S.drill=S.drill||{}; const h=S.drill[d]=S.drill[d]||{sessions:0,answered:0,correct:0};
  if(s.n){h.sessions++;h.answered+=s.n;h.correct+=s.ok;h.lastAnswered=s.n;h.lastCorrect=s.ok;h.last=Date.now();save();}
  DR=null; document.onkeydown=null;
  const missed=Object.entries(s.missedObjs);
  view.innerHTML='<div class="eyebrow">Endless practice · '+d+'</div><h1 class="t">'+(s.n?s.ok+' of '+s.n+' right':'No questions answered')+'</h1>'+
    '<div class="stats dvstats">'+stat(s.n,'answered')+stat(s.n?Math.round(s.ok/s.n*100)+'%':'—','accuracy')+stat(s.best,'best streak')+stat(s.made,'new questions written')+stat(Math.round((Date.now()-s.started)/60000)+' min','time')+'</div>'+
    (missed.length?'<h2 class="s">Missed this session</h2><div class="drsum">'+missed.map(([o,ids])=>'<div class="dvrow weak"><span class="obj">'+esc(o)+'</span><span class="dvt"><b>'+esc(objTitle(o))+'</b><span class="small">missed '+ids.length+'× · they come back more often next time</span></span><span class="mb"><button type="button" class="lnk" data-onotes="'+esc(o)+'">Reread</button><button type="button" class="lnk" data-dr="learn" data-id="'+esc(ids[ids.length-1])+'">Learn it</button></span></div>').join('')+'</div>':'')+
    '<div class="row" style="margin-top:16px"><button type="button" class="btn pri" data-dr="again">Keep going with '+d+'</button><button type="button" class="btn" data-dr="menu">Choose another division</button><a class="btn" href="#mistakes">Mistakes</a></div>';
  view.onclick=e=>{const b=e.target.closest('[data-dr],[data-onotes]');if(!b)return;
    if(b.dataset.onotes){gotoObj(b.dataset.onotes);return;}
    if(b.dataset.dr==='again')startDrill(d,s.useAi);
    if(b.dataset.dr==='menu')initDrill();
    if(b.dataset.dr==='learn'){const it=ITEM(b.dataset.id);if(it)learnLoop(b.closest('.dvrow').parentNode,it);}};
}
