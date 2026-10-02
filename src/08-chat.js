
/* ================= CHAT PANEL: a docked Claude chat that can act on the study site =================
   Runs on the claude.ai link, on the viewer's claude.ai plan. (The website reaches Claude through the connector instead.)
   Claude gets page "tools" (search, quiz, record answers, rate cards, add material, open pages);
   each call shows as a small expandable row, and additions can be undone. */
const LSC='are_chats_v1', LSW='are_chat_w';
const chatKey=()=>LSC+':'+PROF.cur;
let CHATS=[], CUR=null, chatBusy=null, ctxOn=true;
function chatsLoad(){try{CHATS=JSON.parse(localStorage.getItem(chatKey())||'[]');}catch(e){CHATS=[];}if(!Array.isArray(CHATS))CHATS=[];}
function chatsSave(){try{localStorage.setItem(chatKey(),JSON.stringify(CHATS.slice(0,30)));}catch(e){try{CHATS=CHATS.slice(0,10);localStorage.setItem(chatKey(),JSON.stringify(CHATS));}catch(_){}}}
function newChat(){CUR={id:'h'+Date.now().toString(36),title:'',at:Date.now(),route:PROV(),view:[]};return CUR;}

/* ---------- panel markup (built once) ---------- */
function buildChat(){
  if($('#chat'))return;
  const el=document.createElement('aside'); el.id='chat'; el.hidden=true; el.setAttribute('aria-label','Claude chat');
  el.innerHTML='<div class="chgrip" id="chGrip" title="Drag to resize"></div>'+
    '<div class="chhd"><b>Claude</b><span class="chroute" id="chRoute"></span>'+
    '<button type="button" class="chib" id="chHist" title="Past chats" aria-label="Past chats"><svg viewBox="0 0 24 24"><path d="M12 7v5l3 2M3.5 12a8.5 8.5 0 1 0 2.5-6M3 4v4h4"/></svg></button>'+
    '<button type="button" class="chib" id="chNew" title="New chat" aria-label="New chat"><svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg></button>'+
    '<button type="button" class="chib" id="chSet" title="Claude settings" aria-label="Claude settings"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.4-2.3 1a7 7 0 0 0-2.1-1.2L14 3h-4l-.5 2.7a7 7 0 0 0-2.1 1.2l-2.3-1-2 3.4 2 1.5a7 7 0 0 0 0 2.4l-2 1.5 2 3.4 2.3-1a7 7 0 0 0 2.1 1.2L10 21h4l.5-2.7a7 7 0 0 0 2.1-1.2l2.3 1 2-3.4-2-1.5c.1-.4.1-.8.1-1.2z"/></svg></button>'+
    '<button type="button" class="chib" id="chClose" title="Close" aria-label="Close"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>'+
    '<div class="chhist" id="chHistList" hidden></div>'+
    '<div id="chLog" aria-live="polite"></div>'+
    '<div class="chslash" id="chSlash" hidden></div>'+
    '<form id="chForm"><div class="chctx" id="chCtx"></div>'+
    '<textarea id="chIn" rows="3" placeholder="Ask, or type / for commands" aria-label="Message to Claude"></textarea>'+
    '<div class="chbar"><span class="small" id="chHint">Enter to send · Shift+Enter for a new line</span><button type="submit" class="btn pri sm" id="chSend">Send</button></div></form>';
  document.body.appendChild(el);
  try{const w=+localStorage.getItem(LSW);if(w>=320&&w<=900)el.style.width=w+'px';}catch(e){}
  $('#chClose').onclick=closeChat; $('#chSet').onclick=()=>openClaudeSettings();
  $('#chNew').onclick=()=>{if(chatBusy)return;newChat();$('#chHistList').hidden=true;paintChatLog();$('#chIn').focus();};
  $('#chHist').onclick=()=>{const h=$('#chHistList');h.hidden=!h.hidden;if(!h.hidden)paintHistory();};
  $('#chForm').onsubmit=e=>{e.preventDefault();if(chatBusy){chatBusy.abort();return;}sendChatMsg();};
  const inp=$('#chIn');
  inp.addEventListener('keydown',e=>{
    const sl=$('#chSlash');
    if(!sl.hidden&&(e.key==='ArrowDown'||e.key==='ArrowUp')){e.preventDefault();const bs=$$('button',sl);let i=bs.findIndex(b=>b.classList.contains('on'));i=(i+(e.key==='ArrowDown'?1:-1)+bs.length)%bs.length;bs.forEach((b,k)=>b.classList.toggle('on',k===i));return;}
    if(!sl.hidden&&(e.key==='Tab'||(e.key==='Enter'&&!e.shiftKey))){const b=$('button.on',sl)||$('button',sl);if(b){e.preventDefault();pickSlash(b.dataset.cmd);return;}}
    if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();$('#chForm').requestSubmit();}
    if(e.key==='Escape'){if(!sl.hidden)sl.hidden=true;else closeChat();}
  });
  inp.addEventListener('input',paintSlash);
  // drag the left edge to resize
  const grip=$('#chGrip');
  grip.addEventListener('pointerdown',e=>{e.preventDefault();grip.setPointerCapture(e.pointerId);const x0=e.clientX,w0=el.getBoundingClientRect().width;
    const mv=ev=>{const w=Math.max(320,Math.min(900,w0+(x0-ev.clientX)));el.style.width=w+'px';document.documentElement.style.setProperty('--chw',w+'px');};
    const up=()=>{grip.removeEventListener('pointermove',mv);grip.removeEventListener('pointerup',up);try{localStorage.setItem(LSW,Math.round(el.getBoundingClientRect().width));}catch(_){}};
    grip.addEventListener('pointermove',mv);grip.addEventListener('pointerup',up);});
  $('#chLog').addEventListener('click',e=>{const u=e.target.closest('[data-undo]');if(u)undoTool(u);const q=e.target.closest('[data-starter]');if(q){inp.value=q.dataset.starter;sendChatMsg();}});
}
function openChat(){
  if(!needAi(openChat))return;
  buildChat(); chatsLoad(); if(!CUR||CUR.route!==PROV())CUR=CHATS[0]&&CHATS[0].route===PROV()?CHATS[0]:newChat();
  const p=$('#chat'); p.hidden=false; document.body.classList.add('chaton');
  document.documentElement.style.setProperty('--chw',p.getBoundingClientRect().width+'px');
  $('#chRoute').textContent=PROV()==='chatgpt'?'Using ChatGPT plan'+((CG.st.models||[]).find(m=>m.slug===CG.st.model)?' · '+(CG.st.models||[]).find(m=>m.slug===CG.st.model).name:''):'your claude.ai plan'; $('#chat b').textContent=AI_NAME();
  paintChatLog(); paintCtx(); setTimeout(()=>$('#chIn').focus(),30);
}
function closeChat(){const p=$('#chat');if(p)p.hidden=true;document.body.classList.remove('chaton');}

