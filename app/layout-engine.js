/* Conservative rectangular room draft. All measurements are inches; never infer geometry from pixels. */
(function(root){
 const overlap=(a,b,gap=0)=>a.x<b.x+b.w+gap&&a.x+a.w+gap>b.x&&a.y<b.y+b.d+gap&&a.y+a.d+gap>b.y;
 function plan(items,room,product){
  const W=Number(room.wallIn),D=Number(room.depthIn),c=Number(room.clearanceIn),side=room.corridor;
  if(!room.confirmed||![W,D,c].every(Number.isFinite)||W<=0||D<=0||c<=0||c>=W||!['left','right','center'].includes(side))return {ready:false,placed:[],unplaced:items.map((item,i)=>({i,reason:'空间尺寸和通道尚未确认'})),reserved:[]};
  const reserved=[{x:side==='left'?0:side==='right'?W-c:(W-c)/2,y:0,w:c,d:D,label:'预留通道'},...(room.obstacles||[])];
  if(reserved.slice(1).some(r=>r.x<0||r.y<0||r.w<=0||r.d<=0||r.x+r.w>W||r.y+r.d>D||overlap(r,reserved[0])))return {ready:false,placed:[],unplaced:items.map((item,i)=>({i,reason:'固定区域越界或阻断通道'})),reserved};
  const placed=[],unplaced=[],occupied=[];
  const anchors={sofa:[.58,.12],bed:[.55,.24],coffee_table:[.58,.53],armchair:[.87,.6],desk:[.6,.16],dining_table:[.6,.5],dining_chair:[.65,.7],office_chair:[.65,.4],shelving:[.94,.2],wardrobe:[.9,.15],cabinet:[.88,.2],dresser:[.85,.2],nightstand:[.85,.2],floor_lamp:[.9,.86]};
  const order=items.map((it,i)=>({it,i,p:product(it)})).sort((a,b)=>(['sofa','bed','dining_table','desk'].includes(b.it.cat)?1:0)-(['sofa','bed','dining_table','desk'].includes(a.it.cat)?1:0));
  for(const {it,i,p} of order){
   if(['pendant_lamp','table_lamp','mirror'].includes(it.cat)){unplaced.push({i,reason:'需另确认吊装、台面或墙面位置',accessory:true});continue;}
   const w=Number(p.dims_in?.width),d=Number(p.dims_in?.depth);
   if(!(w>0&&d>0)||p.estimated){unplaced.push({i,reason:'缺少已确认的占地尺寸'});continue;}
   const layer=it.cat==='rug';
   for(let q=0;q<(it.qty||1);q++){
    let best=null;const anchor=anchors[it.cat]||[.6,.65];
    for(const rotated of [false,true]){
     const rw=rotated?d:w,rd=rotated?w:d;if(rw>W||rd>D)continue;
     const xs=new Set([0,W-rw,...Array.from({length:Math.floor((W-rw)/6)+1},(_,n)=>n*6)]),ys=new Set([0,D-rd,...Array.from({length:Math.floor((D-rd)/6)+1},(_,n)=>n*6)]);
     for(const x of xs)for(const y of ys){const r={x,y,w:rw,d:rd};if(reserved.some(b=>overlap(r,b))||(!layer&&occupied.some(b=>overlap(r,b,2))))continue;
      const score=Math.hypot((x+rw/2)/W-anchor[0],(y+rd/2)/D-anchor[1])+(rotated?.05:0);
      if(!best||score<best.score)best={...r,score,rotated,i,q,layer,label:p.family||p.name};
     }
    }
    if(best){placed.push(best);if(!layer)occupied.push(best);}else unplaced.push({i,q,reason:'当前尺寸、固定区域和通道约束下未找到位置'});
   }
  }
  return {ready:true,width:W,depth:D,placed,unplaced,reserved};
 }
 const api={plan,overlap};if(typeof module!=='undefined')module.exports=api;else root.LayoutEngine=api;
})(typeof window!=='undefined'?window:globalThis);
