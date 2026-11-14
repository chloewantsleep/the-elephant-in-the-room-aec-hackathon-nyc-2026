let sofaExplorerOpen=false, sofaPreviousOrder=[];
const SOFA_LABELS={seat_depth:'Seat depth',seat_width:'Usable seat width',seat_height:'Seat height',arm_width:'Arm width',padded_arms:'Padded arms',washable_cover:'Machine-washable cover',removable_cover:'Removable cover',sleeper:'Bed conversion',bed_length:'Bed length',bed_width:'Bed width'};
function sofaCandidates(){
 const current=S.scene?.find(it=>it.cat==='sofa');
 const otherCost=sceneTotal((S.scene||[]).filter(it=>it.cat!=='sofa'));
 const available=BriefEngine.budget(B,S.needs.budget)-otherCost;
 const slot=current||{cat:'sofa'};
 return P.filter(p=>p.category==='sofa'&&p.sofa?.eligible&&fits(p,slot)&&p.price.amount<=available).map(p=>({p,a:BriefEngine.assess(p,'sofa',B)})).filter(x=>x.a.eligible).sort((a,b)=>b.a.score-a.a.score||a.p.price.amount-b.p.price.amount);
}
function sofaReason(result){
 const goal=result.goals[0];if(!goal)return '';
 const keys={side_lounge:'seat_width',cross_legged:'seat_depth',upright_chat:'seat_depth',frequent_rising:'seat_height',overnight_guests:'sleeper',easy_clean:'washable_cover'};
 const fact=result.evidence.find(e=>e.requirement===goal.id&&e.key===keys[goal.value]);
 if(!fact)return 'The feature that matters to you still needs checking.';
 const reasons={side_lounge:'More seat width for stretching out',cross_legged:'More seat depth for sitting cross-legged',upright_chat:'A shallower seat for sitting upright',frequent_rising:'A higher seat for getting up',overnight_guests:'Converts to a bed for overnight guests',easy_clean:'A machine-washable cover for easier cleaning'};
 if(fact.alignment>=.5)return reasons[goal.value]+(typeof fact.value==='number'?` — ${inch(fact.value)}.`:'.');
 return `${SOFA_LABELS[fact.key]}: ${typeof fact.value==='boolean'?(fact.value?'yes':'no'):inch(fact.value)} — a compromise for this habit.`;
}
function sofaEvidence(p){
 const result=SofaMatcher.assess(p,B),reason=sofaReason(result);
 return `<div class="sofa-evidence">${reason?`<p>${esc(reason)}</p>`:''}<details><summary>Details</summary><p>${dimsText(p)}</p>
 ${result.evidence.map(e=>`<div class="sofa-fact"><b>${esc(SOFA_LABELS[e.key]||e.key)}: ${typeof e.value==='boolean'?(e.value?'Yes':'No'):inch(e.value)}</b><p>${esc(e.goal)}</p><p>${esc(e.source?.quote||'')}</p>${e.source?.url?`<a href="${esc(e.source.url)}" target="_blank" rel="noopener">Source ↗</a>`:''}</div>`).join('')}
 ${result.unknown.length?`<p>Still to check: ${[...new Set(result.unknown.map(e=>SOFA_LABELS[e.key]||e.key))].map(esc).join(', ')}.</p>`:''}
 ${result.goals.map(r=>`<p>${esc(SofaMatcher.profile(r.value)?.caution||'')}</p>`).join('')}<p>Price shown is a catalogue snapshot.</p></details></div>`;
}
function renderSofaExplorer(){
 let host=document.getElementById('sofa-explorer');
 if(!host){host=document.createElement('section');host.id='sofa-explorer';document.body.append(host);}
 host.hidden=!sofaExplorerOpen;if(!sofaExplorerOpen)return;
 const ranked=sofaCandidates();
 host.innerHTML=`<div class="sofa-explorer-head"><h2>How do you use your sofa?</h2><button class="chip" data-action="sofa-close" aria-label="Close sofa shortlist">×</button></div>
 <form id="sofa-habit-form"><input id="sofa-habit" aria-label="How you use your sofa" placeholder="I like to curl up and read…" maxlength="2000" ${chatBusy?'disabled':''}><button class="btn" ${chatBusy?'disabled':''}>Send ↗</button></form>
 <div class="sofa-results">${ranked.slice(0,6).map(({p})=>`<article class="sofa-result"><div class="sofa-product"><img src="${esc(imgOf(p))}" alt="${esc(p.name)}"></div><h3>${esc(p.name)}</h3><p>${money(p.price.amount)}</p>${sofaEvidence(p)}<button class="btn block" data-action="sofa-choose" data-pid="${esc(p.id)}">Choose</button></article>`).join('')||'<p>No match yet. Try adjusting the budget or size.</p>'}</div>`;
}
document.addEventListener('submit',e=>{if(e.target.id!=='sofa-habit-form')return;e.preventDefault();const text=document.getElementById('sofa-habit').value.trim();if(!text||chatBusy)return;chatDraft=text;chatOpen=true;sendDesigner();renderSofaExplorer();});
document.addEventListener('click',e=>{
 const a=e.target.closest('[data-action]');if(!a)return;
 if(a.dataset.action==='sofa-browse'){sofaExplorerOpen=true;renderSofaExplorer();}
 if(a.dataset.action==='sofa-close'){sofaExplorerOpen=false;renderSofaExplorer();}
 if(a.dataset.action==='sofa-choose'){
  const match=sofaCandidates().find(x=>x.p.id===a.dataset.pid);if(!match)return;
  const slot=S.scene?.find(it=>it.cat==='sofa');if(!slot)return toast('Create a design with a sofa first.');
  const previous=view(slot).name;slot.pid=match.p.id;slot.vid=null;S.last=null;
  sofaExplorerOpen=false;render();renderSofaExplorer();recordEdit(`I chose ${match.p.name} instead of ${previous}.`);
 }
});
