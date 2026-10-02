
/* ================= AI: on each person's own plan, Claude or ChatGPT =================
   claude.ai link: the page asks Claude directly (sample), on the viewer's claude.ai plan.
   Website, ChatGPT: each person connects their own ChatGPT plan once (a sign-in on their own computer with
     tools/chatgpt-signin.mjs); answers then stream into the page through aws/chatgpt.js.
   Website, Claude: the ARE Study System connector, added in Claude (Settings → Connectors); the "with Claude"
     buttons open claude.ai with a ready-made prompt. The connector reads and saves the same progress as this site. */
const AI_MODE=(window.claude&&window.claude.use)?'plan':'connector';
const CONNECTOR_URL=AC.apiUrl?AC.apiUrl.replace(/\/+$/,'')+'/mcp':'';
const AI_POSSIBLE=AI_MODE==='plan'||(AUTH_ON&&!!CONNECTOR_URL);
const LSC_DONE='are_connector_added';
let SAMPLE=undefined;   // the claude.ai sample function once resolved; null when this view can't use it
if(AI_MODE==='plan'){window.claude.use('sample').then(s=>{SAMPLE=s||null;paintAiBtn();}).catch(()=>{SAMPLE=null;paintAiBtn();});}
try{localStorage.removeItem('are_claude_key');sessionStorage.removeItem('are_claude_key');localStorage.removeItem('are_claude_model');}catch(e){}   // from the old API-key option
/* which AI answers in the page: the claude.ai plan, a connected ChatGPT plan, or none (hand off to Claude) */
const CG={url:'',st:null};
const cgReady=()=>!!(CG.st&&CG.st.connected&&CG.st.state==='ready');
const PROV=()=>AI_MODE==='plan'?'plan':cgReady()?'chatgpt':'connector';
const AI_NAME=()=>PROV()==='chatgpt'?'ChatGPT':'Claude';
const aiReady=()=>PROV()==='plan'?!!SAMPLE:PROV()==='chatgpt';
/* claude.ai route: sample() has no system prompt, so the instructions lead the first user turn */
const SAMPLE_MSG={not_granted:'This page is not allowed to use your Claude. Reload the page and choose Allow when claude.ai asks.',sampling_disabled:'Claude is not available for your claude.ai account here.',
  not_declared:'Claude features are switched off on this page.',capability_disabled:'Claude is not available in this view.',capability_removed:'This Claude app is too old for this feature. Update the app or open claude.ai in a browser.',
  rate_limited:'You have reached your Claude usage limit, or sent too many requests. Try again later.',session_expired:'Sign in to claude.ai again, then try once more.',
  refused:'Claude declined this request. Try rewording it.',empty_completion:'Claude returned an empty answer. Try asking for less.',invalid_json:'Claude’s answer was not in the expected format. Try again.',
  prompt_too_large:'That is too much text for one request. Shorten the notes and try again.'};
function sampleErr(e){if(e&&e.code==='cancelled')return Object.assign(new Error('Stopped.'),{ai:true,aborted:true});const x=new Error(SAMPLE_MSG[e&&e.code]||'Claude had a problem answering. Try again in a moment.');x.ai=true;x.code=e&&e.code;return x;}
function sampleInput(system,messages){
  const turns=messages.map(m=>({role:m.role,content:String(m.content)}));
  turns[0]={role:'user',content:(system?'Instructions for this conversation: '+system+'\n\n':'')+turns[0].content};
  return turns.length===1?turns[0].content:turns;
}
function noSample(){return Object.assign(new Error(SAMPLE===undefined?'Claude is still starting. Try again in a moment.':'Claude is not available in this view.'),{ai:true});}

/* ---------- ChatGPT: status, and answers streamed from aws/chatgpt.js (one JSON object per line) ---------- */
async function cgFetch(path,opts){
  const t=await idToken(); if(!t)throw Object.assign(new Error('Sign in to the study website again.'),{ai:true});
  return fetch(CG.url+path,Object.assign({},opts,{headers:{authorization:'Bearer '+t,'content-type':'application/json'}}));
}
async function cgLoad(models){
  if(!AUTH_ON||!SESSION)return CG.st;
  if(!CG.url){try{const r=await fetch(AC.apiUrl.replace(/\/+$/,'')+'/chatgpt-config');if(r.ok)CG.url=String((await r.json()).url||'').replace(/\/+$/,'');}catch(e){}}
  if(!CG.url){CG.st=null;paintAiBtn();return null;}
  try{const r=await cgFetch('/status'+(models?'?models=1':''));CG.st=r.ok?await r.json():{error:r.status};}catch(e){CG.st={error:'offline'};}
  paintAiBtn(); return CG.st;
}
async function cgStream({system,messages,onText,signal}){
  let r;
  try{r=await cgFetch('/ask',{method:'POST',signal,body:JSON.stringify({instructions:system,messages:messages.map(m=>({role:m.role,content:String(m.content)}))})});}
  catch(e){if(e&&e.name==='AbortError')throw Object.assign(new Error('Stopped.'),{ai:true,aborted:true});if(e&&e.ai)throw e;throw Object.assign(new Error('Couldn’t reach the study server. Check your connection.'),{ai:true});}
  if(!r.ok){let j={};try{j=await r.json();}catch(e){}throw Object.assign(new Error(j.error||('The study server answered '+r.status+'.')),{ai:true});}
  const rd=r.body.getReader(), dec=new TextDecoder(); let buf='', text='', end=null;
  const on=o=>{
    if(o.t==='delta'){text+=o.d;if(onText)onText(text);}
    else if(o.t==='done')end='done';
    else if(o.t==='error'){end='error';
      if(o.code==='reauth'||o.code==='not_connected'){if(CG.st)CG.st.state='reauth';paintAiBtn();}
      if(o.code==='limit'&&CG.st)CG.st.lastError='limit';
      throw Object.assign(new Error(o.message||'ChatGPT had a problem.'),{ai:true,code:o.code,text});}
  };
  try{
    for(;;){const {value,done}=await rd.read(); if(value)buf+=dec.decode(value,{stream:true});
      let i; while((i=buf.indexOf('\n'))>=0){const l=buf.slice(0,i).trim();buf=buf.slice(i+1);if(l)on(JSON.parse(l));}
      if(done)break;}
    if(buf.trim())on(JSON.parse(buf.trim()));
  }catch(e){if(e&&e.ai)throw e;if(e&&e.name==='AbortError')throw Object.assign(new Error('Stopped.'),{ai:true,aborted:true,text});throw Object.assign(new Error('The answer was cut off. Try again.'),{ai:true,text});}
  if(end!=='done')throw Object.assign(new Error('The answer was cut off. Try again.'),{ai:true,text});
  return text;
}

/* one streamed request; onText(fullTextSoFar) as it arrives; returns the final text */
async function aiStream({system,messages,effort,onText,schema,signal}){
  if(PROV()==='chatgpt')return cgStream({system,messages,onText,signal});
  if(!SAMPLE)throw noSample();
  try{const r=await SAMPLE(sampleInput(system,messages),{signal,cache:false,modelTier:effort==='low'?'default':'complex',onText:onText?({text})=>onText(text):undefined});
    if(r.truncated&&schema)throw Object.assign(new Error('Claude’s answer was cut off. Ask for fewer items at a time.'),{ai:true});
    return r.text;}
  catch(e){if(e&&e.ai)throw e;throw sampleErr(e);}
}
async function aiJson(opts){
  const msgs=opts.messages.slice(); const last=msgs[msgs.length-1];
  msgs[msgs.length-1]={role:'user',content:last.content+'\n\nReply with only one JSON object that matches this JSON Schema exactly (every listed field present, no other fields):\n'+JSON.stringify(opts.schema)};
  if(PROV()==='chatgpt'){
    const t=await cgStream({system:opts.system,messages:msgs,signal:opts.signal});
    const s=t.replace(/^\s*```(?:json)?\s*/i,'').replace(/\s*```\s*$/,''), a=s.indexOf('{'), b=s.lastIndexOf('}');
    try{return JSON.parse(a>=0&&b>a?s.slice(a,b+1):s);}catch(e){throw Object.assign(new Error('ChatGPT’s answer was not in the expected format. Try again.'),{ai:true});}
  }
  if(!SAMPLE)throw noSample();
  try{return await SAMPLE.json(sampleInput(opts.system,msgs),{signal:opts.signal,cache:false,modelTier:'complex'});}
  catch(e){throw sampleErr(e);}
}
const AI_SYS='You are a study coach for the ARE 5.0 architecture licensing exams (PA, PPD and PDD). Be accurate and current: 2021 IBC, 2010 ADA Standards, current NCARB item formats. If you are not sure of a number or code section, say so instead of guessing. Write plainly and briefly for an architecture graduate. Use short paragraphs, "- " bullets and **bold** for the key rule; no headings.';

