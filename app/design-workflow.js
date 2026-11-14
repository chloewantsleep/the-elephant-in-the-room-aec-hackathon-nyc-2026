/* Connect the existing catalogue controls, visual context and real image service. */
function selectedSceneIndex(target=composerObject()) {
 if(!target)return -1;
 if(target.productId)return (S.scene||[]).findIndex(it=>view(it).id===target.productId||it.pid===target.productId);
 const matches=(S.scene||[]).map((it,i)=>({it,i})).filter(({it})=>it.own===target.id||it.cat===target.category);
 return matches.length===1?matches[0].i:-1;
}
function editableSelection(){
 const i=selectedSceneIndex();if(i<0)return null;
 const it=S.scene[i],p=view(it),base=byId[it.pid];
 return {index:i,productId:p.id,name:p.name,variant:p.variant,materials:p.materials,dims_in:p.dims_in,
  facts:p.sofa?.attributes||{},variants:base?[{id:'',label:base.variant},...base.variants.map(v=>({id:v.id,label:v.variant}))]:[],
  alternatives:P.filter(q=>q.category===it.cat&&q.id!==it.pid&&fits(q,it)&&eligibleSwap(q,it)).sort((a,b)=>BriefEngine.assess(b,it.cat,B).score-BriefEngine.assess(a,it.cat,B).score).slice(0,8).map(q=>({id:q.id,name:q.name,variant:q.variant,price:q.price.amount}))};
}
function changeSceneProduct(index,pid,vid){
 if(S.rendering)throw Error('效果图正在生成，完成后再修改选品。');
 const it=S.scene?.[index],p=byId[pid];if(!it||!p||it.cat!==p.category)throw Error('请先选中要修改的家具。');
 if(vid&&!p.variants.some(v=>v.id===vid))throw Error('目录没有这个配色。');
 const next={...it,pid,vid:vid||null};delete next.own;const candidate=view(next);
 if(!fits(candidate,it)||!eligibleSwap(candidate,it))throw Error('这个选择与预算、尺寸或已确认需求冲突。');
 const before=view(it),wasOwn=it.own;Object.assign(it,next);delete it.own;if(wasOwn&&exById(wasOwn))exById(wasOwn).keep=false;
 S.sel=index;selectedObject=null;objectNotice='';renderObjectSelection();
 recordEdit(before.name===candidate.name?`已将 ${candidate.name} 的配色改为 ${candidate.variant}。`:`已将 ${before.name} 替换为 ${candidate.name}。`);
 render();
}
async function executeDesignerActions(actions,target){
 let index=selectedSceneIndex(target),changed=false,renderRequested=false;
 for(const action of actions){
  if(action.type==='render'){renderRequested=true;continue;}
  try{
   if(index<0)throw Error('请在当前方案中选中要修改的家具。');
   const it=S.scene[index];
   if(action.type==='color'){if(view(it).id!==action.productId)throw Error('选中对象已经变化，请重新选择。');changeSceneProduct(index,it.pid,action.variantId);changed=true;}
   if(action.type==='replace'){changeSceneProduct(index,action.productId,null);changed=true;}
  }catch(e){logTransition(e.message);chatError=e.message;}
 }
 if((changed||renderRequested)&&S.scene?.length){chatBusy=false;await renderScene();}
}
function photoDiagnosisCard(){
 if(!B.annotations?.length||!S.space.data)return '';
 return `<details class="photo-diagnosis"><summary>照片里的空间线索</summary><div><img src="${esc(S.space.data)}" alt="空间观察，非尺寸测量">${B.annotations.map((a,i)=>`<span style="left:${a.x}%;top:${a.y}%">${i+1}</span>`).join('')}</div>${B.annotations.map((a,i)=>`<p>${i+1} · ${esc(a.label)}${a.detail?'：'+esc(a.detail):''}</p>`).join('')}<small>观察不是实测；动线与尺寸仍需确认。</small></details>`;
}
async function loadContext(file){
 if(!file?.type.startsWith('image/'))return;
 if((B.contexts||[]).length>=3){chatError='最多保留三张参考图，请先移除不需要的图片。';renderDesigner();return;}
 const data=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(file);});
 const im=new Image();im.src=data;await im.decode();const k=Math.min(1,900/Math.max(im.width,im.height)),c=document.createElement('canvas');c.width=im.width*k;c.height=im.height*k;c.getContext('2d').drawImage(im,0,0,c.width,c.height);
 B.contexts=B.contexts||[];B.contexts.push({id:'context-'+Date.now(),name:file.name,image:c.toDataURL('image/jpeg',.75)});saveBrief();
 chatDraft=`补充参考图「${file.name}」。请把可见信息与我的空间照片分开；先问我希望借鉴的部分，不要把图中风格当成已确认偏好。`;await sendDesigner();
}
document.addEventListener('click',e=>{
 const a=e.target.closest('[data-action]');if(!a)return;
 if(a.dataset.action==='context-image')document.getElementById('context-file').click();
 if(a.dataset.action==='context-remove'){B.contexts=(B.contexts||[]).filter(x=>x.id!==a.dataset.id);saveBrief();renderDesigner();}
});
document.getElementById('context-file').addEventListener('change',e=>{const f=e.target.files[0];e.target.value='';loadContext(f).catch(()=>{chatError='参考图读取失败，请重试。';renderDesigner();});});
// Images can exceed localStorage limits. IndexedDB stores the last render separately.
function renderStore(){return new Promise((resolve,reject)=>{const req=indexedDB.open('elephant-render',1);req.onupgradeneeded=()=>req.result.createObjectStore('images');req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}
async function persistRenderedImage(sig,last){
 if(typeof indexedDB==='undefined')return;
 try{const db=await renderStore();const tx=db.transaction('images','readwrite');tx.objectStore('images').put({sig,last},'latest');tx.oncomplete=()=>db.close();tx.onerror=()=>{db.close();toast('效果图未保存到本机，请保持页面打开。');};}catch{toast('效果图未保存到本机，请保持页面打开。');}
}
async function restoreRenderedImage(){
 if(typeof indexedDB==='undefined')return;
 try{const db=await renderStore(),tx=db.transaction('images'),req=tx.objectStore('images').get('latest');req.onsuccess=()=>{const saved=req.result;if(saved&&S.scene&&saved.last.photoKey===photoKey()){S.last=saved.last;S.renders[saved.sig]=saved.last.image;render();}};tx.oncomplete=()=>db.close();}catch{}
}
restoreRenderedImage();
