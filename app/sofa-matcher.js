(function(root){
 let ontology={profiles:{},attributes:{}}, ranges={};
 const value=(p,key)=>p.sofa?.attributes?.[key]?.value;
 function configure(o,annotations,products){
  ontology=o;ranges={};
  for(const p of products.filter(p=>p.category==='sofa')){
   p.sofa=annotations.products[p.id]||{eligible:false,attributes:{},issue:'No verified annotation'};
   for(const key of ['width','depth','height']) p.dims_in[key]=value(p,key) ?? null;
  }
  for(const key of Object.keys(o.attributes)){
   const nums=products.filter(p=>p.category==='sofa'&&p.sofa?.eligible).map(p=>value(p,key)).filter(x=>typeof x==='number');
   if(nums.length)ranges[key]=[Math.min(...nums),Math.max(...nums)];
  }
 }
 function assess(p,brief){
  const evidence=[],unknown=[], goals=(brief.requirements||[]).filter(r=>r.status==='confirmed'&&r.effect==='sofa_lifestyle'&&r.category==='sofa');let score=0;
  for(const r of goals){
   const profile=ontology.profiles[r.value];if(!profile)continue;
   for(const [key,direction,weight] of profile.signals){
    const attr=p.sofa?.attributes?.[key];
    if(attr?.value==null){unknown.push({key,goal:r.text});continue;}
    let contribution;
    if(typeof attr.value==='boolean')contribution=attr.value?weight:-weight;
    else {
     const [lo,hi]=ranges[key]||[attr.value,attr.value];
     const position=hi===lo?.5:(attr.value-lo)/(hi-lo);
     contribution=(direction>0?position:1-position)*weight;
    }
    score+=contribution;
    evidence.push({key,value:attr.value,contribution,alignment:contribution/weight,goal:r.text,reason:profile.meaning,requirement:r.id,source:attr.evidence});
   }
  }
  return {score,evidence,unknown,goals,eligible:!!p.sofa?.eligible};
 }
 function profile(key){return ontology.profiles[key];}
 const api={configure,assess,profile,value};
 if(typeof module!=='undefined')module.exports=api;else root.SofaMatcher=api;
})(typeof window!=='undefined'?window:globalThis);
