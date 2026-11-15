const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function app(){
 const el={addEventListener(){},append(){},classList:{toggle(){}},style:{},value:''};
 const c=vm.createContext({console,structuredClone,URLSearchParams,localStorage:{getItem(){return null},setItem(){}},document:{addEventListener(){},querySelector(){return el},getElementById(){return el},body:el},addEventListener(){},setTimeout,clearTimeout,BriefEngine:require('../app/brief-engine.js'),SofaMatcher:require('../app/sofa-matcher.js'),LayoutEngine:require('../app/layout-engine.js')});
 for(const f of ['designer.js','sofa-ui.js','app.js','design-workflow.js'])vm.runInContext(fs.readFileSync('app/'+f,'utf8').split('/* ---------------- boot ---------------- */')[0],c);
 c.products=structuredClone(require('../data/products.json'));c.annotations=require('../data/sofa-annotations.json');c.ontology=require('../schema/sofa-ontology.json');
 vm.runInContext(`P=products;SofaMatcher.configure(ontology,annotations,P);byId=Object.fromEntries(P.map(p=>[p.id,p]));render=()=>{};renderDesigner=()=>{};renderObjectSelection=()=>{};selectedObject=null;objectNotice='';S.needs.budget=10000;S.space.wallIn=500;S.space.confirmed=false;B.requirements=[];`,c);return c;
}
test('real variant changes price/image and survives scene save without invalid SKU lookup',()=>{
 const c=app();vm.runInContext(`const p=P.find(p=>p.category==='sofa'&&p.sofa.eligible&&p.variants.length);S.scene=[{cat:p.category,pid:p.id,vid:null,qty:1,pos:[50,50]}];S.options=[{items:structuredClone(S.scene)}];changeSceneProduct(0,p.id,p.variants[0].id);`,c);
 assert.equal(vm.runInContext('S.scene[0].vid',c),vm.runInContext('p.variants[0].id',c));assert.equal(vm.runInContext('S.options[0].items[0].vid',c),vm.runInContext('p.variants[0].id',c));
 assert.equal(vm.runInContext('view(S.scene[0]).images.main',c),vm.runInContext('p.variants[0].image',c));
});
test('replacement and render payload use the confirmed brief, no invented catalogue IDs',()=>{
 const c=app();vm.runInContext(`const pair=P.filter(p=>p.category==='sofa'&&p.sofa.eligible).slice(0,2);S.scene=[{cat:'sofa',pid:pair[0].id,vid:null,qty:1,pos:[50,50]}];S.options=[{items:structuredClone(S.scene)}];B.requirements=[{id:'habit',effect:'sofa_lifestyle',value:'cross_legged',category:'sofa',status:'confirmed',scope:'room',text:'盘腿阅读',impact:'比较座深'}];changeSceneProduct(0,pair[1].id,null);`,c);
 assert.equal(vm.runInContext('S.scene[0].pid',c),vm.runInContext('pair[1].id',c));assert.match(vm.runInContext('JSON.stringify(renderRequest())',c),/盘腿阅读/);
 assert.throws(()=>vm.runInContext("changeSceneProduct(0,'invented',null)",c));
});