/* ---------- website: hand a prompt to Claude, which reaches this account through the connector ---------- */
const CLAUDE_NEW='https://claude.ai/new?q=';
const connAdded=()=>{try{return !!localStorage.getItem(LSC_DONE);}catch(e){return false;}};
function askClaude(prompt){
  const full='Use my ARE Study System connector. '+prompt;
  if(!connAdded()){openClaudeSettings(()=>askClaude(prompt));return;}
  window.open(CLAUDE_NEW+encodeURIComponent(full.slice(0,6000)),'_blank','noopener');
  try{navigator.clipboard.writeText(full).catch(()=>{});}catch(e){}
  toast('Opened Claude in a new tab · the prompt is also copied');
}

/* ---------- "Discuss in ChatGPT": a wrong answer, talked through in ChatGPT with the same connector ----------
   ChatGPT has no documented link that fills in a message, so the page only copies a short instruction and
   opens chatgpt.com; the student pastes it and sends it. Only the question's ID leaves the page: ChatGPT fetches
   the question and the student's own answer through the connector (get_question), signed in as them. */
const CG_DISCUSS=AI_MODE!=='plan'&&AUTH_ON&&!!CONNECTOR_URL;
const CONNECTOR_NAME='ARE Study System', CHATGPT_HOME='https://chatgpt.com/';
const LSG_DONE='are_chatgpt_connector_added';
function openNewTab(url){const a=document.createElement('a');a.href=url;a.target='_blank';a.rel='noopener noreferrer';document.body.appendChild(a);a.click();a.remove();}
function discussInChatGPT(id,right){
  const msg='Use '+CONNECTOR_NAME+' to retrieve question '+id+(right?' and go over it with me: why the answer is right and why the other choices are traps.':' and help me understand my mistake.');
  try{if(dirty)push();}catch(e){}   // save the latest answer (and any newly written question) so the connector finds it
  // both inside the click, so Safari on iPhone allows them: copy first, then open ChatGPT
  let copy=Promise.resolve(false);
  try{if(navigator.clipboard&&navigator.clipboard.writeText)copy=navigator.clipboard.writeText(msg).then(()=>true,()=>false);}catch(e){}
  openNewTab(CHATGPT_HOME);
  const first=(()=>{try{return !localStorage.getItem(LSG_DONE);}catch(e){return true;}})();
  copy.then(copied=>{
    const st=(ok,txt)=>'<li class="'+(ok?'yes':'no')+'"><i aria-hidden="true">'+(ok?'✓':'✗')+'</i><div>'+txt+'</div></li>';
    modalForm('<div class="lbl">ChatGPT</div><div class="q">Discuss question '+esc(id)+' in ChatGPT</div>'+
      '<ul class="cgsteps">'+st(copied,copied?'<b>Copied</b> the instruction below.':'<b>Not copied</b>: your browser didn’t allow it. Select the text below and copy it.')+
        st(true,'<b>Opened ChatGPT</b> in a new tab. If it didn’t open, use <b>Open ChatGPT</b> below.')+
        st(false,'<b>Not filled in</b>: ChatGPT has no documented link that types a message for you.')+
        st(false,'<b>Not sent</b>: nothing goes to ChatGPT until you send it.')+'</ul>'+
      '<textarea class="cgmsg" id="cgMsg" rows="2" readonly>'+esc(msg)+'</textarea>'+
      '<p class="small"><b>In ChatGPT:</b> paste it into the message box (on iPhone, tap the box, then <b>Paste</b>) and send it. ChatGPT fetches the question, your answer and the explanation from your study account; the link itself carries none of it.</p>'+
      (first?'<p class="small"><b>First time?</b> Add the connector in ChatGPT once, or ChatGPT won’t find the question. <button type="button" class="lnk" data-a="setup">Show me how</button></p>':'')+
      '<div class="row" style="margin-top:10px"><a class="btn pri" href="'+CHATGPT_HOME+'" target="_blank" rel="noopener noreferrer">Open ChatGPT</a><button type="button" class="btn" data-a="copy">Copy again</button><button type="button" class="btn" data-a="close">Close</button></div>',
      (a,m,close)=>{
        if(a==='copy')copyText(msg,'Instruction copied',$('#cgMsg',m));
        if(a==='setup'){close();openClaudeSettings(null,'chatgpt');}
        if(a==='close')close();
      });
    const ta=$('#cgMsg'); if(ta&&!copied){ta.focus();ta.select();}
  });
}
function chatgptConnSection(){
  const done=(()=>{try{return !!localStorage.getItem(LSG_DONE);}catch(e){return false;}})();
  return '<div class="aisec" id="cgConnSec"><div class="aisech"><b>ChatGPT connector</b><span class="small">discuss your mistakes in ChatGPT</span></div>'+
    '<p class="small">Add this site to ChatGPT once, and <b>Discuss in ChatGPT</b> on any wrong answer lets ChatGPT fetch that question, your answer and the explanation from your account. ChatGPT’s custom connectors need <b>Developer mode</b>, which is in beta and not on every plan.</p>'+
    '<ol class="small connsteps"><li>In ChatGPT, open <b>Settings</b> → <b>Apps</b> (or <b>Apps &amp; Connectors</b>) → <b>Advanced settings</b>, and turn on <b>Developer mode</b>.</li>'+
    '<li>Choose <b>Create</b> (or <b>Add custom connector</b>). Name it <b>'+CONNECTOR_NAME+'</b>, paste this URL, and choose <b>OAuth</b>:<div class="connurl"><input id="cgConnUrl" readonly value="'+esc(CONNECTOR_URL)+'"><button type="button" class="btn sm" data-a="cgconncopy">Copy</button></div></li>'+
    '<li>Sign in with your study account when asked: the same email and password as here.</li></ol>'+
    '<div class="row"><button type="button" class="btn" data-a="cgconndone">'+(done?'Added ✓':'I’ve added it')+'</button></div></div>';
}

