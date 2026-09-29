
/* ================= CLAUDE: each person connects their own Anthropic API key =================
   Calls go straight from this browser to the Claude API and bill the person's own account.
   The key is kept on this device only (never in progress, never sent to the site's API).
   Not available inside the claude.ai viewer, which blocks outside network calls. */
const AI_SDK='https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk@0.129.0/+esm';
const AI_MODELS=[['claude-opus-5-5','Claude Opus 5.5 · best answers (default)'],['claude-sonnet-5-5','Claude Sonnet 5.5 · faster, costs about half']];
const LSK='are_claude_key', LSM='are_claude_model';
const AI_POSSIBLE=!(window.claude&&window.claude.use);
let aiMod=null, aiClient=null, aiClientKey=null;
function aiKey(){try{return localStorage.getItem(LSK)||sessionStorage.getItem(LSK)||'';}catch(e){return '';}}
function aiModel(){try{const m=localStorage.getItem(LSM);return AI_MODELS.some(x=>x[0]===m)?m:AI_MODELS[0][0];}catch(e){return AI_MODELS[0][0];}}
const aiReady=()=>AI_POSSIBLE&&!!aiKey();
function aiStore(key,remember,model){
  try{localStorage.removeItem(LSK);sessionStorage.removeItem(LSK);if(key)(remember?localStorage:sessionStorage).setItem(LSK,key);if(model)localStorage.setItem(LSM,model);}catch(e){}
  aiClient=null; paintAiBtn();
}
async function aiGetClient(){
  const key=aiKey(); if(!key)throw aiError({status:-2});
  if(aiClient&&aiClientKey===key)return aiClient;
  if(!aiMod){try{aiMod=await import(AI_SDK);}catch(e){throw aiError({status:0,message:'Could not load the Claude library. Check your internet connection.'});}}
  const Anthropic=aiMod.default||aiMod.Anthropic;
  aiClient=new Anthropic({apiKey:key,dangerouslyAllowBrowser:true,maxRetries:2}); aiClientKey=key;
  return aiClient;
}
/* turn SDK errors into plain sentences */
function aiError(e){
  const st=e&&e.status, msg=String((e&&e.error&&e.error.error&&e.error.error.message)||(e&&e.message)||'');
  let t;
  if(st===-2)t='Connect your Claude first: add your Anthropic API key in Claude settings.';
  else if(st===401)t='Claude did not accept this API key. Check it in Claude settings, or create a new one at console.anthropic.com.';
  else if(st===403)t='This API key is not allowed to use '+aiModel()+'. Try the other model in Claude settings, or check the key’s workspace.';
  else if(st===429)t='Too many requests to Claude right now. Wait a minute and try again.';
  else if(st===400&&/credit|balance|billing/i.test(msg))t='Your Anthropic account is out of credit. Add credit at console.anthropic.com, then try again.';
  else if(st===400)t='Claude could not handle this request: '+msg.slice(0,200);
  else if(st===529||st>=500)t='Claude is busy or having a problem. Try again in a moment.';
  else if(st===0||/fetch|network|Failed to load/i.test(msg))t=msg&&st===0?msg:'Could not reach Claude. Check your internet connection.';
  else t=msg||'Something went wrong talking to Claude.';
  const x=new Error(t); x.ai=true; x.status=st; return x;
}
/* one streamed request; onText(fullTextSoFar) as it arrives; returns the final text */
async function aiStream({system,messages,effort,maxTokens,onText,schema,signal}){
  const client=await aiGetClient(), model=aiModel();
  const params={model,max_tokens:maxTokens||16000,system,messages,output_config:{effort:effort||'low'},
    betas:['server-side-fallback-2026-07-01'],fallbacks:'default'};
  if(schema)params.output_config.format={type:'json_schema',schema};
  let text='';
  try{
    const stream=client.beta.messages.stream(params,signal?{signal}:undefined);
    for await(const ev of stream){
      if(ev.type==='content_block_delta'&&ev.delta&&ev.delta.type==='text_delta'){text+=ev.delta.text;if(onText)onText(text);}
    }
    const fin=await stream.finalMessage();
    if(fin.stop_reason==='refusal')throw Object.assign(new Error('Claude declined this request. Try rewording it.'),{ai:true});
    const all=(fin.content||[]).filter(b=>b.type==='text').map(b=>b.text).join('');
    if(all)text=all;
    if(fin.stop_reason==='max_tokens'&&schema)throw Object.assign(new Error('Claude’s answer was cut off. Ask for fewer items at a time.'),{ai:true});
    return text;
  }catch(e){if(e&&e.ai)throw e;if(e&&e.name==='AbortError')throw Object.assign(new Error('Stopped.'),{ai:true,aborted:true});throw aiError(e);}
}
async function aiJson(opts){const t=await aiStream(Object.assign({},opts,{onText:opts.onText}));try{return JSON.parse(t);}catch(e){const a=t.indexOf('{'),b=t.lastIndexOf('}');if(a>=0&&b>a)return JSON.parse(t.slice(a,b+1));throw Object.assign(new Error('Claude’s answer was not in the expected format. Try again.'),{ai:true});}}
const AI_SYS='You are a study coach for the ARE 5.0 architecture licensing exams (PA, PPD and PDD). Be accurate and current: 2021 IBC, 2010 ADA Standards, current NCARB item formats. If you are not sure of a number or code section, say so instead of guessing. Write plainly and briefly for an architecture graduate. Use short paragraphs, "- " bullets and **bold** for the key rule; no headings.';

