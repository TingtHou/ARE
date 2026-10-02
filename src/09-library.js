
/* ================= MY LIBRARY AND MY AGENTS =================
   Library: each person uploads their own documents (PDF, Word, text). The browser extracts the text, cuts it into
   passages and uploads them to the account (aws/connector.js, /library); the AI searches them to answer, quiz and
   draft cards and questions. Agents: named instructions plus which documents to use, kept in S.agents, picked in
   the chat panel. The Claude connector can read both too. */
const LIB={docs:null,used:0,limit:15e6,busy:'',err:''};
const PDFJS_URL='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/6.3.289/pdf.min.mjs', PDFJS_WORKER='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/6.3.289/pdf.worker.min.mjs';
const MAMMOTH_URL='https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.13.0/mammoth.browser.min.js';
const LIB_TYPES='.pdf,.docx,.txt,.md,.markdown,.html,.htm,.csv';
async function libApi(path,opts){
  const t=await idToken(); if(!t)throw new Error('Sign in to the study website again.');
  let r;
  try{r=await fetch(AC.apiUrl.replace(/\/+$/,'')+path,Object.assign({},opts,{headers:{authorization:'Bearer '+t,'content-type':'application/json'}}));}
  catch(e){throw new Error('Couldn’t reach the library service. Check your connection; if this keeps happening, the AWS stack may need the My library update (aws/SETUP.md, “My library and my agents”).');}
  let j={}; try{j=await r.json();}catch(e){}
  if(r.status===404&&j.error==='not found')throw new Error('My library isn’t switched on yet: the site admin needs to update the AWS stack with the latest aws/are-accounts.yaml (see aws/SETUP.md, “My library and my agents”).');
  if(!r.ok)throw new Error(j.error||('The study server answered '+r.status+'.'));
  return j;
}
async function libLoad(){try{const j=await libApi('/library');LIB.docs=j.docs||[];LIB.used=j.used||0;LIB.limit=j.limit||LIB.limit;LIB.err='';}catch(e){LIB.err=e.message;if(!LIB.docs)LIB.docs=null;}return LIB.docs;}
async function docText(id,topic){
  if(topic){const j=await libApi('/library/search?q='+encodeURIComponent(topic)+'&docs='+encodeURIComponent(id)+'&k=12');return j.results.map(x=>(x.page?'[p. '+x.page+'] ':'')+x.text).join('\n\n');}
  const j=await libApi('/library/chunks?id='+encodeURIComponent(id)+'&from=0&n=24');return j.chunks.map(x=>(x.p?'[p. '+x.p+'] ':'')+x.t).join('\n\n');
}