/* ---------- the AI setup page (#aihelp): every way to connect, step by step ---------- */
function initAiHelp(){
  const chip=(on,yes,no)=>'<span class="chip '+(on?'c-ok':'c-un')+'">'+(on?yes:no)+'</span>';
  const lsOn=k=>{try{return !!localStorage.getItem(k);}catch(e){return false;}};
  const g=CG.st, gOn=cgReady();
  const head='<div class="eyebrow">Help</div><h1 class="t">AI setup</h1><p class="lede">Study with ChatGPT or Claude on your own plan. There are no API keys and nothing extra to pay, and everything the AI records goes to your study account.</p>';
  if(AI_MODE==='plan'){view.innerHTML=head+'<div class="aisec"><div class="aisech"><b>Claude on your claude.ai plan</b>'+chip(!!SAMPLE,'Ready','Not available here')+'</div><p class="small">On this claude.ai version, the chat panel and the “with Claude” buttons use your own claude.ai plan. The first time, claude.ai asks you to allow this page. ChatGPT, the connectors and My library are on the study website.</p><div class="row"><button type="button" class="btn pri" data-h="chat">Open the chat</button></div></div>';
    view.onclick=e=>{if(e.target.closest('[data-h="chat"]'))openChat();};return;}
  if(!AUTH_ON){view.innerHTML=head+'<p class="small">AI features need the study website with accounts. Sign in first.</p>';return;}
  view.innerHTML=head+
    '<div class="aistat">'+
      '<div><b>ChatGPT here</b>'+chip(gOn,'Connected','Not connected')+'</div>'+
      '<div><b>ChatGPT connector</b>'+chip(lsOn(LSG_DONE),'Added','Not added')+'</div>'+
      '<div><b>Claude connector</b>'+chip(connAdded(),'Added','Not added')+'</div></div>'+
    '<h2 class="s">1 · ChatGPT on this site</h2>'+
    '<p class="small">Answers right here: the chat panel, <b>Explain with ChatGPT</b>, <b>Generate</b> and <b>Build my plan</b>, on your ChatGPT plan (Plus or Pro). You connect once, on a Mac or Windows computer, and then it works on every device, phone included.</p>'+
    '<ol class="small connsteps"><li>Click <b>Continue with ChatGPT</b> below. The site shows a one-line command and a download link.</li>'+
      '<li>On your computer (with <a href="'+NODE_URL+'" target="_blank" rel="noopener">Node.js 18 or newer</a>), download <b>chatgpt-signin.mjs</b>, open a terminal in that folder, and run the command.</li>'+
      '<li>Sign in to ChatGPT in the browser it opens, and allow using your ChatGPT plan. The site notices within a few seconds.</li></ol>'+
    '<p class="small">Eligible AI requests in this app will use your ChatGPT plan. You can manage usage in ChatGPT settings.</p>'+
    '<div class="row"><button type="button" class="btn pri" data-h="cg">'+(gOn?'Manage ChatGPT':'Continue with ChatGPT')+'</button><a class="btn" href="'+CG_USAGE+'" target="_blank" rel="noopener">Manage usage</a></div>'+
    '<h2 class="s">2 · Discuss a wrong answer in ChatGPT</h2>'+
    '<p class="small">Every wrong answer on Practice and Mistakes has <b>Discuss in ChatGPT</b>. When you tap it:</p>'+
    '<ul class="cgsteps"><li class="yes"><i>✓</i><div>It <b>copies</b> a short instruction such as “Use '+CONNECTOR_NAME+' to retrieve question q12 and help me understand my mistake.”</div></li>'+
      '<li class="yes"><i>✓</i><div>It <b>opens</b> chatgpt.com in a new tab (on iPhone it may open the ChatGPT app).</div></li>'+
      '<li class="no"><i>✗</i><div>It does <b>not fill in</b> the message: ChatGPT has no documented link for that.</div></li>'+
      '<li class="no"><i>✗</i><div>It does <b>not send</b> anything. You paste it (on iPhone, tap the box, then Paste) and send it.</div></li></ul>'+
    '<p class="small">Only the question’s ID is in the instruction. ChatGPT fetches the question, your answer and the explanation from your account through the connector, so you add the connector once:</p>'+
    chatgptConnSection()+
    '<h2 class="s">3 · Claude</h2>'+
    '<p class="small">Study in Claude on your Claude plan. Claude can see your progress, quiz you and record your answers, rate flashcards, explain mistakes, add material and plan your weeks.</p>'+
    claudeSection(null)+
    '<h2 class="s">4 · Your documents and agents</h2>'+
    '<p class="small">On <a href="#mine">My material</a>, upload your own PDFs and notes to <b>My library</b> (the original is kept too), and make <b>agents</b> with your own instructions that answer from them. Pick an agent at the bottom of the chat panel. Claude and ChatGPT can use them through the connector too, e.g. “use my Structures examiner agent”.</p>'+
    '<h2 class="s">What is shared, and with whom</h2>'+
    '<ul class="small"><li>Each AI reaches only <b>your</b> account, after you sign in to it with your study email and password.</li><li>Your documents, agents, answers and notes are private to you; the other person on the site can’t see them.</li><li>Links the site opens (chatgpt.com, claude.ai) never contain your questions or any sign-in token.</li><li>To disconnect: remove the connector in ChatGPT’s or Claude’s settings, or press <b>Disconnect</b> for ChatGPT here.</li></ul>';
  view.onclick=e=>{
    const h=e.target.closest('[data-h]'); if(h&&h.dataset.h==='cg'){openClaudeSettings();return;}
    const a=e.target.closest('[data-a]'); if(!a)return; const k=a.dataset.a;
    if(k==='copy')copyText(CONNECTOR_URL,'Connector URL copied',$('#connUrl'));
    if(k==='cgconncopy')copyText(CONNECTOR_URL,'Connector URL copied',$('#cgConnUrl'));
    if(k==='cgconndone'){try{localStorage.setItem(LSG_DONE,'1');}catch(_){}toast('Noted: ChatGPT connector added');go('aihelp',{keepScroll:true});}
    if(k==='start'){try{localStorage.setItem(LSC_DONE,'1');}catch(_){}paintAiBtn();askClaude('What should I study today? Look at my plan week, due cards, due mistakes and weak spots, then give me a short prioritized list.');}
  };
  if(!g&&!initAiHelp.tried){initAiHelp.tried=true;cgLoad().then(st=>{if(st&&curPage==='aihelp')go('aihelp',{keepScroll:true});});}
}

