const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const M=require('../app/sofa-matcher.js'),E=require('../app/brief-engine.js'),P=require('../data/products.json'),O=require('../schema/sofa-ontology.json'),A=require('../data/sofa-annotations.json');
M.configure(O,A,P);
const brief=goal=>({requirements:[{id:'habit',text:goal,effect:'sofa_lifestyle',category:'sofa',status:'confirmed',priority:'prefer',value:goal}]});
function rank(goal){return P.filter(p=>p.category==='sofa'&&p.sofa.eligible&&p.dims_in.width<=108&&p.price.amount<=2200).sort((a,b)=>E.assess(b,'sofa',brief(goal)).score-E.assess(a,'sofa',brief(goal)).score);}
test('same catalogue responds differently to two living habits',()=>{
 const deep=rank('cross_legged')[0],upright=rank('upright_chat')[0];assert.notEqual(deep.id,upright.id);assert.ok(M.value(deep,'seat_depth')>M.value(upright,'seat_depth'));
 assert.ok(M.assess(deep,brief('cross_legged')).evidence.every(e=>e.source.url===deep.url));
});
test('real product planner uses the lifestyle signal',()=>{
 const slot=[{cat:'sofa',share:1,maxW:.75,pos:[50,50]}];
 const a=E.plan(P,slot,brief('cross_legged'),2200,144),b=E.plan(P,slot,brief('upright_chat'),2200,144);
 assert.notEqual(a.items[0].pid,b.items[0].pid);
});
test('hard width and total budget take precedence over lifestyle',()=>{
 const b=brief('cross_legged');b.requirements.push({id:'width',effect:'max_width',category:'sofa',value:'60',status:'confirmed',priority:'must'});
 const plan=E.plan(P,[{cat:'sofa',share:1,maxW:1,pos:[50,50]}],b,400,144);assert.ok(plan.items.length);
 const p=P.find(p=>p.id===plan.items[0].pid);assert.ok(p.dims_in.width<=60);assert.ok(p.price.amount<=400);
});
test('missing attributes earn no support and are disclosed',()=>{
 const r=M.assess({sofa:{eligible:true,attributes:{}}},brief('cross_legged'));assert.equal(r.score,0);assert.equal(r.evidence.length,0);assert.equal(r.unknown.length,2);
});
test('inactive habits have no effect',()=>{const b=brief('cross_legged');b.requirements[0].status='superseded';assert.equal(M.assess(rank('cross_legged')[0],b).score,0);});
test('non-removable cover is not parsed as removable',()=>{assert.equal(A.products['ikea:40595942'].attributes.removable_cover.value,false);});
test('untrusted product data cannot enter a plan',()=>{const p=P.find(p=>p.id==='ikea:80618531');assert.equal(E.assess(p,'sofa',brief('upright_chat')).eligible,false);});
test('documented attributes trace to captured manufacturer evidence',()=>{
 for(const p of Object.values(A.products))for(const [key,a] of Object.entries(p.attributes)){
  if(a.status!=='documented')continue;
  const src=JSON.parse(fs.readFileSync(require('node:path').join(__dirname,'..',a.evidence.artifact)));
  assert.equal(src.sku,p.sku);assert.equal(src.url,p.source_url);
  if(typeof a.value==='number')assert.ok(src.measurements.some(m=>a.evidence.quote===m.name+': '+m.measure));
  else {
   const texts=[], collect=x=>{if(typeof x==='string')texts.push(x);else if(Array.isArray(x))x.forEach(collect);else if(x&&typeof x==='object')Object.values(x).forEach(collect);};collect(src.details);
   const materials=src.details.accordionObject?.materialsAndCare?.contentProps?.materials||[];
   const armQuotes=materials.flatMap(g=>g.materials||[]).map(m=>m.part+' '+m.material);
   assert.ok(texts.includes(a.evidence.quote)||key==='padded_arms'&&armQuotes.includes(a.evidence.quote),p.sku+' '+key);
  }
 }
});