/* ---------- settings ---------- */
function paintAiBtn(){
  const b=$('#aiBtn'); if(!b)return;
  if(!AI_POSSIBLE){b.hidden=true;return;}
  b.hidden=false; b.classList.toggle('on',aiReady());
  b.title=aiReady()?'Ask Claude about what you are studying':'Connect your own Claude';
  $('span',b).textContent=aiReady()?'Ask Claude':'Connect Claude';
}
function openClaudeSettings(after){
  const has=!!aiKey(), remembered=(()=>{try{return !!localStorage.getItem(LSK);}catch(e){return false;}})();
  modalForm('<div class="lbl">Your Claude</div><div class="q">Connect your own Claude</div>'+
    '<p class="small">Paste an Anthropic API key to turn on Claude features: explaining mistakes, a study tutor, generating cards and questions, and a personal plan. Requests go straight from this browser to Claude and are billed to <b>your</b> Anthropic account. The key is kept on this device only; it is never saved to your study account or sent to this site.</p>'+
    '<form class="edf" id="aiForm"><label class="af"><span>Anthropic API key</span><input id="aiKeyIn" type="password" autocomplete="off" spellcheck="false" placeholder="'+(has?'•••• saved — paste a new key to replace it':'sk-ant-…')+'"></label>'+
    '<p class="ahint">Create one at <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener">console.anthropic.com → API keys</a>. Add a spending limit there if you like.</p>'+
    '<label class="af"><span>Model</span><select class="sel" id="aiModelIn">'+AI_MODELS.map(m=>'<option value="'+m[0]+'"'+(m[0]===aiModel()?' selected':'')+'>'+m[1]+'</option>').join('')+'</select></label>'+
    '<label class="pass" style="margin:4px 0 8px"><input type="checkbox" id="aiRemember"'+(!has||remembered?' checked':'')+'> Remember on this device (untick on a shared computer: the key is forgotten when you close the tab)</label>'+
    '<div id="aiMsg"></div><div class="row" id="aiActs"><button type="submit" class="btn pri">'+(has?'Save':'Test and save')+'</button><button type="button" class="btn" data-a="close">Cancel</button>'+(has?'<button type="button" class="btn" data-a="remove" style="color:var(--flag)">Remove key</button>':'')+'</div></form>',
  (a,m,close)=>{
    if(a==='close')close();
    if(a==='remove'){aiStore('',false);close();toast('Claude key removed from this device');}
  },
  async(form,m,close)=>{
    const key=$('#aiKeyIn',m).value.trim(), model=$('#aiModelIn',m).value, rem=$('#aiRemember',m).checked, msg=$('#aiMsg',m);
    if(!key&&has){aiStore(aiKey(),rem,model);close();toast('Claude settings saved');if(after)after();return;}
    if(!/^sk-ant-/.test(key)){msg.innerHTML='<div class="aerr">That does not look like an Anthropic API key. Keys start with sk-ant-.</div>';return;}
    const prev=aiKey(), prevRem=remembered;
    aiStore(key,rem,model); msg.innerHTML='<p class="small">Checking the key with Claude…</p>';
    try{await aiStream({system:'Reply with the single word OK.',messages:[{role:'user',content:'Say OK.'}],effort:'low',maxTokens:64});
      close();toast('Claude connected');if(after)after();}
    catch(e){aiStore(prev,prevRem,model);msg.innerHTML='<div class="aerr">'+esc(e.message)+'</div>';}
  });
}
function needAi(then){if(aiReady())return true;openClaudeSettings(then);return false;}

