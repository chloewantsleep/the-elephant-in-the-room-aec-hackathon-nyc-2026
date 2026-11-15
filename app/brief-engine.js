/* Shared, deterministic decision layer. Never silently relax a requirement. */
(function(root) {
  const sofa = typeof module !== 'undefined' ? require('./sofa-matcher.js') : root.SofaMatcher;
  const active = brief => (brief.requirements || []).filter(r => r.status === 'confirmed');
  const applies = (r, category) => r.category === 'all' || r.category === category;
  function assess(product, category, brief) {
    const reasons = [], blocked = [], unknown = []; let score = 0;
    const materials = (product.materials || []).join(' ').toLowerCase();
    for (const r of active(brief).filter(r => applies(r, category) && (r.scope!=='candidate'||r.productId===product.id))) {
      const n = Number(r.value); let match = null;
      if (r.effect === 'max_width') match = Number.isFinite(product.dims_in?.width) ? product.dims_in.width <= n : null;
      if (r.effect === 'max_depth') match = Number.isFinite(product.dims_in?.depth) ? product.dims_in.depth <= n : null;
      if (r.effect === 'avoid_material') match = materials ? !materials.includes(r.value.toLowerCase()) : null;
      if (r.effect === 'prefer_material') match = materials ? materials.includes(r.value.toLowerCase()) : null;
      if (r.effect === 'prefer_compact') { score -= (product.dims_in?.width || 100) / 100; reasons.push(r.id); continue; }
      if (['design_note', 'require_category'].includes(r.effect)) continue;
      if (r.effect === 'exclude_category') match = false;
      if (r.effect === 'budget' || ['room_width','room_depth','room_type','sofa_lifestyle'].includes(r.effect)) continue;
      if (match === null) { unknown.push(r.id); if (r.priority === 'must' && r.effect !== 'design_note') blocked.push(r.id); }
      else if (match) { score += r.priority === 'must' ? 3 : 2; reasons.push(r.id); }
      else if (r.priority === 'must') blocked.push(r.id);
      else score -= 2;
    }
    const lifestyle = category === 'sofa' && product.sofa ? sofa.assess(product,brief) : null;
    if(lifestyle){score+=lifestyle.score;if(!lifestyle.eligible)blocked.push('unverified-sofa');}
    return { eligible: !blocked.length, score, reasons, blocked, unknown, lifestyle };
  }
  function budget(brief, fallback) {
    const r = active(brief).filter(r => r.effect === 'budget'&&r.scope!=='candidate').at(-1);
    return r ? Number(r.value) : fallback;
  }
  function slots(template, brief, templates) {
    let result = template.filter(s => !active(brief).some(r => r.scope!=='candidate' && r.effect === 'exclude_category' && r.category === s.cat));
    for (const r of active(brief).filter(r => r.effect === 'require_category'&&r.scope!=='candidate')) {
      if (!result.some(s => s.cat === r.category)) {
        const slot = Object.values(templates).flat().find(s => s.cat === r.category);
        if (slot) result.push({...slot});
      }
    }
    return result;
  }
  function plan(products, template, brief, cap, wall, strategy = .8) {
    const items = [], gaps = []; let remaining = budget(brief, cap);
    for (const slot of template) {
      const candidates = products.filter(p => p.category === slot.cat).map(p => ({p, a:assess(p, slot.cat, brief)}))
        .filter(({p,a}) => a.eligible && Number.isFinite(p.dims_in?.width) && p.dims_in.width <= slot.maxW * wall && p.price.amount * (slot.qty || 1) <= remaining);
      const target = Math.min(remaining, cap * slot.share * strategy) / (slot.qty || 1);
      candidates.sort((a,b) => b.a.score-a.a.score || Math.abs(a.p.price.amount-target)-Math.abs(b.p.price.amount-target));
      const pick = candidates[0];
      if (!pick) { gaps.push(slot.cat); continue; }
      items.push({cat:slot.cat, pid:pick.p.id, vid:null, qty:slot.qty || 1, pos:slot.pos.slice(), reasons:pick.a.reasons});
      remaining -= pick.p.price.amount * (slot.qty || 1);
    }
    return {items,gaps};
  }
  const api = {active,assess,budget,slots,plan};
  if (typeof module !== 'undefined') module.exports = api; else root.BriefEngine = api;
})(typeof window !== 'undefined' ? window : globalThis);