/* ---------- settings ---------- */
function paintAiBtn(){
  const b=$('#aiBtn'); if(!b)return;
  if(AI_MODE==='plan'){b.hidden=SAMPLE===null;b.classList.add('on');b.title='Ask Claude, using your claude.ai plan';$('span',b).textContent='Ask Claude';return;}
  b.hidden=!AI_POSSIBLE;
  const g=cgReady(), c=connAdded(); b.classList.toggle('on',g||c);
  b.title=g?'Ask ChatGPT, using your ChatGPT plan':c?'Study with Claude, on your own Claude plan':'Connect ChatGPT or Claude to your study account';
  $('span',b).textContent=g?'Ask ChatGPT':c?'Study with Claude':'Connect AI';
}
const CG_USAGE='https://chatgpt.com/settings/usage';
const NODE_URL='https://nodejs.org/en/download';
function cgSection(st,pair){
  const head='<div class="aisec"><div class="aisech"><b>ChatGPT</b><span class="small">answers right here, on your ChatGPT plan</span></div>';
  if(!CG.url)return head+'<p class="small">ChatGPT isn’t set up on this site yet. The site admin turns it on by updating the AWS stack (see aws/SETUP.md).</p></div>';
  if(!st||st.error)return head+'<p class="small">Couldn’t check your ChatGPT connection'+(st&&st.error?' ('+esc(String(st.error))+')':'')+'. <button type="button" class="lnk" data-a="cgretry">Try again</button></p></div>';
  const disclose='<p class="small">Eligible AI requests in this app will use your ChatGPT plan. You can manage usage in ChatGPT settings.</p>';
  if(pair)return head+'<p class="small"><b>Finish on your computer</b> (Mac or Windows, with <a href="'+NODE_URL+'" target="_blank" rel="noopener">Node.js 18 or newer</a>):</p>'+
    '<ol class="small connsteps"><li><a href="tools/chatgpt-signin.mjs" download>Download the sign-in script</a> (chatgpt-signin.mjs).</li>'+
    '<li>In a terminal, in the folder you downloaded it to, run:<div class="connurl"><input id="cgCmd" readonly value="'+esc('node chatgpt-signin.mjs '+CG.url+' '+pair)+'"><button type="button" class="btn sm" data-a="cgcopy">Copy</button></div></li>'+
    '<li>Sign in to ChatGPT in the browser it opens, and allow using your ChatGPT plan. It needs ChatGPT Plus or Pro.</li></ol>'+
    '<p class="small" id="cgWait">Waiting for you to finish… The code works for 15 minutes, once.</p><div class="row"><button type="button" class="btn sm" data-a="cgcancel">Cancel</button></div></div>';
  if(!st.connected)return head+'<p class="small">Connect your own ChatGPT plan once, and explanations, generated cards and questions, your own study plan and the chat panel answer here with ChatGPT. There’s no API key and nothing extra to pay. Each person connects their own account.</p>'+disclose+
    '<div class="row"><button type="button" class="btn pri" data-a="cgstart">Continue with ChatGPT</button></div></div>';
  if(st.state==='reauth')return head+'<div class="aerr">Your ChatGPT sign-in has ended'+(st.lastError?' ('+esc(st.lastError)+')':'')+'. Connect again to keep using ChatGPT here.</div><div class="row"><button type="button" class="btn pri" data-a="cgstart">Continue with ChatGPT</button><button type="button" class="btn" data-a="cgoff">Disconnect</button></div></div>';
  const ms=st.models||[];
  return head+'<p class="small"><span class="chip c-ok">Using ChatGPT plan</span> '+esc(st.email||st.name||'Connected')+'</p>'+
    (st.lastError==='limit'?'<div class="aerr">You recently reached the usage limit for this app. <a href="'+CG_USAGE+'" target="_blank" rel="noopener">Manage usage</a></div>':'')+
    (st.lastError==='not_eligible'?'<div class="aerr">Your ChatGPT plan can’t be used here. Using your plan in other apps needs ChatGPT Plus or Pro.</div>':'')+
    (ms.length?'<label class="af"><span>Model</span><select class="sel" id="cgModel">'+ms.map(m=>'<option value="'+esc(m.slug)+'"'+(m.slug===st.model?' selected':'')+'>'+esc(m.name)+'</option>').join('')+'</select></label>':'<p class="small">Loading models…</p>')+
    disclose+'<div class="row"><a class="btn sm" href="'+CG_USAGE+'" target="_blank" rel="noopener">Manage usage</a><button type="button" class="btn sm" data-a="cgoff">Disconnect</button></div></div>';
}
function claudeSection(after){
  const done=connAdded();
  return '<div class="aisec"><div class="aisech"><b>Claude</b><span class="small">study in Claude, on your Claude plan</span></div>'+
    '<p class="small">Add this site to Claude once as a <b>connector</b>. Then, in any Claude chat, Claude can see your progress, quiz you, record your answers and flashcard ratings, explain your mistakes, add cards and questions to your material, and plan your weeks. Everything saves to this account, so it shows up here too.</p>'+
    '<ol class="small connsteps"><li>In Claude, open <a href="https://claude.ai/settings/connectors" target="_blank" rel="noopener">Settings → Connectors</a> and choose <b>Add custom connector</b>.</li>'+
    '<li>Name it <b>ARE Study System</b> and paste this URL:<div class="connurl"><input id="connUrl" readonly value="'+esc(CONNECTOR_URL)+'"><button type="button" class="btn sm" data-a="copy">Copy</button></div></li>'+
    '<li>Click <b>Connect</b>, then sign in with your study account: the same email and password as here.</li>'+
    '<li>Start a chat and ask “What should I study today?”. If Claude doesn’t use the connector, turn it on from the chat’s tools menu.</li></ol>'+
    '<p class="small">Your Claude plan must allow custom connectors. To disconnect, remove it in Claude’s connector settings.</p>'+
    '<div class="row">'+(after?'<button type="button" class="btn pri" data-a="go">'+(done?'Continue to Claude':'I’ve added it · continue to Claude')+'</button>':'<button type="button" class="btn" data-a="start">'+(done?'Start a study chat in Claude':'I’ve added it · start a study chat')+'</button>')+'</div></div>';
}
function cgWelcome(){
  const k='are_cgpt_welcomed:'+(SESSION&&SESSION.sub);
  try{if(localStorage.getItem(k))return;localStorage.setItem(k,'1');}catch(e){}
  modalForm('<div class="lbl">ChatGPT</div><div class="q">You’re using your ChatGPT plan</div><p class="small">Eligible AI requests in this app will use your ChatGPT plan. You can manage usage in ChatGPT settings.</p>'+
    '<div class="row" style="margin-top:12px"><button type="button" class="btn pri" data-a="ok">Got it</button><a class="btn" href="'+CG_USAGE+'" target="_blank" rel="noopener">Manage usage</a></div>',(a,m,close)=>close());
}
function openClaudeSettings(after,focus){
  if(AI_MODE==='plan'){
    modalForm('<div class="lbl">Your Claude</div><div class="q">Claude on your claude.ai plan</div>'+
      (SAMPLE?'<p class="small">Here on claude.ai, the Claude features use <b>your own claude.ai plan</b>. No API key is needed, and nothing is billed separately. The first time you use one, claude.ai asks you to allow this page.</p>'+
        '<p class="small">If you chose <b>Don’t allow</b>, reload the page to be asked again.</p>'
      :'<p class="small">Claude is not available in this view. Open the study site at claude.ai in a browser or the Claude app, signed in to your account.</p>')+
      '<div class="row" style="margin-top:12px">'+(SAMPLE&&after?'<button type="button" class="btn pri" data-a="go">Continue</button>':'')+'<button type="button" class="btn" data-a="close">Close</button></div>',
      (a,m,close)=>{close();if(a==='go'&&after)after();});
    return;
  }
  let pair=null, poll=null, alive=true;
  const paint=m=>{const box=$('#cgBox',m);if(box)box.innerHTML=cgSection(CG.st,pair);const sel=$('#cgModel',m);if(sel)sel.onchange=async()=>{try{const r=await cgFetch('/model',{method:'POST',body:JSON.stringify({model:sel.value})});if(r.ok){CG.st.model=sel.value;toast('Model saved');}}catch(e){toast('Couldn’t save the model');}};};
  const stop=()=>{alive=false;clearInterval(poll);};
  modalForm('<div class="lbl">Your AI</div><div class="q">Study with ChatGPT or Claude, on your own plan</div><p class="small"><a href="#aihelp" data-a="close">All the steps, on the AI setup page →</a></p><div id="cgBox"></div>'+(CG_DISCUSS?chatgptConnSection():'')+claudeSection(after)+
    '<div class="row" style="margin-top:12px"><button type="button" class="btn" data-a="close">Close</button></div>',
    async(a,m,close)=>{
      if(a==='copy'){copyText(CONNECTOR_URL,'Connector URL copied',$('#connUrl',m));return;}
      if(a==='cgconncopy'){copyText(CONNECTOR_URL,'Connector URL copied',$('#cgConnUrl',m));return;}
      if(a==='cgconndone'){try{localStorage.setItem(LSG_DONE,'1');}catch(e){}const b=m.querySelector('[data-a="cgconndone"]');if(b)b.textContent='Added ✓';toast('Noted: ChatGPT connector added');return;}
      if(a==='cgcopy'){copyText($('#cgCmd',m).value,'Command copied',$('#cgCmd',m));return;}
      if(a==='cgretry'){await cgLoad(true);paint(m);return;}
      if(a==='cgcancel'){pair=null;clearInterval(poll);paint(m);return;}
      if(a==='cgstart'){
        try{const r=await cgFetch('/pair',{method:'POST',body:'{}'});const j=await r.json();if(!r.ok)throw new Error(j.error||r.status);pair=j.code;}
        catch(e){toast('Couldn’t start: '+(e.message||e));return;}
        paint(m); clearInterval(poll); const t0=Date.now(), seen=CG.st&&CG.st.linkedAt;
        poll=setInterval(async()=>{
          if(!alive||$('#modal').hidden){stop();return;}
          if(Date.now()-t0>15*60e3){pair=null;clearInterval(poll);paint(m);return;}
          const st=await cgLoad(true);
          if(st&&st.connected&&st.state==='ready'&&st.linkedAt!==seen){pair=null;clearInterval(poll);paint(m);toast('ChatGPT connected');setTimeout(cgWelcome,600);}
        },3000);
        return;
      }
      if(a==='cgoff'){if(!confirm('Disconnect ChatGPT from your study account?'))return;try{await cgFetch('/disconnect',{method:'POST',body:'{}'});}catch(e){}CG.st={connected:false};paintAiBtn();paint(m);toast('ChatGPT disconnected');return;}
      if(a==='go'||a==='start'){try{localStorage.setItem(LSC_DONE,'1');}catch(e){}paintAiBtn();stop();close();if(a==='go')after();else askClaude('What should I study today? Look at my plan week, due cards, due mistakes and weak spots, then give me a short prioritized list.');return;}
      if(a==='close'){stop();close();}
    });
  paint($('#modal'));
  if(focus==='chatgpt'){const s=$('#cgConnSec');if(s)setTimeout(()=>s.scrollIntoView({block:'start'}),30);}
  if(AUTH_ON)cgLoad(true).then(()=>{if(alive&&!$('#modal').hidden&&!pair)paint($('#modal'));});
}
function needAi(then){if(aiReady())return true;openClaudeSettings(then);return false;}