/* ---------- 1. explain my mistake ---------- */
function aiBox(host,title){
  let box=host.querySelector(':scope > .aibox'); if(box)box.remove();
  box=document.createElement('div'); box.className='aibox';
  box.innerHTML='<div class="aihd"><span class="aik">Claude</span><span class="ait">'+esc(title)+'</span><button type="button" class="lnk" data-ai="stop">Stop</button></div><div class="aibody"><p class="small">Thinking…</p></div><div class="aifoot"></div>';
  host.appendChild(box); return box;
}
async function aiRun(box,opts,footHtml,onDone){
  const ctl=new AbortController(), body=$('.aibody',box);
  box.querySelector('[data-ai="stop"]').onclick=()=>ctl.abort();
  try{
    const t=await aiStream(Object.assign({signal:ctl.signal,onText:x=>{body.innerHTML=md2html(x);}},opts));
    body.innerHTML=md2html(t); box.querySelector('[data-ai="stop"]').remove();
    $('.aifoot',box).innerHTML=footHtml||''; if(onDone)onDone(t,box);
  }catch(e){body.innerHTML='<div class="aerr" style="margin:0">'+esc(e.message)+'</div>';const s=box.querySelector('[data-ai="stop"]');if(s)s.remove();
    if(e.status===-2||e.status===401)$('.aifoot',box).innerHTML='<button type="button" class="btn sm" data-ai="settings">Claude settings</button>';}
  box.onclick=ev=>{if(ev.target.closest('[data-ai="settings"]'))openClaudeSettings();};
}
function aiExplainItem(it,sel,host,mistakeId){
  if(!needAi(()=>aiExplainItem(it,sel,host,mistakeId)))return;
  const box=aiBox(host,'Explaining '+it.o);
  const opt=i=>String.fromCharCode(65+i)+'. '+it.opts[i];
  const prompt='Practice question ('+it.o+', '+(it.t==='cata'?'check all that apply':'multiple choice')+'):\n'+strip(it.s)+'\n\nOptions:\n'+it.opts.map((o,i)=>opt(i)).join('\n')+
    '\n\nCorrect: '+it.c.map(opt).join('; ')+'\nI chose: '+(sel&&sel.length?sel.map(opt).join('; '):'nothing')+
    (it.e?'\n\nThe book explanation (which did not click for me): '+strip(it.e):'')+
    '\n\nExplain it a different way than the book: first the one rule that decides it, then why my choice is tempting but wrong, then a quick way to remember it. Under 180 words.';
  aiRun(box,{system:AI_SYS,messages:[{role:'user',content:prompt}],effort:'low',maxTokens:4000},
    mistakeId&&S.mist[mistakeId]?'<button type="button" class="btn sm" data-ai="savenote">Save to my note</button>':'',
    (t,b)=>{const s=b.querySelector('[data-ai="savenote"]');if(s)s.onclick=()=>{const m=S.mist[mistakeId];m.note=((m.note?m.note+'\n\n':'')+'Claude: '+strip(md2html(t))).slice(0,1000);save();s.replaceWith(Object.assign(document.createElement('span'),{className:'small',textContent:'Saved to your note'}));const ta=document.querySelector('textarea[data-i="'+mistakeId+'"]');if(ta)ta.value=m.note;};});
}
function aiExplainCard(c,host){
  if(!needAi(()=>aiExplainCard(c,host)))return;
  const box=aiBox(host,'Explaining this card');
  aiRun(box,{system:AI_SYS,messages:[{role:'user',content:'Flashcard ('+c.o+', deck '+c.d+').\nQuestion: '+strip(c.q)+'\nAnswer: '+strip(c.a)+'\n\nI keep forgetting this. Explain why it is true in plain terms, give one realistic exam-style situation where it decides the answer, and a memory hook. Under 150 words.'}],effort:'low',maxTokens:3000});
}

