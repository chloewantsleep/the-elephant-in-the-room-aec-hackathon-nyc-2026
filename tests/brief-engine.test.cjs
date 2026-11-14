const test=require('node:test'), assert=require('node:assert/strict');
const E=require('../app/brief-engine.js'), products=require('../data/products.json');
const template=[{cat:'sofa',share:.6,maxW:.9,pos:[50,50]},{cat:'coffee_table',share:.2,maxW:.5,pos:[50,70]}];
const requirement=(effect,category,value,priority='must')=>({id:effect,text:effect,effect,category,value,priority,status:'confirmed'});
test('confirmed constraints change actual SKUs and remove slots, with total cap',()=>{
 const b={requirements:[requirement('max_width','sofa','75'),requirement('exclude_category','coffee_table','true'),requirement('budget','all','1800')]};
 const slots=E.slots(template,b,{living:template});assert.equal(slots.length,1);
 const plan=E.plan(products,slots,b,1800,144);assert.equal(plan.items.length,1);
 const p=products.find(p=>p.id===plan.items[0].pid);assert.ok(p.dims_in.width<=75);assert.ok(p.price.amount<=1800);assert.ok(plan.items[0].reasons.includes('max_width'));
});
test('impossible width or budget leaves explicit gap, never falls back',()=>{
 for(const r of [requirement('max_width','sofa','1'),requirement('budget','all','1')]) {
 const p=E.plan(products,[template[0]],{requirements:[r]},3000,144);assert.deepEqual(p.items,[]);assert.deepEqual(p.gaps,['sofa']);}
});
test('pending and superseded decisions do not constrain',()=>{
 const r=requirement('max_width','sofa','1'); for(const status of ['pending','superseded']) assert.ok(E.assess(products.find(p=>p.category==='sofa'),'sofa',{requirements:[{...r,status}]}).eligible);
});
test('unknown dimensions and required material evidence fail closed',()=>{
 const p={dims_in:{},materials:[]};assert.equal(E.assess(p,'sofa',{requirements:[requirement('max_width','sofa','75')]}).eligible,false);
 assert.equal(E.assess(p,'sofa',{requirements:[requirement('avoid_material','sofa','leather')]}).eligible,false);
});
test('material preference changes ranking rather than claiming performance',()=>{
 const b={requirements:[requirement('prefer_material','sofa','wood','prefer')]};
 assert.ok(E.assess({materials:['wood'],dims_in:{}},'sofa',b).score>E.assess({materials:['steel'],dims_in:{}},'sofa',b).score);
});
test('total budget enforced across quantities',()=>{
 const p=E.plan(products,template,{requirements:[]},300,144);assert.ok(p.items.reduce((n,it)=>n+products.find(p=>p.id===it.pid).price.amount*it.qty,0)<=300);
});
test('correction to width changes the selected SKU',()=>{
 const candidates=[{id:'wide',category:'sofa',price:{amount:100},dims_in:{width:90},materials:[]},{id:'small',category:'sofa',price:{amount:130},dims_in:{width:60},materials:[]}];
 const before=E.plan(candidates,[template[0]],{requirements:[]},200,144);
 const after=E.plan(candidates,[template[0]],{requirements:[requirement('max_width','sofa','75')]},200,144);
 assert.equal(before.items[0].pid,'wide');assert.equal(after.items[0].pid,'small');
});
