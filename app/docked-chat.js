/* Main app conversation dock. Shares the existing brief, scene and image APIs. */
let selectedObject=null,objectNotice='',voice=null,voiceActive=false;
chatOpen=false;
const baseWorkStatus=workStatus;
workStatus=function(){return S.rendering?'正在把当前选品与颜色生成到空间照片…':baseWorkStatus();};
function logTransition(text){dockActivity=true;if(!dockTurnStart)dockTurnStart=Date.now();B.events=B.events||[];B.events.push({text,time:Date.now()});B.events=B.events.slice(-30);saveBrief();}
const originalApplyBrief=applyBrief;
applyBrief=function(){if(chatBusy)return;const proposals=B.proposals.slice();originalApplyBrief();if(proposals.length)logTransition(`已确认 ${proposals.length} 条需求：${proposals.map(p=>p.text).join('；')}。${S.scene?'已据此重新筛选选品。':'接下来核对空间条件。'}`);if(proposals.length){chatOpen=true;chatMode=designReady()?'conversation':'setup';}renderDesigner();};
// Keep the original .chat-input / input / .send primitives and the same DOM input
// mounted while activity, selection and expanded history change around it.
let dockActivity=false,dockTurnStart=0;
function composerObject(){
 if(selectedObject)return selectedObject;
 if(S.sel!=null&&S.scene?.[S.sel]){const it=S.scene[S.sel],p=view(it);return {label:p.family||p.name,category:it.cat,productId:p.id,crop:imgOf(p)};}
 return null;
}
function objectCapsule(){const o=composerObject();return o?`<span class="chip object-capsule">${o.crop?`<img src="${esc(o.iso||o.crop)}" alt="">`:''}<span>${esc(o.label)}</span><button type="button" data-action="object-clear" aria-label="取消物件选择">×</button></span>`:'';}
function dockForm(){return `<form id="designer-form" class="chat-input"><details class="composer-add"><summary class="icon-btn" aria-label="添加照片或资料">＋</summary><div class="card"><button class="chip" type="button" data-action="upload">添加照片</button>${S.space.photo==='upload'&&!S.scene?'<button class="chip" type="button" data-action="scan">Find furniture to keep</button>':''}<button class="chip" type="button" data-action="context-image">添加灵感图 / sketch</button><button class="chip" type="button" data-action="context">导入 ChatGPT / Claude 记忆</button></div></details><span id="composer-object">${objectCapsule()}</span><input id="designer-message" aria-label="告诉设计师" autocomplete="off" maxlength="12000" placeholder="${S.space.photo==='upload'?'说说想改哪里…':'拍张照片，聊聊你的空间…'}" value="${esc(chatDraft)}"><button class="icon-btn voice-input" type="button" data-action="voice" aria-label="语音输入" aria-pressed="${voiceActive}"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5 10v2a7 7 0 0014 0v-2M12 19v3M8 22h8"/></svg></button><button class="send" type="submit" aria-label="发送消息" ${chatBusy?'disabled':''} ${chatDraft.trim()?'':'hidden'}>↑</button></form>`;}
function dockProgress(){
 if(!dockActivity)return '';
 const busy=chatBusy||S.rendering||S.generating;
 const latest=B.history.filter(m=>!m.hidden).at(-1),last=latest?.role==='assistant'&&!latest.event?latest:null;
 const changes=(B.events||[]).filter(e=>e.time>=dockTurnStart).slice(-2);
 if(!busy&&!changes.length&&!objectNotice&&!last&&!B.proposals.length&&!chatError&&!S.renderError)return '';
 return `<div class="dock-progress" role="status">${busy?`<p class="chat-status busy"><i></i>${esc(workStatus())}</p>`:''}${changes.map(e=>`<p>✓ ${esc(e.text)}</p>`).join('')}${!busy&&objectNotice?`<p>${esc(objectNotice)}</p>`:!busy&&last?`<p class="dock-reply">${esc(last.text)}</p>`:''}${!busy&&B.proposals.length?`<button class="chip" data-action="dock-expand">确认 ${B.proposals.length} 条需求 →</button>`:''}${S.renderError?`<p class="chat-warning">效果图生成失败 <button data-action="render">重试生成</button></p>`:''}${chatError?`<p class="chat-warning">${esc(chatError)} <button data-action="chat-retry">重试</button></p>`:''}</div>`;
}
renderDesigner=function(){
 let host=document.getElementById('designer-drawer');if(!host){host=document.createElement('aside');host.id='designer-drawer';document.body.append(host);}
 if(!host.querySelector('#dock-content'))host.innerHTML=`<div id="dock-content"></div><div class="composer-top"><span id="composer-start"></span><button class="icon-btn" data-action="dock-expand" aria-label="展开对话" title="展开对话">↗</button></div>${dockForm()}`;
 host.classList.toggle('dock-expanded',chatOpen);host.classList.remove('dock-collapsed');
 const content=host.querySelector('#dock-content'),contextDraft=host.querySelector('#context-input')?.value;
 if(chatOpen){content.innerHTML=designerCard();content.querySelector('#designer-form')?.remove();}
 else if(importOpen){content.innerHTML=`<section class="card dock-import"><header><b>导入你的偏好</b><button class="icon-btn" data-action="context" aria-label="关闭导入">×</button></header><button class="chip" data-action="history-prompt">复制给 ChatGPT / Claude 的提示词</button><textarea id="context-input" aria-label="导入偏好" placeholder="粘贴你检查过的记忆…"></textarea><button class="btn" data-action="context-add">导入并整理</button></section>`;}
 else content.innerHTML=dockProgress();
 if(contextDraft!=null&&host.querySelector('#context-input'))host.querySelector('#context-input').value=contextDraft;
 host.querySelector('#composer-object').innerHTML=objectCapsule();
 const input=host.querySelector('#designer-message');if(input.value!==chatDraft)input.value=chatDraft;
 input.placeholder=S.space.photo==='upload'?'说说想改哪里…':'拍张照片，聊聊你的空间…';
 const send=host.querySelector('#designer-form [type="submit"]');send.hidden=!chatDraft.trim();send.disabled=chatBusy;
 host.querySelector('[data-action="voice"]').setAttribute('aria-pressed',String(voiceActive));
 const expand=host.querySelector('.composer-top');expand.hidden=chatOpen;
 host.querySelector('#composer-start').innerHTML=S.space.photo!=='upload'?'<button data-action="upload">上传照片</button><button data-action="context">导入记忆</button>':'';
 if(chatOpen){const body=content.querySelector('.chat-body');if(body&&(B.contexts||[]).length)body.insertAdjacentHTML('afterbegin',`<details class="context-thumbs"><summary>参考图 · ${B.contexts.length}</summary>${B.contexts.map(c=>`<figure><img src="${esc(c.image)}" alt="${esc(c.name)}"><figcaption>${esc(c.name)} <button data-action="context-remove" data-id="${esc(c.id)}">移除</button></figcaption></figure>`).join('')}</details>`);if(body)body.scrollTop=body.scrollHeight;}
};
const originalSendDesigner=sendDesigner;
sendDesigner=async function(retry=false){if(chatBusy||(!retry&&!chatDraft.trim()))return;dockActivity=true;dockTurnStart=Date.now();const o=composerObject();logTransition(o?`已把「${o.label}」和这次描述作为输入。`:'已收到这次输入。');await originalSendDesigner(retry);if(!chatError&&B.proposals.length)logTransition(`已整理 ${B.proposals.length} 条待确认需求，确认后用于选品。`);renderDesigner();};
document.addEventListener('input',e=>{if(e.target.id==='designer-message'){const send=e.target.form.querySelector('[type="submit"]');send.hidden=!e.target.value.trim();}});
function renderObjectSelection(){document.getElementById('selected-object')?.remove();}
document.addEventListener('click',e=>{const b=e.target.closest('[data-action]');if(!b)return;const a=b.dataset.action;
 if(['context','upload','context-image','scan'].includes(a))document.querySelector('.composer-add')?.removeAttribute('open');
 if(a==='dock-expand'){chatOpen=!chatOpen;chatMode='conversation';renderDesigner();}
 if(a==='object-clear'){selectedObject=null;S.sel=null;objectNotice='';renderObjectSelection();render();}
 if(['select','cart-item'].includes(a)){selectedObject=null;objectNotice='';renderObjectSelection();renderDesigner();}
 if(a==='cart'){chatOpen=false;renderDesigner();}
 if(a==='voice'){
  dockActivity=true;
  const Speech=window.SpeechRecognition||window.webkitSpeechRecognition;if(!Speech){chatError='这个浏览器不支持语音转文字。可使用系统听写，或在 Chrome 中打开。';renderDesigner();return;}
  if(voiceActive){voice.stop();return;}voice=new Speech();voice.lang='zh-CN';voice.interimResults=false;voice.onresult=e=>{chatDraft+=(chatDraft?' ':'')+e.results[0][0].transcript;renderDesigner();};voice.onerror=()=>{chatError='没有收到语音或麦克风未获授权，文字输入仍可用。';};voice.onend=()=>{voiceActive=false;renderDesigner();};voiceActive=true;voice.start();renderDesigner();
 }
});

const baseRecordEdit=recordEdit;
recordEdit=function(text){dockActivity=true;dockTurnStart=Date.now();logTransition('已更新当前方案：'+text+' 下一次效果图将使用这些选品和颜色。');baseRecordEdit(text);};
const baseGenerate=generate;
generate=function(){baseGenerate();if(S.scene&&designReady()){logTransition('已把确认的需求、预算与空间限制用于选品和占位检查；开始生成效果图。');renderScene();}};

// Reuse the repository's detected-furniture cards as conversation context.
document.addEventListener('click',e=>{const card=e.target.closest('[data-ex]');if(!card)return;selectedObject=exById(card.dataset.ex);renderDesigner();});