/* ---------- 2. study tutor chat ---------- */
let CHAT=[];
function chatContext(){
  const bits=['The student is on the "'+((PAGES.find(p=>p.id===curPage)||{}).n||curPage)+'" page of the study site.'];
  if(curPage==='cards'&&fcur)bits.push('Current flashcard ('+fcur.o+'): Q: '+strip(fcur.q)+(fshown?' A: '+strip(fcur.a):' (answer not revealed yet — do not give it away unless asked)'));
  const h=[...view.querySelectorAll('h2.s,h3.s')].find(x=>x.getBoundingClientRect().top>60);
  if(h&&NOTE_PAGES.includes(curPage))bits.push('They are reading the section: '+h.textContent.replace(/\s+/g,' ').trim());
  const w=curWeek(), W=PW(w); if(W)bits.push('Study plan week '+w+': '+W.g);
  const nx=myExams().find(e=>e.date>=midnight(new Date())&&!S.passed[e.d]); if(nx)bits.push('Next exam: '+nx.d+' on '+fmtDate(nx.date,{day:'numeric',month:'long'})+'.');
  return bits.join('\n');
}
function openChat(){
  if(!needAi(openChat))return;
  const p=$('#chat'); p.hidden=false; document.body.classList.add('chaton');
  paintChat(); setTimeout(()=>$('#chatIn').focus(),30);
}
function closeChat(){$('#chat').hidden=true;document.body.classList.remove('chaton');}
function paintChat(){
  const list=$('#chatLog');
  list.innerHTML=CHAT.length?CHAT.map(m=>'<div class="cm '+m.role+'">'+(m.role==='user'?esc(m.content).replace(/\n/g,'<br>'):md2html(m.content))+'</div>').join(''):
    '<div class="cmempty">Ask anything about what you are studying: "why is business 150 SF?", "quiz me on PDD 3.2", "explain this card another way". Claude sees which page, card or section you are on.</div>';
  list.scrollTop=list.scrollHeight;
}
let chatCtl=null;
async function sendChat(){
  const inp=$('#chatIn'), q=inp.value.trim(); if(!q||chatCtl)return;
  inp.value=''; CHAT.push({role:'user',content:q}); CHAT.push({role:'assistant',content:''}); paintChat();
  const last=$('#chatLog').lastElementChild; last.innerHTML='<span class="small">Thinking…</span>';
  chatCtl=new AbortController(); $('#chatSend').textContent='Stop';
  const msgs=CHAT.slice(0,-1).slice(-20).map(m=>({role:m.role,content:m.content}));
  msgs[msgs.length-1]={role:'user',content:'[Context: '+chatContext()+']\n\n'+q};
  try{const t=await aiStream({system:AI_SYS+' You are chatting with the student inside their study site; keep answers short unless they ask for more, and end quizzes with the answer only when they reply.',messages:msgs,effort:'low',maxTokens:8000,signal:chatCtl.signal,
      onText:x=>{last.innerHTML=md2html(x);$('#chatLog').scrollTop=$('#chatLog').scrollHeight;}});
    CHAT[CHAT.length-1].content=t; chatCtl=null; $('#chatSend').textContent='Send'; paintChat();}
  catch(e){chatCtl=null;$('#chatSend').textContent='Send';CHAT.pop();CHAT.pop();paintChat();
    $('#chatLog').insertAdjacentHTML('beforeend','<div class="aerr" style="margin:8px 0">'+esc(e.message)+'</div>');if(!e.aborted)inp.value=q;}
}

/* ---------- 3. generate cards and questions (drafts go through the study-pack preview) ---------- */
const PACK_SCHEMA={type:'object',additionalProperties:false,required:['title','points','cards','questions'],properties:{
  title:{type:'string'},
  points:{type:'array',items:{type:'object',additionalProperties:false,required:['division','objective','text'],properties:{division:{type:'string'},objective:{type:'string'},text:{type:'string'}}}},
  cards:{type:'array',items:{type:'object',additionalProperties:false,required:['deck','division','objective','question','answer'],properties:{deck:{type:'string'},division:{type:'string'},objective:{type:'string'},question:{type:'string'},answer:{type:'string'}}}},
  questions:{type:'array',items:{type:'object',additionalProperties:false,required:['division','objective','type','question','options','correct','explanation'],properties:{division:{type:'string'},objective:{type:'string'},type:{type:'string',enum:['mc','cata']},question:{type:'string'},options:{type:'array',items:{type:'string'}},correct:{type:'array',items:{type:'string'}},explanation:{type:'string'}}}}}};