/* ---------- 1. explain my mistake ---------- */
function aiBox(host,title){
  let box=host.querySelector(':scope > .aibox'); if(box)box.remove();
  box=document.createElement('div'); box.className='aibox';
  box.innerHTML='<div class="aihd"><span class="aik">'+AI_NAME()+'</span><span class="ait">'+esc(title)+'</span><button type="button" class="lnk" data-ai="stop">Stop</button></div><div class="aibody"><p class="small">Thinking…</p></div><div class="aifoot"></div>';
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
    if(['not_granted','reauth','not_connected','limit','not_eligible','not_allowed'].includes(e.code))$('.aifoot',box).innerHTML='<button type="button" class="btn sm" data-ai="settings">AI settings</button>';}
  box.onclick=ev=>{if(ev.target.closest('[data-ai="settings"]'))openClaudeSettings();};
}
function aiExplainItem(it,sel,host,mistakeId){
  if(PROV()==='connector'){askClaude('Use get_question to fetch practice question '+it.id+' with my answer, and explain it a different way than the book: first the one rule that decides it, then why my choice is tempting but wrong, then a quick way to remember it. Under 180 words.'+
    (mistakeId?' Then offer to quiz me on a similar question.':''));return;}
  if(!needAi(()=>aiExplainItem(it,sel,host,mistakeId)))return;
  const box=aiBox(host,'Explaining '+it.o);
  const prompt='Practice question ('+it.o+', '+qTypeName(it).toLowerCase()+'):\n'+strip(it.s)+'\n\n'+qPlain(it)+
    '\n\nCorrect: '+rightText(it)+'\nI answered: '+ansText(it,sel)+
    (it.e?'\n\nThe book explanation (which did not click for me): '+strip(it.e):'')+
    '\n\nExplain it a different way than the book: first the one rule that decides it, then why my choice is tempting but wrong, then a quick way to remember it. Under 180 words.';
  aiRun(box,{system:AI_SYS,messages:[{role:'user',content:prompt}],effort:'low',maxTokens:4000},
    mistakeId&&S.mist[mistakeId]?'<button type="button" class="btn sm" data-ai="savenote">Save to my note</button>':'',
    (t,b)=>{const s=b.querySelector('[data-ai="savenote"]');if(s)s.onclick=()=>{const m=S.mist[mistakeId];m.note=((m.note?m.note+'\n\n':'')+AI_NAME()+': '+strip(md2html(t))).slice(0,1000);save();s.replaceWith(Object.assign(document.createElement('span'),{className:'small',textContent:'Saved to your note'}));const ta=document.querySelector('textarea[data-i="'+mistakeId+'"]');if(ta)ta.value=m.note;};});
}
function aiExplainCard(c,host){
  if(PROV()==='connector'){askClaude('Explain flashcard '+c.id+' ('+c.o+', deck '+c.d+'). Question: '+strip(c.q)+' Answer: '+strip(c.a)+' I keep forgetting this. Explain why it is true in plain terms, give one realistic exam-style situation where it decides the answer, and a memory hook. Under 150 words.');return;}
  if(!needAi(()=>aiExplainCard(c,host)))return;
  const box=aiBox(host,'Explaining this card');
  aiRun(box,{system:AI_SYS,messages:[{role:'user',content:'Flashcard ('+c.o+', deck '+c.d+').\nQuestion: '+strip(c.q)+'\nAnswer: '+strip(c.a)+'\n\nI keep forgetting this. Explain why it is true in plain terms, give one realistic exam-style situation where it decides the answer, and a memory hook. Under 150 words.'}],effort:'low',maxTokens:3000});
}

/* ---------- 3. generate cards and questions (drafts go through the study-pack preview) ---------- */
/* one question in any of the four formats (only the fields of its type are used) */
const Q_SCHEMA={type:'object',additionalProperties:false,required:['division','objective','type','title','question','explanation'],properties:{
  division:{type:'string'},objective:{type:'string'},type:{type:'string',enum:['mc','cata','num','match']},title:{type:'string'},question:{type:'string'},
  options:{type:'array',items:{type:'string'}},correct:{type:'array',items:{type:'string'}},
  answer:{type:'number'},tolerance:{type:'number'},unit:{type:'string'},
  statements:{type:'array',items:{type:'string'}},choices:{type:'array',items:{type:'string'}},matches:{type:'array',items:{type:'string'}},
  explanation:{type:'string'}}};
const FORMAT_RULES='Question formats (use the field names exactly):\n'+
  '- "mc": 4 options, exactly one correct; "correct" repeats the right option text.\n'+
  '- "cata" (check all that apply): 5–6 options, 2 or more correct; the question says how many to check.\n'+
  '- "num" (fill in the number): no options; "answer" is the number, "unit" its unit ("" if none), "tolerance" the accepted difference for rounding; the question says what to round to.\n'+
  '- "match" (drag and drop): 3–6 "statements" and 3–6 "choices"; "matches" gives the right choice text for each statement, in order (a choice may be used more than once).\n'+
  'Every question: a short "title" naming the concept; a realistic scenario in the current NCARB style (a building, a client, a constraint) rather than a bare definition; an "explanation" that gives the rule that decides it, why each trap is wrong ("- A → …" lines for options), the working for calculations, and a "Reference:" line when you know the source.';
const PACK_SCHEMA={type:'object',additionalProperties:false,required:['title','points','cards','questions'],properties:{
  title:{type:'string'},
  points:{type:'array',items:{type:'object',additionalProperties:false,required:['division','objective','text'],properties:{division:{type:'string'},objective:{type:'string'},text:{type:'string'}}}},
  cards:{type:'array',items:{type:'object',additionalProperties:false,required:['deck','division','objective','question','answer'],properties:{deck:{type:'string'},division:{type:'string'},objective:{type:'string'},question:{type:'string'},answer:{type:'string'}}}},
  questions:{type:'array',items:Q_SCHEMA}}};
