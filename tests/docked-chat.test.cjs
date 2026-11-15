const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function dock(){
 const element={addEventListener(){}};
 const c=vm.createContext({console,Date,chatOpen:true,chatBusy:false,chatDraft:'',chatError:'',importOpen:false,chatMode:'conversation',B:{history:[],events:[],proposals:[]},S:{space:{photo:'upload'},scene:[{cat:'sofa',pid:'sofa-1'}],sel:null},workStatus:()=> '正在整理需求',applyBrief(){},sendDesigner:async()=>{},recordEdit(){},generate(){},saveBrief(){},esc:s=>String(s).replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;'),view:it=>({id:it.pid,family:'A sofa'}),imgOf:()=>'/sofa.jpg',room:element,document:element,addEventListener(){}});
 vm.runInContext(fs.readFileSync('app/docked-chat.js','utf8'),c);return c;
}
test('idle dock shows original input primitive, no full conversation or stale steps',()=>{
 const c=dock();c.B.history=[{role:'assistant',text:'old reply'}];c.B.events=[{text:'old activity',time:0}];
 assert.equal(vm.runInContext('dockProgress()',c),'');
 const html=vm.runInContext('dockForm()',c);
 assert.match(html,/class="chat-input"/);assert.match(html,/<input id="designer-message"/);assert.match(html,/aria-label="语音输入"/);
 assert.doesNotMatch(html,/<textarea|dock-expand|dock-collapse/);
});
test('catalogue selection becomes the same object context used by the capsule',()=>{
 const c=dock();c.S.sel=0;
 assert.equal(vm.runInContext('composerObject().productId',c),'sofa-1');assert.match(vm.runInContext('objectCapsule()',c),/A sofa/);
 vm.runInContext(`selectedObject={label:'照片里的椅子',category:'chair',box:[1,2,3,4]}`,c);
 assert.equal(vm.runInContext('composerObject().label',c),'照片里的椅子');assert.match(vm.runInContext('objectCapsule()',c),/照片里的椅子/);
 vm.runInContext('selectedObject=null;S.sel=null',c);assert.equal(vm.runInContext('objectCapsule()',c),'');
});
test('brief request includes selected product identity and source, without fake box',async()=>{
 const c=dock();
 // Exercise the actual request builder, not a parallel fixture implementation.
 const designer=fs.readFileSync('app/designer.js','utf8');
 const start=designer.indexOf('async function sendDesigner('),end=designer.indexOf('\nfunction applyBrief()',start);
 vm.runInContext(designer.slice(start,end),c);
 let body;c.fetch=async(url,opts)=>{body=JSON.parse(opts.body);return {ok:true,json:async()=>({reply:'收到',proposals:[]})};};
 c.AbortSignal=AbortSignal;c.passcode={get:()=>''};c.refreshDesigner=()=>{};c.S.needs={room:'living'};c.S.sel=0;c.S.space.data='photo';c.chatDraft='想靠着扶手读书';c.B.revision=0;c.B.requirements=[];
 await vm.runInContext('sendDesigner()',c);
 assert.equal(body.region.productId,'sofa-1');assert.equal(body.messages[0].object.productId,'sofa-1');assert.equal(body.region.box,undefined);assert.equal(body.messages[0].text,'想靠着扶手读书');
});