function objectiveOptions(sel){
  objTitle('PA 1.1'); // builds the objective list
  return Object.keys(OBJT).sort((a,b)=>DIVS.indexOf(a.split(' ')[0])-DIVS.indexOf(b.split(' ')[0])||parseFloat(a.split(' ')[1])-parseFloat(b.split(' ')[1]))
    .map(o=>'<option value="'+o+'"'+(o===sel?' selected':'')+'>'+o+' · '+esc(OBJT[o].slice(0,70))+'</option>').join('');
}
function openGenerate(preset,done){
  preset=preset||{};
  if(!needAi(()=>openGenerate(preset,done)))return;
  modalForm('<div class="lbl">Claude · your own material</div><div class="q">Generate study material</div>'+
    '<p class="small">Claude drafts cards and questions; you review them before anything is added to your material.</p>'+
    '<form class="edf" id="genForm"><div class="edrow"><label class="af" style="flex:2 1 260px"><span>Objective</span><select class="sel" id="genObj"><option value="">Any — use the topic or notes below</option>'+objectiveOptions(preset.obj||'')+'</select></label>'+
    '<label class="af" style="flex:1 1 150px"><span>Make</span><select class="sel" id="genKind"><option value="both">Cards and questions</option><option value="cards"'+(preset.kind==='cards'?' selected':'')+'>Flashcards only</option><option value="questions"'+(preset.kind==='questions'?' selected':'')+'>Questions only</option></select></label>'+
    '<label class="af" style="flex:0 1 100px"><span>How many</span><select class="sel" id="genN"><option>3</option><option selected>5</option><option>8</option><option>12</option></select></label></div>'+
    '<label class="af"><span>Topic (optional)</span><input id="genTopic" placeholder="e.g. exit separation, flashing at shelf angles"></label>'+
    '<label class="af"><span>Your notes to work from (optional)</span><textarea id="genNotes" rows="5" placeholder="Paste notes, a textbook passage, or a list of facts"></textarea></label>'+
    '<div id="genMsg"></div><div class="row" id="genActs"><button type="submit" class="btn pri">Generate</button><button type="button" class="btn" data-a="close">Cancel</button></div></form>',
  (a,m,close)=>{if(a==='close'){if(m._ctl)m._ctl.abort();close();}},
  async(form,m,close)=>{
    const obj=$('#genObj',m).value, kind=$('#genKind',m).value, n=+$('#genN',m).value, topic=$('#genTopic',m).value.trim(), notes=$('#genNotes',m).value.trim();
    if(!obj&&!topic&&!notes){$('#genMsg',m).innerHTML='<div class="aerr">Choose an objective, or give a topic or notes.</div>';return;}
    const ex=ITEMS.filter(q=>!obj||q.o===obj).slice(0,2).map(q=>JSON.stringify({question:strip(q.s),options:q.opts,correct:q.c.map(k=>q.opts[k]),explanation:strip(q.e)})).join('\n');
    const want=kind==='cards'?n+' flashcards and no questions':kind==='questions'?n+' practice questions and no flashcards':Math.ceil(n/2)+' flashcards and '+Math.floor(n/2+0.5)+' practice questions';
    const prompt='Write '+want+' for the ARE study pack'+(obj?' on objective '+obj+' ('+objTitle(obj)+')':'')+(topic?', topic: '+topic:'')+'.\n'+
      'Leave "points" empty. Use division "'+(obj?obj.split(' ')[0]:'PA, PPD or PDD as fits')+'" and objective "'+(obj?obj.split(' ')[1]:'the best-fitting number like 2.2')+'".\n'+
      'Cards: a prompt and a complete answer (full lists where the exam tests lists). Questions: current NCARB style; "mc" has 4 options and exactly one correct, "cata" has 5–6 options and 2+ correct; "correct" repeats the exact option text; the explanation says why each trap is wrong. Deck: "'+(obj||'My')+' · Claude"; title: a short name for this batch.\n'+
      'Do not repeat questions I already have'+(ex?', such as:\n'+ex:'')+'.'+(notes?'\n\nBase everything on these notes, and do not add facts that contradict them:\n'+notes.slice(0,20000):'');
    $('#genActs',m).innerHTML='<p class="small" style="margin:0">Claude is writing… this can take up to a minute.</p><button type="button" class="btn" data-a="close">Cancel</button>';
    m._ctl=new AbortController();
    try{
      const j=await aiJson({system:AI_SYS,messages:[{role:'user',content:prompt}],effort:'medium',maxTokens:32000,schema:PACK_SCHEMA,signal:m._ctl.signal});
      close(); openImportWith(JSON.stringify(j),done);
    }catch(e){if(e.aborted)return;$('#genMsg',m).innerHTML='<div class="aerr">'+esc(e.message)+'</div>';$('#genActs',m).innerHTML='<button type="submit" class="btn pri">Try again</button><button type="button" class="btn" data-a="close">Cancel</button>';}
  });
}
/* open the import preview pre-filled (used for Claude drafts) */
function openImportWith(text,done){openImport(done);const t=$('#imText');if(t){t.value=text;$('#modal').querySelector('[data-a="check"]').click();}}

