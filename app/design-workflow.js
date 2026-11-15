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
  alternatives:P.filter(q=>q.category===it.cat&&q.id!==it.pid&&fits(q,it)&&eligibleSwap(q,it)).sort((a,b)=>BriefEngine.assess(b,it.cat,B).score-BriefEngine.assess(a,it.cat,B).score).slice(0,4).map(q=>({id:q.id,name:q.name,variant:q.variant,price:q.price.amount}))};
}
function changeSceneProduct(index,pid,vid){
 if(S.rendering)throw Error('A render is in progress. Change the picks once it finishes.');
 const it=S.scene?.[index],p=byId[pid];if(!it||!p||it.cat!==p.category)throw Error('Select the piece you want to change first.');
 if(vid&&!p.variants.some(v=>v.id===vid))throw Error('That color isn’t in the catalog.');
 const next={...it,pid,vid:vid||null};delete next.own;const candidate=view(next);
 // only a color change of the piece already in the room: same product, same size -> never blocked
 const colorOnly=!it.own&&it.pid===pid;
 const locked=typeof lockedSlot==='function'&&lockedSlot(it)&&lockedSlot({...it,pid});   // demo: a locked similar product
 if(!colorOnly&&!locked&&(!fits(candidate,it)||!eligibleSwap(candidate,it)))throw Error('That choice conflicts with the budget, size or a confirmed need.');
 const before=view(it),wasOwn=it.own;Object.assign(it,next);delete it.own;if(wasOwn&&exById(wasOwn))exById(wasOwn).keep=false;
 S.sel=index;selectedObject=null;objectNotice='';renderObjectSelection();
 recordEdit(before.name===candidate.name?`Changed ${candidate.name} to ${candidate.variant}.`:`Swapped ${before.name} for ${candidate.name}.`);
 render();
 if(!wasOwn&&typeof previewPicked==='function')previewPicked(it);   // color variants: show the new color / similar product right away
}
async function executeDesignerActions(actions,target){
 let index=selectedSceneIndex(target),changed=false,renderRequested=false;
 for(const action of actions){
  if(action.type==='render'){renderRequested=true;continue;}
  try{
   if(index<0)throw Error('Select the piece to change in the current design.');
   const it=S.scene[index];
   if(action.type==='color'){if(view(it).id!==action.productId)throw Error('The selection changed. Please select it again.');changeSceneProduct(index,it.pid,action.variantId);changed=true;}
   if(action.type==='replace'){changeSceneProduct(index,action.productId,null);changed=true;}
  }catch(e){logTransition(e.message);chatError=e.message;}
 }
 if((changed||renderRequested)&&S.scene?.length){chatBusy=false;await renderScene();}
}
function photoDiagnosisCard(){
 if(!B.annotations?.length||!S.space.data)return '';
 return `<details class="photo-diagnosis"><summary>What the photo shows</summary><div><img src="${esc(S.space.data)}" alt="Observations, not measurements">${B.annotations.map((a,i)=>`<span style="left:${a.x}%;top:${a.y}%">${i+1}</span>`).join('')}</div>${B.annotations.map((a,i)=>`<p>${i+1} · ${esc(a.label)}${a.detail?': '+esc(a.detail):''}</p>`).join('')}<small>Observations aren’t measurements. Walkways and sizes still need checking.</small></details>`;
}
async function loadContext(file){
 if(!file?.type.startsWith('image/'))return;
 if((B.contexts||[]).length>=3){chatError='You can keep up to three reference images. Remove one first.';renderDesigner();return;}
 const data=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(file);});
 const im=new Image();im.src=data;await im.decode();const k=Math.min(1,900/Math.max(im.width,im.height)),c=document.createElement('canvas');c.width=im.width*k;c.height=im.height*k;c.getContext('2d').drawImage(im,0,0,c.width,c.height);
 B.contexts=B.contexts||[];B.contexts.push({id:'context-'+Date.now(),name:file.name,image:c.toDataURL('image/jpeg',.75)});saveBrief();
 chatDraft=`Adding a reference image, "${file.name}". Keep what you see in it separate from my room photo. First ask me which parts I want to borrow, and don’t treat its style as a confirmed preference.`;await sendDesigner();
}
document.addEventListener('click',e=>{
 const a=e.target.closest('[data-action]');if(!a)return;
 if(a.dataset.action==='context-image')document.getElementById('context-file').click();
 if(a.dataset.action==='context-remove'){B.contexts=(B.contexts||[]).filter(x=>x.id!==a.dataset.id);saveBrief();renderDesigner();}
});
document.getElementById('context-file').addEventListener('change',e=>{const f=e.target.files[0];e.target.value='';loadContext(f).catch(()=>{chatError='Couldn’t read that reference image. Please try again.';renderDesigner();});});
// Images can exceed localStorage limits. IndexedDB stores the last render separately.
function renderStore(){return new Promise((resolve,reject)=>{const req=indexedDB.open('elephant-render',1);req.onupgradeneeded=()=>req.result.createObjectStore('images');req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}
async function persistRenderedImage(sig,last){
 if(typeof indexedDB==='undefined')return;
 try{const db=await renderStore();const tx=db.transaction('images','readwrite');tx.objectStore('images').put({sig,last},'latest');tx.oncomplete=()=>db.close();tx.onerror=()=>{db.close();toast('The render wasn’t saved in this browser. Keep the page open.');};}catch{toast('The render wasn’t saved in this browser. Keep the page open.');}
}
async function restoreRenderedImage(){
 if(typeof indexedDB==='undefined')return;
 try{const db=await renderStore(),tx=db.transaction('images'),req=tx.objectStore('images').get('latest');req.onsuccess=()=>{const saved=req.result;if(saved&&S.scene&&saved.last.photoKey===photoKey()&&!(typeof ONLY_SKETCH_NEW!=='undefined'&&ONLY_SKETCH_NEW)){S.last=saved.last;S.renders[saved.sig]=saved.last.image;render();if(typeof prepareVariants==='function')prepareVariants();}};tx.oncomplete=()=>db.close();}catch{}
}
restoreRenderedImage();
