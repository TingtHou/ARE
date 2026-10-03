
/* ================= ENDLESS PRACTICE (#drill) =================
   Pick a division (PA, PPD, PDD, PcM or PjM) and answer one question after another until you finish. A question you
   get right leaves the rotation and returns only as a spaced memory check (see CHECK_DAYS). Questions and objectives you miss
   come up more often; with ChatGPT or Claude in the page, about one in three questions is newly written for your
   weakest objectives (saved to My material, so later sessions have a bigger pool). Answers count like Practice:
   misses go into the Mistakes schedule.
   A session is saved after every step (S.drill[d].run, synced like the rest of the progress), so leaving the page,
   closing the tab or pressing Stop keeps your place: opening Endless practice again continues the last session on
   the same question, with the same counts. "New session" starts over. */
const DRILL_RECENT=8, DRILL_NEW_EVERY=3;
let DR=null;   // the running session
function drillHist(d){S.drill=S.drill||{};return S.drill[d]=S.drill[d]||{sessions:0,answered:0,correct:0};}
/* save where the session is, and add its new answers to the division's totals */
function drillSave(){
  if(!DR)return; const h=drillHist(DR.d);
  if(DR.n>DR.counted.n){if(!DR.counted.n)h.sessions++;h.answered+=DR.n-DR.counted.n;h.correct+=DR.ok-DR.counted.ok;h.lastAnswered=DR.n;h.lastCorrect=DR.ok;h.last=Date.now();DR.counted={n:DR.n,ok:DR.ok};}
  h.run={n:DR.n,ok:DR.ok,streak:DR.streak,best:DR.best,made:DR.made,sinceNew:DR.sinceNew,recent:DR.recent.slice(-40),right:[...DR.rightIds],missed:DR.missedObjs,
    cur:DR.cur&&DR.cur.id,answered:DR.answered,curCheck:DR.curCheck,sinceCheck:DR.sinceCheck,checks:DR.checks,checksOk:DR.checksOk,fresh:DR.fresh.map(q=>q.id),useAi:DR.useAi,started:DR.started,mins:DR.mins+(Date.now()-DR.since)/60000,at:Date.now()};
  DR.mins=h.run.mins; DR.since=Date.now(); S.drill.lastDiv=DR.d; save();
}
const drillRun=d=>{const r=S.drill&&S.drill[d]&&S.drill[d].run;return r&&(r.n||r.cur)?r:null;};
function drillReset(d){const h=drillHist(d);delete h.run;save();}
const drillPool=d=>ITEMS.filter(q=>q.d===d);
/* miss rate per objective, from every answer so far */
function objMiss(d){
  const o={}; drillPool(d).forEach(q=>{const a=S.ans[q.id];if(!a)return;const x=o[q.o]=o[q.o]||{n:0,miss:0};x.n++;if(!a.ok)x.miss++;});
  Object.values(o).forEach(x=>{x.rate=x.n?x.miss/x.n:0;}); return o;
}
/* Same concept: a question and the similar ones written from it (learning loop, src link), or questions whose wording
   overlaps a lot (counted double inside one objective). Used to keep them apart and to ease off concepts you know. */
const DRILL_SPACE=6;   // look this many questions back for the same concept
const SIM_STOP=new Set('which what that this with from have will would should their there they been were when where about into than then them these those your following under each other more most only also does used uses using best first after before such being because based given shown below above according statement statements correct apply check three four'.split(' '));
const SIM_WORDS=new Map();
function simWords(q){let w=SIM_WORDS.get(q.id);if(!w){w=new Set((strip(String(q.s).replace(/<details[\s\S]*?<\/details>/g,' ')).toLowerCase().match(/[a-z][a-z0-9-]{3,}/g)||[]).filter(x=>!SIM_STOP.has(x)));SIM_WORDS.set(q.id,w);}return w;}
function simRoot(q){const C=(S.custom&&S.custom.items)||{};let id=q.id,k=0;while(C[id]&&C[id].src&&k++<5)id=C[id].src;return id;}
function sameConcept(a,b){
  if(a.id===b.id||simRoot(a)===simRoot(b))return true;
  const A=simWords(a),B=simWords(b); if(!A.size||!B.size)return false;
  let n=0;A.forEach(x=>{if(B.has(x))n++;}); const j=n/(A.size+B.size-n);
  return (a.o===b.o?2*j:j)>=0.35;
}
const rightRun=a=>a&&a.ok?(a.rs||1):0;   // answers saved before the count existed count as once
/* Learned = last answer right, and no mistake review due. Learned questions leave the regular rotation: they come back
   only as memory checks (about one question in five, when one is due), spaced out more each time you get them right
   in a row: 2 days, then 7, 21, 60. Miss a check and the question is back in rotation and in Mistakes. */
