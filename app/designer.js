/* One continuous, local-first conversation drives the existing catalogue, scene and layout. */
const BRIEF_KEY='elephant-living-brief-v1';
let B={revision:0,requirements:[],history:[],observations:[],proposals:[],setupApproved:false};
let savedProject=null,chatBusy=false,chatOpen=true,chatError='',chatDraft='',importOpen=false,chatMode='conversation',layoutOpen=false;
try{const v=JSON.parse(localStorage.getItem(BRIEF_KEY));if(v?.version===1){B={...B,...v.brief};savedProject=v.project||null;}}catch{}
const HISTORY_PROMPT='请仅根据你实际能访问的对话或记忆，整理我在居住空间、生活习惯、家具、审美、预算、收纳和维护方面明确表达的偏好。每条附依据，区分明确表达和推测；不要编造或推断敏感信息。只保留会影响空间与家具选择的信息。我会检查后，再分享给空间设计师。';
const lastRequirement=effect=>BriefEngine.active(B).filter(r=>r.effect===effect).at(-1);
const cnRoom={living:'客厅',bedroom:'卧室',dining:'餐厅',office:'工作空间'};
const cmValue=n=>n!=null&&Number.isFinite(+n)?Math.round(n*2.54):'';
function saveBrief(){try{localStorage.setItem(BRIEF_KEY,JSON.stringify({version:1,brief:B,project:{space:S.space,needs:S.needs,scene:S.scene,options:S.options,opt:S.opt,existing:S.existing,removedCategories:S.removedCategories}}));}catch{chatError='本机存储空间不足，请保持页面打开或导出需求。';}}
function restoreDesignerProject(){
 if(!savedProject)return;
 for(const k of ['space','needs','scene','options','opt','existing','removedCategories'])if(savedProject[k]!=null)S[k]=savedProject[k];
 S.options=S.options||[];S.removedCategories=S.removedCategories||[];
 if(S.space.photo==='upload'){S.live=true;if(B.history.at(-1)?.role==='user'&&!B.history.at(-1)?.manual)chatError=B.lastError||'上次消息尚未收到回复，可以重试。';}
 if(S.scene?.some(it=>!it.own&&!byId[it.pid])){S.scene=null;S.options=[];}
 if(S.scene&&!designReady()){S.scene=null;S.options=[];}
 if(S.scene)syncLayout();
}
function designReady(){return S.space.photo==='upload'&&S.space.confirmed===true&&B.setupApproved===true&&!!lastRequirement('budget')&&BriefEngine.active(B).some(r=>!['budget','room_width','room_depth','room_type'].includes(r.effect));}
function derivedConditions(){return BriefEngine.active(B).map(r=>({id:r.id,text:r.text,impact:r.impact||'需在方案中复核',kind:r.effect==='design_note'?'review':'selection',quote:r.quote}));}
function workStatus(){
 if(chatBusy)return '正在读图、梳理这次需求…';
 if(S.generating)return '正在按需求筛选产品、检查占位…';
 if(B.proposals.length)return `整理出 ${B.proposals.length} 条需求，等你确认`;
 if(S.scene)return `方案已更新 · ${S.scene.length} 类家具 · ${money(sceneTotal(S.scene))}`;
 if(!S.space.data)return '从一张照片开始';
 if(!BriefEngine.active(B).length)return '已看过空间，聊聊你的生活习惯';
 return S.space.confirmed?'需求已整理，确认设计条件后出方案':'需求已整理，接下来确认空间限制';
}
function uiCard(ui,index){if(ui?.type!=='question'||!ui.options?.length)return '';return `<div class="chat-question"><b>${esc(ui.title)}</b><div>${ui.options.map((o,i)=>`<button class="chip" data-action="chat-answer" data-message="${index}" data-answer="${i}" ${chatBusy?'disabled':''}>${esc(o.label)}</button>`).join('')}</div></div>`;}
function setupCard(){
 const w=lastRequirement('room_width'),d=lastRequirement('room_depth'),budget=lastRequirement('budget');
 return `<div class="chat-summary"><h3>把空间条件确认一下。</h3><p>照片无法给出可靠尺寸。这里填实测值，之后还可以改。</p>
 <form id="space-setup"><div class="setup-grid"><label>空间<select name="room">${Object.entries(cnRoom).map(([k,v])=>`<option value="${k}" ${S.needs.room===k?'selected':''}>${v}</option>`).join('')}</select></label><label>总预算 · USD<input name="budget" type="number" min="1" max="10000000" required value="${budget?esc(budget.value):''}" placeholder="例如 3000"></label><label>宽 · cm<input name="width" type="number" min="150" max="1500" required value="${w?cmValue(+w.value):S.space.confirmed?cmValue(S.space.wallIn):''}"></label><label>深 · cm<input name="depth" type="number" min="150" max="1500" required value="${d?cmValue(+d.value):S.space.confirmed?cmValue(S.space.depthIn):''}"></label><label>连续通道留在<select name="corridor" required><option value="">请选择</option>${[['left','左侧'],['right','右侧'],['center','中间']].map(([k,v])=>`<option value="${k}" ${S.space.corridor===k?'selected':''}>${v}</option>`).join('')}</select></label><label>通道宽 · cm<input name="clearance" type="number" min="40" max="200" required value="${S.space.clearanceIn?cmValue(S.space.clearanceIn):''}" placeholder="按实际通行需求"></label></div>
 <details class="fixed-areas"><summary>有固定家具、柱子或门窗要留空？</summary><p>按平面左上角为原点填写占位，单位 cm。窗下无需留空的可不填。</p><div id="fixed-area-rows">${(S.space.obstacles||[]).map(o=>obstacleRow(o)).join('')}</div><button type="button" class="btn ghost chat-secondary" data-action="add-obstacle">＋ 添加保留区域</button></details>
 <label class="setup-consent"><input type="checkbox" name="checked" required> 已核对尺寸、入口通道，以及需要保留的固定区域。</label>
 <div class="conditions"><b>这些条件会如何影响方案</b>${derivedConditions().filter(r=>!['room_width','room_depth','budget','room_type'].includes(B.requirements.find(x=>x.id===r.id)?.effect)).map(r=>`<p>${esc(r.impact)}</p>`).join('')||'<p>还需要聊聊日常活动和你想改善的地方。</p>'}</div>
 <button class="btn chat-primary" type="submit" ${chatBusy?'disabled':''}>确认，看看效果</button></form></div>`;
}
function obstacleRow(o={}){return `<div class="obstacle-row"><input aria-label="保留区域名称" data-obstacle="label" placeholder="名称" required value="${esc(o.label||'')}">${[['x','距左'],['y','距上'],['w','宽'],['d','深']].map(([k,label])=>`<input type="number" min="${k==='w'||k==='d'?1:0}" max="1500" data-obstacle="${k}" aria-label="${label} cm" placeholder="${label}" required value="${o[k]!=null?cmValue(o[k]):''}">`).join('')}<button type="button" data-action="remove-obstacle" aria-label="删除保留区域">×</button></div>`;}
function designerCard(){
 const body=S.space.photo!=='upload'?`<div class="chat-welcome"><h2>拍张照片，一起看看。</h2><button class="btn" data-action="upload">上传空间照片 ↗</button></div>`:`<div class="conversation" role="log" aria-live="polite">${B.history.map((m,i)=>m.hidden?'':`<article class="message ${m.role}"><p>${esc(m.text).replace(/\n/g,'<br>')}</p>${m.role==='assistant'?uiCard(m.ui,i):''}</article>`).join('')}</div>${chatMode==='setup'?setupCard():BriefEngine.active(B).length&&!B.proposals.length?`<button class="chat-next" data-action="${designReady()?'cart':'chat-setup'}">${designReady()?'看看选好的家具 →':'再确认一下空间条件 →'}</button>`:''}`;
 return `<section class="card floating-designer" aria-label="空间设计师"><header><button data-action="chat-close" aria-label="收起聊天" title="收起聊天">↙</button></header><div class="chat-status ${chatBusy?'busy':''}" role="status"><i></i>${esc(workStatus())}</div><div class="chat-body">${typeof photoDiagnosisCard==='function'?photoDiagnosisCard():''}${body}</div>
 ${B.proposals.length?`<div class="chat-proposals">${B.proposals.map(p=>`<p>${esc(p.text)}</p>`).join('')}<button class="btn chat-primary" data-action="brief-accept" ${chatBusy?'disabled':''}>就按这个来</button><button class="btn ghost chat-secondary" data-action="brief-dismiss">我再说清楚一点</button></div>`:''}
 ${chatError?`<div class="chat-warning" role="alert">${esc(chatError)} <button data-action="chat-retry">重试</button></div>`:''}
 ${importOpen?`<div class="chat-import"><button class="btn ghost chat-secondary" data-action="history-prompt">复制给 ChatGPT / Claude 的提示词 ↗</button><textarea id="context-input" aria-label="导入偏好" placeholder="粘贴你已检查的记忆或生活习惯…"></textarea><button class="btn chat-primary" data-action="context-add" ${chatBusy?'disabled':''}>导入并整理</button></div>`:''}
 <form id="designer-form"><textarea id="designer-message" aria-label="告诉设计师" placeholder="继续说，我一直在。" ${chatBusy?'disabled':''}>${esc(chatDraft)}</textarea><div><span><button type="button" data-action="upload" aria-label="添加照片">＋</button><button type="button" data-action="context">导入记忆</button></span><button class="send chat-send" type="submit" aria-label="发送消息" ${chatBusy?'disabled':''}>↑</button></div></form></section>`;
}
function renderDesigner(){let host=document.getElementById('designer-drawer');if(!host){host=document.createElement('aside');host.id='designer-drawer';document.body.append(host);}host.innerHTML=chatOpen?designerCard():'<button class="designer-launch" data-action="chat-open">✳ 聊聊这个空间</button>';const log=host.querySelector('.chat-body');if(log&&chatMode==='conversation')log.scrollTop=log.scrollHeight;}
function refreshDesigner(){renderDesigner();}
function renderDiagnosis(){for(const id of ['photo-annotations','space-diagnosis']){const el=document.getElementById(id);if(el)el.hidden=true;}}
async function startPhotoConversation(){
 if(chatBusy){chatError='照片已更换，当前回复结束后请重试。';refreshDesigner();return;}
 B.history.push({role:'user',text:'这是我的空间照片。请先说出可见的优点和可能需要改善的地方，推测要标明不确定，再问一个与我的生活有关的问题。不要从照片猜尺寸。',hidden:true});await sendDesigner(true);
}
async function sendDesigner(retry=false){
 if(chatBusy)return;const text=chatDraft.trim();if(!retry&&!text)return;
 const target=typeof composerObject==='function'?composerObject():null;
 if(!retry){B.history.push({role:'user',text,...(target?{object:{label:target.label,category:target.category,box:target.box,productId:target.productId}}:{})});chatDraft='';}
 const photoAtSend=S.space.data,revisionAtSend=B.revision,count=B.history.length;
 chatError='';B.lastError='';chatBusy=true;chatMode='conversation';saveBrief();refreshDesigner();
 try{
  const response=await fetch('/api/chat',{method:'POST',headers:{'Content-Type':'application/json','X-Passcode':passcode.get()},body:JSON.stringify({interface:'studio',messages:B.history,brief:{revision:B.revision,requirements:B.requirements,unknowns:B.unknowns||[],observations:B.observations||[]},photo:S.space.photo==='upload'?S.space.data:null,region:target?{label:target.label,category:target.category,box:target.box,productId:target.productId}:null,project:{room:S.needs.room,space:S.space.confirmed?{width:S.space.wallIn,depth:S.space.depthIn,corridor:S.space.corridor,clearance:S.space.clearanceIn,obstacles:S.space.obstacles}:null,setupApproved:B.setupApproved},selectedCrop:target?.crop||null,contexts:B.contexts||[],editable:typeof editableSelection==='function'?editableSelection():null,selection:(S.scene||[]).map(it=>({category:it.cat,name:view(it).name}))}),signal:AbortSignal.timeout(100000)});
  const data=await response.json();if(response.status===401){const code=prompt('团队访问口令');if(code)passcode.set(code);throw Error('请重试');}if(!response.ok){const error=Error(data.error||'连接失败');error.code=data.code;throw error;}
  if(photoAtSend!==S.space.data||revisionAtSend!==B.revision||count!==B.history.length)throw Error('空间已变化，请重试');
  B.history.push({role:'assistant',text:data.reply,ui:data.ui});B.proposals=data.proposals||[];B.unknowns=data.unknowns||[];
  if(typeof executeDesignerActions==='function')await executeDesignerActions(data.actions||[],target);
  if(data.observations?.length){B.observations=data.observations;B.observationEvidence=data.observations.map(text=>({text,source:'space_photo',photoKey:photoKey(),certainty:'observation'}));}if(data.annotations?.length)B.annotations=data.annotations;
  if(typeof renderDiagnosis==='function')renderDiagnosis();
 }catch(e){chatError=e.code?e.message:e.name==='TimeoutError'?'这次响应超时，你的话已保留，请重试。':'暂时没有连上设计师，你的话已保留。';B.lastError=chatError;}
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
 if(S.scene&&designReady()){
  const old=S.scene;S.options=planOptions();const next=structuredClone(S.options[S.opt]?.items||S.options[0].items);
  for(let i=0;i<next.length;i++){const prior=old.find(it=>it.cat===next[i].cat);if(prior&&!prior.own&&!next[i].own&&fits(view(prior),prior)&&BriefEngine.assess(view(prior),prior.cat,B).eligible&&BriefEngine.assess(view(prior),prior.cat,B).score>=BriefEngine.assess(view(next[i]),next[i].cat,B).score){const trial=next.slice();trial[i]=prior;if(sceneTotal(trial)<=S.needs.budget&&layoutAllows(trial))next[i]=prior;}}
  S.scene=next;S.options[S.opt].items=structuredClone(next);S.sel=null;S.dirty=false;syncLayout();
 }else if(S.scene){S.scene=null;S.options=[];S.layout=null;layoutOpen=false;}
 saveBrief();render();if(typeof renderSofaExplorer==='function')renderSofaExplorer();
}
function syncLayout(){if(!S.scene)return;S.layout=LayoutEngine.plan(S.scene,S.space,view);}
function renderLayout(){document.getElementById('layout-sheet')?.remove();}
function recordEdit(text){syncLayout();B.history.push({role:'assistant',text,manual:true,event:true});if(S.options[S.opt])S.options[S.opt].items=structuredClone(S.scene);saveBrief();}
function manualRequirement(effect,value,text){for(const r of B.requirements)if(r.status==='confirmed'&&r.effect===effect&&r.category==='all')r.status='superseded';B.requirements.push({id:`manual-${B.revision}-${effect}`,effect,value:String(value),category:'all',status:'confirmed',text,quote:text,priority:'must',scope:'room',evidence_kind:'user_statement',certainty:'explicit',situation:'用户确认的空间设置',outcome:'约束选品与布局',impact:effect==='budget'?'方案总价不能超过预算':'按实测尺寸检查布局'});}
document.addEventListener('submit',e=>{
 if(e.target.id==='designer-form'){e.preventDefault();sendDesigner();}
 if(e.target.id==='space-setup'){
  e.preventDefault();if(chatBusy)return;const f=new FormData(e.target),width=+f.get('width')/2.54,depth=+f.get('depth')/2.54,c=+f.get('clearance')/2.54;
  if(c>=width){chatError='通道宽度必须小于房间宽度。';renderDesigner();return;}
  const obstacles=[...document.querySelectorAll('.obstacle-row')].map(row=>Object.fromEntries([...row.querySelectorAll('[data-obstacle]')].map(i=>[i.dataset.obstacle,i.dataset.obstacle==='label'?i.value:+i.value/2.54])));
  if(obstacles.some(o=>o.x<0||o.y<0||o.w<=0||o.d<=0||o.x+o.w>width||o.y+o.d>depth)){chatError='固定区域要在房间边界内。';renderDesigner();return;}
  const corridor={x:f.get('corridor')==='left'?0:f.get('corridor')==='right'?width-c:(width-c)/2,y:0,w:c,d:depth};
  if(obstacles.some(o=>LayoutEngine.overlap(o,corridor))){chatError='固定区域占用了预留通道，请调整通道侧或宽度。';renderDesigner();return;}
  if(!BriefEngine.active(B).some(r=>!['budget','room_width','room_depth','room_type'].includes(r.effect))){chatError='还需要了解你怎么使用这里。先聊一个日常场景。';chatMode='conversation';renderDesigner();return;}
  B.revision++;manualRequirement('budget',f.get('budget'),`整体预算 ${f.get('budget')} 美元`);manualRequirement('room_width',width,`房间宽 ${f.get('width')} cm`);manualRequirement('room_depth',depth,`房间深 ${f.get('depth')} cm`);
  S.space={...S.space,wallIn:width,depthIn:depth,clearanceIn:c,corridor:f.get('corridor'),obstacles,confirmed:true};S.needs.room=f.get('room');S.needs.budget=+f.get('budget');B.setupApproved=true;B.proposals=[];chatError='';
  B.history.push({role:'user',manual:true,text:`我确认空间设置：${cnRoom[S.needs.room]}，宽 ${f.get('width')} cm、深 ${f.get('depth')} cm，总预算 ${f.get('budget')} 美元，${{left:'左侧',right:'右侧',center:'中间'}[S.space.corridor]}预留 ${f.get('clearance')} cm 连续通道；${obstacles.length?obstacles.map(o=>o.label).join('、')+'区域保留':'没有其他固定保留区域'}。`});
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
 if(action==='brief-dismiss'){B.proposals=[];chatDraft='我想再说清楚一点：';saveBrief();renderDesigner();}
 if(action==='brief-correct'){chatMode='conversation';chatDraft=`关于“${B.requirements.find(r=>r.id===a.dataset.id)?.text}”，我想改成：`;renderDesigner();}
 if(action==='context'){importOpen=!importOpen;renderDesigner();}
 if(action==='context-add'){const text=document.getElementById('context-input').value.trim();if(!text)return;chatDraft='以下是我检查并愿意分享的记忆摘要：\n'+text;importOpen=false;sendDesigner();}
 if(action==='history-prompt'){try{await navigator.clipboard.writeText(HISTORY_PROMPT);toast('提示词已复制，在原工具整理并检查后带回来。');}catch{chatError=HISTORY_PROMPT;renderDesigner();}}
 if(action==='add-obstacle')document.getElementById('fixed-area-rows').insertAdjacentHTML('beforeend',obstacleRow());
 if(action==='remove-obstacle')a.closest('.obstacle-row').remove();

});