/* ---------- context chip: what Claude can see right now ---------- */
function ctxNow(){
  const pg=(PAGES.find(p=>p.id===curPage)||{}).n||curPage, bits=[], label=[pg];
  bits.push('The student is on the "'+pg+'" page.');
  if(curPage==='cards'&&fcur){bits.push('Current flashcard (card_id '+fcur.id+', '+fcur.o+'): Q: '+strip(fcur.q)+(fshown?' | A: '+strip(fcur.a):' | answer not revealed yet'));label.push('card '+fcur.o);}
  if(curPage==='practice'){const q=[...view.querySelectorAll('.qz')].find(x=>x.getBoundingClientRect().top>40);if(q){const id=q.id.replace(/^it-/,''),it=ITEM(id);if(it){bits.push('Question on screen (question_id '+id+', '+it.o+'): '+strip(it.s));label.push('question '+it.o);}}}
  if(NOTE_PAGES.includes(curPage)){const h=[...view.querySelectorAll('h2.s,h3.s')].find(x=>x.getBoundingClientRect().top>60);if(h){const t=h.textContent.replace(/\s+/g,' ').trim();bits.push('Reading the section: '+t);label.push(t.slice(0,40));}}
  return {text:bits.join('\n'),label:label.join(' · ')};
}
function paintCtx(){
  const c=$('#chCtx'); if(!c)return; const n=ctxNow();
  const ag=curAgent();
  c.innerHTML='<select class="chagent" id="chAgent" aria-label="Agent" title="Agent: who answers, and from which documents">'+allAgents().map(a=>'<option value="'+esc(a.id)+'"'+(a.id===ag.id?' selected':'')+'>'+esc(a.name)+'</option>').join('')+'<option value="__new">+ New agent…</option></select>'+
    (CHAT_DOC?'<button type="button" class="chchip" id="chDocBtn" title="Answering from this document. Click to stop.">'+esc(CHAT_DOC.name.slice(0,30))+' ×</button>':'')+
    '<button type="button" class="chchip'+(ctxOn?'':' off')+'" id="chCtxBtn" title="'+(ctxOn?AI_NAME()+' sees this. Click to hide it.':'Hidden from '+AI_NAME()+'. Click to share it.')+'"><svg viewBox="0 0 24 24"><path d="M4 5h16v14H4zM8 9h8M8 13h5"/></svg>'+esc(n.label)+'</button>';
  $('#chCtxBtn').onclick=()=>{ctxOn=!ctxOn;paintCtx();};
  const sel=$('#chAgent'); sel.onchange=()=>{if(sel.value==='__new'){sel.value=ag.id;(AUTH_ON&&LIB.docs===null?libLoad():Promise.resolve()).then(()=>agentEditor(null,()=>{paintCtx();paintAgents();}));return;}setAgent(sel.value);paintCtx();toast('Agent: '+curAgent().name);};
  const db=$('#chDocBtn'); if(db)db.onclick=()=>{CHAT_DOC=null;$('#chIn').placeholder='Ask, or type / for commands';paintCtx();};
}

