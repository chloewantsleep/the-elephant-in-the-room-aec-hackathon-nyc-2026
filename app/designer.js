/* The brief is local to this browser. Only Send transmits context to the designer. */
const BRIEF_KEY = 'elephant-living-brief-v1';
let B = {revision:0, requirements:[], history:[], observations:[], proposals:[]};
let chatBusy = false, chatOpen = false, chatError = '', chatDraft = '', importOpen = false;
try { const saved = JSON.parse(localStorage.getItem(BRIEF_KEY)); if (saved?.version === 1) { B = saved.brief; B.observations=[]; B.annotations=[]; } } catch {}
// Retire only the explicitly tagged sample records from earlier local previews.
B.requirements = B.requirements.filter(r=>!r.id.startsWith('sample-'));
B.proposals = B.proposals.filter(r=>!r.id.startsWith('sample-'));
B.history = B.history.filter(m=>!/^\[(Sample|Scripted sample)/.test(m.text));
function saveBrief() {
  try { localStorage.setItem(BRIEF_KEY, JSON.stringify({version:1,brief:B})); }
  catch { chatError = 'This browser could not save your conversation. Keep this tab open or export your brief.'; }
}
const HISTORY_PROMPT = `Using only conversations or memories you actually have access to, summarize my preferences relevant to furnishing a room. Include daily activities, household needs, dislikes, maintenance tolerance, budget and existing furniture only if I explicitly mentioned them. For each, give a short supporting quote or context, when known, and separate explicit facts from uncertain interpretations. Do not invent missing information or infer sensitive traits. Omit unrelated personal details. Return a short summary I can review and edit before sharing with my interior designer.`;
function designerCard() {
  if (S.step === 0 && S.space.photo !== 'upload') return `<section class="card designer-card photo-start" aria-label="Start with a photo">
    <h2>Show me your space.</h2>
    <button class="btn" data-action="upload">Take or upload a photo ↗</button>
  </section>`;
  return `<section class="card designer-card" aria-label="Your designer">
    <div class="designer-heading"><span>Your space</span>${S.step >= 2 ? '<button data-action="chat-close" aria-label="Close designer">×</button>' : '<button class="chip" data-action="upload">Change photo</button>'}</div>
    <div class="conversation" role="log" aria-label="Design conversation" aria-live="polite">
    ${B.history.filter(m=>!m.hidden).map(m=>`<div class="message ${m.role}"><p>${esc(m.text)}</p></div>`).join('')}
    ${chatBusy ? '<p role="status">Looking at your space…</p>' : ''}</div>
    ${B.proposals.length ? `<div class="proposal-box">${B.proposals.map(p=>`<p>${esc(p.text)}</p>`).join('')}<div class="btn-row"><button class="btn" data-action="brief-accept" ${chatBusy?'disabled':''}>Sounds right</button><button class="btn ghost" data-action="brief-dismiss">Let me clarify</button></div></div>` : ''}
    ${chatError ? `<p class="chat-error" role="alert">${esc(chatError)}</p><button class="chip" data-action="chat-retry">Try again</button>` : ''}
    ${importOpen ? `<div class="context-box"><button class="chip" data-action="history-prompt">Get preferences from ChatGPT / Claude</button><textarea id="context-input" aria-label="Context to import" placeholder="Notes, things you own, or inspiration…"></textarea><button class="btn" data-action="context-add">Add</button><button class="chip new-room" data-action="new-room">Start a new room</button></div>` : ''}
    <form id="designer-form"><label class="sr-only" for="designer-message">Tell your designer</label><textarea id="designer-message" maxlength="12000" placeholder="Tell me…" ${chatBusy?'disabled':''}>${esc(chatDraft)}</textarea><div class="composer-footer"><button class="chip" type="button" data-action="context">＋ Context</button><button class="btn" type="submit" ${chatBusy?'disabled':''}>Send ↗</button></div></form>
    ${S.step < 2 && BriefEngine.active(B).length ? '<button class="btn ghost block" data-action="goto" data-step="1">Explore furniture →</button>' : ''}
  </section>`;
}
async function startPhotoConversation() {
  if(chatBusy) { chatError='Your photo changed. Please retry when the current response finishes.';refreshDesigner();return; }
  B.history.push({role:'user', text:'Here is my room. Start with what you can see, then ask one question about how I use it.', hidden:true});
  await sendDesigner(true);
}

function renderDesigner() {
  let host = document.getElementById('designer-drawer');
  if (!host) { host = document.createElement('aside'); host.id='designer-drawer'; document.body.append(host); }
  host.innerHTML = S.step >= 2 ? (chatOpen ? designerCard() : '<button class="designer-launch btn" data-action="chat-open">Talk to your designer ↗</button>') : '';
  const log = document.querySelector('.conversation'); if(log) log.scrollTop=log.scrollHeight;
}
function refreshDesigner() { if (S.step === 0) renderPanel(); renderDesigner(); }
async function sendDesigner(retry=false) {
  if(chatBusy) return;
  const message = chatDraft.trim();
  if (!retry && !message) return;
  if (!retry) { B.history.push({role:'user',text:message}); chatDraft=''; }
  const photoAtSend=S.space.data, revisionAtSend=B.revision, historyAtSend=B.history.length;
  chatError=''; chatBusy=true; saveBrief(); refreshDesigner();
  try {
    const response = await fetch('/api/chat',{method:'POST', headers:{'Content-Type':'application/json','X-Passcode':passcode.get()},
      body:JSON.stringify({messages:B.history, brief:{revision:B.revision,requirements:B.requirements},photo:S.space.photo==='upload'?S.space.data:null,
        language:document.documentElement.lang, selection:(S.scene||[]).map(it=>({category:it.cat,name:view(it).name}))}), signal:AbortSignal.timeout(55000)});
    const data = await response.json();
    if(response.status === 401) { const code=prompt('Team passcode for the designer'); if(code) passcode.set(code); throw Error('Passcode updated or cancelled. Retry when ready.'); }
    if(!response.ok) throw Error(data.error || 'Designer unavailable');
    if(photoAtSend!==S.space.data || revisionAtSend!==B.revision || historyAtSend!==B.history.length) throw Error('Your room or requirements changed while I was responding. Please retry with the latest context.');
    B.history.push({role:'assistant',text:data.reply}); B.proposals=data.proposals; B.observations=data.observations; B.annotations=data.annotations || [];
  } catch(e) { chatError=e.name==='TimeoutError'?'The designer timed out. Your message is saved; retry when ready.':'I can’t connect right now. Please try again shortly.'; }
  finally {chatBusy=false; saveBrief(); refreshDesigner(); renderDiagnosis(); if(typeof renderSofaExplorer==='function')renderSofaExplorer();}
}
function applyBrief() {
  if(chatBusy || !B.proposals.length) return;
  if(typeof sofaCandidates==='function')sofaPreviousOrder=sofaCandidates().map(x=>x.p.id);
  for(const p of B.proposals) {
    // A current user confirmation supersedes old values of the same decision.
    for(const r of B.requirements) if(r.status==='confirmed' && (r.id===p.supersedes || (r.category===p.category && ((r.effect===p.effect && (['budget','max_width','max_depth','prefer_compact'].includes(p.effect) || r.value===p.value)) || ['require_category','exclude_category'].includes(r.effect)&&['require_category','exclude_category'].includes(p.effect))))) r.status='superseded';
    B.requirements.push({...p,status:'confirmed'});
  }
  B.revision++; B.proposals=[]; briefChanged();
}
function briefChanged() {
  S.needs.budget=BriefEngine.budget(B,3000); S.dirty=true;
  S.renders={}; S.last=null;
  if(S.scene) {
    const old=S.scene; S.options=planOptions();
    const next=structuredClone(S.options[S.opt]?.items||S.options[0].items);
    // Preserve deliberate edits when still compatible; replace only invalid choices.
    for(let i=0;i<next.length;i++) {
      const prior=old.find(it=>it.cat===next[i].cat);
      if(prior && fits(view(prior),prior) && BriefEngine.assess(view(prior),prior.cat,B).eligible && BriefEngine.assess(view(prior),prior.cat,B).score >= BriefEngine.assess(view(next[i]),next[i].cat,B).score) {
        const trial=next.slice();trial[i]=prior;
        if(sceneTotal(trial)<=S.needs.budget) next[i]=prior;
      }
    }
    S.scene=next.filter(it=>!S.removedCategories?.includes(it.cat) || BriefEngine.active(B).some(r=>r.effect==='require_category'&&r.category===it.cat));
    S.options[S.opt].items=structuredClone(S.scene);S.sel=null;S.dirty=false;
  }
  saveBrief(); render(); if(typeof renderSofaExplorer==='function')renderSofaExplorer();
}
function recordEdit(text) {
  B.history.push({role:'user',text});
  saveBrief();
  queueMicrotask(()=>{chatOpen=true;sendDesigner(true);});
}
function renderDiagnosis() {
  let host=document.getElementById('space-diagnosis');
  if(!host){host=document.createElement('section');host.id='space-diagnosis';document.body.append(host);}
  let markers=document.getElementById('photo-annotations');
  if(!markers){markers=document.createElement('div');markers.id='photo-annotations';document.getElementById('stage').append(markers);}
  const g=geom();
  markers.hidden=S.step>1 || S.space.photo!=='upload';
  markers.innerHTML=(B.annotations||[]).map((a,i)=>`<div class="photo-annotation" style="left:${g.ox+a.x/100*g.dw}px;top:${g.oy+a.y/100*g.dh}px"><span>${i+1}</span><p>${esc(a.label)}</p></div>`).join('');
  host.hidden=true;
  host.innerHTML=`<span class="eyebrow">YOUR SPACE</span><div class="diagnosis-flow">${B.observations.map((o,i)=>`<div><span class="diagnosis-number">0${i+1}</span><p>${esc(o)}</p></div>`).join('<span class="diagnosis-connector">↓</span>')}</div>`;
}
document.addEventListener('submit',e=>{if(e.target.id==='designer-form'){e.preventDefault();sendDesigner();}});
document.addEventListener('input',e=>{if(e.target.id==='designer-message') chatDraft=e.target.value;});
document.addEventListener('click',async e=>{
  const a=e.target.closest('[data-action]');if(!a)return;
  const action=a.dataset.action;
  if(action==='new-room') {
    if(chatBusy)return;
    try {localStorage.setItem(BRIEF_KEY+'-previous',JSON.stringify(B));} catch {chatError='Could not save the previous room.';refreshDesigner();return;}
    B={revision:0,requirements:[],history:[],observations:[],annotations:[],proposals:[]};
    S.space={wallIn:144,depthIn:132,photo:'demo'};S.needs.budget=3000;
    S.scene=null;S.options=[];S.last=null;S.renders={};S.removedCategories=[];S.dirty=true;S.step=0;
    chatDraft='';chatError='';chatOpen=false;importOpen=false;saveBrief();render();return;
  }
  if(action==='chat-open'){chatOpen=true;renderDesigner();}
  if(action==='chat-close'){chatOpen=false;renderDesigner();}
  if(action==='chat-retry') sendDesigner(true);
  if(action==='brief-accept') applyBrief();
  if(action==='brief-dismiss'){B.proposals=[];chatDraft='Let me clarify: ';saveBrief();refreshDesigner();}
  if(action==='brief-remove'){B.requirements.find(r=>r.id===a.dataset.id).status='superseded';B.revision++;briefChanged();}
  if(action==='context'){importOpen=!importOpen;refreshDesigner();}
  if(action==='context-add'){chatDraft += '\nContext I reviewed and chose to share:\n'+document.getElementById('context-input').value;importOpen=false;refreshDesigner();}
  if(action==='history-prompt'){try{await navigator.clipboard.writeText(HISTORY_PROMPT);toast('Preference prompt copied');}catch{chatError='Clipboard unavailable. '+HISTORY_PROMPT;refreshDesigner();}}
  if(action==='brief-export'){const url=URL.createObjectURL(new Blob([JSON.stringify(B,null,2)],{type:'application/json'}));const link=Object.assign(document.createElement('a'),{href:url,download:'space-brief.json'});link.click();URL.revokeObjectURL(url);}

});