function objectiveOptions(sel){
  objTitle('PA 1.1'); // builds the objective list
  return Object.keys(OBJT).sort((a,b)=>DIVS.indexOf(a.split(' ')[0])-DIVS.indexOf(b.split(' ')[0])||parseFloat(a.split(' ')[1])-parseFloat(b.split(' ')[1]))
    .map(o=>'<option value="'+o+'"'+(o===sel?' selected':'')+'>'+o+' · '+esc(OBJT[o].slice(0,70))+'</option>').join('');
}
function openGenerate(preset,done){
  preset=preset||{};
  if(PROV()==='connector'){const what=preset.kind==='cards'?'5 flashcards':preset.kind==='questions'?'5 practice questions':'a few flashcards and practice questions';
    if(String(preset.obj||'').startsWith('div:')){const dd=preset.obj==='div:ALL'?'PA, PPD and PDD':preset.obj.slice(4);askClaude('Write practice questions covering EVERY objective of '+dd+' (use list_objectives to get them), 2 per objective, in mixed formats. Call question_examples first and follow its style and the format rules in add_practice_question, then show me each section’s drafts and add them once I say yes.');return;}
    askClaude('Make '+what+(preset.doc?' from my uploaded document "'+preset.doc.name+'" (document_id '+preset.doc.id+'; read it with search_library)':preset.obj?' on objective '+preset.obj+' ('+objTitle(preset.obj)+')':' on my weakest objective (check weak_spots)')+'. Check my existing material first so you don’t repeat it, show me the drafts, and add them to my material once I say yes.');return;}
  if(!needAi(()=>openGenerate(preset,done)))return;
  setTimeout(()=>genScopeUI($('#modal')),0);
  modalForm('<div class="lbl">'+AI_NAME()+' · your own material</div><div class="q">Generate study material</div>'+
    '<p class="small">'+AI_NAME()+' drafts cards and questions; you review them before anything is added to your material.</p>'+(preset.doc?'<div class="impv"><b>From your document: '+esc(preset.doc.name)+'</b><p class="small" style="margin:4px 0 0">Give a topic to focus on part of it. Without one, '+AI_NAME()+' works from its first pages.</p></div>':'')+
    '<form class="edf" id="genForm"><div class="edrow"><label class="af" style="flex:2 1 260px"><span>Objective</span><select class="sel" id="genObj"><option value="">Any — use the topic or notes below</option><optgroup label="Cover a whole division">'+DIVS.map(d=>'<option value="div:'+d+'"'+(preset.obj==='div:'+d?' selected':'')+'>All of '+d+' — every objective</option>').join('')+'<option value="div:ALL"'+(preset.obj==='div:ALL'?' selected':'')+'>All three divisions — every objective</option></optgroup><optgroup label="One objective">'+objectiveOptions(preset.obj||'')+'</optgroup></select></label>'+
    '<label class="af" style="flex:1 1 150px"><span>Make</span><select class="sel" id="genKind"><option value="both">Cards and questions</option><option value="cards"'+(preset.kind==='cards'?' selected':'')+'>Flashcards only</option><option value="questions"'+(preset.kind==='questions'?' selected':'')+'>Questions only</option></select></label>'+
    '<label class="af" style="flex:1 1 170px"><span>Question formats</span><select class="sel" id="genFmt"><option value="mix">Mix: same concept, several formats</option><option value="mc">Multiple choice</option><option value="cata">Check all that apply</option><option value="num">Fill in the number</option><option value="match">Drag and drop (matching)</option></select></label>'+
    '<label class="af" style="flex:0 1 120px"><span id="genNl">How many</span><select class="sel" id="genN"><option>3</option><option selected>5</option><option>8</option><option>12</option></select></label></div>'+
    '<label class="af"><span>Topic (optional)</span><input id="genTopic" placeholder="e.g. exit separation, flashing at shelf angles"></label>'+
    '<label class="af"><span>Your notes to work from (optional)</span><textarea id="genNotes" rows="5" placeholder="Paste notes, a textbook passage, or a list of facts"></textarea></label>'+
    '<div id="genMsg"></div><div class="row" id="genActs"><button type="submit" class="btn pri">Generate</button><button type="button" class="btn" data-a="close">Cancel</button></div></form>',
  (a,m,close)=>{if(a==='close'){if(m._ctl)m._ctl.abort();close();}},
  async(form,m,close)=>{
    const obj=$('#genObj',m).value, kind=$('#genKind',m).value, n=+$('#genN',m).value, topic=$('#genTopic',m).value.trim(); let notes=$('#genNotes',m).value.trim();
    if(obj.startsWith('div:')){const ds=obj==='div:ALL'?DIVS.slice():[obj.slice(4)];return generateCoverage(ds,n,kind,$('#genFmt',m).value,topic,m,close,done);}
    if(preset.doc&&!notes){$('#genActs',m).innerHTML='<p class="small" style="margin:0">Reading '+esc(preset.doc.name)+'…</p>';notes=await docText(preset.doc.id,topic).catch(()=>'');if(!notes){$('#genMsg',m).innerHTML='<div class="aerr">Couldn’t read that document. Try again.</div>';$('#genActs',m).innerHTML='<button type="submit" class="btn pri">Try again</button><button type="button" class="btn" data-a="close">Cancel</button>';return;}}
    if(!obj&&!topic&&!notes){$('#genMsg',m).innerHTML='<div class="aerr">Choose an objective, or give a topic or notes.</div>';return;}
    const fmt=$('#genFmt',m).value, ex=styleExamples(obj,preset.doc?null:obj?obj.split(' ')[0]:null).map(q=>JSON.stringify(Object.assign({division:q.d,objective:q.o.split(' ')[1]||''},packOf(q)))).join('\n');
    const want=kind==='cards'?n+' flashcards and no questions':kind==='questions'?n+' practice questions and no flashcards':Math.ceil(n/2)+' flashcards and '+Math.floor(n/2+0.5)+' practice questions';
    const prompt='Write '+want+' for the ARE study pack'+(obj?' on objective '+obj+' ('+objTitle(obj)+')':'')+(topic?', topic: '+topic:'')+'.\n'+
      'Leave "points" empty. Use division "'+(obj?obj.split(' ')[0]:DIVS.join(', ')+' as fits')+'" and objective "'+(obj?obj.split(' ')[1]:'the best-fitting number like 2.2')+'".\n'+
      'Cards: a prompt and a complete answer (full lists where the exam tests lists).\n'+FORMAT_RULES+'\n'+(fmt==='mix'?'Use more than one format: write each key concept in at least two different formats where it fits (for example a multiple-choice scenario and a matching or fill-in-the-number question on the same rule). Use "num" only for real calculations.':'Write every question in the "'+fmt+'" format.')+'\nMatch the style, depth and tone of these example questions from the student\'s bank (don\'t copy them):\n'+(ex||'(none)')+'\nDeck: "'+(obj||'My')+' · '+AI_NAME()+'"; title: a short name for this batch.\n'+
      'Do not repeat the example questions or any question I already have.'+(notes?'\n\nBase everything on these notes, and do not add facts that contradict them'+(preset.doc?' (from my document "'+preset.doc.name+'"; put the page in the explanation where it helps)':'')+':\n'+notes.slice(0,24000):'');
    $('#genActs',m).innerHTML='<p class="small" style="margin:0">'+AI_NAME()+' is writing… this can take up to a minute.</p><button type="button" class="btn" data-a="close">Cancel</button>';
    m._ctl=new AbortController();
    try{
      const j=await aiJson({system:AI_SYS,messages:[{role:'user',content:prompt}],effort:'medium',maxTokens:32000,schema:PACK_SCHEMA,signal:m._ctl.signal});
      close(); openImportWith(JSON.stringify(j),done);
    }catch(e){if(e.aborted)return;$('#genMsg',m).innerHTML='<div class="aerr">'+esc(e.message)+'</div>';$('#genActs',m).innerHTML='<button type="submit" class="btn pri">Try again</button><button type="button" class="btn" data-a="close">Cancel</button>';}
  });
}
/* the "How many" list means "per objective" when a whole division is chosen */
function genScopeUI(m){
  const sel=$('#genObj',m), n=$('#genN',m), l=$('#genNl',m); if(!sel||!n)return;
  const paint=()=>{const whole=sel.value.startsWith('div:'), was=n.value;
    l.textContent=whole?'Per objective':'How many';
    n.innerHTML=(whole?['1','2','3','4']:['3','5','8','12']).map(v=>'<option'+(v===(whole?'2':'5')?' selected':'')+'>'+v+'</option>').join('');
    if([...n.options].some(o=>o.value===was))n.value=was;
    const cnt=whole?(sel.value==='div:ALL'?DIVS:[sel.value.slice(4)]).reduce((s,d)=>s+divOutline(d).reduce((a,x)=>a+x.objs.length,0),0):0;
    let hint=$('#genScope',m); if(!hint){hint=document.createElement('p');hint.id='genScope';hint.className='small';sel.closest('.edrow').after(hint);}
    hint.textContent=whole?'Covers all '+cnt+' objectives, one exam section at a time, in the same formats and style as your bank. You review everything before it is added.':'';};
  sel.onchange=paint; n.onchange=()=>{const h=$('#genScope',m);if(h&&sel.value.startsWith('div:'))paint();}; paint();
}
/* cover every objective of one or more divisions: one request per exam section, then one review */
async function generateCoverage(divs,per,kind,fmt,topic,m,close,done){
  const jobs=[]; divs.forEach(d=>divOutline(d).forEach(sec=>{if(sec.objs.length)jobs.push({d,sec});}));
  const pack={title:(divs.length>1?'PA, PPD and PDD':divs[0])+' · every objective · '+AI_NAME(),points:[],cards:[],questions:[]}, failed=[];
  const acts=$('#genActs',m), msg=$('#genMsg',m);
  m._ctl=new AbortController();
  for(let i=0;i<jobs.length;i++){
    const {d,sec}=jobs[i];
    acts.innerHTML='<p class="small" style="margin:0">'+AI_NAME()+' is writing section '+(i+1)+' of '+jobs.length+': '+d+' · '+esc(sec.title.replace(/\s+—.*$/,''))+' · '+pack.questions.length+' questions so far</p><button type="button" class="btn" data-a="close">Stop</button>';
    const ex=styleExamples(null,d).map(q=>JSON.stringify(Object.assign({division:q.d,objective:q.o.split(' ')[1]||''},packOf(q)))).join('\n');
    const objs=sec.objs.map(o=>'- '+o.split(' ')[1]+': '+objTitle(o)).join('\n');
    const prompt='Write ARE '+d+' study material covering EVERY objective in the section "'+sec.title+'":\n'+objs+'\n\n'+
      'For each objective write '+(kind==='cards'?per+' flashcard'+(per>1?'s':'')+' and no questions':per+' practice question'+(per>1?'s':'')+(kind==='both'?' and 1 flashcard':' and no flashcards'))+
      '. Use division "'+d+'" and that objective\'s number (like "'+sec.objs[0].split(' ')[1]+'") for every item. Leave "points" empty.'+(topic?' Where it fits, lean toward: '+topic+'.':'')+'\n'+
      'Cards: a prompt and a complete answer (full lists where the exam tests lists).\n'+FORMAT_RULES+'\n'+
      (fmt==='mix'?'Use different formats across the section, and where an objective gets more than one question, write the same concept in two different formats (for example a multiple-choice scenario and a matching or fill-in-the-number question). Use "num" only for real calculations.':'Write every question in the "'+fmt+'" format.')+
      '\nMatch the style, depth and tone of these example questions from the student\'s bank (don\'t copy them):\n'+(ex||'(none)')+
      '\nTitle: "'+d+' '+sec.title.replace(/\s+—.*$/,'').slice(0,50)+'".';
    try{const j=await aiJson({system:AI_SYS,messages:[{role:'user',content:prompt}],effort:'medium',maxTokens:32000,schema:PACK_SCHEMA,signal:m._ctl.signal});
      (j.cards||[]).forEach(x=>pack.cards.push(Object.assign({},x,{division:d})));(j.questions||[]).forEach(x=>pack.questions.push(Object.assign({},x,{division:d})));}
    catch(e){if(e&&e.aborted){if(!pack.questions.length&&!pack.cards.length)return;break;}failed.push(d+' · '+sec.title.replace(/\s+—.*$/,'')+': '+(e.message||e));}
  }
  // which objectives ended up without a question (or card)
  const have=new Set(pack.questions.concat(pack.cards).map(x=>(canonDiv(x.division)||x.division)+' '+((String(x.objective).match(/\d+\.\d+/)||[''])[0])));
  const missing=jobs.flatMap(j=>j.sec.objs).filter(o=>!have.has(o));
  if(!pack.questions.length&&!pack.cards.length){msg.innerHTML='<div class="aerr">Nothing came back. '+esc(failed[0]||'Try again.')+'</div>';acts.innerHTML='<button type="submit" class="btn pri">Try again</button><button type="button" class="btn" data-a="close">Cancel</button>';return;}
  close(); openImportWith(JSON.stringify(pack),done);
  const note=(failed.length?'<b>Not written:</b> '+failed.map(esc).join('; ')+'. ':'')+(missing.length?'<b>No question yet for:</b> '+missing.join(', ')+'. Generate those objectives on their own to fill the gaps.':'');
  if(note){const mm=$('#modal');if(mm)mm.insertAdjacentHTML('afterbegin','<div class="impv" style="margin-bottom:10px"><p class="small" style="margin:0">'+note+'</p></div>');}
  else toast('Every objective is covered · review and import');
}
/* open the import preview pre-filled (used for Claude drafts) */
function openImportWith(text,done){openImport(done);const t=$('#imText');if(t){t.value=text;$('#modal').querySelector('[data-a="check"]').click();}}