/* ---------- slash commands ---------- */
const SLASH=[
  ['/today','What should I study today? Look at my plan week, due cards, due mistakes and weak spots, then give me a short prioritized list.'],
  ['/quiz','Quiz me with practice questions{arg}, one at a time. Show the question and lettered options, wait for my answer, then record it and explain briefly.'],
  ['/cards','Run through my due flashcards one at a time: show the question, wait for my answer, show the real answer, then ask me to rate it and record the rating.'],
  ['/mistakes','Go through my due mistakes one at a time: re-ask each question, record my answer, and explain what I got wrong before.'],
  ['/explain','Explain what is on my screen right now in a different way, with a quick example and a memory hook.'],
  ['/weak','Which objectives am I weakest on, and what is the one thing to fix in each?'],
  ['/plan','Look at my study plan and exam dates. Am I on track? Suggest what to change this week.'],
  ['/make','Make{arg} flashcards and practice questions for me and add them to my material. Ask me first if the topic is unclear.']
];
function paintSlash(){
  const v=$('#chIn').value, sl=$('#chSlash');
  if(!/^\/\S*$/.test(v)){sl.hidden=true;return;}
  const m=SLASH.filter(s=>s[0].startsWith(v.toLowerCase()));
  if(!m.length){sl.hidden=true;return;}
  sl.innerHTML=m.map((s,i)=>'<button type="button" data-cmd="'+s[0]+'" class="'+(i?'':'on')+'"><b>'+s[0]+'</b><span>'+esc(s[1].replace('{arg}','').slice(0,70))+'…</span></button>').join('');
  sl.hidden=false; sl.onclick=e=>{const b=e.target.closest('button');if(b)pickSlash(b.dataset.cmd);};
}
function pickSlash(cmd){const i=$('#chIn');i.value=cmd+' ';$('#chSlash').hidden=true;i.focus();}
function expandSlash(t){
  const m=t.match(/^(\/[a-z]+)\s*(.*)$/i); if(!m)return t;
  const s=SLASH.find(x=>x[0]===m[1].toLowerCase()); if(!s)return t;
  const arg=m[2].trim();
  return s[1].replace('{arg}',arg?' on '+arg:'')+(arg&&!s[1].includes('{arg}')?'\n\nAlso: '+arg:'');
}

