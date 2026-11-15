/* Main app conversation dock. Shares the existing brief, scene and image APIs. */
let historyOpen=false,dockShown=false,selectedObject=null,objectNotice='',voice=null,voiceActive=false;
chatOpen=false;
const baseWorkStatus=workStatus;
workStatus=function(){return S.rendering?'Rendering the current picks and colors into your photo…':baseWorkStatus();};
function logTransition(text){dockActivity=true;if(!dockTurnStart)dockTurnStart=Date.now();B.events=B.events||[];B.events.push({text,time:Date.now()});B.events=B.events.slice(-30);saveBrief();}
const originalApplyBrief=applyBrief;
applyBrief=function(){if(chatBusy)return;const proposals=B.proposals.slice();originalApplyBrief();if(proposals.length)logTransition(`Confirmed ${proposals.length} need${proposals.length>1?'s':''}: ${proposals.map(p=>p.text).join('; ')}. ${S.scene?'Re-picked the furniture to match.':'Next, check the room details.'}`);if(proposals.length){chatOpen=true;chatMode=designReady()?'conversation':'setup';}renderDesigner();};
// Keep the original .chat-input / input / .send primitives and the same DOM input
// mounted while activity, selection and expanded history change around it.
let dockActivity=false,dockTurnStart=0;
function composerObject(){
 if(selectedObject)return selectedObject;
 if(S.sel!=null&&S.scene?.[S.sel]){const it=S.scene[S.sel],p=view(it);return {label:p.family||p.name,category:it.cat,productId:p.id,crop:imgOf(p)};}
 return null;
}
function objectCapsule(){const o=composerObject();return o?`<span class="chip object-capsule">${o.crop?`<img src="${esc(o.iso||o.crop)}" alt="">`:''}<span>${esc(o.label)}</span><button type="button" data-action="object-clear" aria-label="Clear the selected object">×</button></span>`:'';}
function dockForm(){return `<form id="designer-form" class="chat-input"><details class="composer-add"><summary class="icon-btn" aria-label="Add a photo or notes">+</summary><div class="card"><button class="chip" type="button" data-action="upload">Add a photo</button>${S.space.photo==='upload'&&!S.scene?'<button class="chip" type="button" data-action="scan">Find furniture to keep</button>':''}<button class="chip" type="button" data-action="context-image">Add an inspiration image / sketch</button><button class="chip" type="button" data-action="context">Import ChatGPT / Claude memory</button></div></details><span id="composer-object">${objectCapsule()}</span><input id="designer-message" aria-label="Tell the designer" autocomplete="off" maxlength="12000" placeholder="${S.space.photo==='upload'?'What would you like to change…':'Add a photo and tell me about your space…'}" value="${esc(chatDraft)}"><button class="icon-btn voice-input" type="button" data-action="voice" aria-label="Voice input" aria-pressed="${voiceActive}"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5 10v2a7 7 0 0014 0v-2M12 19v3M8 22h8"/></svg></button><button class="send" type="submit" aria-label="Send message" ${chatBusy?'disabled':''} ${chatDraft.trim()?'':'hidden'}>↑</button></form>`;}
function dockProgress(){
 if(!dockActivity)return '';
 const busy=chatBusy||S.rendering||S.generating;
 const latest=B.history.filter(m=>!m.hidden).at(-1),last=latest?.role==='assistant'&&!latest.event?latest:null;
 const changes=(B.events||[]).filter(e=>e.time>=dockTurnStart).slice(-2);
 if(!busy&&!changes.length&&!objectNotice&&!last&&!B.proposals.length&&!chatError&&!S.renderError)return '';
 // what changed: kept, but folded into one small line; tap it to read
 const notes=[...changes.map(e=>`<p>✓ ${esc(e.text)}</p>`),...(!busy&&objectNotice?[`<p>${esc(objectNotice)}</p>`]:!busy&&last?[`<p class="dock-reply">${esc(last.text)}</p>`]:[])];
 const history=notes.length?`<details class="dock-history" ${historyOpen?'open':''}><summary>✓ ${changes.length?`${changes.length} update${changes.length>1?'s':''}`:'Reply'}</summary>${notes.join('')}</details>`:'';
 return `<div class="dock-progress" role="status">${busy?`<p class="chat-status busy"><i></i>${esc(workStatus())}</p>`:''}${history}${!busy&&B.proposals.length?`<button class="chip" data-action="dock-expand">Confirm ${B.proposals.length} need${B.proposals.length>1?'s':''} →</button>`:''}${S.renderError?`<p class="chat-warning">Render failed <button data-action="render">Try again</button></p>`:''}${chatError?`<p class="chat-warning">${esc(chatError)} <button data-action="chat-retry">Retry</button></p>`:''}</div>`;
}
renderDesigner=function(){
 let host=document.getElementById('designer-drawer');if(!host){host=document.createElement('aside');host.id='designer-drawer';document.body.append(host);}
 // main's steps and rail stay on screen, so the dock waits behind a small launcher until you open it
 if(chatOpen)dockShown=true;host.classList.toggle('dock-shown',dockShown);
 if(!dockShown){host.innerHTML='';return;}   // closed: nothing on screen; the chat button in the right rail opens it
 if(!host.querySelector('#dock-content'))host.innerHTML=`<div id="dock-content"></div><div class="composer-top"><span id="composer-start"></span><button class="icon-btn" data-action="dock-expand" aria-label="Expand chat" title="Expand chat">↗</button><button class="icon-btn" data-action="dock-hide" aria-label="Hide the designer" title="Hide">–</button></div>${dockForm()}`;
 host.classList.toggle('dock-expanded',chatOpen);host.classList.remove('dock-collapsed');
 const content=host.querySelector('#dock-content'),contextDraft=host.querySelector('#context-input')?.value;
 if(chatOpen){content.innerHTML=designerCard();content.querySelector('#designer-form')?.remove();}
 else if(importOpen){content.innerHTML=`<section class="card dock-import"><header><b>Import your preferences</b><button class="icon-btn" data-action="context" aria-label="Close import">×</button></header><button class="chip" data-action="history-prompt">Copy a prompt for ChatGPT / Claude</button><textarea id="context-input" aria-label="Import preferences" placeholder="Paste the memory you’ve checked…"></textarea><button class="btn" data-action="context-add">Import</button></section>`;}
 else content.innerHTML=dockProgress();
 if(contextDraft!=null&&host.querySelector('#context-input'))host.querySelector('#context-input').value=contextDraft;
 host.querySelector('#composer-object').innerHTML=objectCapsule();
 const input=host.querySelector('#designer-message');if(input.value!==chatDraft)input.value=chatDraft;
 input.placeholder=S.space.photo==='upload'?'What would you like to change…':'Add a photo and tell me about your space…';
 const send=host.querySelector('#designer-form [type="submit"]');send.hidden=!chatDraft.trim();send.disabled=chatBusy;
 host.querySelector('[data-action="voice"]').setAttribute('aria-pressed',String(voiceActive));
 host.querySelector('[data-action="dock-expand"]').hidden=chatOpen;   // minimize (–) stays: it folds the card and the input together
 host.querySelector('#composer-start').innerHTML=S.space.photo!=='upload'?'<button data-action="upload">Upload photo</button><button data-action="context">Import memory</button>':'';
 if(chatOpen){const body=content.querySelector('.chat-body');if(body&&(B.contexts||[]).length)body.insertAdjacentHTML('afterbegin',`<details class="context-thumbs"><summary>Reference images · ${B.contexts.length}</summary>${B.contexts.map(c=>`<figure><img src="${esc(c.image)}" alt="${esc(c.name)}"><figcaption>${esc(c.name)} <button data-action="context-remove" data-id="${esc(c.id)}">Remove</button></figcaption></figure>`).join('')}</details>`);if(body)body.scrollTop=body.scrollHeight;}
};
const originalSendDesigner=sendDesigner;
sendDesigner=async function(retry=false){if(chatBusy||(!retry&&!chatDraft.trim()))return;dockActivity=true;dockTurnStart=Date.now();const o=composerObject();logTransition(o?`Using "${o.label}" and your message as input.`:'Got it.');await originalSendDesigner(retry);if(!chatError&&B.proposals.length)logTransition(`Found ${B.proposals.length} need${B.proposals.length>1?'s':''} to confirm. Once confirmed they guide the picks.`);renderDesigner();};
document.addEventListener('input',e=>{if(e.target.id==='designer-message'){const send=e.target.form.querySelector('[type="submit"]');send.hidden=!e.target.value.trim();}});
function host_focus(){document.getElementById('designer-message')?.focus();}
function renderObjectSelection(){document.getElementById('selected-object')?.remove();}
document.addEventListener('click',e=>{const b=e.target.closest('[data-action]');if(!b)return;const a=b.dataset.action;
 if(['context','upload','context-image','scan'].includes(a))document.querySelector('.composer-add')?.removeAttribute('open');
 if(a==='dock-show'){dockShown=true;renderDesigner();renderCart();host_focus();}
 if(a==='dock-hide'){dockShown=false;chatOpen=false;renderDesigner();renderCart();}
 if(a==='dock-expand'){chatOpen=!chatOpen;chatMode='conversation';renderDesigner();}
 if(a==='object-clear'){selectedObject=null;S.sel=null;objectNotice='';renderObjectSelection();render();}
 if(['select','cart-item'].includes(a)){selectedObject=null;objectNotice='';renderObjectSelection();renderDesigner();}
 if(a==='cart'){chatOpen=false;renderDesigner();}
 if(a==='voice'){
  dockActivity=true;
  const Speech=window.SpeechRecognition||window.webkitSpeechRecognition;if(!Speech){chatError='This browser can’t do speech to text. Use your system dictation, or open this in Chrome.';renderDesigner();return;}
  if(voiceActive){voice.stop();return;}voice=new Speech();voice.lang='en-US';voice.interimResults=false;voice.onresult=e=>{chatDraft+=(chatDraft?' ':'')+e.results[0][0].transcript;renderDesigner();};voice.onerror=()=>{chatError='No speech heard, or the microphone isn’t allowed. Typing still works.';};voice.onend=()=>{voiceActive=false;renderDesigner();};voiceActive=true;voice.start();renderDesigner();
 }
});

const baseRecordEdit=recordEdit;
recordEdit=function(text){dockActivity=true;dockTurnStart=Date.now();logTransition('Updated the design: '+text+' The next render uses these picks and colors.');baseRecordEdit(text);};
const baseGenerate=generate;
generate=function(){baseGenerate();if(S.scene&&designReady()){logTransition('Used your confirmed needs, budget and room limits to pick and place furniture. Starting the render.');renderScene();}};

// Reuse the repository's detected-furniture cards as conversation context.
document.addEventListener('click',e=>{const card=e.target.closest('[data-ex]');if(!card)return;selectedObject=exById(card.dataset.ex);renderDesigner();});

document.addEventListener('toggle',e=>{if(e.target.classList?.contains('dock-history'))historyOpen=e.target.open;},true);