/* example questions for the AI to imitate: the objective's own first, then the division, one of each format where possible */
function styleExamples(obj,div){
  const pool=ITEMS.filter(q=>!q.mine&&(obj?q.o===obj:div?q.d===div:true)), more=ITEMS.filter(q=>!q.mine&&div&&q.d===div&&!pool.includes(q));
  const any=ITEMS.filter(q=>!q.mine);   // a format the division lacks is shown from another division, for its shape
  const out=[]; ['mc','cata','num','match'].forEach(ty=>{const q=pool.find(x=>x.t===ty)||more.find(x=>x.t===ty)||any.find(x=>x.t===ty);if(q)out.push(q);});
  return out.slice(0,4);
}

/* ---------- 3b. learn it: after a miss, similar questions until two in a row are right ----------
   Each round asks about the same concept in a new situation and, where it fits, a different format.
   With ChatGPT or Claude in the page the questions are written fresh; otherwise other bank questions on the objective
   are used. Similar questions are scored but don't enter the mistake log; the missed question itself still comes back
   on its 1-, 3- and 7-day schedule until it is fixed. */
const LOOP_NEED=2;
const loopOf=id=>{S.loops=S.loops||{};return S.loops[id]=S.loops[id]||{streak:0,tries:0,done:false};};
function learnLoop(host,it,o){
  o=o||{};
  if(!host||!it)return;
  if(o.auto&&!aiReady()&&!bankSimilar(it,[]).length)return;   // nothing to offer: stay quiet after a miss
  let box=host.querySelector(':scope > .loop'); if(box)box.remove();
  box=document.createElement('div'); box.className='loop'; host.appendChild(box);
  const st=loopOf(it.id); st.streak=0; st.done=false; st.started=Date.now(); save();
  const seen=[it.id]; let round=0, ctl=null, ahead=null;
  const head=()=>'<div class="loophd"><b>Learn it</b><span class="small">'+esc(it.o)+' · '+(st.streak?st.streak+' of '+LOOP_NEED+' right in a row':LOOP_NEED+' right in a row to finish')+'</span><button type="button" class="lnk" data-loop="stop">Stop</button></div>';
  box.onclick=e=>{const b=e.target.closest('[data-loop]');if(!b)return;
    if(b.dataset.loop==='stop'){if(ctl)ctl.abort();box.remove();}
    if(b.dataset.loop==='next')next();
    if(b.dataset.loop==='connect')openClaudeSettings();};
  const fetchOne=r=>{const c=new AbortController();const p=similarQuestion(it,r,seen,c.signal);return {c,p};};
  async function next(){
    round++;
    box.innerHTML=head()+'<p class="small loopwait">Writing a similar question'+(aiReady()?' with '+AI_NAME():'')+'…</p>';
    const job=ahead||fetchOne(round); ahead=null; ctl=job.c;
    let q; try{q=await job.p;}catch(err){if(err&&err.aborted)return;box.innerHTML=head()+'<div class="aerr">'+esc(err.message||String(err))+'</div><div class="row"><button type="button" class="btn sm" data-loop="next">Try again</button></div>';round--;return;}
    if(!q){box.innerHTML=head()+'<p class="small">No more questions on '+esc(it.o)+' in the bank. <button type="button" class="lnk" data-loop="connect">Connect ChatGPT</button> (or use the claude.ai link) to get new ones written for you.</p>';return;}
    seen.push(q.id);
    box.innerHTML=head()+'<p class="small loopnote">Similar question '+round+(q.mine?' · written for you':' · from the bank')+(q.t!==it.t?' · '+qTypeName(q).toLowerCase():'')+'</p>';
    const qe=itemEl(q,q.id,{live:true,fresh:true,loop:it.id,onResult:ok=>{
      st.tries++; st.streak=ok?st.streak+1:0; st.last=Date.now();
      if(st.streak>=LOOP_NEED){st.done=true;st.doneAt=Date.now();}
      save(); box.querySelector('.loophd').outerHTML=head();
      const m=S.mist[it.id];
      box.insertAdjacentHTML('beforeend',st.done?'<div class="learned good"><strong>Learned for now.</strong> '+LOOP_NEED+' similar questions right in a row.'+(m&&!m.fixed?' The original comes back '+whenStr(m.due)+' to make sure it sticks.':'')+'</div>':
        '<div class="row loopnext"><button type="button" class="btn sm pri" data-loop="next">Next similar question</button><span class="small">'+(ok?'Good. One more like it.':'Not yet. Here comes another one on the same idea.')+'</span></div>');
      if(!st.done&&aiReady())ahead=fetchOne(round+1);   // write the next one while the explanation is read
    }});
    qe.id='loop-'+q.id; box.appendChild(qe);
    box.scrollIntoView({behavior:'smooth',block:'nearest'});
  }
  next();
}
/* other bank questions on the same objective, not yet answered right, least recently seen first */
function bankSimilar(it,seen){
  return ITEMS.filter(q=>q.o===it.o&&!seen.includes(q.id)&&q.id!==it.id&&!(S.ans[q.id]&&S.ans[q.id].ok)).sort((a,b)=>((S.ans[a.id]||{}).at||0)-((S.ans[b.id]||{}).at||0));
}
const FORMAT_CYCLE=['mc','cata','num','match'];
async function similarQuestion(it,round,seen,signal){
  if(!aiReady()){const q=bankSimilar(it,seen)[0];return q||null;}
  const a=S.ans[it.id], prefer=FORMAT_CYCLE[(FORMAT_CYCLE.indexOf(it.t)+round)%4];
  const made=Object.values((S.custom&&S.custom.items)||{}).filter(x=>x.src===it.id).map(x=>strip(x.s).slice(0,160));
  const prompt='The student missed this practice question ('+it.o+', '+objTitle(it.o)+'):\n'+JSON.stringify(packOf(it))+
    '\nTheir answer: '+ansText(it,a?a.sel:[])+'\n\n'+
    'Write ONE new question that tests the same concept and the same trap, in a different situation (another building type, client or numbers), so they can show they really understand it. '+
    'Prefer the "'+prefer+'" format; if that format doesn\'t suit this concept, use another one. Keep the style of the original.\n'+FORMAT_RULES+
    '\nUse division "'+it.d+'" and objective "'+(it.o.split(' ')[1]||'')+'".'+(made.length?'\nDon\'t repeat these earlier similar questions:\n- '+made.join('\n- '):'');
  const j=await aiJson({system:AI_SYS,messages:[{role:'user',content:prompt}],effort:'medium',maxTokens:8000,schema:Q_SCHEMA,signal});
  const probs=[], p=packQuestion(Object.assign({},j,{division:it.d,objective:it.o}),'The similar question',probs);
  if(!p)throw Object.assign(new Error((probs[0]||'The similar question came back incomplete')+' Try again.'),{ai:true});
  const id=newUid(); customSet('items',id,Object.assign(itemFromPack(p),{at:Date.now(),src:it.id,gen:'similar'}));
  return ITEM(id);
}

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
  if(PROV()==='connector'){askClaude('Build me my own weekly study plan from this week to my last exam, around my exam dates, my weak spots and what I have already done (check study_status and weak_spots). Ask me how many hours a week I can study and anything else you need first. Show me the plan, and save it with set_study_plan only when I agree.');return;}
  if(!needAi(openPlanBuilder))return;
  const ex=myExams().filter(e=>!S.passed[e.d]), today=ds(new Date());
  modalForm('<div class="lbl">'+AI_NAME()+' · your plan</div><div class="q">Build my own study plan</div>'+
    '<p class="small">'+AI_NAME()+' plans week by week from today to your last exam, around your exam dates, your weak spots and what you have already done. You see it before it replaces anything, and you can go back to the standard plan at any time.</p>'+
    '<form class="edf" id="plForm"><div class="impv"><b>Planning from</b><ul><li>Today: '+esc(fmtDate(new Date(),{day:'numeric',month:'long',year:'numeric'}))+'</li>'+ex.map(e=>'<li>'+e.d+' exam: '+esc(fmtDate(e.date,{weekday:'short',day:'numeric',month:'long'}))+'</li>').join('')+'<li>Weak spots: '+esc(weakList().slice(0,5).join('; ')||'none yet')+'</li></ul></div>'+
    '<label class="af"><span>Hours you can study per week</span><select class="sel" id="plH"><option>5</option><option selected>10</option><option>15</option><option>20</option><option>30</option></select></label>'+
    '<label class="af"><span>Anything else '+AI_NAME()+' should know (optional)</span><textarea id="plNote" rows="3" placeholder="e.g. I travel the week of Nov 9; PDD is my strongest division"></textarea></label>'+
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
    $('#plActs',m).innerHTML='<p class="small" style="margin:0">'+AI_NAME()+' is planning… this can take up to a minute.</p><button type="button" class="btn" data-a="close">Cancel</button>';
    m._ctl=new AbortController();
    try{
      const j=await aiJson({system:AI_SYS,messages:[{role:'user',content:prompt}],effort:'medium',maxTokens:32000,schema:PLAN_SCHEMA,signal:m._ctl.signal});
      const weeks=(j.weeks||[]).filter(w=>w&&!isNaN(pdate(w.from))&&!isNaN(pdate(w.to))&&Array.isArray(w.tasks)&&w.tasks.length).map((w,i)=>{
        const f=pdate(w.from),t=pdate(w.to),same=f.getMonth()===t.getMonth();
        return {w:i+1,from:w.from,to:w.to,d:f.getDate()+(same?'':' '+fmtDate(f,{month:'short'}))+'–'+t.getDate()+' '+fmtDate(t,{month:'short'}),g:String(w.goal||'').slice(0,200),exam:w.exam||undefined,t:w.tasks.map(x=>String(x).slice(0,300)).slice(0,10)};});
      if(!weeks.length)throw Object.assign(new Error(AI_NAME()+' did not return any usable weeks. Try again.'),{ai:true});
      m._plan={summary:String(j.summary||''),weeks};
      $('#plMsg',m).innerHTML='<div class="impv"><b>'+weeks.length+' weeks, '+esc(weeks[0].d)+' to '+esc(weeks[weeks.length-1].d)+'</b><p class="small" style="margin:6px 0">'+esc(m._plan.summary)+'</p><ol class="small plprev">'+weeks.map(w=>'<li><b>'+esc(w.d)+'</b> — '+esc(w.g)+(w.exam?' <span class="chip c-un">'+esc(w.exam)+'</span>':'')+'</li>').join('')+'</ol></div>';
      $('#plActs',m).innerHTML='<button type="button" class="btn pri" data-a="use">Use this plan</button><button type="submit" class="btn">Make another</button><button type="button" class="btn" data-a="close">Cancel</button>';
    }catch(e){if(e.aborted)return;$('#plMsg',m).innerHTML='<div class="aerr">'+esc(e.message)+'</div>';$('#plActs',m).innerHTML='<button type="submit" class="btn pri">Try again</button><button type="button" class="btn" data-a="close">Cancel</button>';}
  });
}

/* ---------- wiring ---------- */
if($('#aiBtn'))$('#aiBtn').addEventListener('click',()=>PROV()==='connector'?openClaudeSettings():aiReady()?openChat():openClaudeSettings(openChat));
paintAiBtn();