/* ---------- tools Claude can use on this page ---------- */
const L=i=>String.fromCharCode(65+i);
/* a question as the tools show it, for every type, and the student's reply turned back into an answer */
function qView(q){
  const v={question_id:q.id,objective:q.o,type:qTypeName(q).toLowerCase(),question:strip(q.s)};
  if(q.t==='num')Object.assign(v,{answer_format:'a number'+(q.unit?' in '+q.unit:''),correct:numText(q,q.ans),tolerance:+q.tol||0});
  else if(q.t==='match')Object.assign(v,{statements:q.items.map((x,k)=>(k+1)+'. '+strip(x)),choices:q.opts.map((x,k)=>L(k)+'. '+x),correct:q.c.map((k,i)=>(i+1)+' → '+L(k))});
  else Object.assign(v,{options:q.opts.map((x,k)=>L(k)+'. '+x),correct:q.c.map(L)});
  v.explanation=strip(q.e); return v;
}
function selFrom(it,choices){
  choices=(choices||[]).map(x=>String(x).trim());
  if(it.t==='num'){if(numIn(choices[0])==null)throw new Error('For this question, choices is the number the student gave, e.g. ["400"].');return [choices[0]];}
  if(it.t==='match'){const s=choices.map(x=>x.toUpperCase().charCodeAt(0)-65);if(s.length!==it.items.length||s.some(k=>!(k>=0&&k<it.opts.length)))throw new Error('For this matching question, choices is one choice letter per statement, in statement order, e.g. ['+it.items.map(()=>'"A"').join(',')+'].');return s;}
  const s=[...new Set(choices.map(x=>x.toUpperCase().charCodeAt(0)-65).filter(k=>k>=0&&k<it.opts.length))];
  if(!s.length)throw new Error('choices must be option letters like ["B"].'); return s;
}
function toolRating(id,r){
  const c=CARDS.find(x=>x.id===id); if(!c)throw new Error('No flashcard with card_id '+id+'.');
  const s=S.cards[id]||{b:0,n:0,due:0}, now=Date.now(), had=!!S.cards[id];
  if(r===1){S.cardMiss[id]=(S.cardMiss[id]||0)+1;s.b=0;s.due=now+INT[0];}
  else if(r===2){s.b=Math.max(1,Math.min(s.b,2));s.due=now+DAY;}
  else{s.b=Math.min(5,(had?s.b:1)+1);s.due=now+INT[s.b];}
  s.n=(s.n||0)+1; s.r=r; S.cards[id]=s; logAct(); save();
  return 'next due '+whenStr(s.due);
}
const CHAT_TOOLS=[
  {name:'study_status',label:'Checked your study status',description:'The student’s current situation: today’s date, study-plan week and its tasks (with task_id and done), exam dates and days left, flashcard and question counts, and how many mistakes are due. Use at the start of planning or "what should I do" questions.',
   schema:{type:'object',properties:{},additionalProperties:false},
   run:()=>{const t=midnight(new Date()),w=curWeek(),W=PW(w),cc=cardCounts(CARDS);let ans=0,ok=0;ITEMS.forEach(i=>{const a=S.ans[i.id];if(a){ans++;if(a.ok)ok++;}});
     return {today:ds(t),plan_week:W?{week:w,dates:W.d,goal:W.g,tasks:W.t.map((x,i)=>({task_id:taskId(W.w,i),text:x,done:!!S.plan[taskId(W.w,i)]}))}:null,
       exams:myExams().map(e=>({division:e.d,date:ds(e.date),days_left:Math.round((midnight(e.date)-t)/DAY),passed:!!S.passed[e.d]})),
       flashcards:{total:cc.n,due_now:cc.due,new:cc.nw,strong:cc.strong},questions:{total:ITEMS.length,answered:ans,correct:ok},mistakes_due:mistDue().length};}},
  {name:'weak_spots',label:'Looked at your weak spots',description:'The student’s weakest objectives, from missed questions and cards rated Again or Shaky, weakest first.',
   schema:{type:'object',properties:{},additionalProperties:false},
   run:()=>{const w={};ITEMS.forEach(it=>{const a=S.ans[it.id];if(a&&!a.ok)(w[it.o]=w[it.o]||{objective:it.o,title:objTitle(it.o),missed_questions:0,shaky_cards:0}).missed_questions++;});
     CARDS.forEach(c=>{const s=S.cards[c.id];if(s&&s.b<=1&&c.o!=='—')(w[c.o]=w[c.o]||{objective:c.o,title:objTitle(c.o),missed_questions:0,shaky_cards:0}).shaky_cards++;});
     return Object.values(w).sort((a,b)=>(b.missed_questions*2+b.shaky_cards)-(a.missed_questions*2+a.shaky_cards)).slice(0,10);}},
  {name:'search_material',label:'Searched the material',description:'Search the notes, numbers tables, flashcards and practice questions. Returns the best matches with short excerpts. Use before answering factual questions so answers match the site’s material.',
   schema:{type:'object',properties:{query:{type:'string',description:'Words to search for, e.g. "occupant load business"'}},required:['query'],additionalProperties:false},
   run:i=>{const q=String(i.query||'').trim();if(!q)throw new Error('query is empty');return search(q).slice(0,8).map(r=>({kind:r.k,title:r.t.slice(0,140),excerpt:r.x.slice(0,500)}));},
   note:i=>'“'+String(i.query||'')+'”'},
  {name:'get_notes',label:'Read the notes',description:'The full notes text for one objective (e.g. "PPD 2.2"), plus the student’s own points on it.',
   schema:{type:'object',properties:{objective:{type:'string'}},required:['objective'],additionalProperties:false},
   run:i=>{const o=String(i.objective||'').trim().toUpperCase().replace(/\s+/,' '), d=odiv(o); if(!d)throw new Error('Use an objective like "PA 4.1".');
     const tpl=$('#tpl-'+d.toLowerCase()); if(!tpl)throw new Error('Notes not loaded.');
     const out=[]; $$('h3',tpl.content).forEach(h=>{if(![...h.querySelectorAll('.obj')].some(c=>c.textContent.trim()===o))return;let t=h.textContent+'\n',n=h.nextElementSibling;while(n&&!/^H[1-3]$/.test(n.tagName)){t+=n.textContent.replace(/\s+/g,' ').trim()+'\n';n=n.nextElementSibling;}out.push(t);});
     const pts=myPoints().filter(p=>p.div===d&&p.obj===o.split(' ')[1]).map(p=>strip(md2html(p.text)));
     return {objective:o,title:objTitle(o),notes:out.join('\n').slice(0,8000)||'(no notes section for this objective)',my_points:pts};},
   note:i=>String(i.objective||'')},
  {name:'practice_questions',label:'Picked practice questions',description:'Practice questions for quizzing, with the correct answers so you can grade. Never show the correct letters or explanation until the student has answered.',
   schema:{type:'object',properties:{objective:{type:'string',description:'e.g. "PA 4.1", or "" for any'},division:{type:'string',description:'PA, PPD, PDD or ""'},count:{type:'integer'},which:{type:'string',enum:['unanswered','missed','due_mistakes','any']}},required:['count'],additionalProperties:false},
   run:i=>{let l=ITEMS.slice();const o=String(i.objective||'').trim().toUpperCase(),d=String(i.division||'').toUpperCase();
     if(o)l=l.filter(q=>q.o===o); if(d)l=l.filter(q=>q.d===d);
     if(i.which==='unanswered')l=l.filter(q=>!S.ans[q.id]); if(i.which==='missed')l=l.filter(q=>S.ans[q.id]&&!S.ans[q.id].ok);
     if(i.which==='due_mistakes'){const due=mistDue();l=l.filter(q=>due.includes(q.id));}
     return shuffle(l).slice(0,Math.max(1,Math.min(10,+i.count||3))).map(qView);},
   note:i=>[i.objective||i.division||'any',i.which||''].filter(Boolean).join(' · ')},
  {name:'record_answer',label:'Recorded your answer',description:'Record the student’s answer to a practice question (updates their score and mistake log exactly like the Practice page). Call once per answer.',
   schema:{type:'object',properties:{question_id:{type:'string'},choices:{type:'array',items:{type:'string'},description:'The student’s answer: option letters for multiple choice and check-all (e.g. ["B"] or ["A","C"]); the number for fill-in (e.g. ["400"]); one choice letter per statement, in order, for matching (e.g. ["B","A","C"])'}},required:['question_id','choices'],additionalProperties:false},
   run:i=>{const it=ITEM(String(i.question_id));if(!it)throw new Error('No question with question_id '+i.question_id+'.');
     const sel=selFrom(it,i.choices);
     const info=record(it.id,sel);return {correct:itemOk(it,sel),correct_answer:rightText(it),note:info?strip(info.msg):''};},
   note:i=>String(i.question_id||'')+' → '+(i.choices||[]).join(',')},
  {name:'due_flashcards',label:'Picked flashcards',description:'Flashcards that are due now (weakest first), then new ones. Show the question, let the student answer, then reveal.',
   schema:{type:'object',properties:{count:{type:'integer'},objective:{type:'string'}},required:['count'],additionalProperties:false},
   run:i=>{const now=Date.now();let p=CARDS.slice();const o=String(i.objective||'').trim().toUpperCase();if(o)p=p.filter(c=>c.o===o);
     const due=p.filter(c=>S.cards[c.id]&&S.cards[c.id].due<=now).sort((a,b)=>S.cards[a.id].b-S.cards[b.id].b), nw=shuffle(p.filter(c=>!S.cards[c.id]));
     return due.concat(nw).slice(0,Math.max(1,Math.min(15,+i.count||5))).map(c=>({card_id:c.id,deck:c.d,objective:c.o,question:strip(c.q),answer:strip(c.a)}));}},
  {name:'rate_flashcard',label:'Rated a flashcard',description:'Save the student’s rating for a flashcard: again (did not know it), shaky (partly), good (knew it). Schedules its next review.',
   schema:{type:'object',properties:{card_id:{type:'string'},rating:{type:'string',enum:['again','shaky','good']}},required:['card_id','rating'],additionalProperties:false},
   run:i=>({saved:true,schedule:toolRating(String(i.card_id),{again:1,shaky:2,good:3}[i.rating]||3)}),
   note:i=>String(i.card_id||'')+' · '+String(i.rating||'')},
  {name:'add_flashcards',label:'Added flashcards',undoable:'cards',description:'Add flashcards to the student’s own material (private to them). Only after they ask for new cards.',
   schema:{type:'object',properties:{cards:{type:'array',items:{type:'object',properties:{deck:{type:'string'},objective:{type:'string',description:'e.g. "PDD 1.5"'},question:{type:'string'},answer:{type:'string'}},required:['deck','objective','question','answer'],additionalProperties:false}}},required:['cards'],additionalProperties:false},
   run:(i,ctx)=>{const ids=[];(i.cards||[]).slice(0,25).forEach(c=>{const q=String(c.question||'').trim(),a=String(c.answer||'').trim();if(!q||!a)return;const d=odiv(String(c.objective||'').toUpperCase()),ob=(String(c.objective||'').match(/\d+\.\d+/)||[''])[0];
       const id=newUid();S.custom=S.custom||{};S.custom.cards=S.custom.cards||{};S.custom.cards[id]={d:String(c.deck||'My cards').slice(0,60),o:d?(ob?d+' '+ob:d):'—',q:oneLine(q),a:md2html(a),qraw:q,araw:a,at:Date.now()};ids.push(id);});
     if(!ids.length)throw new Error('No valid cards (each needs question and answer).');rebuildMaterial();save();ctx.ids=ids;return {added:ids.length};},
   note:i=>(i.cards||[]).length+' card'+((i.cards||[]).length===1?'':'s')},
  {name:'add_practice_question',label:'Added a practice question',undoable:'items',description:'Add one practice question to the student’s own material. mc has exactly one correct option; cata has two or more.',
   schema:{type:'object',properties:{objective:{type:'string'},type:{type:'string',enum:['mc','cata']},question:{type:'string'},options:{type:'array',items:{type:'string'}},correct:{type:'array',items:{type:'string'},description:'Letters of the correct options'},explanation:{type:'string'}},required:['objective','type','question','options','correct','explanation'],additionalProperties:false},
   run:(i,ctx)=>{const o=String(i.objective||'').toUpperCase(),d=odiv(o),ob=(o.match(/\d+\.\d+/)||[''])[0];if(!d)throw new Error('objective must start with PA, PPD or PDD.');
     const opts=(i.options||[]).map(x=>String(x).replace(/^[A-Z][.)]\s*/,'').trim()).filter(Boolean),c=[...new Set((i.correct||[]).map(x=>String(x).trim().toUpperCase().charCodeAt(0)-65).filter(k=>k>=0&&k<opts.length))];
     if(opts.length<2||!c.length)throw new Error('Need 2+ options and at least one correct letter.');
     const t=i.type==='cata'||c.length>1?'cata':'mc',id=newUid();S.custom=S.custom||{};S.custom.items=S.custom.items||{};
     S.custom.items[id]={d,o:ob?d+' '+ob:d,t,s:oneLine(String(i.question)),opts,c,e:String(i.explanation||''),sraw:String(i.question),eraw:String(i.explanation||''),at:Date.now()};rebuildMaterial();save();ctx.ids=[id];return {added:1,question_id:id};},
   note:i=>String(i.objective||'')},
  {name:'add_study_point',label:'Added a study point',undoable:'points',description:'Save a short study note to the student’s own material. It also shows under that objective in the notes.',
   schema:{type:'object',properties:{objective:{type:'string',description:'e.g. "PA 4.3", or a division like "PPD"'},text:{type:'string'}},required:['objective','text'],additionalProperties:false},
   run:(i,ctx)=>{const o=String(i.objective||'').toUpperCase(),d=odiv(o)||'GEN',ob=(o.match(/\d+\.\d+/)||[''])[0],t=String(i.text||'').trim();if(!t)throw new Error('text is empty');
     const id=newUid();S.custom=S.custom||{};S.custom.points=S.custom.points||{};S.custom.points[id]={div:d,obj:d==='GEN'?'':ob,text:t.slice(0,4000),at:Date.now()};rebuildMaterial();save();ctx.ids=[id];return {saved:true};},
   note:i=>String(i.objective||'')},
  {name:'tick_plan_task',label:'Updated your plan',description:'Mark a study-plan task done or not done, using task_id from study_status.',
   schema:{type:'object',properties:{task_id:{type:'string'},done:{type:'boolean'}},required:['task_id','done'],additionalProperties:false},
   run:i=>{const id=String(i.task_id||'');if(!/^c?w\d+t\d+$/.test(id))throw new Error('Unknown task_id.');if(i.done)S.plan[id]=1;else delete S.plan[id];logAct();save();return {ok:true};},
   note:i=>String(i.task_id||'')+(i.done?' ✓':' ✗')},
  {name:'open_page',label:'Opened a page',description:'Show the student a page of the site: today, cards, practice, mistakes, plan, overview, objectives, pa, ppd, pdd, numbers or mine. With an objective, scrolls to its notes.',
   schema:{type:'object',properties:{page:{type:'string'},objective:{type:'string'}},required:['page'],additionalProperties:false},
   run:i=>{const o=String(i.objective||'').trim().toUpperCase();if(o&&odiv(o)){gotoObj(o);return {opened:o};}const p=String(i.page||'').toLowerCase();if(!PAGES.some(x=>x.id===p))throw new Error('Unknown page.');go(p);return {opened:p};},
   note:i=>String(i.objective||i.page||'')}
];
const CHAT_SYS=()=>AI_SYS+'\n\nYou are the study tutor inside the student’s ARE Study System web page. You can use tools to read their progress and the site’s material, quiz them, record answers, rate flashcards, add material to their own collection, tick plan tasks and open pages. Prefer the site’s own material (search_material, get_notes) for facts. When quizzing, ask one question at a time, show lettered options, wait for the student’s reply, then call record_answer before explaining. Never reveal an answer before the student responds. Keep replies short unless asked for more. Today is '+ds(new Date())+'.';