/* ---------- reading files in the browser ---------- */
let PDFJS=null;
async function pdfLib(){
  if(PDFJS)return PDFJS;
  const lib=await import(PDFJS_URL);
  // browsers refuse a worker script from another site, so pdf.js runs on the page instead (its built-in fallback);
  // pages are read one at a time, so the page stays responsive between them
  globalThis.pdfjsWorker=await import(PDFJS_WORKER);
  lib.GlobalWorkerOptions.workerSrc=PDFJS_WORKER;
  return PDFJS=lib;
}
function loadScript(src){return new Promise((ok,no)=>{const s=document.createElement('script');s.src=src;s.onload=ok;s.onerror=()=>no(new Error('Could not load '+src));document.head.appendChild(s);});}
async function readFile(file,onProg){
  const ext=(file.name.match(/\.([a-z0-9]+)$/i)||['',''])[1].toLowerCase();
  if(ext==='pdf'){
    const lib=await pdfLib(), doc=await lib.getDocument({data:new Uint8Array(await file.arrayBuffer())}).promise, pages=[];
    for(let i=1;i<=doc.numPages;i++){const pg=await doc.getPage(i), tc=await pg.getTextContent();pages.push({p:i,text:tc.items.map(it=>(it.str||'')+(it.hasEOL?'\n':' ')).join('')});if(onProg)onProg(i/doc.numPages);}
    return {type:'pdf',pages,count:doc.numPages};
  }
  if(ext==='docx'){
    if(!window.mammoth)await loadScript(MAMMOTH_URL);
    const r=await window.mammoth.extractRawText({arrayBuffer:await file.arrayBuffer()});
    return {type:'docx',pages:[{p:null,text:r.value}],count:null};
  }
  if(['html','htm'].includes(ext)){const d=new DOMParser().parseFromString(await file.text(),'text/html');return {type:'html',pages:[{p:null,text:d.body?d.body.innerText||d.body.textContent:''}],count:null};}
  if(['txt','md','markdown','csv'].includes(ext))return {type:ext,pages:[{p:null,text:await file.text()}],count:null};
  throw new Error('Can’t read .'+ext+' files. Use PDF, Word (.docx), text or Markdown.');
}
/* passages of up to ~1,400 characters that never cross a page, so every passage keeps its page number */
function chunkPages(pages){
  const out=[], MAX=1400;
  pages.forEach(pg=>{
    const paras=String(pg.text||'').replace(/\r/g,'').split(/\n\s*\n/).map(s=>s.replace(/[ \t]+/g,' ').replace(/\s*\n\s*/g,' ').trim()).filter(Boolean);
    let cur='';
    const push=()=>{if(cur.trim())out.push({t:cur.trim(),p:pg.p});cur='';};
    paras.forEach(para=>{
      if(para.length>MAX){push();(para.match(/[^.!?]+[.!?]+["')\]]*\s*|[^.!?]+$/g)||[para]).forEach(s=>{if((cur+s).length>MAX)push();if(s.length>MAX){for(let i=0;i<s.length;i+=MAX)out.push({t:s.slice(i,i+MAX).trim(),p:pg.p});}else cur+=s;});push();}
      else if(cur&&(cur.length+para.length+1)>MAX){push();cur=para;}
      else cur+=(cur?'\n':'')+para;
    });
    push();
  });
  return out.filter(c=>c.t.length>1);
}
async function libUpload(files,box){
  for(const file of files){
    try{
      if(file.size>60e6)throw new Error(file.name+' is larger than 60 MB.');
      LIB.busy='Reading '+file.name+'…'; paintLibrary(box);
      const r=await readFile(file,f=>{LIB.busy='Reading '+file.name+'… '+Math.round(f*100)+'%';const s=$('#libBusy');if(s)s.textContent=LIB.busy;});
      const chunks=chunkPages(r.pages), chars=chunks.reduce((n,c)=>n+c.t.length,0);
      if(!chars)throw new Error(file.name+' has no text the site can read. If it’s a scanned PDF (pictures of pages), it needs text recognition (OCR) first.');
      const thin=r.type==='pdf'&&r.count>2&&chars/r.count<150;
      const parts=[]; let cur=[], size=0;
      chunks.forEach(c=>{const s=JSON.stringify(c).length;if(cur.length&&size+s>240000){parts.push(cur);cur=[];size=0;}cur.push(c);size+=s;}); if(cur.length)parts.push(cur);
      if(parts.length>80)throw new Error(file.name+' is too long to add. Split it into smaller files.');
      const id='d-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,8);
      for(let i=0;i<parts.length;i++){
        LIB.busy='Uploading '+file.name+'… '+Math.round(i/parts.length*100)+'%'; const s=$('#libBusy'); if(s)s.textContent=LIB.busy;
        await libApi('/library/upload',{method:'POST',body:JSON.stringify({id,name:file.name,type:r.type,pages:r.count,chars,chunkCount:chunks.length,part:i,parts:parts.length,chunks:parts[i]})});
      }
      toast('Added '+file.name+(thin?' · some pages had little text (scanned?)':''));
      if(thin)LIB.err=file.name+': some pages had very little text. If parts are scanned images, those parts can’t be searched.';
    }catch(e){LIB.err=e.message||String(e);}
  }
  LIB.busy=''; await libLoad(); paintLibrary(box); paintAgents($('#agBox'));
}
const kb=n=>n>=1e6?(n/1e6).toFixed(1)+' M':n>=1e3?Math.round(n/1e3)+' K':String(n);
function paintLibrary(box){
  box=box||$('#libBox'); if(!box)return;
  const head='<h2 class="s">My library <span class="pill">'+(LIB.docs?LIB.docs.filter(d=>d.done).length:'·')+'</span></h2>';
  if(!AUTH_ON){box.innerHTML=head+'<p class="small" style="color:var(--ink-3)">Uploading documents works on the study website, signed in to your account.</p>';return;}
  if(LIB.docs===null&&!LIB.err){box.innerHTML=head+'<p class="small">Loading your documents…</p>';libLoad().then(()=>paintLibrary(box));return;}
  const docs=(LIB.docs||[]).slice().sort((a,b)=>b.at-a.at);
  box.innerHTML=head+'<p class="small">Upload your own books, notes and handouts (PDF, Word, text). The AI reads them to answer your questions, quiz you, and draft cards and questions, and cites the page. Only you can see them. The site keeps the text, not the file.</p>'+
    '<div class="libdrop" id="libDrop"><button type="button" class="btn pri" data-lib="pick"'+(LIB.busy?' disabled':'')+'>Upload documents</button><span class="small">or drop files here · PDF, .docx, .txt, .md</span><input type="file" id="libFile" multiple accept="'+LIB_TYPES+'" hidden></div>'+
    (LIB.busy?'<p class="small" id="libBusy">'+esc(LIB.busy)+'</p>':'')+(LIB.err?'<div class="aerr">'+esc(LIB.err)+' <button type="button" class="lnk" data-lib="clearerr">OK</button></div>':'')+
    (docs.length?docs.map(d=>'<div class="mrow"><span class="obj">'+esc((d.type||'doc').toUpperCase())+'</span><span class="mt">'+esc(d.name)+' <span style="color:var(--ink-3)">· '+(d.pages?d.pages+' pages · ':'')+kb(d.chars||0)+' characters'+(d.done?'':' · upload unfinished')+'</span></span><span class="mb">'+
      (d.done?'<button type="button" class="lnk" data-libask="'+esc(d.id)+'">Ask about it</button><button type="button" class="lnk" data-libgen="'+esc(d.id)+'">Make cards &amp; questions</button>':'')+'<button type="button" class="lnk" data-libdel="'+esc(d.id)+'">Delete</button></span></div>').join(''):'<p class="small" style="color:var(--ink-3)">No documents yet.</p>')+
    (docs.length?'<p class="small" style="color:var(--ink-3)">Using '+kb(LIB.used)+' of '+kb(LIB.limit)+' characters.</p>':'');
  const inp=$('#libFile',box), drop=$('#libDrop',box);
  inp.onchange=()=>{if(inp.files.length)libUpload([...inp.files],box);};
  drop.ondragover=e=>{e.preventDefault();drop.classList.add('on');}; drop.ondragleave=()=>drop.classList.remove('on');
  drop.ondrop=e=>{e.preventDefault();drop.classList.remove('on');if(!LIB.busy&&e.dataTransfer.files.length)libUpload([...e.dataTransfer.files],box);};
  box.onclick=async e=>{
    const t=e.target.closest('[data-lib],[data-libask],[data-libgen],[data-libdel],[data-libdelyes]'); if(!t)return;
    const doc=id=>(LIB.docs||[]).find(d=>d.id===id);
    if(t.dataset.lib==='pick')inp.click();
    if(t.dataset.lib==='clearerr'){LIB.err='';paintLibrary(box);}
    if(t.dataset.libask){const d=doc(t.dataset.libask);if(d)chatAboutDoc(d);}
    if(t.dataset.libgen){const d=doc(t.dataset.libgen);if(d)openGenerate({doc:{id:d.id,name:d.name}},()=>go('mine',{keepScroll:true}));}
    if(t.dataset.libdel){const d=doc(t.dataset.libdel);t.parentNode.innerHTML='<span class="small">Delete “'+esc(d.name)+'”?</span> <button type="button" class="lnk" data-libdelyes="'+esc(d.id)+'">Delete</button><button type="button" class="lnk" data-lib="cancel">Keep</button>';}
    if(t.dataset.lib==='cancel')paintLibrary(box);
    if(t.dataset.libdelyes){try{await libApi('/library/doc?id='+encodeURIComponent(t.dataset.libdelyes),{method:'DELETE'});
      Object.values(S.agents||{}).forEach(a=>{if(Array.isArray(a.docs))a.docs=a.docs.filter(x=>x!==t.dataset.libdelyes);});save();toast('Deleted');}catch(err){LIB.err=err.message;}
      await libLoad();paintLibrary(box);paintAgents($('#agBox'));}
  };
}

/* ---------- agents ---------- */
const AGENT_PRESETS=[
  {id:'tutor',name:'Study tutor',instructions:''},
  {id:'examiner',name:'Examiner',instructions:'Act as a strict ARE examiner. Ask one NCARB-style question at a time (multiple choice or check-all-that-apply, lettered options), wait for my answer, then mark it right or wrong with a two-line explanation and the trap. No hints before I answer. Keep score in the chat and make the questions harder after three right in a row.'},
  {id:'code',name:'Code coach',instructions:'Focus on the 2021 IBC and the 2010 ADA Standards. Always name the section or table, give the number with its conditions, and say plainly when you are not sure. Point out the usual traps: older code editions, net vs gross, sprinklered vs not.'},
  {id:'explainer',name:'Explainer',instructions:'Explain in plain language for someone meeting the topic for the first time: the idea in one sentence, a concrete building example, an analogy, then a memory hook. Define any jargon you use.'},
  {id:'planner',name:'Planner',instructions:'Help me plan my study time. Use my plan week, exam dates, due cards, due mistakes and weak spots, and give me a short, prioritized, time-boxed list for today or this week.'}
].map(a=>Object.assign(a,{preset:true,site:true,docs:'all'}));
const agentsMine=()=>Object.entries(S.agents||{}).map(([id,a])=>Object.assign({},a,{id,mine:true})).sort((a,b)=>(a.at||0)-(b.at||0));
const allAgents=()=>AGENT_PRESETS.concat(agentsMine());
const LSAG='are_agent';
function curAgent(){let id='tutor';try{id=localStorage.getItem(LSAG+':'+PROF.cur)||'tutor';}catch(e){}return allAgents().find(a=>a.id===id)||AGENT_PRESETS[0];}
function setAgent(id){try{localStorage.setItem(LSAG+':'+PROF.cur,id);}catch(e){}}
let CHAT_DOC=null;   // "Ask about it": the chat answers from this one document until cleared
function chatAboutDoc(d){CHAT_DOC={id:d.id,name:d.name};openChat();paintCtx();const i=$('#chIn');if(i&&!i.value)i.placeholder='Ask about '+d.name+', or “quiz me on it”';}
const docsLabel=a=>a.docs==='all'?'all my documents':Array.isArray(a.docs)&&a.docs.length?a.docs.map(id=>((LIB.docs||[]).find(d=>d.id===id)||{name:'(deleted)'}).name).join(', '):'no documents';
function agentEditor(a,done){
  a=a||{name:'',instructions:'',site:true,docs:'all'};
  const docs=(LIB.docs||[]).filter(d=>d.done), mode=a.docs==='all'?'all':Array.isArray(a.docs)&&a.docs.length?'some':'none';
  modalForm('<div class="lbl">My agents</div><div class="q">'+(a.id?'Edit agent':'New agent')+'</div>'+
    '<form class="edf" id="agForm"><label class="af"><span>Name</span><input id="agName" maxlength="60" required value="'+esc(a.name||'')+'" placeholder="e.g. Structures examiner"></label>'+
    '<label class="af"><span>Instructions</span><textarea id="agIns" rows="8" maxlength="8000" placeholder="How it should behave: what to focus on, how to quiz you, how long the answers are. You can paste the instructions of a custom GPT here.">'+esc(a.instructions||'')+'</textarea></label>'+
    '<div class="af"><span>Answer from</span><label class="pass"><input type="checkbox" id="agSite"'+(a.site!==false?' checked':'')+'> The site’s notes and my material</label>'+
    '<label class="pass"><input type="radio" name="agD" value="all"'+(mode==='all'?' checked':'')+'> All my documents</label>'+
    '<label class="pass"><input type="radio" name="agD" value="some"'+(mode==='some'?' checked':'')+(docs.length?'':' disabled')+'> Only these documents:</label>'+
    (docs.length?'<div class="agdocs">'+docs.map(d=>'<label class="pass"><input type="checkbox" class="agDoc" value="'+esc(d.id)+'"'+(Array.isArray(a.docs)&&a.docs.includes(d.id)?' checked':'')+'> '+esc(d.name)+'</label>').join('')+'</div>':'<p class="ahint">Upload documents in My library first.</p>')+
    '<label class="pass"><input type="radio" name="agD" value="none"'+(mode==='none'?' checked':'')+'> No documents</label></div>'+
    '<div id="agMsg"></div><div class="row"><button type="submit" class="btn pri">Save agent</button><button type="button" class="btn" data-a="close">Cancel</button>'+(a.id&&a.mine?'<button type="button" class="btn" data-a="del" style="color:var(--flag)">Delete</button>':'')+'</div></form>',
  (act,m,close)=>{if(act==='close')close();if(act==='del'){delete S.agents[a.id];if(curAgent().id===a.id)setAgent('tutor');save();close();toast('Agent deleted');if(done)done();}},
  (form,m,close)=>{
    const name=$('#agName',m).value.trim(), ins=$('#agIns',m).value.trim(), dm=(m.querySelector('input[name="agD"]:checked')||{}).value||'all';
    const picked=[...m.querySelectorAll('.agDoc:checked')].map(x=>x.value);
    if(!name){$('#agMsg',m).innerHTML='<div class="aerr">Give it a name.</div>';return;}
    if(dm==='some'&&!picked.length){$('#agMsg',m).innerHTML='<div class="aerr">Tick at least one document, or choose All or None.</div>';return;}
    const mine=agentsMine(); if(!a.id&&mine.length>=12){$('#agMsg',m).innerHTML='<div class="aerr">You can have up to 12 agents. Delete one first.</div>';return;}
    S.agents=S.agents||{}; const id=a.mine?a.id:'g'+Date.now().toString(36);
    S.agents[id]={name:name.slice(0,60),instructions:ins.slice(0,8000),site:$('#agSite',m).checked,docs:dm==='all'?'all':dm==='some'?picked:[],at:a.at||Date.now()};
    save(); setAgent(id); close(); toast('Agent saved · picked in the chat'); if(done)done();
  });
}
function paintAgents(box){
  box=box||$('#agBox'); if(!box)return;
  const mine=agentsMine();
  box.innerHTML='<h2 class="s">My agents <span class="pill">'+mine.length+'</span></h2><p class="small">An agent is a study helper with your own instructions, answering from the documents you choose. Pick one at the bottom of the chat panel. It works with ChatGPT on this site and with Claude through the connector (“use my Structures examiner agent”). Built in: '+AGENT_PRESETS.slice(1).map(a=>esc(a.name)).join(', ')+'.</p>'+
    '<div class="row" style="margin:6px 0 12px"><button type="button" class="btn sm pri" data-ag="new">+ New agent</button></div>'+
    (mine.length?mine.map(a=>'<div class="mrow"><span class="obj">agent</span><span class="mt">'+esc(a.name)+' <span style="color:var(--ink-3)">· '+esc([a.site!==false?'site notes':'',docsLabel(a)].filter(Boolean).join(' + '))+'</span></span><span class="mb"><button type="button" class="lnk" data-agchat="'+esc(a.id)+'">Chat</button><button type="button" class="lnk" data-agedit="'+esc(a.id)+'">Edit</button></span></div>').join(''):'<p class="small" style="color:var(--ink-3)">No agents of your own yet.</p>');
  box.onclick=e=>{const t=e.target.closest('[data-ag],[data-agchat],[data-agedit]');if(!t)return;
    const again=()=>{paintAgents(box);paintCtx();};
    if(t.dataset.ag==='new'){if(AUTH_ON&&LIB.docs===null)libLoad().then(()=>agentEditor(null,again));else agentEditor(null,again);}
    if(t.dataset.agedit){const a=allAgents().find(x=>x.id===t.dataset.agedit);if(a)agentEditor(a,again);}
    if(t.dataset.agchat){setAgent(t.dataset.agchat);CHAT_DOC=null;openChat();paintCtx();}};
}
/* what the chosen agent adds to a chat message: its instructions, and passages from its sources */
async function agentContext(q){
  const ag=curAgent();
  const sys=ag.instructions?'\n\nYou are the student’s agent “'+ag.name+'”. Follow these instructions from the student:\n'+ag.instructions:'';
  const src=[]; let docs=null, useDocs=false;
  if(CHAT_DOC){docs=[CHAT_DOC.id];useDocs=true;}
  else if(ag.docs==='all'){useDocs=LIB.docs===null||LIB.docs.some(d=>d.done);}
  else if(Array.isArray(ag.docs)&&ag.docs.length){docs=ag.docs;useDocs=true;}
  if(useDocs&&AUTH_ON&&AI_MODE!=='plan'&&q.trim()){
    try{const j=await libApi('/library/search?q='+encodeURIComponent(q.slice(0,400))+(docs?'&docs='+encodeURIComponent(docs.join(',')):'')+'&k='+(CHAT_DOC?8:6));
      j.results.forEach((x,i)=>src.push('[S'+(i+1)+'] '+x.name+(x.page?', p. '+x.page:'')+':\n'+x.text));}catch(e){}
  }
  if(ag.site!==false&&!CHAT_DOC&&q.trim())search(q).slice(0,4).forEach((h,i)=>src.push('[N'+(i+1)+'] '+h.k+' · '+h.t+':\n'+h.x.slice(0,600)));
  const focus=CHAT_DOC?'\n\nThe student is asking about their document “'+CHAT_DOC.name+'”. Answer from it; to quiz them, write questions from its passages, one at a time.':'';
  return {sys:sys+focus,sources:src.length?'[Passages found for this message. Base your answer on them when they cover it and cite them like [S1] or [N2], with the page for documents. If they don’t cover it, say so, then answer from general knowledge.]\n\n'+src.join('\n\n'):(useDocs&&!CHAT_DOC?'':CHAT_DOC?'[No passage in “'+CHAT_DOC.name+'” matched this message. Say so if you need the document to answer.]':'')};
}
