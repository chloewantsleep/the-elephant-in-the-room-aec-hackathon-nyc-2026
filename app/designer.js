/* One continuous, local-first conversation drives the existing catalogue, scene and layout. */
const BRIEF_KEY='elephant-living-brief-v1';
let B={revision:0,requirements:[],history:[],observations:[],proposals:[],setupApproved:false};
let savedProject=null,chatBusy=false,chatOpen=true,chatError='',chatDraft='',importOpen=false,chatMode='conversation',layoutOpen=false;
try{const v=JSON.parse(localStorage.getItem(BRIEF_KEY));if(v?.version===1){B={...B,...v.brief};savedProject=v.project||null;}}catch{}
const HISTORY_PROMPT='Using only conversations or memory you can actually access, list the preferences I have clearly expressed about my living space, daily habits, furniture, taste, budget, storage and upkeep. Give the evidence for each, and mark what I said versus what you inferred. Don’t invent or infer sensitive information. Keep only what affects the space and furniture choices. I’ll check it before sharing it with a space designer.';
const lastRequirement=effect=>BriefEngine.active(B).filter(r=>r.effect===effect).at(-1);
const cnRoom={living:'Living room',bedroom:'Bedroom',dining:'Dining room',office:'Workspace'};
const cmValue=n=>n!=null&&Number.isFinite(+n)?Math.round(n*2.54):'';
function saveBrief(){try{localStorage.setItem(BRIEF_KEY,JSON.stringify({version:1,brief:B,project:{space:S.space,needs:S.needs,scene:S.scene,options:S.options,opt:S.opt,existing:S.existing,removedCategories:S.removedCategories}}));}catch{chatError='This browser is out of storage. Keep the page open or export your brief.';}}
function restoreDesignerProject(){
 if(!savedProject)return;
 for(const k of ['space','needs','scene','options','opt','existing','removedCategories'])if(savedProject[k]!=null)S[k]=savedProject[k];
 S.options=S.options||[];S.removedCategories=S.removedCategories||[];
 if(S.space.photo==='demo')S.existing=null;   // the demo room's furniture reloads fresh (nothing kept by default)
 if(S.space.photo==='upload'){S.live=true;if(B.history.at(-1)?.role==='user'&&!B.history.at(-1)?.manual)chatError=B.lastError||'Your last message didn’t get a reply. You can retry.';}
 if(S.scene?.some(it=>!it.own&&!byId[it.pid])){S.scene=null;S.options=[];}
 if(S.scene&&!designGate()){S.scene=null;S.options=[];}
 if(S.scene)syncLayout();
}
// The setup form only gates designs once you've talked to the designer about your own photo.
// The demo room and the Needs chat (app.js) design straight away with its answers.
function designerEngaged(){return BriefEngine.active(B).length>0||B.history.some(m=>m.role==='user'&&!m.hidden&&!m.manual);}
function designGate(){return S.space.photo!=='upload'||!designerEngaged()||designReady();}
function designReady(){return S.space.photo==='upload'&&S.space.confirmed===true&&B.setupApproved===true&&!!lastRequirement('budget')&&BriefEngine.active(B).some(r=>!['budget','room_width','room_depth','room_type'].includes(r.effect));}
function derivedConditions(){return BriefEngine.active(B).map(r=>({id:r.id,text:r.text,impact:r.impact||'Check this in the design',kind:r.effect==='design_note'?'review':'selection',quote:r.quote}));}
function workStatus(){
 if(chatBusy)return 'Reading the photo and your needs…';
 if(S.generating)return 'Picking products for your needs and checking the fit…';
 if(B.proposals.length)return `${B.proposals.length} need${B.proposals.length>1?'s':''} to confirm`;
 if(S.scene)return `Design updated · ${S.scene.length} pieces · ${money(sceneTotal(S.scene))}`;
 if(!S.space.data)return 'Start with a photo';
 if(!BriefEngine.active(B).length)return 'Seen your space. Tell me how you live in it';
 return S.space.confirmed?'Brief ready. Confirm the design conditions to see options':'Brief ready. Next, confirm the room’s limits';
}
function uiCard(ui,index){if(ui?.type!=='question'||!ui.options?.length)return '';return `<div class="chat-question"><b>${esc(ui.title)}</b><div>${ui.options.map((o,i)=>`<button class="chip" data-action="chat-answer" data-message="${index}" data-answer="${i}" ${chatBusy?'disabled':''}>${esc(o.label)}</button>`).join('')}</div></div>`;}
function setupCard(){
 const w=lastRequirement('room_width'),d=lastRequirement('room_depth'),budget=lastRequirement('budget');
 return `<div class="chat-summary"><h3>Let’s confirm the room.</h3><p>A photo can’t give reliable sizes. Enter measured values here; you can change them later.</p>
 <form id="space-setup"><div class="setup-grid"><label>Room<select name="room">${Object.entries(cnRoom).map(([k,v])=>`<option value="${k}" ${S.needs.room===k?'selected':''}>${v}</option>`).join('')}</select></label><label>Total budget · USD<input name="budget" type="number" min="1" max="10000000" required value="${budget?esc(budget.value):''}" placeholder="e.g. 3000"></label><label>Width · cm<input name="width" type="number" min="150" max="1500" required value="${w?cmValue(+w.value):S.space.confirmed?cmValue(S.space.wallIn):''}"></label><label>Depth · cm<input name="depth" type="number" min="150" max="1500" required value="${d?cmValue(+d.value):S.space.confirmed?cmValue(S.space.depthIn):''}"></label><label>Keep a walkway on the<select name="corridor" required><option value="">Choose</option>${[['left','Left'],['right','Right'],['center','Middle']].map(([k,v])=>`<option value="${k}" ${S.space.corridor===k?'selected':''}>${v}</option>`).join('')}</select></label><label>Walkway width · cm<input name="clearance" type="number" min="40" max="200" required value="${S.space.clearanceIn?cmValue(S.space.clearanceIn):''}" placeholder="As wide as you need to walk"></label></div>
 <details class="fixed-areas"><summary>Built-ins, columns, doors or windows to keep clear?</summary><p>Measure from the top-left corner of the floor plan, in cm. Skip windows that don’t need clearance.</p><div id="fixed-area-rows">${(S.space.obstacles||[]).map(o=>obstacleRow(o)).join('')}</div><button type="button" class="btn ghost chat-secondary" data-action="add-obstacle">+ Add an area to keep clear</button></details>
 <label class="setup-consent"><input type="checkbox" name="checked" required> I’ve checked the sizes, the entry walkway and the areas to keep clear.</label>
 <div class="conditions"><b>How these conditions shape the design</b>${derivedConditions().filter(r=>!['room_width','room_depth','budget','room_type'].includes(B.requirements.find(x=>x.id===r.id)?.effect)).map(r=>`<p>${esc(r.impact)}</p>`).join('')||'<p>Tell me about your daily routine and what you’d like to improve.</p>'}</div>
 <button class="btn chat-primary" type="submit" ${chatBusy?'disabled':''}>Confirm and see it</button></form></div>`;
}
function obstacleRow(o={}){return `<div class="obstacle-row"><input aria-label="Name of the area to keep clear" data-obstacle="label" placeholder="Name" required value="${esc(o.label||'')}">${[['x','From left'],['y','From top'],['w','Width'],['d','Depth']].map(([k,label])=>`<input type="number" min="${k==='w'||k==='d'?1:0}" max="1500" data-obstacle="${k}" aria-label="${label} cm" placeholder="${label}" required value="${o[k]!=null?cmValue(o[k]):''}">`).join('')}<button type="button" data-action="remove-obstacle" aria-label="Remove this area">×</button></div>`;}
function designerCard(){
 const body=S.space.photo!=='upload'?`<div class="chat-welcome"><h2>Take a photo and let’s look together.</h2><button class="btn" data-action="upload">Upload a room photo ↗</button></div>`:`<div class="conversation" role="log" aria-live="polite">${B.history.map((m,i)=>m.hidden?'':`<article class="message ${m.role}"><p>${esc(m.text).replace(/\n/g,'<br>')}</p>${m.role==='assistant'?uiCard(m.ui,i):''}</article>`).join('')}</div>${chatMode==='setup'?setupCard():BriefEngine.active(B).length&&!B.proposals.length?`<button class="chat-next" data-action="${designReady()?'cart':'chat-setup'}">${designReady()?'See the picked furniture →':'Confirm the room details →'}</button>`:''}`;
 return `<section class="card floating-designer" aria-label="Space designer"><header><button data-action="chat-close" aria-label="Collapse chat" title="Collapse chat">↙</button></header><div class="chat-status ${chatBusy?'busy':''}" role="status"><i></i>${esc(workStatus())}</div><div class="chat-body">${typeof photoDiagnosisCard==='function'?photoDiagnosisCard():''}${body}</div>
 ${B.proposals.length?`<div class="chat-proposals">${B.proposals.map(p=>`<p>${esc(p.text)}</p>`).join('')}<button class="btn chat-primary" data-action="brief-accept" ${chatBusy?'disabled':''}>Go with this</button><button class="btn ghost chat-secondary" data-action="brief-dismiss">Let me clarify</button></div>`:''}
 ${chatError?`<div class="chat-warning" role="alert">${esc(chatError)} <button data-action="chat-retry">Retry</button></div>`:''}
 ${importOpen?`<div class="chat-import"><button class="btn ghost chat-secondary" data-action="history-prompt">Copy a prompt for ChatGPT / Claude ↗</button><textarea id="context-input" aria-label="Import preferences" placeholder="Paste the memory or habits you’ve checked…"></textarea><button class="btn chat-primary" data-action="context-add" ${chatBusy?'disabled':''}>Import</button></div>`:''}
 <form id="designer-form"><textarea id="designer-message" aria-label="Tell the designer" placeholder="Keep going, I’m listening." ${chatBusy?'disabled':''}>${esc(chatDraft)}</textarea><div><span><button type="button" data-action="upload" aria-label="Add a photo">+</button><button type="button" data-action="context">Import memory</button></span><button class="send chat-send" type="submit" aria-label="Send message" ${chatBusy?'disabled':''}>↑</button></div></form></section>`;
}
function renderDesigner(){let host=document.getElementById('designer-drawer');if(!host){host=document.createElement('aside');host.id='designer-drawer';document.body.append(host);}host.innerHTML=chatOpen?designerCard():'<button class="designer-launch" data-action="chat-open">✳ Talk about this space</button>';const log=host.querySelector('.chat-body');if(log&&chatMode==='conversation')log.scrollTop=log.scrollHeight;}
function refreshDesigner(){renderDesigner();}
function renderDiagnosis(){for(const id of ['photo-annotations','space-diagnosis']){const el=document.getElementById(id);if(el)el.hidden=true;}}
async function startPhotoConversation(){
 if(chatBusy){chatError='The photo changed. Try again once this reply finishes.';refreshDesigner();return;}
 B.history.push({role:'user',text:'This is a photo of my space. First tell me what works and what might be improved, marking guesses as uncertain, then ask one question about how I live. Don’t guess dimensions from the photo.',hidden:true});await sendDesigner(true);
}
async function sendDesigner(retry=false){
 if(chatBusy)return;const text=chatDraft.trim();if(!retry&&!text)return;
 const target=typeof composerObject==='function'?composerObject():null;
 if(!retry){B.history.push({role:'user',text,...(target?{object:{label:target.label,category:target.category,box:target.box,productId:target.productId}}:{})});chatDraft='';}
 const photoAtSend=S.space.data,revisionAtSend=B.revision,count=B.history.length;
 chatError='';B.lastError='';chatBusy=true;chatMode='conversation';saveBrief();refreshDesigner();
 try{
  const response=await fetch('/api/chat',{method:'POST',headers:{'Content-Type':'application/json','X-Passcode':passcode.get()},body:JSON.stringify({interface:'studio',messages:B.history,brief:{revision:B.revision,requirements:B.requirements,unknowns:B.unknowns||[],observations:B.observations||[]},photo:S.space.photo==='upload'?S.space.data:null,region:target?{label:target.label,category:target.category,box:target.box,productId:target.productId}:null,project:{room:S.needs.room,space:S.space.confirmed?{width:S.space.wallIn,depth:S.space.depthIn,corridor:S.space.corridor,clearance:S.space.clearanceIn,obstacles:S.space.obstacles}:null,setupApproved:B.setupApproved},selectedCrop:target?.crop||null,contexts:B.contexts||[],editable:typeof editableSelection==='function'?editableSelection():null,selection:(S.scene||[]).map(it=>({category:it.cat,name:view(it).name}))}),signal:AbortSignal.timeout(100000)});
  const data=await response.json();if(response.status===401){const code=prompt('Team passcode');if(code)passcode.set(code);throw Error('Please try again');}if(!response.ok){const error=Error(data.error||'Connection failed');error.code=data.code;throw error;}
  if(photoAtSend!==S.space.data||revisionAtSend!==B.revision||count!==B.history.length)throw Error('The space changed. Please try again');
  B.history.push({role:'assistant',text:data.reply,ui:data.ui});B.proposals=data.proposals||[];B.unknowns=data.unknowns||[];
  if(typeof executeDesignerActions==='function')await executeDesignerActions(data.actions||[],target);
  if(data.observations?.length){B.observations=data.observations;B.observationEvidence=data.observations.map(text=>({text,source:'space_photo',photoKey:photoKey(),certainty:'observation'}));}if(data.annotations?.length)B.annotations=data.annotations;
  if(typeof renderDiagnosis==='function')renderDiagnosis();
 }catch(e){chatError=e.code?e.message:e.name==='TimeoutError'?'That took too long. Your message is saved, please try again.':'Couldn’t reach the designer. Your message is saved.';B.lastError=chatError;}
 finally{chatBusy=false;saveBrief();refreshDesigner();}
}
function applyBrief(){
 if(chatBusy||!B.proposals.length)return;
 if(typeof sofaCandidates==='function')sofaPreviousOrder=sofaCandidates().map(x=>x.p.id);
 for(const p of B.proposals){
  for(const r of B.requirements)if(r.status==='confirmed'&&(r.id===p.supersedes||(r.category===p.category&&r.scope===p.scope&&(p.scope!=='candidate'||r.productId===p.productId)&&((r.effect===p.effect&&(['budget','max_width','max_depth','prefer_compact','room_width','room_depth','room_type'].includes(p.effect)||r.value===p.value))||['require_category','exclude_category'].includes(r.effect)&&['require_category','exclude_category'].includes(p.effect)))))r.status='superseded';
  B.requirements.push({...p,status:'confirmed'});
  if(p.effect==='room_width'){S.space.wallIn=+p.value;S.space.confirmed=false;B.setupApproved=false;}
  if(p.effect==='room_depth'){S.space.depthIn=+p.value;S.space.confirmed=false;B.setupApproved=false;}
  if(p.effect==='room_type'){S.needs.room=p.value;B.setupApproved=false;}
  // Unverified design notes remain visible checks; they do not erase confirmed geometry.
 }
 B.revision++;B.proposals=[];briefChanged();if(!designReady())chatMode='setup';else chatMode='conversation';renderDesigner();
}
function briefChanged(){
 S.needs.budget=BriefEngine.budget(B,S.needs.budget);S.dirty=true;
 if(S.scene&&designGate()){
  const old=S.scene;S.options=planOptions();const next=structuredClone(S.options[S.opt]?.items||S.options[0].items);
  for(let i=0;i<next.length;i++){const prior=old.find(it=>it.cat===next[i].cat);if(prior&&!prior.own&&!next[i].own&&fits(view(prior),prior)&&BriefEngine.assess(view(prior),prior.cat,B).eligible&&BriefEngine.assess(view(prior),prior.cat,B).score>=BriefEngine.assess(view(next[i]),next[i].cat,B).score){const trial=next.slice();trial[i]=prior;if(sceneTotal(trial)<=S.needs.budget&&layoutAllows(trial))next[i]=prior;}}
  S.scene=next;S.options[S.opt].items=structuredClone(next);S.sel=null;S.dirty=false;syncLayout();
 }else if(S.scene){S.scene=null;S.options=[];S.layout=null;layoutOpen=false;}
 saveBrief();render();if(typeof renderSofaExplorer==='function')renderSofaExplorer();
}
function syncLayout(){if(!S.scene)return;S.layout=LayoutEngine.plan(S.scene,S.space,view);}
function renderLayout(){document.getElementById('layout-sheet')?.remove();}
function recordEdit(text){syncLayout();B.history.push({role:'assistant',text,manual:true,event:true});if(S.options[S.opt])S.options[S.opt].items=structuredClone(S.scene);saveBrief();}
function manualRequirement(effect,value,text){for(const r of B.requirements)if(r.status==='confirmed'&&r.effect===effect&&r.category==='all')r.status='superseded';B.requirements.push({id:`manual-${B.revision}-${effect}`,effect,value:String(value),category:'all',status:'confirmed',text,quote:text,priority:'must',scope:'room',evidence_kind:'user_statement',certainty:'explicit',situation:'Room setup confirmed by the user',outcome:'Limits product picks and layout',impact:effect==='budget'?'The design total can’t exceed the budget':'Layout checked against measured sizes'});}
document.addEventListener('submit',e=>{
 if(e.target.id==='designer-form'){e.preventDefault();sendDesigner();}
 if(e.target.id==='space-setup'){
  e.preventDefault();if(chatBusy)return;const f=new FormData(e.target),width=+f.get('width')/2.54,depth=+f.get('depth')/2.54,c=+f.get('clearance')/2.54;
  if(c>=width){chatError='The walkway must be narrower than the room.';renderDesigner();return;}
  const obstacles=[...document.querySelectorAll('.obstacle-row')].map(row=>Object.fromEntries([...row.querySelectorAll('[data-obstacle]')].map(i=>[i.dataset.obstacle,i.dataset.obstacle==='label'?i.value:+i.value/2.54])));
  if(obstacles.some(o=>o.x<0||o.y<0||o.w<=0||o.d<=0||o.x+o.w>width||o.y+o.d>depth)){chatError='Areas to keep clear must be inside the room.';renderDesigner();return;}
  const corridor={x:f.get('corridor')==='left'?0:f.get('corridor')==='right'?width-c:(width-c)/2,y:0,w:c,d:depth};
  if(obstacles.some(o=>LayoutEngine.overlap(o,corridor))){chatError='An area to keep clear blocks the walkway. Change the walkway side or width.';renderDesigner();return;}
  if(!BriefEngine.active(B).some(r=>!['budget','room_width','room_depth','room_type'].includes(r.effect))){chatError='I still need to know how you use this space. Start with an everyday moment.';chatMode='conversation';renderDesigner();return;}
  B.revision++;manualRequirement('budget',f.get('budget'),`Total budget $${f.get('budget')}`);manualRequirement('room_width',width,`Room width ${f.get('width')} cm`);manualRequirement('room_depth',depth,`Room depth ${f.get('depth')} cm`);
  S.space={...S.space,wallIn:width,depthIn:depth,clearanceIn:c,corridor:f.get('corridor'),obstacles,confirmed:true};S.needs.room=f.get('room');S.needs.budget=+f.get('budget');B.setupApproved=true;B.proposals=[];chatError='';
  B.history.push({role:'user',manual:true,text:`I confirm the room setup: ${cnRoom[S.needs.room]}, ${f.get('width')} cm wide, ${f.get('depth')} cm deep, total budget $${f.get('budget')}, a ${f.get('clearance')} cm clear walkway on the ${{left:'left',right:'right',center:'middle'}[S.space.corridor]}; ${obstacles.length?'keep clear: '+obstacles.map(o=>o.label).join(', '):'no other areas to keep clear'}.`});
  chatMode='conversation';chatOpen=false;generate();
 }
});
document.addEventListener('input',e=>{if(e.target.id==='designer-message')chatDraft=e.target.value;});
document.addEventListener('click',async e=>{
 const a=e.target.closest('[data-action]');if(!a)return;const action=a.dataset.action;
 if(action==='chat-setup'){chatMode='setup';chatOpen=true;layoutOpen=false;renderLayout();renderDesigner();}
 if(action==='chat-plans'){chatOpen=false;S.cart='open';render();}
 if(action==='chat-open'){chatOpen=true;renderDesigner();}
 if(action==='chat-close'){chatOpen=false;renderDesigner();}
 if(action==='chat-answer'){chatDraft=B.history[+a.dataset.message]?.ui?.options[+a.dataset.answer]?.value||'';sendDesigner();}
 if(action==='chat-retry')sendDesigner(true);
 if(action==='brief-accept')applyBrief();
 if(action==='brief-dismiss'){B.proposals=[];chatDraft='Let me be clearer: ';saveBrief();renderDesigner();}
 if(action==='brief-correct'){chatMode='conversation';chatDraft=`About "${B.requirements.find(r=>r.id===a.dataset.id)?.text}", I’d like to change it to: `;renderDesigner();}
 if(action==='context'){importOpen=!importOpen;renderDesigner();}
 if(action==='context-add'){const text=document.getElementById('context-input').value.trim();if(!text)return;chatDraft='Here is a memory summary I checked and am happy to share:\n'+text;importOpen=false;sendDesigner();}
 if(action==='history-prompt'){try{await navigator.clipboard.writeText(HISTORY_PROMPT);toast('Prompt copied. Run it in that tool, check the result, then bring it back here.');}catch{chatError=HISTORY_PROMPT;renderDesigner();}}
 if(action==='add-obstacle')document.getElementById('fixed-area-rows').insertAdjacentHTML('beforeend',obstacleRow());
 if(action==='remove-obstacle')a.closest('.obstacle-row').remove();

});