/* ---------- rendering ---------- */
function mdRich(t){
  const parts=String(t||'').split(/```[a-z]*\n?/i);
  return parts.map((p,i)=>i%2?'<pre class="chcode"><code>'+esc(p.replace(/\n$/,''))+'</code></pre>':md2html(p.replace(/^#{1,4}\s+(.*)$/gm,'**$1**'))).join('');
}
function toolRow(tr){
  const t=CHAT_TOOLS.find(x=>x.name===tr.name)||{label:tr.name};
  const icon=tr.error?'!':tr.done?'✓':'…';
  return '<details class="chtool'+(tr.error?' err':'')+'"'+(tr.id?' data-tid="'+tr.id+'"':'')+'><summary><span class="ti">'+icon+'</span>'+esc(t.label)+(tr.note?' <span class="tn">'+esc(tr.note)+'</span>':'')+
    (tr.undo&&!tr.undone?'<button type="button" class="lnk" data-undo="'+esc(tr.undo)+'" data-ids="'+esc((tr.ids||[]).join(','))+'" data-tid="'+tr.id+'">Undo</button>':'')+(tr.undone?' <span class="tn">undone</span>':'')+'</summary>'+
    '<pre>'+esc(tr.error?tr.error:JSON.stringify(tr.result,null,1)||'').slice(0,3000)+'</pre></details>';
}
function paintChatLog(){
  const log=$('#chLog'); if(!log)return;
  if(!CUR||!CUR.view.length){
    log.innerHTML='<div class="chempty"><b>Study with '+AI_NAME()+'</b><p>'+(PROV()==='chatgpt'?'ChatGPT sees this page and your study status, explains, quizzes you and plans with you. Answers you give in the chat aren’t recorded; use Practice and Flashcards for that.':'Claude can see this page, quiz you from your question bank, run your flashcards, and add material to your collection.')+'</p><div class="chstarters">'+
      ['What should I study today?','/quiz PA 4.1','/cards','Explain what is on my screen'].map(s=>'<button type="button" data-starter="'+esc(s)+'">'+esc(s)+'</button>').join('')+'</div></div>';return;}
  log.innerHTML=CUR.view.map(m=>m.role==='user'?'<div class="cm user">'+esc(m.text).replace(/\n/g,'<br>')+'</div>':
    '<div class="cm assistant">'+(m.tools||[]).map(toolRow).join('')+(m.text?mdRich(m.text):(m.pending?'<span class="small chthink">Thinking…</span>':''))+(m.error?'<div class="aerr" style="margin:6px 0 0">'+esc(m.error)+'</div>':'')+'</div>').join('');
  log.scrollTop=log.scrollHeight;
}
function paintHistory(){
  const h=$('#chHistList'); chatsLoad();
  h.innerHTML='<div class="chhh"><b>Past chats</b><span class="small">saved on this device</span></div>'+(CHATS.length?CHATS.map(c=>'<div class="chhrow'+(CUR&&c.id===CUR.id?' on':'')+'"><button type="button" class="chho" data-open="'+c.id+'">'+esc(c.title||'Untitled')+'<span>'+esc(fmtDate(new Date(c.at),{day:'numeric',month:'short'}))+(c.route!==PROV()?' · '+(c.route==='chatgpt'?'ChatGPT':'Claude'):'')+'</span></button><button type="button" class="chib" data-del="'+c.id+'" aria-label="Delete chat"><svg viewBox="0 0 24 24"><path d="M6 7h12M9 7V5h6v2M8 7l1 12h6l1-12"/></svg></button></div>').join(''):'<p class="small" style="padding:8px 12px">No saved chats yet.</p>');
  h.onclick=e=>{const o=e.target.closest('[data-open]'),d=e.target.closest('[data-del]');
    if(o&&!chatBusy){CUR=CHATS.find(c=>c.id===o.dataset.open)||CUR;h.hidden=true;paintChatLog();}
    if(d){CHATS=CHATS.filter(c=>c.id!==d.dataset.del);chatsSave();if(CUR&&CUR.id===d.dataset.del)newChat();paintHistory();paintChatLog();}};
}
function undoTool(btn){
  const kind=btn.dataset.undo, ids=(btn.dataset.ids||'').split(',').filter(Boolean);
  ids.forEach(id=>{if(S.custom&&S.custom[kind])delete S.custom[kind][id];}); rebuildMaterial(); save();
  CUR.view.forEach(m=>(m.tools||[]).forEach(t=>{if(t.id===btn.dataset.tid)t.undone=true;})); chatsSave(); paintChatLog(); toast('Undone');
  if(curPage==='mine'||curPage==='cards'||curPage==='practice')go(curPage,{keepScroll:true});
}

/* ---------- sending ---------- */
async function runTool(name,input,trow){
  const t=CHAT_TOOLS.find(x=>x.name===name); const ctx={};
  trow.note=t&&t.note?t.note(input||{}):'';
  try{if(!t)throw new Error('Unknown tool '+name);const r=await t.run(input||{},ctx);trow.done=true;trow.result=r;if(t.undoable&&ctx.ids){trow.undo=t.undoable;trow.ids=ctx.ids;}
    if(['add_flashcards','add_practice_question','add_study_point','record_answer','rate_flashcard','tick_plan_task'].includes(name)&&['today','mine','cards','practice','mistakes','plan'].includes(curPage)&&name!=='open_page'){/* refresh numbers quietly */ if(curPage==='today'||curPage==='mine'||curPage==='plan')go(curPage,{keepScroll:true});}
    return r;}
  catch(e){trow.done=true;trow.error=String(e&&e.message||e);throw e;}
}
async function sendChatMsg(){
  const inp=$('#chIn'); let raw=inp.value.trim(); if(!raw||chatBusy)return;
  $('#chSlash').hidden=true; inp.value='';
  if(!CUR)newChat();
  const prompt=expandSlash(raw), ctx=ctxOn?ctxNow().text:'';
  const content=(ctx?'[What I am looking at: '+ctx+']\n\n':'')+prompt;
  CUR.view.push({role:'user',text:raw}); const am={role:'assistant',text:'',tools:[],pending:true}; CUR.view.push(am);
  if(!CUR.title)CUR.title=raw.slice(0,60); CUR.at=Date.now();
  paintChatLog(); chatBusy=new AbortController(); $('#chSend').textContent='Stop';
  const paint=()=>{const last=$('#chLog').lastElementChild;if(last){last.outerHTML='<div class="cm assistant">'+am.tools.map(toolRow).join('')+(am.text?mdRich(am.text):'<span class="small chthink">Thinking…</span>')+'</div>';$('#chLog').scrollTop=$('#chLog').scrollHeight;}};
  try{
    const ag=await agentContext(prompt); CUR.agent=curAgent().id;
    if(PROV()==='chatgpt')await chatViaChatGPT(content,am,paint,ag); else await chatViaPlan(content,am,paint,ag);
  }catch(e){am.error=e&&e.aborted?'':String(e&&e.message||'Something went wrong.');if(!am.text&&!am.tools.length&&!e.aborted)inp.value=raw;}
  am.pending=false; chatBusy=null; $('#chSend').textContent='Send';
  const i=CHATS.findIndex(c=>c.id===CUR.id); if(i>=0)CHATS.splice(i,1); CHATS.unshift(CUR); chatsSave();
  paintChatLog(); paintCtx();
}
/* claude.ai-plan route: sample() runs the tool rounds and calls these page functions */
async function chatViaPlan(content,am,paint,ag){
  ag=ag||{sys:'',sources:''}; if(ag.sources)content=ag.sources+'\n\n'+content;
  if(!SAMPLE)throw new Error('Claude is not available in this view.');
  let canTools=false; try{const lim=await SAMPLE.limits();canTools=!!lim.tools;}catch(e){}
  const turns=CUR.view.slice(0,-2).filter(m=>m.text).slice(-16).map(m=>({role:m.role,content:m.role==='user'?m.text:m.text.slice(0,4000)}));
  const input=[{role:'user',content:'Instructions for this conversation: '+CHAT_SYS()+ag.sys+(canTools?'':'\n(Tools are not available in this view: answer from the context given.)')}].concat(turns).concat([{role:'user',content}]);
  const opts={signal:chatBusy.signal,onText:({text})=>{am.text=text;paint();}};
  if(canTools)opts.tools=CHAT_TOOLS.map(t=>({name:t.name,description:t.description,inputSchema:t.schema,
    execute:async(inp)=>{const tr={id:'t'+Math.random().toString(36).slice(2,8),name:t.name};am.tools.push(tr);paint();try{const r=await runTool(t.name,inp,tr);paint();return r;}catch(e){paint();throw e;}}}));
  else opts.cache=false;
  try{const r=await SAMPLE(input,opts);am.text=r.text;}
  catch(e){if(e&&e.text)am.text=e.text;throw sampleErr(e);}
}
/* ChatGPT route (website): answers stream from aws/chatgpt.js on the person's ChatGPT plan. It has no page tools,
   so it gets a snapshot of the student's status with each message instead. */
async function chatViaChatGPT(content,am,paint,ag){
  ag=ag||{sys:'',sources:''}; if(ag.sources)content=ag.sources+'\n\n'+content;
  const snap={};
  ['study_status','weak_spots'].forEach(n=>{try{snap[n]=CHAT_TOOLS.find(t=>t.name===n).run({},{});}catch(e){}});
  const sys=AI_SYS+'\n\nYou are the study tutor inside the student’s ARE Study System web page, answering on their own ChatGPT plan. You can’t change their data from here: their answers in this chat are not recorded, so for scored practice send them to the Practice, Flashcards or Mistakes pages. You may still quiz them with your own questions, one at a time, waiting for their answer before explaining. Keep replies short unless asked for more. Today is '+ds(new Date())+'.\n\nThe student’s current status (JSON): '+JSON.stringify(snap).slice(0,6000)+ag.sys;
  const turns=CUR.view.slice(0,-2).filter(m=>m.text).slice(-16).map(m=>({role:m.role,content:m.role==='user'?m.text:m.text.slice(0,4000)}));
  try{am.text=await cgStream({system:sys,messages:turns.concat([{role:'user',content}]),signal:chatBusy.signal,onText:t=>{am.text=t;paint();}});}
  catch(e){if(e&&e.text)am.text=e.text;throw e;}
}
