const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function app(){
 const element={addEventListener(){},append(){},classList:{toggle(){}},style:{},value:''};
 const c=vm.createContext({console,structuredClone,URLSearchParams,localStorage:{getItem(){return null},setItem(){}},document:{addEventListener(){},querySelector(){return element},getElementById(){return element},body:element},addEventListener(){},setTimeout,clearTimeout,BriefEngine:require('../app/brief-engine.js'),SofaMatcher:require('../app/sofa-matcher.js'),LayoutEngine:require('../app/layout-engine.js')});
 for(const file of ['designer.js','sofa-ui.js','app.js'])vm.runInContext(fs.readFileSync('app/'+file,'utf8').split('/* ---------------- boot ---------------- */')[0],c);
 c.products=structuredClone(require('../data/products.json'));c.annotations=require('../data/sofa-annotations.json');c.ontology=require('../schema/sofa-ontology.json');
 vm.runInContext('P=products; SofaMatcher.configure(ontology,annotations,P); byId=Object.fromEntries(P.map(p=>[p.id,p])); render=()=>{}; renderDesigner=()=>{}; renderSofaExplorer=()=>{};',c);return c;
}
test('merged planner keeps owned furniture while ranking new sofas from the brief',()=>{
 const c=app();vm.runInContext(`S.existing={photoKey:photoKey(),items:[{id:'table',category:'coffee_table',label:'My table',keep:true,status:'done',box:[100,100,300,300]}]}; B.requirements=[{id:'habit',status:'confirmed',category:'sofa',effect:'sofa_lifestyle',priority:'prefer',value:'cross_legged'}];`,c);
 const a=vm.runInContext('planOptions()[0].items',c);assert.equal(a.filter(i=>i.cat==='coffee_table').length,1);assert.equal(a.find(i=>i.cat==='coffee_table').own,'table');
 vm.runInContext(`B.requirements[0].value='upright_chat'`,c);const b=vm.runInContext('planOptions()[0].items',c);assert.notEqual(a.find(i=>i.cat==='sofa').pid,b.find(i=>i.cat==='sofa').pid);assert.equal(b.find(i=>i.cat==='coffee_table').own,'table');
});
test('floating conversation remains available throughout the main workflow',()=>{
 const c=app();vm.runInContext(`S.space.photo='upload';B.requirements=[{status:'confirmed'}];`,c);
 for(const step of [0,1,2,3]){vm.runInContext('S.step='+step,c);const html=vm.runInContext('designerCard()',c);assert.match(html,/告诉设计师/);assert.match(html,/收起聊天/);assert.doesNotMatch(html,/data-mode=|chat-menu|开始新的空间|layout-open|看看摆放草案/);assert.doesNotMatch(html,/data-step=/);}
 assert.equal(vm.runInContext('designReady()',c),false);
});
test('brief correction preserves an explicitly kept sofa',()=>{
 const c=app();vm.runInContext(`S.existing={photoKey:photoKey(),items:[{id:'sofa',category:'sofa',label:'My sofa',keep:true,status:'done',box:[100,100,300,300]}]};S.space={...S.space,photo:'upload',data:'data:image/jpeg;base64,test',confirmed:true,wallIn:180,depthIn:180,corridor:'left',clearanceIn:30};S.existing.photoKey=photoKey();B.setupApproved=true;B.requirements=[{id:'budget',status:'confirmed',effect:'budget',category:'all',value:'3000'}];S.options=planOptions();S.scene=structuredClone(S.options[0].items);B.proposals=[{id:'new',scope:'room',category:'sofa',effect:'sofa_lifestyle',value:'upright_chat',priority:'prefer',supersedes:''}];applyBrief();`,c);
 assert.equal(vm.runInContext("S.scene.find(i=>i.cat==='sofa').own",c),'sofa');
});