const CHECK_DAYS=[2,2,7,21,60], DRILL_CHECK_EVERY=5;
function learned(q,now){const a=S.ans[q.id],m=S.mist[q.id];return !!(a&&a.ok)&&!(m&&!m.fixed&&m.due<=now);}
const checkDue=q=>{const a=S.ans[q.id];return a.at+CHECK_DAYS[Math.min(rightRun(a),4)]*DAY;};
/* a memory check: the most overdue learned question that isn't close to what was just shown; early: even if none is due yet */
function drillCheckPick(d,now,early){
  const back=DR.recent.slice(-DRILL_SPACE).map(ITEM).filter(Boolean), seen=new Set(DR.recent.slice(-DRILL_RECENT));
  const L=drillPool(d).filter(q=>learned(q,now)&&!seen.has(q.id)&&!back.some(r=>sameConcept(q,r))).sort((a,b)=>checkDue(a)-checkDue(b));
  const due=L.filter(q=>checkDue(q)<=now);
  if(due.length)return due[Math.floor(Math.random()*Math.min(3,due.length))];
  return early&&L.length?L[0]:null;
}
function drillWeight(q,om,now,ctx){
  const a=S.ans[q.id], m=S.mist[q.id], due=m&&!m.fixed&&m.due<=now; let w=1;
  if(!a)w*=2; else if(!a.ok)w*=5;
  if(m&&!m.fixed){w+=4;if(due)w+=3;}
  const x=om[q.o]; if(x)w*=1+2*x.rate;
  // a concept you've got right twice in a row comes up less in its other questions too
  if(!due&&ctx.known.some(k=>k.id!==q.id&&sameConcept(q,k)))w*=0.5;
  // keep the same concept apart: nothing similar to the last few questions, and not the same objective twice running
  ctx.recent.forEach((r,k)=>{const dist=ctx.recent.length-k; if(sameConcept(q,r))w*=dist<=3?0.02:0.2; else if(r.o===q.o&&dist<=2)w*=dist===1?0.25:0.5;});
  return w;
}
function drillCtx(d){
  return {recent:DR.recent.slice(-DRILL_SPACE).map(ITEM).filter(Boolean),
    known:drillPool(d).filter(q=>rightRun(S.ans[q.id])>=2)};
}
/* the regular rotation: questions not answered yet, or missed last time (null when all of them were just shown) */
function drillPick(d){
  const now=Date.now(), om=objMiss(d), pool=drillPool(d).filter(q=>!learned(q,now)), ctx=drillCtx(d);
  const keep=Math.min(DRILL_RECENT,Math.max(2,pool.length-3));
  const recent=new Set(DR.recent.slice(-keep));
  const cand=pool.filter(q=>!recent.has(q.id)); if(!cand.length)return null;
  const ws=cand.map(q=>drillWeight(q,om,now,ctx)), tot=ws.reduce((a,b)=>a+b,0);
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
function initDrill(opts){
  if(DR&&DR.ctl)DR.ctl.abort(); DR=null;
  const ai=aiReady(), hist=S.drill||{};
  // coming back: pick up the last session where it stopped
  if(!(opts&&opts.menu)){const d=hist.lastDiv, r=d&&drillRun(d); if(r&&drillPool(d).length){startDrill(d,!!r.useAi&&ai,r);return;}}
  view.innerHTML='<div class="eyebrow">Study · until you stop</div><h1 class="t">Endless practice</h1>'+
    '<p class="lede">Pick a division and answer one question after another. A question you get right leaves the rotation and comes back only now and then as a <b>memory check</b>, later each time you get it right. Questions you miss, and objectives where you miss often, come up more. Answers count like Practice: misses go into your Mistakes schedule.</p>'+
    '<div class="drillpick">'+DIVS.map(d=>{const pool=drillPool(d), om=objMiss(d), h=hist[d], run=drillRun(d);
      const weak=Object.entries(om).filter(([,x])=>x.miss).sort((a,b)=>b[1].rate*b[1].miss-a[1].rate*a[1].miss).slice(0,3).map(([o])=>o);
      return '<button type="button" class="drillcard" data-dstart="'+d+'"><span class="pill '+d.toLowerCase()+'">'+d+'</span><b>'+esc((EXAMS.find(e=>e.d===d)||{n:d}).n)+'</b>'+
        '<span class="small">'+pool.length+' questions · '+pool.filter(q=>learned(q,Date.now())).length+' learned'+(run?' · <b>continue</b>: '+run.n+' answered'+(run.n?', '+Math.round(run.ok/run.n*100)+'%':''):h?' · last time '+(h.lastAnswered?Math.round(h.lastCorrect/h.lastAnswered*100)+'% of '+h.lastAnswered:'—'):'')+'</span>'+
        (weak.length?'<span class="small dvweak">Weak: '+weak.join(', ')+'</span>':'')+'</button>';}).join('')+'</div>'+
    (ai?'<label class="pass" style="margin:12px 0"><input type="checkbox" id="drAi" checked> Mix in new questions written by '+AI_NAME()+' (about 1 in '+DRILL_NEW_EVERY+', aimed at your weak objectives; they are saved to My material)</label>'
       :'<p class="small" style="margin:12px 0">Connect ChatGPT on this site (or use the claude.ai link) to mix in newly written questions. <a href="#aihelp">AI setup</a></p>');
  view.onclick=e=>{const b=e.target.closest('[data-dstart]');if(!b)return;const d=b.dataset.dstart,r=drillRun(d),want=ai&&!!($('#drAi')||{}).checked;startDrill(d,want,r);};
}
/* run: a saved session to continue (from S.drill[d].run), or nothing to start a new one */
function startDrill(d,useAi,run){
  const r=run||{}, now=Date.now();
  DR={d,useAi,ctl:new AbortController(),recent:(r.recent||[]).slice(),rightIds:new Set(r.right||[]),fresh:(r.fresh||[]).map(ITEM).filter(Boolean),writing:false,made:r.made||0,aiFails:0,aiNote:'',
    n:r.n||0,ok:r.ok||0,streak:r.streak||0,best:r.best||0,sinceNew:r.sinceNew||0,missedObjs:r.missed||{},cur:null,answered:false,started:r.started||now,mins:r.mins||0,since:now,
    counted:{n:r.n||0,ok:r.ok||0},sinceCheck:r.sinceCheck||0,checks:r.checks||0,checksOk:r.checksOk||0,curCheck:false};
  view.innerHTML='<div class="drillhd" id="drHd"></div>'+(run&&run.n?'<p class="small drresume">Continuing your '+d+' session from '+esc(new Date(run.at||now).toLocaleString([], {month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}))+'. <button type="button" class="lnk" data-dr="new">Start a new session</button></p>':'')+'<div id="drQ"></div>';
  view.onclick=e=>{const b=e.target.closest('[data-dr]');if(!b)return;
    if(b.dataset.dr==='next')drillNext();
    if(b.dataset.dr==='finish')finishDrill();
    if(b.dataset.dr==='new'){drillReset(d);startDrill(d,useAi);}
    if(b.dataset.dr==='menu'){drillSave();initDrill({menu:true});}
    if(b.dataset.dr==='learn'){const it=ITEM(b.dataset.id);if(it)learnLoop(b.closest('.drsum')||view,it);}};
  document.onkeydown=e=>{if(curPage!=='drill'||!DR){document.onkeydown=null;return;}
    if(e.key==='Enter'&&DR.answered&&!e.target.closest('input,textarea,select')){e.preventDefault();drillNext();}};
  drillRefill();
  // the same question you left, if you hadn't answered it yet
  const back=r.cur&&!r.answered&&ITEM(r.cur);
  if(back&&back.d===d)showDrillQ(back,r.curCheck); else drillNext();
}
function paintDrillBar(){
  const h=$('#drHd'); if(!h||!DR)return;
  const acc=DR.n?Math.round(DR.ok/DR.n*100)+'%':'—';
  h.innerHTML='<span class="pill '+DR.d.toLowerCase()+'">'+DR.d+'</span><span><b>'+DR.n+'</b> answered</span><span><b>'+DR.ok+'</b> right</span><span><b>'+acc+'</b></span><span>streak <b>'+DR.streak+'</b></span>'+
    (DR.cur&&DR.cur.gen==='drill'?'<span class="chip c-ok">new</span>':'')+(DR.curCheck?'<span class="chip">memory check</span>':'')+
    (()=>{const now=Date.now(),p=drillPool(DR.d),l=p.filter(q=>learned(q,now)).length;return '<span class="small" title="Questions you have got right leave the rotation and come back only as memory checks">'+(p.length-l)+' to go · '+l+' learned</span>';})()+(DR.writing?'<span class="small">writing new questions…</span>':DR.aiNote?'<span class="small" title="'+esc(DR.aiNote)+'">bank questions only for now</span>':'')+
    '<span class="drbtns"><button type="button" class="btn sm" data-dr="menu" title="Your place is kept">Divisions</button><button type="button" class="btn sm" data-dr="finish" title="See how it went; your place is kept">Stop</button></span>';
}
function drillNext(){
  if(!DR)return;
  const now=Date.now(); let it=null, check=false;
  // a memory check every fifth question or so, when a learned question is due
  if(DR.sinceCheck>=DRILL_CHECK_EVERY-1){it=drillCheckPick(DR.d,now);check=!!it;}
  // about one in three is new, when a newly written question is waiting
  // (new questions come three to an objective, so take one that isn't close to what was just shown; otherwise wait)
  if(!it&&DR.fresh.length&&DR.sinceNew>=DRILL_NEW_EVERY-1){
    const back=DR.recent.slice(-DRILL_SPACE).map(ITEM).filter(Boolean);
    const k=DR.fresh.findIndex(q=>!back.some((r,j)=>sameConcept(q,r)||(r.o===q.o&&back.length-j<=2)));
    if(k>=0){it=DR.fresh.splice(k,1)[0];DR.sinceNew=0;}
  }
  if(!it){it=drillPick(DR.d);if(it)DR.sinceNew++;}
  // nothing left in rotation: a waiting new question, then a due check, then an early check
  if(!it&&DR.fresh.length){it=DR.fresh.shift();DR.sinceNew=0;}
  if(!it){it=drillCheckPick(DR.d,now)||drillCheckPick(DR.d,now,true);check=!!it;}
  if(!it)it=drillPool(DR.d).find(q=>!learned(q,now))||null;   // only just-shown questions remain
  if(!it){$('#drQ').innerHTML='<div class="panel empty">There are no '+DR.d+' questions yet. Add some on My material, or connect ChatGPT to have them written.</div>';return;}
  DR.sinceCheck=check?0:DR.sinceCheck+1;
  DR.recent.push(it.id); if(DR.recent.length>40)DR.recent.shift();
  showDrillQ(it,check);
}
function showDrillQ(it,check){
  const raw=(S.custom&&S.custom.items&&S.custom.items[it.id])||{};
  DR.cur=Object.assign({},it,{gen:raw.gen}); DR.answered=false; DR.curCheck=!!check;
  const q=$('#drQ'); q.innerHTML='';
  const a=S.ans[it.id];
  if(check&&a){const now=Date.now(), early=checkDue(it)>now,
      nextDue=early?Math.min(...drillPool(DR.d).filter(x=>learned(x,now)).map(checkDue)):0;
    q.insertAdjacentHTML('beforeend','<p class="drcheck"><b>Memory check</b> · you got this right '+(()=>{const dd=Math.round((now-a.at)/DAY);return dd<1?'today':dd===1?'yesterday':dd+' days ago';})()+(rightRun(a)>1?' ('+rightRun(a)+' times in a row)':'')+'. Still remember it?'+
      (early?'<br><span class="small">You’ve got every '+DR.d+' question right, and the next check isn’t due until '+esc(new Date(nextDue).toLocaleDateString([], {month:'short',day:'numeric'}))+', so this one is early.'+(DR.useAi?'':' Turn on newly written questions (ChatGPT on this site) to keep getting new ones.')+'</span>':'')+'</p>');}
  const el=itemEl(it,it.id,{live:true,fresh:true,drill:true,onResult:ok=>{
    DR.n++; DR.answered=true;
    if(ok){DR.ok++;DR.streak++;DR.best=Math.max(DR.best,DR.streak);DR.rightIds.add(it.id);}
    else{DR.streak=0;(DR.missedObjs[it.o]=DR.missedObjs[it.o]||[]).push(it.id);}
    if(DR.curCheck){DR.checks++;if(ok)DR.checksOk++;}
    drillSave(); paintDrillBar();
    q.insertAdjacentHTML('beforeend','<div class="row drnext"><button type="button" class="btn pri" data-dr="next">Next question →</button><span class="small">or press Enter</span></div>');
    drillRefill();
  }});
  el.id='dr-'+it.id; q.appendChild(el);
  paintDrillBar(); window.scrollTo(0,0);
  drillSave(); drillRefill();
}
/* Stop: how the session has gone so far. The place is kept; "Continue" picks up there, "New session" starts over. */
function finishDrill(){
  if(!DR)return; drillSave(); const d=DR.d, s=DR;
  if(s.ctl)s.ctl.abort();
  DR=null; document.onkeydown=null;
  const missed=Object.entries(s.missedObjs);
  view.innerHTML='<div class="eyebrow">Endless practice · '+d+' · paused</div><h1 class="t">'+(s.n?s.ok+' of '+s.n+' right':'No questions answered')+'</h1>'+
    '<p class="lede">Your place is saved. Next time you open Endless practice, it continues here'+(s.cur&&!s.answered?', on the question you were on':'')+'.</p>'+
    '<div class="stats dvstats">'+stat(s.n,'answered')+stat(s.n?Math.round(s.ok/s.n*100)+'%':'—','accuracy')+stat(s.best,'best streak')+(s.checks?stat(s.checksOk+'/'+s.checks,'memory checks kept'):'')+stat(s.made,'new questions written')+stat(Math.round(s.mins)+' min','time')+'</div>'+
    (missed.length?'<h2 class="s">Missed this session</h2><div class="drsum">'+missed.map(([o,ids])=>'<div class="dvrow weak"><span class="obj">'+esc(o)+'</span><span class="dvt"><b>'+esc(objTitle(o))+'</b><span class="small">missed '+ids.length+'× · they come back more often</span></span><span class="mb"><button type="button" class="lnk" data-onotes="'+esc(o)+'">Reread</button><button type="button" class="lnk" data-dr="learn" data-id="'+esc(ids[ids.length-1])+'">Learn it</button></span></div>').join('')+'</div>':'')+
    '<div class="row" style="margin-top:16px"><button type="button" class="btn pri" data-dr="again">Continue '+d+'</button><button type="button" class="btn" data-dr="new">New '+d+' session</button><button type="button" class="btn" data-dr="menu">Choose another division</button><a class="btn" href="#mistakes">Mistakes</a></div>';
  view.onclick=e=>{const b=e.target.closest('[data-dr],[data-onotes]');if(!b)return;
    if(b.dataset.onotes){gotoObj(b.dataset.onotes);return;}
    if(b.dataset.dr==='again')startDrill(d,s.useAi&&aiReady(),drillRun(d));
    if(b.dataset.dr==='new'){drillReset(d);startDrill(d,s.useAi&&aiReady());}
    if(b.dataset.dr==='menu')initDrill({menu:true});
    if(b.dataset.dr==='learn'){const it=ITEM(b.dataset.id);if(it)learnLoop(b.closest('.dvrow').parentNode,it);}};
}