/* ---------- 4. personal study plan ---------- */
const PLAN_SCHEMA={type:'object',additionalProperties:false,required:['summary','weeks'],properties:{summary:{type:'string'},
  weeks:{type:'array',items:{type:'object',additionalProperties:false,required:['from','to','goal','exam','tasks'],properties:{from:{type:'string'},to:{type:'string'},goal:{type:'string'},exam:{type:'string'},tasks:{type:'array',items:{type:'string'}}}}}}};
function weakList(){
  const weak={};
  ITEMS.forEach(it=>{const a=S.ans[it.id];if(a&&!a.ok)(weak[it.o]=weak[it.o]||{o:it.o,n:0}).n+=2;});
  CARDS.forEach(c=>{const s=S.cards[c.id];if(s&&s.b<=1&&c.o!=='—')(weak[c.o]=weak[c.o]||{o:c.o,n:0}).n++;});
  return Object.values(weak).sort((a,b)=>b.n-a.n).slice(0,10).map(x=>x.o+' ('+objTitle(x.o)+')');
}
function openPlanBuilder(){
  if(!needAi(openPlanBuilder))return;
  const ex=myExams().filter(e=>!S.passed[e.d]), today=ds(new Date());
  modalForm('<div class="lbl">Claude · your plan</div><div class="q">Build my own study plan</div>'+
    '<p class="small">Claude plans week by week from today to your last exam, around your exam dates, your weak spots and what you have already done. You see it before it replaces anything, and you can go back to the standard plan at any time.</p>'+
    '<form class="edf" id="plForm"><div class="impv"><b>Planning from</b><ul><li>Today: '+esc(fmtDate(new Date(),{day:'numeric',month:'long',year:'numeric'}))+'</li>'+ex.map(e=>'<li>'+e.d+' exam: '+esc(fmtDate(e.date,{weekday:'short',day:'numeric',month:'long'}))+'</li>').join('')+'<li>Weak spots: '+esc(weakList().slice(0,5).join('; ')||'none yet')+'</li></ul></div>'+
    '<label class="af"><span>Hours you can study per week</span><select class="sel" id="plH"><option>5</option><option selected>10</option><option>15</option><option>20</option><option>30</option></select></label>'+
    '<label class="af"><span>Anything else Claude should know (optional)</span><textarea id="plNote" rows="3" placeholder="e.g. I travel the week of Nov 9; PDD is my strongest division"></textarea></label>'+
    '<div id="plMsg"></div><div class="row" id="plActs"><button type="submit" class="btn pri"'+(ex.length?'':' disabled')+'>Build my plan</button><button type="button" class="btn" data-a="close">Cancel</button></div>'+(ex.length?'':'<p class="small">All your exams are marked passed or past. Change an exam date on Today first.</p>')+'</form>',
  (a,m,close)=>{
    if(a==='close'){if(m._ctl)m._ctl.abort();close();}
    if(a==='use'&&m._plan){S.customPlan=m._plan;S.customPlan.at=Date.now();rebuildMaterial();save();close();go('plan');toast('Your own plan is in use');}
  },
  async(form,m,close)=>{
    const hours=$('#plH',m).value, note=$('#plNote',m).value.trim();
    const done=BASE_PLAN.flatMap(w=>w.t.map((t,i)=>S.plan[taskId(w.w,i)]?t:null)).filter(Boolean).slice(0,40);
    const prompt='Build a weekly ARE study plan starting the week that contains '+today+'.\n'+
      'Exams: '+ex.map(e=>e.d+' ('+e.n+') on '+ds(e.date)).join('; ')+'.\n'+
      'About '+hours+' study hours per week.\n'+
      'Weak objectives, weakest first: '+(weakList().join('; ')||'no data yet')+'.\n'+
      'Already done: '+(done.join(' | ')||'nothing yet')+'.\n'+(note?'Student note: '+note+'\n':'')+
      'The site has these tools, which tasks can name: Flashcards (decks per division), Practice (question bank and timed sets), Mistakes (re-ask log), and notes pages PA, PPD, PDD and Numbers.\n'+
      'Section weights (heaviest first) — PA: Building Analysis & Programming 37–43%, Site 21–27%, Codes 16–22%, Environmental 14–21%. PPD: Integration 32–38%, Systems 19–25%, Codes 16–22%, Environmental 10–16%, Costs 8–14%. PDD: Construction Documentation 32–38%, Materials & Systems 31–37%, Specs 12–18%, Codes 8–14%, Estimates 2–8%.\n'+
      'Rules: one entry per calendar week (Monday–Sunday; the first week may start mid-week), from/to as YYYY-MM-DD, running through the week of the last exam. 4–7 concrete tasks per week, each one sentence. Put a full-length timed practice exam on the Saturday before each exam, and light review only in the two days before. Set "exam" to e.g. "PA exam — Thursday 22 October" in the week of an exam, otherwise "". Spend extra time on the weak objectives. "summary": two sentences on how the plan is shaped.';
    $('#plActs',m).innerHTML='<p class="small" style="margin:0">Claude is planning… this can take up to a minute.</p><button type="button" class="btn" data-a="close">Cancel</button>';
    m._ctl=new AbortController();
    try{
      const j=await aiJson({system:AI_SYS,messages:[{role:'user',content:prompt}],effort:'medium',maxTokens:32000,schema:PLAN_SCHEMA,signal:m._ctl.signal});
      const weeks=(j.weeks||[]).filter(w=>w&&!isNaN(pdate(w.from))&&!isNaN(pdate(w.to))&&Array.isArray(w.tasks)&&w.tasks.length).map((w,i)=>{
        const f=pdate(w.from),t=pdate(w.to),same=f.getMonth()===t.getMonth();
        return {w:i+1,from:w.from,to:w.to,d:f.getDate()+(same?'':' '+fmtDate(f,{month:'short'}))+'–'+t.getDate()+' '+fmtDate(t,{month:'short'}),g:String(w.goal||'').slice(0,200),exam:w.exam||undefined,t:w.tasks.map(x=>String(x).slice(0,300)).slice(0,10)};});
      if(!weeks.length)throw Object.assign(new Error('Claude did not return any usable weeks. Try again.'),{ai:true});
      m._plan={summary:String(j.summary||''),weeks};
      $('#plMsg',m).innerHTML='<div class="impv"><b>'+weeks.length+' weeks, '+esc(weeks[0].d)+' to '+esc(weeks[weeks.length-1].d)+'</b><p class="small" style="margin:6px 0">'+esc(m._plan.summary)+'</p><ol class="small plprev">'+weeks.map(w=>'<li><b>'+esc(w.d)+'</b> — '+esc(w.g)+(w.exam?' <span class="chip c-un">'+esc(w.exam)+'</span>':'')+'</li>').join('')+'</ol></div>';
      $('#plActs',m).innerHTML='<button type="button" class="btn pri" data-a="use">Use this plan</button><button type="submit" class="btn">Make another</button><button type="button" class="btn" data-a="close">Cancel</button>';
    }catch(e){if(e.aborted)return;$('#plMsg',m).innerHTML='<div class="aerr">'+esc(e.message)+'</div>';$('#plActs',m).innerHTML='<button type="submit" class="btn pri">Try again</button><button type="button" class="btn" data-a="close">Cancel</button>';}
  });
}

/* ---------- wiring ---------- */
if($('#aiBtn'))$('#aiBtn').addEventListener('click',()=>aiReady()?openChat():openClaudeSettings(openChat));
if($('#chat')){
  $('#chatClose').onclick=closeChat;
  $('#chatClear').onclick=()=>{CHAT=[];paintChat();};
  $('#chatSet').onclick=()=>openClaudeSettings();
  $('#chatForm').onsubmit=e=>{e.preventDefault();if(chatCtl){chatCtl.abort();return;}sendChat();};
  $('#chatIn').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();$('#chatForm').requestSubmit();}if(e.key==='Escape')closeChat();});
}
paintAiBtn();
