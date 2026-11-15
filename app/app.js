/* The Elephant in the Room — UI MVP
 *
 * Shows the whole pipeline on one photo:
 *   ① Needs → ② Space → ⑤ Design (3 options) → Edit (click / swap) → Shop (render + list)
 *
 * What is REAL: every product, price, dimension, image and colorway comes from data/products.json.
 * What is REAL: the render — server.py sends room photo + product photos to Gemini (/api/render).
 * What is MOCKED (swap in later):
 *   - planOptions(): rule-based picker standing in for the LLM layout agent  (track B1 / P2)
 *   - room analysis: user types one wall length instead of vision + depth    (track B1 / P2)
 *   - pin positions: defaults per slot; drag to line up with the render
 */

const STEPS = ["Needs", "Design", "Edit", "Shop"];   // needs = your room photo + a short chat
const NEEDS = 0, DESIGN = 1, EDIT = 2, SHOP = 3;

const ROOMS = {
  living: "Living room", bedroom: "Bedroom", dining: "Dining", office: "Office",
};
const STYLES = ["Warm minimal", "Japandi", "Scandinavian", "Mid-century", "Industrial", "Cozy eclectic"];

const CAT_LABEL = {
  sofa: "Sofa", armchair: "Armchair", bed: "Bed", dining_table: "Dining table", coffee_table: "Coffee table",
  side_table: "Side table", desk: "Desk", office_chair: "Office chair", dining_chair: "Dining chair",
  stool_bench: "Bench", dresser: "Dresser", nightstand: "Nightstand", wardrobe: "Wardrobe", shelving: "Shelving",
  tv_stand: "TV stand", cabinet: "Sideboard", floor_lamp: "Floor lamp", table_lamp: "Table lamp",
  pendant_lamp: "Pendant lamp", rug: "Rug", mirror: "Mirror",
  base_cabinet: "Base cabinets", other: "Other",
};

// Slots per room type. share = share of budget, maxW = max width as a fraction of the wall,
// pos = default pin position on the photo (% of image). Pins can be dragged to match any photo.
const TEMPLATES = {
  living: [
    { cat: "sofa", share: .36, maxW: .75, pos: [52, 62] },
    { cat: "coffee_table", share: .10, maxW: .40, pos: [28, 76] },
    { cat: "armchair", share: .14, maxW: .35, pos: [14, 62] },
    { cat: "rug", share: .12, maxW: .80, pos: [40, 92] },
    { cat: "floor_lamp", share: .06, maxW: .20, pos: [88, 45] },
    { cat: "pendant_lamp", share: .06, maxW: .30, pos: [45, 16] },
    { cat: "shelving", share: .08, maxW: .40, pos: [8, 40] },
  ],
  bedroom: [
    { cat: "bed", share: .40, maxW: .60, pos: [50, 60] },
    { cat: "nightstand", share: .10, maxW: .20, pos: [18, 62], qty: 2 },
    { cat: "dresser", share: .16, maxW: .40, pos: [86, 55] },
    { cat: "rug", share: .10, maxW: .80, pos: [50, 88] },
    { cat: "table_lamp", share: .05, maxW: .15, pos: [20, 44] },
    { cat: "mirror", share: .06, maxW: .30, pos: [78, 28] },
    { cat: "wardrobe", share: .13, maxW: .40, pos: [8, 38] },
  ],
  dining: [
    { cat: "dining_table", share: .34, maxW: .55, pos: [50, 60] },
    { cat: "dining_chair", share: .26, maxW: .20, pos: [35, 78], qty: 4 },
    { cat: "cabinet", share: .20, maxW: .45, pos: [70, 45] },
    { cat: "pendant_lamp", share: .08, maxW: .30, pos: [50, 30] },
    { cat: "rug", share: .10, maxW: .80, pos: [62, 94] },
  ],
  office: [
    { cat: "desk", share: .34, maxW: .55, pos: [50, 62] },
    { cat: "office_chair", share: .26, maxW: .25, pos: [40, 78] },
    { cat: "shelving", share: .16, maxW: .40, pos: [84, 38] },
    { cat: "table_lamp", share: .06, maxW: .15, pos: [30, 46] },
    { cat: "rug", share: .10, maxW: .80, pos: [62, 90] },
  ],
};

// Example rooms: photos taken at the AEC Hackathon NYC venue. Each has a matching demo render (no AI spend).
const EXAMPLES = [
  { name: "Lounge", src: "assets/example-lounge-wide.jpg", room: "living", render: "assets/demo-render-lounge-wide.jpg",
    furniture: "assets/examples/lounge.json" },
  { name: "Bar counter", src: "assets/example-bar.jpg", room: "dining", render: "assets/demo-render-bar.jpg",
    furniture: "assets/examples/bar.json" },
];
const example = () => EXAMPLES[S.space.ex] || EXAMPLES[0];

const STRATEGIES = [
  { key: "essentials", name: "Essentials", target: 0.45 },
  { key: "balanced", name: "Balanced", target: 0.85 },
  { key: "statement", name: "Statement", target: 1.2 },
];

const S = {
  step: 0,
  removedCategories: [],
  needs: { room: "living", style: "Warm minimal", budget: 3000, notes: "", mode: "non-pro" },
  space: { wallIn: 144, depthIn: 132, photo: "demo", ex: 0 },   // photo: "demo" = one of EXAMPLES, "upload" = yours
  dirty: true,         // needs/space changed since the last plan
  generating: false,
  stage: 0,
  options: [],
  opt: 0,
  scene: null,         // the source of truth: [{cat, qty, pid, vid, pos}]
  sel: null,
  renders: {},         // scene signature -> rendered image (data URL); avoids paying twice
  rendering: false,
  last: null,          // latest render + the scene it shows (for edit-mode updates)
  live: true,          // true = real AI renders (repeat requests come from the server cache for free); false = demo renders
  cart: "closed",      // closed | open (left drawer) | expanded (big grid)
  cartFilter: "all",
  cartCat: "all",      // category dropdown in the expanded view
  cartQ: "",           // search text in the expanded view
  cartMenu: false,
  cartView: "list",     // list | room within the expanded shopping list
  shopSelected: null,
  preview: null,       // index of the piece open in the product preview
  previewAlt: null,    // product id of a similar item being looked at inside the preview
  sizeOpen: false,
  needsMin: true,      // the Needs window folded into an elephant bubble     // room size inputs are optional and folded away
  chat: null,          // needs conversation {q: current question, log: [{from, text}]}
  existing: null,      // furniture found in the user's photo: {photoKey, status, items:[{id,label,category,box,iso,keep,…}]}
  before: false,       // show the original photo instead of the render
};

S.needs.budget=BriefEngine.budget(B,S.needs.budget);
let P = [], byId = {};
const $ = (s, el = document) => el.querySelector(s);
const room = $("#room");

/* ---------------- helpers ---------------- */
const money = n => "$" + Math.round(n).toLocaleString("en-US");
const FR = ["", "⅛", "¼", "⅜", "½", "⅝", "¾", "⅞"];
function inch(v) {
  if (v == null) return "–";
  const e = Math.round(v * 8), w = Math.floor(e / 8), f = e % 8;
  return (w ? w : "") + (f ? (w ? " " : "") + FR[f] : "") + "″";
}
function dimsText(p) {
  const d = p.dims_in;
  return (p.estimated ? "≈ " : "") + [["W", d.width], ["D", d.depth], ["H", d.height]].filter(x => x[1] != null).map(x => `${x[0]} ${inch(x[1])}`).join(" · ");
}
const imgOf = p => p.images.main_local ? "../" + p.images.main_local : p.images.main;
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// A piece the user already owns (found in their photo), shaped like a product record.
const exById = id => S.existing?.items.find(e => e.id === id);
const cap = t => t ? t[0].toUpperCase() + t.slice(1) : t;
function ownedProduct(e) {
  const d = e.dims_in || {};
  return { id: "own:" + e.id, name: cap(e.label), family: cap(e.label), variant: "Already yours", brand: "Yours",
           category: e.category, price: { amount: 0, currency: "USD" }, owned: true, estimated: true,
           dims_in: { width: d.width ?? null, depth: d.depth ?? null, height: d.height ?? null },
           materials: [], variants: [], images: { main: e.iso || e.crop, main_local: null }, url: null,
           description: e.description };
}

// Product as displayed: the base record, optionally with a colorway applied.
function view(item) {
  if (item.extra) return item.extra;   // furniture the render shows that isn't in the list (Shop room view)
  if (item.own) {
    const e = exById(item.own);
    return e ? ownedProduct(e) : ownedProduct({ id: item.own, label: "your piece", category: item.cat });
  }
  const p = byId[item.pid];
  if (!item.vid) return p;
  const v = p.variants.find(x => x.id === item.vid);
  if (!v) return p;
  return { ...p, id: v.id, variant: v.variant, price: { amount: v.price ?? p.price.amount, currency: "USD" },
           images: { ...p.images, main_local: null, main: v.image || p.images.main }, url: v.url || p.url,
           sofa: p.sofa ? {...p.sofa, attributes:{...p.sofa.attributes, washable_cover:{value:null,status:"unknown"},removable_cover:{value:null,status:"unknown"}}} : undefined,
           description: `${p.name} in ${v.variant}` };
}
const slotOf = item => item.maxW ? item : TEMPLATES[S.needs.room].find(t => t.cat === item.cat) || { maxW: 1 };
const maxWidthFor = item => Math.min(slotOf(item).maxW * S.space.wallIn, ...BriefEngine.active(B).filter(r=>r.effect==='max_width' && (r.scope!=='candidate'||r.productId===item.pid||r.productId===item.vid) && r.priority==='must' && (r.category==='all'||r.category===item.cat)).map(r=>Number(r.value)));
// no width: fine for most pieces, but a sofa without a verified width is unverified (sofa-matcher.js)
const fits = (p, item) => p.dims_in.width == null ? p.category !== "sofa" : p.dims_in.width <= maxWidthFor(item);
function layoutAllows(items){if(!S.space.confirmed)return true;const l=LayoutEngine.plan(items,S.space,view);return l.ready&&!l.unplaced.some(r=>!r.accessory&&!items[r.i].own);}
function eligibleSwap(p,it) {
 if(!p)return false;
 const base=byId[p.id]||P.find(q=>q.variants.some(v=>v.id===p.id));if(!base)return false;
 const trial=S.scene.map(item=>item===it?{...item,pid:base.id,vid:base.id===p.id?null:p.id,own:null}:item);
 return BriefEngine.assess(p,it.cat,B).eligible&&sceneTotal(trial)<=BriefEngine.budget(B,S.needs.budget)&&layoutAllows(trial);
}
const sceneTotal = items => items.reduce((s, it) => s + view(it).price.amount * (it.qty || 1), 0);

function toast(msg) {
  const t = $("#toast");
  t.textContent = msg; t.hidden = false;
  clearTimeout(toast._t); toast._t = setTimeout(() => (t.hidden = true), Math.max(2200, Math.min(7000, msg.length * 45)));
}

/* ---------------- image <-> screen mapping: the photo always spans the window edge to edge ----------------
   wider window -> cover (trims top/bottom, mostly ceiling: anchored 70% down); taller window -> contain (blur above/below) */
const FIT_Y = 0.7;
function geom() {
  const W = innerWidth, H = innerHeight, nw = room.naturalWidth || 1, nh = room.naturalHeight || 1;
  const sc = W / nw, dw = W, dh = nh * sc, ay = dh > H ? FIT_Y : 0.5;
  const fit = dh > H ? "cover" : "contain", pos = `50% ${ay * 100}%`;
  if (room.style.objectFit !== fit) room.style.objectFit = fit;          // keep the <img> in step with this math
  if (room.style.objectPosition !== pos) room.style.objectPosition = pos;
  return { dw, dh, ox: 0, oy: (H - dh) * ay, W, H };
}
function toScreen([px, py]) {
  const g = geom();
  const small = innerWidth < 820;
  const fy = small ? 16 : innerHeight * 0.06, fx = small ? 16 : innerWidth * 0.05;
  // keep pins inside the frame so labels never fall off-screen or under the top bar / bottom pills
  const bottomGap = S.step === DESIGN && !small ? 330 : 110;
  const x = Math.min(Math.max(g.ox + px / 100 * g.dw, fx + 80), g.W - fx - 80);
  const y = Math.min(Math.max(g.oy + py / 100 * g.dh, fy + 230), g.H - fy - bottomGap);
  return [x, y];
}
function toImage(x, y) {
  const g = geom();
  return [((x - g.ox) / g.dw) * 100, ((y - g.oy) / g.dh) * 100];
}

/* ---------------- Brief-driven catalogue planner ---------------- */
const keptPieces = () => S.existing?.photoKey === photoKey() ? S.existing.items.filter(e => e.keep && e.status !== "error") : [];
const boxCenter = b => [(b[1] + b[3]) / 20, (b[0] + b[2]) / 20];   // box 0-1000 -> image %
const ownedItem = e => ({ cat: CAT_LABEL[e.category] && e.category !== "other" ? e.category : "other", qty: e.count || 1,
                          own: e.id, pid: null, vid: null, pos: boxCenter(e.box) });

// Pieces the user sketched on this photo (sketch.js): [{category, widthIn, pos}]
const sketched = () => S.sketch?.photoKey === photoKey() ? S.sketch.items : [];

// What to design: the room template plus the sketched pieces. A sketched piece is always added (drawn over something
// that's already there, it replaces that piece instead: sketchCovers).
// Each sketched piece goes at the spot and about the size it was drawn. Budget share per piece comes from the
// templates (a sofa gets more than a lamp), scaled down if the extra pieces push the total over the budget.
const SHARE = Object.fromEntries(Object.values(TEMPLATES).flat().reverse().map(s => [s.cat, s.share]));
function slotsWithSketch(tpl = TEMPLATES[S.needs.room]) {
  const sk = sketched(), wall = S.space.wallIn;
  if (!sk.length) return tpl;
  const slots = tpl.map(s => ({ ...s }));
  sk.forEach((s, n) => {
    const mine = RUN_CATS.has(s.category)   // a run (base cabinets): priced by its length, not by a budget share
      ? { cat: s.category, share: 0, pos: s.pos.slice(), sketched: true, sk: n, lengthIn: s.widthIn || 96, ends: s.ends }
      : { cat: s.category, share: SHARE[s.category] ?? 0.1, pos: s.pos.slice(), sketched: true, sk: n,
          maxW: Math.min(1, (s.widthIn || wall * 0.3) * 1.25 / wall) };   // allow a bit bigger than drawn
    slots.push(mine);   // a sketch only ADDS a piece; it replaces something only when drawn over it (sketchCovers)
  });
  const total = slots.reduce((a, s) => a + s.share, 0);
  return total > 1 ? slots.map(s => ({ ...s, share: s.share / total })) : slots;
}

// TEST SET (sample room + test images only): option 1 is this hand-picked living room instead of the mock planner.
// Placement is described in words for the render AI (no fixed coordinates); labels follow where it really puts them.
// Pieces already in the photo of these categories are replaced; other pieces in the photo are kept.
// LOCKED for the demo: the products and their 4 similar products (all already rendered on the demo picture)
const TEST_SET = [
  { cat: "coffee_table", pid: "ikea:20586552", place: "in the foreground, in the middle of the seating area",
    similar: ["ikea:10489311", "ikea:70497582", "ikea:20487873", "ikea:60627980"] },           // TONSTAD, FRÖTORP, IDANÄS, UGGLERUM
  { cat: "sofa",         pid: "ikea:s09514830", place: "a large sofa on one side of the coffee table, facing it",
    similar: ["ikea:00586096", "ikea:s39634845", "ikea:20245049", "ikea:s59580059"] },         // STOCKHOLM 2025, VIMLE, STOCKHOLM, SÖDERHAMN
  { cat: "armchair",     pid: "ikea:s49502038", place: "a small chair on the other side of the coffee table, facing the sofa",
    similar: ["ikea:s59578565", "ikea:s59318327", "ikea:40525925", "ikea:30533493"] },         // SALTSJÖBADEN, MORABO, PERSBOL, EKENÄSET
  { cat: "rug",          pid: "ikea:80635451", place: "on the floor under the coffee table, the sofa and the chair",
    similar: ["ikea:90625705", "ikea:20595698", "ikea:00602001", "ikea:90607688"] },           // MARKBLÅMME, JÄRNVÄG, GREJSIMOJS, STOENSE
  { cat: "pendant_lamp", pid: "ikea:70315030", place: "hanging from the ceiling above the seating area",
    similar: ["ikea:50513738", "ikea:20585996", "ikea:90637633", "ikea:10601586"] },           // NÖSUND, STOCKHOLM 2025, VINTERFINT, TRUBBRUFSE
];
// DEMO SKETCH: any shape drawn on the sample room is this lamp, at one fixed spot (where or how it was drawn doesn't
// matter), so every demo run sends the same request (instant + free after the first time). Off with #newrenders=1.
const DEMO_LAMP = { pid: "ikea:50513738", similar: ["ikea:70315030", "ikea:20585996"],   // NÖSUND; SINNERLIG, STOCKHOLM 2025
                    strokes: [[[25, 12], [37, 12], [37, 24], [25, 24], [25, 12]]] };   // hanging (on its cord) between the column and the pendant
function demoSketch(m) {   // called by sketch.js for each shape when the user presses Done
  if (!demoRoom()) return;
  m.cat = "pendant_lamp"; m.strokes = structuredClone(DEMO_LAMP.strokes); m.widthIn = null; m.demoLamp = true;
}
const isDemoLamp = it => it.sketched && it.cat === "pendant_lamp" && demoRoom();

// the locked slot this piece belongs to (the test piece itself, or one of its similar products swapped in)
const lockedSlot = it => S.space.photo === "demo" && !it.own && !it.sketched
  && TEST_SET.find(t => t.cat === it.cat && (t.pid === it.pid || t.similar.includes(it.pid))) || null;
// colors shown for a piece: a similar product swapped in has only its first (default) color prepared
const colorLimit = it => { const t = lockedSlot(it); return t && t.pid !== it.pid ? 1 : VARIANT_MAX; };
// Demo room: options 2 and 3 are the test set with prepared colors / similar products, so all three show instantly
const DEMO_OPTIONS = [
  null,   // option 1: the test set as recommended
  { name: "Balanced", set: { sofa: { vid: "ikea:s39514819" }, armchair: { vid: "ikea:s49627175" } } },   // sofa Gransel gray, chair Kelinge dark yellow
  { name: "Statement", set: { sofa: { pid: "ikea:20245049" }, armchair: { pid: "ikea:s59318327" }, coffee_table: { pid: "ikea:70497582" } } },   // STOCKHOLM sofa, MORABO chair, FRÖTORP table
];
function demoOption(k) {
  const o = DEMO_OPTIONS[k], items = testScene();
  if (o) items.forEach(it => { const c = o.set[it.cat]; if (c) { it.pid = c.pid || it.pid; it.vid = c.pid ? null : c.vid || null; } });
  return items;
}
function testScene() {
  const cats = new Set(TEST_SET.map(t => t.cat));
  return [...keptPieces().filter(e => !cats.has(e.category)).map(ownedItem),
          ...TEST_SET.filter(t => byId[t.pid]).map(t => ({ cat: t.cat, qty: 1, pid: t.pid, vid: null, pos: [50, 50], place: t.place,
            ...(demoRoom() && DEMO_AT[t.cat] ? { at: DEMO_AT[t.cat].slice() } : {}) }))];
}
// label spots on the sample lounge before the render is checked: where its saved tracking finds each piece (same values
// prepareVariants sets later), so the labels don't all start in the middle of the picture
const DEMO_AT = { coffee_table: [67.9, 72], sofa: [53.3, 65.2], armchair: [87.8, 76.8], rug: [66.5, 83.8], pendant_lamp: [68.3, 25.8] };

/* ---------------- cabinet runs: a drawn line -> real modules that fill its length ----------------
 * Base cabinets are sold in modules (12", 15", ... 36" wide). A run of a given length is filled with the fewest
 * modules of one product line that reach it; up to a few inches are left for a filler strip, as a fitter would. */
const RUN_CATS = new Set(["base_cabinet"]);
const RUN_GAP = 3;   // inches a filler strip can close
// product lines that sell the category, cheapest per inch first: [{family, mods: [{p, w}]}]
function runLines(cat = "base_cabinet") {
  const fam = {};
  for (const p of P) if (p.category === cat && p.dims_in.width) (fam[p.family] = fam[p.family] || []).push({ p, w: Math.round(p.dims_in.width) });
  const perIn = mods => mods.reduce((a, m) => a + m.p.price.amount / m.w, 0) / mods.length;
  return Object.entries(fam).map(([family, mods]) => ({ family, mods: mods.sort((a, b) => b.w - a.w) }))
    .sort((a, b) => perIn(a.mods) - perIn(b.mods));
}
function fillRun(lengthIn, mods) {
  const L = Math.max(0, Math.round(lengthIn)), best = new Array(L + 1).fill(Infinity), from = [];
  best[0] = 0;
  for (let l = 1; l <= L; l++) mods.forEach((m, k) => {
    if (m.w <= l && best[l - m.w] + 1 < best[l]) { best[l] = best[l - m.w] + 1; from[l] = k; }
  });
  let l = L; while (l > 0 && best[l] === Infinity) l--;
  const pieces = [];
  for (let x = l; x > 0; x -= mods[from[x]].w) pieces.push(mods[from[x]]);
  pieces.sort((a, b) => b.w - a.w);   // wide ones first, so equal widths sit side by side
  return { pieces, filled: l, gap: L - l, total: pieces.reduce((a, m) => a + m.p.price.amount, 0) };
}
// what a run of this length costs in each line (shown on the sketch chip)
const runQuote = (lengthIn, cat = "base_cabinet") => runLines(cat).map(line => ({ family: line.family, ...fillRun(lengthIn, line.mods) }))
  .filter(q => q.pieces.length);
// scene items for a sketched run: one item per module width (qty = how many), placed along the drawn line
function runItems(slot, rank) {
  // the lines ranked by what THIS run costs in each: Essentials gets the cheapest, Statement the priciest
  const quotes = runLines(slot.cat).map(line => ({ line, run: fillRun(slot.lengthIn, line.mods) }))
    .filter(q => q.run.pieces.length).sort((a, b) => a.run.total - b.run.total);
  if (!quotes.length) return [];
  const { line, run } = quotes[Math.min(quotes.length - 1, Math.round(rank * (quotes.length - 1)))];
  const [a, b] = slot.ends || [[slot.pos[0] - 10, slot.pos[1]], [slot.pos[0] + 10, slot.pos[1]]];
  const at = t => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  const groups = [];
  for (const m of run.pieces) {
    const g = groups[groups.length - 1];
    if (g && g.m.p.id === m.p.id) g.n++; else groups.push({ m, n: 1 });
  }
  const modules = run.pieces.map(m => m.w + '"').join(" + ");
  let start = 0;
  return groups.map(({ m, n }) => {
    const mid = (start + m.w * n / 2) / (run.filled || 1); start += m.w * n;
    return { cat: slot.cat, qty: n, pid: m.p.id, vid: null, pos: at(mid), sketched: true, sk: slot.sk,
             run: { family: line.family, lengthIn: Math.round(slot.lengthIn), filled: run.filled, modules } };
  });
}

function planOptions() {
  // the brief can drop or add categories; then the sketch goes on top (what the user drew always stays)
  const tpl = slotsWithSketch(BriefEngine.slots(TEMPLATES[S.needs.room], B, TEMPLATES))
    .filter(s => s.sketched || !S.removedCategories.includes(s.cat));
  const cap = BriefEngine.budget(B, S.needs.budget);
  const strict = BriefEngine.active(B).some(r => r.effect === "budget");   // a confirmed budget is never exceeded
  const used = {};
  const kept = keptPieces();
  const opts = STRATEGIES.map((strat, si) => {
    const usedOwn = new Set(), gaps = [];
    let remaining = cap;
    let items = tpl.map(slot => {
      const mine = !slot.sketched && kept.find(e => e.category === slot.cat && !usedOwn.has(e.id));
      if (mine) { usedOwn.add(mine.id); return ownedItem(mine); }   // you already have one: keep it, don't buy
      return null;
    }).map((own, k) => own || tpl[k]).map(slot => {
      if (slot.own) return slot;
      if (RUN_CATS.has(slot.cat) && slot.sketched) {   // a drawn cabinet run: cheapest line for Essentials ... priciest for Statement
        const run = runItems(slot, si / (STRATEGIES.length - 1));
        if (!run.length) gaps.push(slot.cat);
        remaining -= sceneTotal(run);
        return run;
      }
      const qty = slot.qty || 1, budget = cap * slot.share / qty;
      // only products that fit and that the confirmed brief allows (brief-engine.js)
      let scored = P.filter(p => p.category === slot.cat && fits(p, slot))
        .map(p => ({ p, a: BriefEngine.assess(p, slot.cat, B) })).filter(x => x.a.eligible);
      if (!scored.length && slot.sketched) {   // a sketch is a rough size: nothing that small? take the closest sizes
        // (what the user drew always gets a product: brief limits don't drop it)
        const near = w => Math.abs((w ?? 1e9) - (slot.maxW * S.space.wallIn / 1.25));
        scored = P.filter(p => p.category === slot.cat).map(p => ({ p, a: BriefEngine.assess(p, slot.cat, B) }))
          .sort((a, b) => b.a.eligible - a.a.eligible || near(a.p.dims_in.width) - near(b.p.dims_in.width)).slice(0, 3);
      }
      // a confirmed budget is a hard cap, except for sketched pieces: what the user drew is always rendered
      const pool = strict && !slot.sketched ? scored.filter(x => x.p.price.amount * qty <= remaining) : scored;
      if (!pool.length) { gaps.push(slot.cat); return null; }
      const fresh = pool.filter(x => !(used[slot.cat] || []).includes(x.p.id));
      const cands = (fresh.length ? fresh : pool).filter(x => x.p.price.amount <= budget * 1.35);
      const list = cands.length ? cands : pool.slice().sort((a, b) => a.p.price.amount - b.p.price.amount).slice(0, 1);
      const target = budget * strat.target;
      const pick = list.slice().sort((a, b) => b.a.score - a.a.score ||
        Math.abs(a.p.price.amount - target) - Math.abs(b.p.price.amount - target))[0];
      (used[slot.cat] = used[slot.cat] || []).push(pick.p.id);
      remaining -= pick.p.price.amount * qty;
      return { cat: slot.cat, qty, pid: pick.p.id, vid: null, pos: slot.pos.slice(), reasons: pick.a.reasons,
               ...(slot.sketched ? { maxW: slot.maxW, sketched: true, sk: slot.sk } : {}) };
    }).flat().filter(Boolean);   // a cabinet run adds several items
    kept.filter(e => !usedOwn.has(e.id)).forEach(e => items.push(ownedItem(e)));   // other pieces you keep
    if (S.space.confirmed) {   // measured room: drop what the layout can't place (layout-engine.js)
      const layout = LayoutEngine.plan(items, S.space, view);
      const blocked = new Set(layout.unplaced.filter(r => !r.accessory && !items[r.i].own).map(r => r.i));
      for (const i of blocked) gaps.push(items[i].cat);
      items = items.filter((it, i) => !blocked.has(i));
    }
    return { name: strat.name, items, gaps, shopOriginal: structuredClone(items) };
  });
  if (S.space.photo === "demo") {
    // option 1 is always the test set (whatever the brief says), plus anything the user sketched
    const drawn = opts[0].items.filter(it => it.sketched);
    const items = [...testScene(), ...drawn];
    opts[0] = { ...opts[0], name: "Test set", items, shopOriginal: structuredClone(items) };
    if (demoRoom()) for (const k of [1, 2]) if (opts[k]) {   // the sample lounge: options 2-3 from the same prepared looks
      const its = [...demoOption(k), ...structuredClone(drawn)];
      opts[k] = { ...opts[k], name: DEMO_OPTIONS[k].name, items: its, shopOriginal: structuredClone(its), gaps: [] };
    }
    S.needs.budget = Math.max(S.needs.budget, 6000);   // room for color changes / swaps (they must stay within budget)
  }
  opts.forEach(o => {
    o.items.forEach(it => { if (isDemoLamp(it) && byId[DEMO_LAMP.pid]) { it.pid = DEMO_LAMP.pid; it.vid = null; } });   // demo: fixed lamp
    o.items = sketchCovers(o.items);
  });
  return opts;
}

// A sketch drawn OVER a piece that's already there replaces it (a sketch elsewhere only adds). "Over" = the sketch
// covers at least 40% of the piece's box: the piece's box in the photo (yours) or where the last render put it (new).
function sketchCovers(items) {
  const sk = items.filter(it => it.sketched), shapes = typeof savedShapes === "function" ? savedShapes() : [];
  if (!sk.length || typeof skBox !== "function") return items;
  const area = b => Math.max(0, b[2] - b[0]) * Math.max(0, b[3] - b[1]);
  const inter = (a, b) => area([Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.min(a[2], b[2]), Math.min(a[3], b[3])]);
  const boxesOf = it => it.own ? (e => e ? e.boxes || [e.box] : [])(exById(it.own))
    : V ? Object.entries(V.items).filter(([i]) => V.scene[i]?.pid === it.pid && V.scene[i]?.cat === it.cat).map(([, e]) => e.crop.box) : [];
  const covered = new Set();
  for (const s of sk) {
    const sh = shapes[s.sk];
    if (!sh) continue;
    const [x0, y0, x1, y1] = skBox(sh.strokes), sb = [y0 * 10, x0 * 10, y1 * 10, x1 * 10];   // 0-1000, like the boxes
    for (const it of items) if (!it.sketched && boxesOf(it).some(b => area(b) && inter(sb, b) >= 0.4 * area(b))) covered.add(it);
  }
  return items.filter(it => !covered.has(it));
}

function generate() {
  if(typeof designGate==='function' && !designGate()) {chatMode='setup';chatOpen=true;renderDesigner();return;}
  S.generating=true;renderDesigner();
  S.options=planOptions();S.opt=0;S.scene=structuredClone(S.options[0].items);
  S.shopSelected = null;
  S.generating=false;S.dirty=false;S.sel=null;S.step=DESIGN;
  syncLayout();saveBrief();render();
}
function stagesText() {
  return [
    `Reading your needs · ${S.needs.style.toLowerCase()}, ${money(S.needs.budget)}`,
    `Scaling the room · back wall ${inch(S.space.wallIn)}`,
    ...(keptCount() ? [`Keeping ${keptCount()} of your pieces`] : []),
    ...(sketched().length ? [`Adding your ${sketched().length} sketched piece${sketched().length > 1 ? "s" : ""}`] : []),
    `Searching ${P.length} real products`,
    "Checking fit and budget",
    "Composing 3 options",
  ];
}

/* ---------------- rendering ---------------- */
function render() {
  document.body.classList.toggle("dim", (S.step < DESIGN && !S.needsMin) || S.generating);
  document.body.classList.toggle("rendering", S.rendering);
  showImage();
  renderSteps(); renderSides(); renderPanel(); renderHotspots(); renderMeasure(); renderBoxes(); renderTopbar(); renderCart(); renderMode();
  if (typeof renderSketch === "function") renderSketch();   // sketch.js: shapes drawn on the photo -> furniture types
  renderDesigner(); renderDiagnosis(); if(typeof renderLayout==='function')renderLayout();
}

/* ---------------- real render via server.py -> Gemini ---------------- */
const photoSrc = () => S.space.photo === "demo" ? example().src : S.space.data;
const sceneSig = (items = S.scene) => JSON.stringify([photoKey(), S.space.wallIn, S.needs.style,
  S.space.depthIn, S.space.corridor, S.space.clearanceIn, S.space.obstacles, B.revision,
  items.map(it => [it.pid, it.vid, it.qty, it.own, it.pos])]);
const currentRender = () => S.scene && S.renders[sceneSig()];
const photoKey = () => S.space.photo === "demo" ? "demo2-" + S.space.ex : String(S.space.data.length);
// the latest render for this photo; kept on screen after edits until the user updates it
const lastRender = () => S.last && S.last.photoKey === photoKey() ? S.last : null;

function showImage() {
  const r = S.step >= DESIGN && !S.before && (currentRender() || lastRender()?.image);
  const want = r || photoSrc();
  if (room.dataset.src !== want) { room.dataset.src = want; room.src = want; $("#backdrop").src = want; }
}

function itemPayload(it) {
  const p = view(it);
  return { name: p.name, variant: p.variant, category: CAT_LABEL[it.cat], qty: it.qty, dims_in: p.dims_in,
           description: (it.place ? `Placement: ${it.place}. ` : "") + (p.description || ""), image: p.images.main_local || p.images.main,
           ...(it.sketched ? { pos: it.pos.map(Math.round), sketched: true } : {}),
           ...(it.run ? { run: { line: it.run.family, length_in: it.run.lengthIn, modules: it.run.modules } } : {}) };
  // no position otherwise: the render AI decides where each piece goes; labels follow where it really is (tracking)
}

// What changed since the last render? null = too different, do a full render instead.
function editsSinceLast() {
  const L = lastRender();
  if (!L || L.wallIn !== S.space.wallIn || L.style !== S.needs.style) return null;
  // sketched pieces are diffed on their own (they're added into a crop around the sketch, see renderScene); the rest
  // is matched by category, and two of the same kind there means a full render
  const plain = items => items.filter(it => !it.sketched), Lp = plain(L.items), Sp = plain(S.scene);
  const dup = items => new Set(items.map(it => it.cat)).size !== items.length;
  if (dup(Lp) || dup(Sp)) return null;
  const before = Object.fromEntries(Lp.map(it => [it.cat, it]));
  const now = Object.fromEntries(Sp.map(it => [it.cat, it]));
  const same = (a, b) => a.pid === b.pid && a.vid === b.vid && a.own === b.own;
  const sameSketch = (a, b) => same(a, b) && a.pos.map(Math.round).join() === b.pos.map(Math.round).join();
  const skNow = S.scene.filter(it => it.sketched), skBefore = L.items.filter(it => it.sketched);
  const changed = Sp.filter(it => !before[it.cat] || !same(before[it.cat], it))
    .map(it => ({ ...itemPayload(it), replaces: before[it.cat] ? view(before[it.cat]).name : null }))
    .concat(skNow.filter(it => !skBefore.some(b => sameSketch(b, it))).map(itemPayload));   // new / moved sketches
  const removed = Lp.filter(it => !now[it.cat]).concat(skBefore.filter(b => !skNow.some(it => sameSketch(b, it))))
    .map(it => ({ category: CAT_LABEL[it.cat], name: view(it).name }));
  const n = changed.length + removed.length;
  return n && n <= 3 ? { changed, removed } : null;
}

const renderBase = () => ({ room: { width_in: S.space.wallIn, depth_in: S.space.depthIn }, needs: { style: S.needs.style, brief:BriefEngine.active(B).map(r=>({text:r.text,impact:r.impact,scope:r.scope,productId:r.productId,category:r.category})) } });
function renderRequest() {
  const base = renderBase();
  const edits = editsSinceLast();
  if (edits) {
    // edit mode: start from the current render and change only these pieces (keeps everything else stable)
    const img = lastRender().image;   // a baked example render is a file under app/assets
    return { ...base, mode: "edit", base_image: img.startsWith("assets/") ? "app/" + img : img, items: edits.changed, removed: edits.removed };
  }
  const ex = S.existing?.photoKey === photoKey() ? S.existing.items : [];
  const here = e => ({ label: e.label, category: e.category, count: e.count || 1,
                       positions: (e.boxes || [e.box]).map(b => boxCenter(b).map(Math.round)) });
  return { ...base, room_image: S.space.photo === "demo" ? apiSrc(example().src) : S.space.data,
           items: S.scene.filter(it => !it.own).map(itemPayload),
           keep: S.scene.filter(it => it.own && exById(it.own)).map(it => here(exById(it.own))),
           remove_existing: ex.filter(e => !e.id.startsWith("picked-") && !S.scene.some(it => it.own === e.id)).map(here) };
}

// real = the image truly shows this scene (an AI render), so AI edits can build on it
function rememberRender(sig, image, real = true) {
  S.renders[sig] = image;
  S.last = { image, real, photoKey: photoKey(), wallIn: S.space.wallIn, style: S.needs.style,
             items: structuredClone(S.scene) };
  if(typeof persistRenderedImage==='function')persistRenderedImage(sig,S.last);
}

function setLive(on) {
  S.live = on; S.renders = {}; S.before = false;
  if (!S.last?.real) S.last = null;   // keep real renders (incl. the baked example ones) as a base for edits
}

// remembered per browser so teammates only type it once
const passcode = {
  get() { try { return localStorage.getItem("elephant-passcode") || ""; } catch { return ""; } },
  set(v) { try { localStorage.setItem("elephant-passcode", v); } catch { /* private mode: ask again next time */ } },
};

// VS Code Live Preview serves the page on another local port (3000); the AI server (python server.py) is on 8000
const API_BASE = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) && location.port === "3000"   // Live Preview only
  ? `http://127.0.0.1:${window.ELEPHANT_API_PORT || "8000"}` : "";
async function apiPost(path, obj) {
  const body = JSON.stringify(obj);
  const call = () => fetch(API_BASE + path, { method: "POST", body,
    headers: { "Content-Type": "application/json", "X-Passcode": passcode.get() } });
  let res = await call();
  if (res.status === 401) {   // deployed site: AI calls cost money, so they need the team passcode
    const pc = prompt("Team passcode for AI features:");
    if (!pc) throw new Error("This needs the team passcode");
    passcode.set(pc.trim());
    res = await call();
    if (res.status === 401) { passcode.set(""); throw new Error("Wrong passcode"); }
  }
  const j = await res.json().catch(() => ({ error: "AI server not running. Start it with: python3 server.py" }));
  if (!res.ok || j.error) throw new Error(j.error || "Request failed");
  return j;
}


let renderQueued = false;   // a render asked for while another one runs (e.g. a sketch finished): runs right after it
async function renderScene(manual = false) {
  if (S.rendering) { renderQueued = true; toast("Rendering… your latest change is next"); return; }
  if (!S.scene || !S.scene.length) return;
  const sig = sceneSig();
  S.renderError='';
  if (!S.live && !demoRoom()) {
    // demo mode: show a saved render instead of calling Gemini (saves credits while we build)
    if (S.renders[sig]) { S.before = false; render(); return; }
    const ex = S.existing?.photoKey === photoKey() ? S.existing.items : [];
    const keepsMine = S.scene.some(it => it.own);
    // the baked example render shows exactly option 1 with everything found kept
    const isBaked = S.space.photo === "demo" && !!example().render && ex.every(e => e.keep) && S.options[0] && sig === sceneSig(S.options[0].items);
    if (manual && !isBaked && lastRender()) {
      // you edited the design: a saved image can't show that, so offer to turn AI on for this one change
      if (confirm("AI renders are off (demo mode), so the picture can't show this change.\n\nTurn AI renders on and update it now? (about $0.07 per render)")) {
        setLive(true); render(); renderScene(true);
      } else toast("Still showing the previous picture. Turn on AI renders (top right) to see your edits");
      return;
    }
    S.rendering = true; S.before = false; render();
    setTimeout(() => {
      // a saved demo image only fits the default plan; otherwise show your photo with the pieces you keep
      const sk = S.scene.some(it => it.sketched);   // sketched pieces: no saved image has them, so show the photo
      const img = isBaked ? example().render : keepsMine || sk ? photoSrc() : S.space.photo === "demo" ? (example().render || photoSrc()) : EXAMPLES[0].render;
      rememberRender(sig, img, isBaked); S.rendering = false; render();
      if (isBaked) prepareVariants();
      toast(isBaked ? "Demo render · AI renders are off (top right to turn on)"
            : sk ? "Demo mode: your sketched pieces show as pins. Turn on AI renders (top right) to see them in the picture"
            : keepsMine ? "Demo mode: showing your photo with the pieces you keep. Turn on AI renders to see the new ones in it"
            : "Demo render · AI renders are off (top right to turn on)");
    }, 700);
    return;
  }
  // the demo's options are always put together again from its saved looks (instant once loaded), never from a picture
  // stored before a look (e.g. the sofa's own fixed picture) had finished loading
  const demoScene = demoRoom() && isDemoDerived(S.scene);
  if (S.renders[sig] && !demoScene) { rememberRender(sig, S.renders[sig]); S.before = false; render(); prepareVariants(); return; }
  if (demoScene) {
    S.rendering = true; S.before = false; render();
    try { await demoCompose(); } catch (e) { toast(e.message.slice(0, 120)); }
    finally { S.rendering = false; render(); if (renderQueued) { renderQueued = false; renderScene(manual); } }
    return;
  }
  const reqObj = renderRequest();
  // sketched pieces don't go in the big render: each is added afterwards into a small crop around its sketch
  const sketchedNames = new Set(reqObj.items.filter(x => x.sketched).map(x => x.name));
  const toPlace = S.scene.filter(it => it.sketched && !it.own && byId[it.pid] && sketchedNames.has(view(it).name));
  reqObj.items = reqObj.items.filter(x => !x.sketched);
  const bigNeeded = reqObj.items.length + (reqObj.mode === "edit" ? reqObj.removed.length : (reqObj.remove_existing || []).length) > 0;
  if (!bigNeeded && !toPlace.length) {
    S.before = true; render(); toast("You're keeping everything, so there's nothing new to render yet");   // don't pay for a copy
    return;
  }
  S.rendering = true; S.before = false; render();
  let stale = false;
  try {
    // demo: the sample room's test set (option 1, colors as recommended) is the saved render all demo looks were made on
    const isDemoBase = reqObj.mode !== "edit" && S.space.photo === "demo" && S.space.ex === 0
      && sameItems(S.scene.filter(it => !it.sketched), testScene());
    if (demoRoom() && !toPlace.length) reqObj.cache_only = true;   // demo room: only sketches make new renders
    if (demoRoom() && !bigNeeded && toPlace.length && rsOf.has(lastRender()?.image) && await addSketchLayers(toPlace)) return;
    const fromDemo = bigNeeded && demoRoom() && isDemoBase;
    const prevShown = reqObj.mode === "edit" ? lastRender().image : null;
    const demoLine = fromDemo || (!bigNeeded && prevShown && rsOf.has(prevShown));   // a picture of the demo render's lineage
    const j = fromDemo ? await apiPost("/api/cached_render", { key: DEMO_BASE })
      : bigNeeded ? await apiPost("/api/render", reqObj)
      : { image: prevShown ? renderSpace(prevShown) : photoSrc(), cached: true, ms: 0 };   // only sketches: add them to what's there
    if(sig!==sceneSig()){S.renders[sig]=j.image;stale=true;return;}   // you picked another option meanwhile: keep this one for later, render the new pick next
    if (toPlace.length) {
      toast(`Adding your ${toPlace.length} sketched piece${toPlace.length > 1 ? "s" : ""}…`);
      j.image = await placeSketched(j.image, toPlace);
      if (sig !== sceneSig()) { toast('The design changed, so this image doesn’t show it. Render again.'); return; }
    }
    if (demoLine) j.image = await showOnPhoto(j.image);   // shown on the full photo, at the right place
    rememberRender(sig, j.image);if(typeof logTransition==='function')logTransition('Render updated with the current picks and colors.');
    prepareVariants();   // in the background: color crops for instant color switching
    const what = reqObj.mode === "edit" ? `Updated ${reqObj.items.length + reqObj.removed.length} piece(s)` : "Rendered";
    toast(j.cached ? "Loaded saved render" : `${what} in ${(j.ms / 1000).toFixed(1)}s`);
  } catch (e) {
    S.renderError=e.message; if(typeof logTransition==='function')logTransition('Render failed. Your picks are saved, so you can retry.');toast(e.message.slice(0,120));
  } finally {
    S.rendering = false; render();
    if (renderQueued) { renderQueued = false; renderScene(manual); }   // the change asked for meanwhile
    else if (stale && S.live) renderScene();
  }
}

/* ---------------- color variants: switch a product's color (or a similar product) on the render instantly ----------------
 * After a render: check each new product is really in it (add it with an edit render if not), crop it, and prepare
 * in the background (one small Gemini edit each):
 *   - its other colors (up to VARIANT_MAX colors in all), and
 *   - its similar products (up to SIMILAR_MAX, in their default color only; their other colors are not prepared).
 * Picking one with the existing buttons then lays that crop over the render right away (variants.js), instead of
 * asking for a new render. #variantsmock=1 runs this without Gemini (fake tints) to test the flow. */
let MOCK_VARIANTS = false;
// DEMO: only sketches make new AI renders. Everything else (full renders, tracking, colors, similar products) comes from
// what was rendered before (server cache). #newrenders=1 in the URL allows new renders for everything again.
let ONLY_SKETCH_NEW = true;
// the demo only applies to the sample lounge; your own photo (and the other example) render as usual
const demoRoom = () => ONLY_SKETCH_NEW && S.space.photo === "demo" && S.space.ex === 0;
const DEMO_BASE = "ddfbf2dc833b2419";   // the test-set render (sample room, option 1) all demo colors / swaps were made on
const cacheOnly = live => (path, body) => apiPost(path, demoRoom() && !live ? { ...body, cache_only: true } : body);
const prepared = new Map();   // render image -> its V, so going back to a picture (e.g. another option) is instant
// The demo render (and every color / similar product / sketch made on it) was made on the earlier, cropped lounge
// photo. That crop is this part of the full photo (example-lounge-wide.jpg): all the work stays in the render's own
// space (so everything comes from the cache) and is pasted onto the full photo only for display.
const DEMO_SPACE = { x: 0.3306, y: 0, w: 0.6695, h: 1 };
const rsOf = new Map(), shownOf = new Map();   // shown picture <-> picture in the render's own space
const renderSpace = img => rsOf.get(img) || img;
const toShown = ([x, y]) => [DEMO_SPACE.x * 100 + DEMO_SPACE.w * x, DEMO_SPACE.y * 100 + DEMO_SPACE.h * y];
async function showOnPhoto(rsImg) {   // render-space picture -> the same picture on the full photo
  if (shownOf.has(rsImg)) return shownOf.get(rsImg);
  // always the plain photo: the sofa's own finished pictures (demo-cache, made on this photo) cover the seam
  const shown = await Variants.pasteInto(photoSrc(), rsImg, DEMO_SPACE);
  shownOf.set(rsImg, shown); rsOf.set(shown, rsImg);
  return shown;
}
// a piece's crop on the full photo (the demo render pasted on it); box stays in the render's own space
async function wideCrop(base, box) {
  const m = [box[0], Math.round(DEMO_SPACE.x * 1000 + DEMO_SPACE.w * box[1]), box[2], Math.round(DEMO_SPACE.x * 1000 + DEMO_SPACE.w * box[3])];
  const soft = await Variants.cropForRecolor(await showOnPhoto(base), m);   // where it sits on the shown picture
  const hard = await Variants.cropForRecolor(await hardOnPhoto(base), m);   // sent to Gemini: no faded seam to copy
  return { ...soft, dataUrl: hard.dataUrl, box, wide: true };
}
// a finished crop picture -> an overlay that is the whole picture, only its edges feathered into the photo
async function wholePatch(crop, src) {
  const im = new Image(); im.src = src; await im.decode();
  const w = crop.full.width, h = crop.full.height, c = document.createElement("canvas"); c.width = w; c.height = h;
  const g = c.getContext("2d"); g.drawImage(im, 0, 0, w, h);
  const f = Math.max(2, Math.min(w, h) * 0.04);
  g.globalCompositeOperation = "destination-in";
  for (const [x0, y0, x1, y1] of [[0, 0, f, 0], [w, 0, w - f, 0], [0, 0, 0, f], [0, h, 0, h - f]]) {
    const gr = g.createLinearGradient(x0, y0, x1, y1); gr.addColorStop(0, "rgba(0,0,0,0)"); gr.addColorStop(1, "rgba(0,0,0,1)");
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  }
  return { canvas: c, rect: crop.rect, wide: true };
}
const sofaIndex = run => Object.keys(run.items).find(i => run.items[i].crop?.wide);
// the sofa picture with holes where other pieces' new looks (render space) are, so a changed table or rug still shows
async function cutOut(removal, overlays, run) {
  if (!overlays.length) return removal;
  const e = run.items[sofaIndex(run)], im = new Image(); im.src = run.base; await im.decode();
  const sx = DEMO_SPACE.w * e.crop.W / im.naturalWidth, sy = DEMO_SPACE.h * e.crop.H / im.naturalHeight;
  const c = document.createElement("canvas"); c.width = removal.canvas.width; c.height = removal.canvas.height;
  const g = c.getContext("2d"); g.drawImage(removal.canvas, 0, 0); g.globalCompositeOperation = "destination-out";
  for (const o of overlays) g.drawImage(o.canvas, DEMO_SPACE.x * e.crop.W + o.rect.x * sx - removal.rect.x, DEMO_SPACE.y * e.crop.H + o.rect.y * sy - removal.rect.y, o.rect.w * sx, o.rect.h * sy);
  return { ...removal, canvas: c };
}
// the render pasted onto the full photo without the feathered seam (only used as Gemini's input for wideCrop)
async function hardOnPhoto(rsImg) {
  const load = src => new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = src; });
  const [ph, im] = await Promise.all([load(photoSrc()), load(rsImg)]);
  const c = Object.assign(document.createElement("canvas"), { width: ph.naturalWidth, height: ph.naturalHeight }), g = c.getContext("2d");
  g.drawImage(ph, 0, 0);
  g.drawImage(im, Math.round(DEMO_SPACE.x * c.width), Math.round(DEMO_SPACE.y * c.height), Math.round(DEMO_SPACE.w * c.width), Math.round(DEMO_SPACE.h * c.height));
  return c.toDataURL("image/jpeg", 0.93);
}
let SOFA_WIDE_NEW = false;   // #sofawide=1: render the sofa's full-photo looks again (new AI calls); otherwise from demo-cache
const VARIANT_MAX = 4;   // colors per product, including the one it was rendered in (also the swatches shown)
const SIMILAR_MAX = 4;   // similar products listed per piece (also prepared, default color only)
// V = {base: render image the crops come from, scene: what that render shows, items: {slot index: {pid, from, fromName,
//      crop, looks: {"c:<vid|base>" | "s:<pid>": {status, overlay}}}}}
let V = null;
let lastV = null;        // the previous V: its finished looks are reused when a piece looks the same in the new picture
const vkey = vid => vid || "base";
const apiSrc = img => img.startsWith("assets/") ? "app/" + img : img;   // a baked example render is a file under app/
// which prepared look shows this item: another color of the rendered product, or a similar product in its default color
const lookKey = (entry, it) => it.pid === entry.pid ? "c:" + vkey(it.vid) : it.vid ? null : "s:" + it.pid;

function colorChoices(p) {
  return [{ id: null, variant: p.variant, image: p.images.main_local || p.images.main },
    ...p.variants.map(v => ({ id: v.id, variant: v.variant, image: v.image }))].slice(0, VARIANT_MAX);
}
// the similar products listed for a piece (same list in the Edit card, the product preview and the background prep)
function similarProducts(it) {
  const t = lockedSlot(it);
  if (t) return [t.pid, ...t.similar].filter(id => id !== it.pid && byId[id]).map(id => byId[id]).slice(0, SIMILAR_MAX);
  // a sketched piece: 2 similar products in the demo (all of them with real AI renders on, #newrenders=1)
  if (isDemoLamp(it) && it.pid === DEMO_LAMP.pid) return DEMO_LAMP.similar.filter(id => byId[id]).map(id => byId[id]);
  if (it.sketched) return similarRanked(it).slice(0, demoRoom() ? 2 : SIMILAR_MAX);
  return similarRanked(it).slice(0, SIMILAR_MAX);
}
function similarRanked(it) {
  const p = view(it);
  return P.filter(q => q.category === it.cat && q.id !== it.pid && fits(q, it) && (typeof eligibleSwap !== "function" || eligibleSwap(q, it)))
    .sort((a, b) => BriefEngine.assess(b, it.cat, B).score - BriefEngine.assess(a, it.cat, B).score
      || Math.abs(a.price.amount - p.price.amount) - Math.abs(b.price.amount - p.price.amount));
}

// how item i of the scene relates to what V was made from
function lookState(it, i) {
  const was = V?.scene[i];
  if (!was || it.cat !== was.cat || it.own !== was.own) return { s: "none" };
  if (it.own || (it.pid === was.pid && vkey(it.vid) === vkey(was.vid))) return { s: "same" };
  const e = V.items[i], key = e && lookKey(e, it), look = key && e.looks[key];
  if (!look) return { s: "none" };
  return look.status === "done" ? { s: "ready", overlay: look.overlay } : { s: look.status, error: look.error };
}
// the scene is what V was made from, apart from looks that are prepared (or being prepared)
const variantsCover = (scene = S.scene) => !!V && !!scene && scene.length === V.scene.length && scene.every((it, i) => lookState(it, i).s !== "none");
const colorsReady = () => variantsCover() && S.scene.every((it, i) => ["same", "ready"].includes(lookState(it, i).s));

const REPAIR_MAX = 2;   // extra edit renders to add products the render left out
// L0 / quiet: prepare a picture that isn't on screen yet (demoWarm): no "checking" state or toast
async function prepareVariants(depth = 0, L0 = null, quiet = false) {
  const L = L0 || lastRender();
  if (!L?.real || !(S.live || MOCK_VARIANTS || demoRoom()) || V?.base === renderSpace(L.image) || (L.fromVariants && V)) return;
  // L.items = exactly what this render shows (the scene may have been edited since)
  const base = renderSpace(L.image), mapped = base !== L.image;   // mapped: shown on the full photo (demo render)
  if (prepared.has(base) && prepared.get(base).tracked) {   // seen this picture before: labels + looks right away
    V = lastV = prepared.get(base); S.verifying = false; render(); resumeJobs(V); return;
  }
  const prev = V || lastV;
  const run = V = lastV = { base, mapped, scene: structuredClone(L.items), items: {} };
  prepared.set(run.base, run);
  if (prepared.size > 12) prepared.delete(prepared.keys().next().value);
  // every new product is tracked (labels move onto it); then its colors and similar products are prepared
  const todo = L.items.map((it, i) => ({ it, i })).filter(({ it }) => !it.own && byId[it.pid]);
  if (!todo.length) return;
  if (!quiet) {
    S.verifying = true; renderHotspots();   // no product labels until we've checked each one is really in the picture
    if (!MOCK_VARIANTS) toast("Checking that every product is in the picture…");
  }
  try {
    // where everything is already known (the other pieces from the last picture, a sketched piece where it was
    // drawn), skip tracking: labels show right away and nothing is paid
    let boxes = null;
    if (prev?.tracked) {
      const shapes = typeof savedShapes === "function" ? savedShapes() : [];
      const known = todo.map(({ it }) => {
        if (it.sketched) {
          const sh = shapes[it.sk];
          if (!sh || typeof skBox !== "function") return null;
          const [x0, y0, x1, y1] = skBox(sh.strokes);
          return [y0 * 10, x0 * 10, y1 * 10, x1 * 10].map(Math.round);
        }
        const e = Object.values(prev.items).find(e => e.pid === it.pid && vkey(e.from) === vkey(it.vid));
        return e ? e.crop.box : null;
      });
      if (known.every(Boolean)) boxes = known;
    }
    if (!boxes) boxes = await Variants.track({ image: apiSrc(run.base), api: cacheOnly(todo.some(({ it }) => it.sketched)), mock: MOCK_VARIANTS,
      items: todo.map(({ it }) => { const p = view(it); return { name: p.name, category: CAT_LABEL[it.cat],
        image: p.images.main_local || p.images.main }; }) });   // no position hint: search the whole picture
    if (V !== run) return;
    // a product the render left out: add it with an edit render, then check again; never label what isn't there
    const missing = todo.filter((x, k) => !boxes[k]).map(x => x.it);
    if (missing.length && !MOCK_VARIANTS) {
      const names = missing.map(it => view(it).family || view(it).name).join(", ");
      if (depth < REPAIR_MAX && S.live) {
        const sig = sceneSig(L.items);
        if (sceneSig() !== sig) return;   // the design changed meanwhile; the next render starts over
        toast(`${names} was missing from the picture · adding it`);
        S.rendering = true; render();
        try {
          const j = await cacheOnly(missing.some(it => it.sketched))("/api/render", { ...renderBase(), mode: "edit", base_image: apiSrc(run.base), removed: [],
            items: missing.map(it => { const x = itemPayload(it); return { ...x, description:
              `This product is MISSING from IMAGE 1. Add it so it is clearly visible and fully recognizable. ${x.description || ""}`.trim() }; }) });
          S.rendering = false;
          if (V !== run || sceneSig() !== sig) return;
          rememberRender(sig, j.image); V = null; render();
          return prepareVariants(depth + 1);
        } finally { S.rendering = false; }
      }
      run.missing = new Set(missing.map(it => it.pid));
      toast(`${names} couldn't be placed in the picture, so it has no label. Click Update render to try again.`);
    }
    run.tracked = true;
    S.verifying = false;   // checked: labels show now; colors / similar products keep preparing in the background
    // labels: put each pin where the product really is in the render (template positions are only a guess)
    todo.forEach(({ it }, k) => {
      if (!boxes[k]) return;
      const at = run.mapped ? toShown(boxCenter(boxes[k])) : boxCenter(boxes[k]);   // label spot on the shown picture
      const lists = run.mapped ? [S.scene, run.scene, ...S.options.map(o => o.items)] : [S.scene, S.options[S.opt]?.items, run.scene];
      lists.forEach(list => list?.filter(x => x.cat === it.cat && !x.own && !x.sketched && (run.mapped || x.pid === it.pid))
        .forEach(x => { x.at = at.slice(); }));   // label spot only (pos is part of sceneSig)
    });
    renderHotspots();
    const jobs = [], fresh = new Set();
    for (const [k, { it, i }] of todo.entries()) {
      if (!boxes[k]) continue;
      // same piece, same color, same spot and it looks the same in the new picture (e.g. only a sketch was added
      // elsewhere): keep its finished colors / similar products instead of paying for them again
      const old = await reusableEntry(prev, it, boxes[k], run.base);
      if (V !== run) return;
      if (old) {
        run.items[i] = old;
        for (const [key, look] of Object.entries(old.looks)) if (look.status === "queued" || look.status === "loading") {
          look.status = "queued";
          jobs.push(key.startsWith("c:") ? { i, entry: old, key, cat: it.cat, color: colorChoices(byId[it.pid]).find(c => "c:" + vkey(c.id) === key) }
                                         : { i, entry: old, key, cat: it.cat, swap: byId[key.slice(2)] });
        }
        continue;
      }
      fresh.add(i);
      const p = byId[it.pid], from = it.vid || null;
      const wide = demoRoom() && run.mapped && it.cat === "sofa";   // only the saved sample-lounge demo; real AI renders keep the usual crop
      const entry = run.items[i] = { pid: it.pid, from, fromName: view(it).variant,
                                     crop: wide ? await wideCrop(run.base, boxes[k]) : await Variants.cropForRecolor(run.base, boxes[k]),
                                     looks: { ["c:" + vkey(from)]: { status: "done" } } };
      // the demo sofa touches the render's left edge, where the paste onto the full photo fades it: its looks are made
      // on the full photo instead, and its own look is redrawn there too (a layer), so its left end stays sharp
      if (wide) jobs.push({ i, entry, key: "layer", color: colorChoices(p).find(c => c.id === from), cat: it.cat });
      for (const c of colorChoices(p).filter(c => c.id !== from)) {
        entry.looks["c:" + vkey(c.id)] = { status: "queued" };
        jobs.push({ i, entry, key: "c:" + vkey(c.id), color: c, cat: it.cat });
      }
      for (const q of similarProducts(it)) {
        entry.looks["s:" + q.id] = { status: "queued" };
        jobs.push({ i, entry, key: "s:" + q.id, swap: q, cat: it.cat, prefetch: it.sketched ? sketchPrefetch.get(`${it.sk}|${it.pid}|${q.id}`) : null });
      }
    }
    // the piece you're looking at first, then pieces that are new in this picture (e.g. a sketch), colors before similar products
    // looks that a design option shows come first (demo: options 2 and 3 switch at once), the sofa's own picture first of all
    const shown = new Set();
    for (const o of S.options || []) o.items?.forEach((it, i) => { const e = run.items[i], k = e && lookKey(e, it); if (k) shown.add(i + "|" + k); });
    const need = j => j.key === "layer" ? 2 : shown.has(j.i + "|" + j.key) ? 1 : 0;
    jobs.sort((a, b) => need(b) - need(a) || (b.i === S.sel) - (a.i === S.sel) || fresh.has(b.i) - fresh.has(a.i) || !!a.swap - !!b.swap);
    await runJobs(run, jobs);
  } catch (e) {
    if (V === run) toast("Color previews unavailable: " + e.message.slice(0, 90));
  } finally {
    if (V === run || !V) { S.verifying = false; render(); }
  }
}

// Make the queued looks of a V (colors / similar products), a few at a time. New AI work only for sketched pieces.
async function runJobs(run, jobs) {
  const worker = async () => {
    for (let j; (j = jobs.shift());) {
      if (V !== run) return;
      const look = j.key === "layer" ? (j.entry.layerLook ||= {}) : j.entry.looks[j.key];
      const from = { name: byId[j.entry.pid].name, category: CAT_LABEL[j.cat], variant: j.entry.fromName };
      const api = cacheOnly(!!run.scene[j.i]?.sketched || (j.entry.crop.wide && SOFA_WIDE_NEW));
      look.status = "loading";
      try {
        if (j.prefetch) {   // made together with the sketch (placeSketched)
          look.overlay = await j.prefetch; look.status = "done";
          const it = S.scene?.[j.i];
          if (V === run && it && lookState(it, j.i).s === "ready" && !currentRender()) showColors();
          continue;
        }
        const img = j.swap
          ? await Variants.swap({ crop: j.entry.crop, product: from, api, mock: MOCK_VARIANTS,
              to: { name: j.swap.name, variant: j.swap.variant, image: j.swap.images.main_local || j.swap.images.main, dims_in: j.swap.dims_in } })
          : await Variants.recolor({ crop: j.entry.crop, colorway: j.color, product: from, api, mock: MOCK_VARIANTS });
        // the demo sofa: the finished picture is laid on as it is (whole crop, edges feathered), no pixel matching
        look.overlay = j.entry.crop.wide ? await wholePatch(j.entry.crop, img) : await Variants.makeOverlay(j.entry.crop, img, null, null, true);
        look.overlay.wide = !!j.entry.crop.wide;   // made on the full photo: laid on after the paste
        look.status = "done";
        if (j.key === "layer") { j.entry.layer = look.overlay;   // shown as soon as nothing else is rendering
          (async () => { while (S.rendering) await new Promise(r => setTimeout(r, 100));
            if (V === run && lastRender() && rsOf.has(lastRender().image)) showColors(); })(); continue; }   // only if a demo picture is up
      } catch (e) { look.status = "error"; look.error = e.message; }
      // the user already picked this one and was waiting for it
      const it = S.scene?.[j.i];
      if (V === run && it && lookState(it, j.i).s === "ready" && !currentRender()) showColors();
    }
  };
  await Promise.all(Array.from({ length: demoRoom() ? 6 : 3 }, worker));   // demo: saved looks only, no AI calls
}
// a restored picture whose looks were still being made when we left it: carry on
function resumeJobs(run) {
  const jobs = [];
  for (const [i, e] of Object.entries(run.items)) for (const [key, look] of Object.entries(e.looks)) {
    if (look.status !== "queued" && look.status !== "loading") continue;
    look.status = "queued";
    const cat = run.scene[i].cat;
    jobs.push(key.startsWith("c:") ? { i: +i, entry: e, key, cat, color: colorChoices(byId[e.pid]).find(c => "c:" + vkey(c.id) === key) }
                                   : { i: +i, entry: e, key, cat, swap: byId[key.slice(2)] });
  }
  if (jobs.length) runJobs(run, jobs);
}

// A finished entry of the previous V for this piece, if the piece is unchanged in the new picture: same product and
// color, about the same box, and its crop looks the same (mean pixel difference small). null = prepare it again.
async function reusableEntry(prev, it, box, base) {
  if (!prev) return null;
  const iou = (a, b) => {
    const w = Math.min(a[3], b[3]) - Math.max(a[1], b[1]), h = Math.min(a[2], b[2]) - Math.max(a[0], b[0]);
    const i = Math.max(0, w) * Math.max(0, h), u = (a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - i;
    return u ? i / u : 0;
  };
  const e = Object.values(prev.items).find(e => e.pid === it.pid && vkey(e.from) === vkey(it.vid) && iou(e.crop.box, box) > 0.8);
  if (!e) return null;
  const now = await Variants.cropForRecolor(base, e.crop.box);
  if (now.rect.w !== e.crop.rect.w || now.rect.h !== e.crop.rect.h) return null;
  const small = c => { const t = Object.assign(document.createElement("canvas"), { width: 64, height: 64 });
    t.getContext("2d").drawImage(c, 0, 0, 64, 64); return t.getContext("2d").getImageData(0, 0, 64, 64).data; };
  const a = small(now.full), b = small(e.crop.full);
  let d = 0; for (let k = 0; k < a.length; k += 4) d += Math.abs(a[k] - b[k]) + Math.abs(a[k + 1] - b[k + 1]) + Math.abs(a[k + 2] - b[k + 2]);
  return d / (64 * 64 * 3) < 6 ? e : null;
}

// the test set with only prepared looks (colors of the test pieces, similar products in their first color): composable
function isDemoDerived(scene) {
  const plain = (scene || []).filter(it => !it.sketched);
  return plain.length === TEST_SET.length && !plain.some(it => it.own) && plain.every(it => {
    const t = TEST_SET.find(t => t.cat === it.cat);
    if (!t) return false;
    if (it.pid === t.pid) return !it.vid || colorChoices(byId[t.pid]).some(c => c.id === it.vid);
    return t.similar.includes(it.pid) && !it.vid;
  }) && !scene.some(it => it.sketched && !(V?.items[scene.indexOf(it)]?.layer));
}
// show the current scene from the demo render + prepared looks (loads + prepares the demo render the first time)
let demoBaseRs = null, demoWarmed = null;
// load and prepare the demo render and its looks in the background without showing anything (the walkthrough calls
// this at its start, so picking an option later switches at once)
function demoWarm() {
  if (!demoRoom()) return Promise.resolve();
  return demoWarmed ||= (async () => {
    demoBaseRs = (await apiPost("/api/cached_render", { key: DEMO_BASE })).image;
    await prepareVariants(0, { image: await showOnPhoto(demoBaseRs), real: true, items: testScene() }, true);
  })().catch(() => { demoWarmed = null; });
}
async function demoCompose() {
  if (demoWarmed) await demoWarmed;   // being prepared in the background: use that
  if (!(V?.mapped && V.base === demoBaseRs && V.tracked)) {
    demoBaseRs = (await apiPost("/api/cached_render", { key: DEMO_BASE })).image;
    const shown = await showOnPhoto(demoBaseRs), cur = S.scene;
    S.scene = testScene();   // the scene the saved render shows
    rememberRender(sceneSig(), shown, true);
    S.scene = cur;
    await prepareVariants();   // labels + every prepared look (all saved)
  }
  for (let t = 0; t < 150 && !colorsReady(); t++) {
    if (!S.scene.some((it, i) => ["queued", "loading"].includes(lookState(it, i).s))) break;
    await new Promise(r => setTimeout(r, 200));
  }
  if (!(await showColors())) toast("This combination isn't in the demo set");
}

// where each piece is on the shown demo picture (from the tracking), for the Shop room plan: {slotId: [box 0-1000]}
function demoBoxes(items) {
  if (!demoRoom() || !V?.mapped) return null;
  const m = b => [b[0], Math.round(DEMO_SPACE.x * 1000 + DEMO_SPACE.w * b[1]), b[2], Math.round(DEMO_SPACE.x * 1000 + DEMO_SPACE.w * b[3])];
  const out = {};
  items.forEach((it, k) => {
    const i = V.scene.findIndex(x => x.cat === it.cat && !!x.own === !!it.own && !!x.sketched === !!it.sketched);
    const box = i >= 0 && V.items[i]?.crop?.box;
    if (box) out[it.slotId ?? k] = [m(box)];
  });
  return Object.keys(out).length ? out : null;
}

// same pieces, products and colors (order doesn't matter)
const sameItems = (a, b) => a.length === b.length && b.every(x => a.some(y => y.cat === x.cat && y.pid === x.pid
  && (y.vid || null) === (x.vid || null) && (y.own || null) === (x.own || null)));

// Sketched pieces (sketch.js): each is added into a small crop around what the user drew, then laid over the picture.
// They are then tracked like every other product, so they get labels, colors and similar products too.
const sketchPrefetch = new Map();   // "<sketch>|<product>|<similar>" -> overlay promise (made together with the sketch)
function sketchCrop(base, strokes) {
  let [x0, y0, x1, y1] = skBox(strokes);   // % of the picture
  const grow = (a, b, min) => { const c = (a + b) / 2, h = Math.max(b - a, min) / 2; return [Math.max(0, c - h), Math.min(100, c + h)]; };
  [x0, x1] = grow(x0, x1, 18); [y0, y1] = grow(y0, y1, 18);   // a tiny sketch still gets a crop with some context
  return Variants.cropForRecolor(base, [y0 * 10, x0 * 10, y1 * 10, x1 * 10], 0.5);
}

// Demo picture: a sketched piece is one more LAYER on the unchanged demo render (like a color or a similar product),
// so its saved placement is always reused and every other prepared look stays valid. Its similar products are
// layers that replace it. false = not this case (the normal flow places it into the picture).
async function addSketchLayers(items) {
  const run = V, shapes = typeof savedShapes === "function" ? savedShapes() : [];
  if (!run?.tracked || !run.mapped || typeof skBox !== "function") return false;
  const at = items.map(it => S.scene.indexOf(it));
  // the scene is the demo picture's scene plus these sketched pieces, at the end
  if (S.scene.length !== run.scene.length + items.length || at.some((i, k) => i !== run.scene.length + k)) return false;
  if (!S.scene.slice(0, run.scene.length).every((it, i) => lookState(it, i).s !== "none")) return false;
  toast(`Adding your sketched ${items.map(it => CAT_LABEL[it.cat].toLowerCase()).join(", ")}…`);
  for (const [k, it] of items.entries()) {
    const sh = shapes[it.sk], i = at[k];
    if (!sh) return false;
    const crop = await sketchCrop(run.base, sh.strokes), limit = Variants.sketchBox(crop, sh.strokes), p = view(it);
    const placeOne = q => Variants.place({ crop, strokes: sh.strokes, api: apiPost, mock: MOCK_VARIANTS,
      product: { name: q.name, variant: q.variant, category: CAT_LABEL[it.cat], image: q.images.main_local || q.images.main,
                 dims_in: q.dims_in, description: q.description } });
    const mainP = placeOne(p).catch(() => placeOne(p));
    const alts = similarProducts(it).map(q => ({ q, img: placeOne(q) }));   // at the same time: switching is instant later
    let main;
    try { main = await mainP; } catch (e) { toast(`Couldn't add ${p.family || p.name}: ${e.message.slice(0, 80)}`); return true; }
    const [x0, y0, x1, y1] = skBox(sh.strokes), box = [y0 * 10, x0 * 10, y1 * 10, x1 * 10].map(Math.round);
    run.scene[i] = structuredClone(it);
    run.items[i] = { pid: it.pid, from: it.vid || null, fromName: p.variant, crop: await Variants.cropForRecolor(run.base, box),
                     layer: await Variants.makeOverlay(crop, main, limit), looks: { ["c:" + vkey(it.vid)]: { status: "done" } } };
    for (const { q, img } of alts) {
      const look = run.items[i].looks["s:" + q.id] = { status: "loading" };
      img.then(alt => Variants.makeOverlay(crop, alt, limit, main))
        .then(o => { look.overlay = o; look.status = "done"; const cur = S.scene?.[i];
                     if (V === run && cur && lookState(cur, i).s === "ready" && !currentRender()) showColors(); })
        .catch(e => { look.status = "error"; look.error = e.message; });
    }
    const spot = toShown(boxCenter(box));   // its label, on the shown photo
    for (const list of [S.scene, S.options[S.opt]?.items]) if (list?.[i]) list[i].at = spot.slice();
  }
  await showColors();
  return true;
}

async function placeSketched(base, items) {
  const shapes = typeof savedShapes === "function" ? savedShapes() : [];
  const overlays = await Promise.all(items.map(async it => {
    const sh = shapes[it.sk];
    if (!sh || typeof skBox !== "function") return null;
    const crop = await sketchCrop(base, sh.strokes);
    const p = view(it);
    const placeOne = q => Variants.place({ crop, strokes: sh.strokes, api: apiPost, mock: MOCK_VARIANTS,
        product: { name: q.name, variant: q.variant, category: CAT_LABEL[it.cat], image: q.images.main_local || q.images.main,
                   dims_in: q.dims_in, description: q.description } });
    const mainP = placeOne(p).catch(e => { console.warn("sketch placement failed, retrying once:", e.message); return placeOne(p); });
    // its similar products are placed in the same crop at the same time, so switching to them is instant later
    const limit = Variants.sketchBox(crop, sh.strokes);
    for (const q of similarProducts(it)) {
      const k = `${it.sk}|${it.pid}|${q.id}`;
      if (sketchPrefetch.has(k)) continue;
      const done = Promise.all([mainP, placeOne(q)]).then(([main, alt]) => Variants.makeOverlay(crop, alt, limit, main));
      done.catch(() => sketchPrefetch.delete(k));
      sketchPrefetch.set(k, done);
    }
    try {
      const img = await mainP;
      return await Variants.makeOverlay(crop, img, Variants.sketchBox(crop, sh.strokes));   // keep it where it was drawn
    } catch (e) { toast(`Couldn't add ${p.family || p.name}: ${e.message.slice(0, 80)}`); return null; }
  }));
  const ok = overlays.filter(Boolean);
  return ok.length ? Variants.flatten(base, ok) : base;
}

// Show the render with the chosen looks laid over it. false = can't (yet), so the old flow applies.
async function showColors() {
  if (!colorsReady()) return false;
  const sig = sceneSig(), run = V;
  // floor first (a rug's crop covers the furniture on it), then bigger pieces before smaller, so each piece sits on top
  const area = b => (b[2] - b[0]) * (b[3] - b[1]);
  const overlays = S.scene.map((it, i) => { const l = lookState(it, i), e = V.items[i];
    const o = l.s === "ready" ? l.overlay : l.s === "same" && e?.layer ? e.layer : null;
    return o && { o, rug: it.cat === "rug", size: e?.crop ? area(e.crop.box) : 0 }; }).filter(Boolean)
    .sort((a, b) => b.rug - a.rug || b.size - a.size).map(x => x.o).filter(o => !o.wide);
  const wideOv = run.mapped ? S.scene.map((it, i) => { const l = lookState(it, i), e = V.items[i];
    const o = l.s === "ready" ? l.overlay : l.s === "same" ? e?.layer : null;
    return o?.wide ? [o] : []; }).flat() : [];
  const saved = !wideOv.length && S.renders[sig];
  let img = saved || (overlays.length ? await Variants.flatten(run.base, overlays) : run.base);
  if (!saved && run.mapped) {
    img = await showOnPhoto(img);   // the demo render: shown on the full photo
    if (wideOv.length) {   // + the sofa picture, laid on the full photo as it is
      const rs = renderSpace(img);
      img = await Variants.flatten(img, await Promise.all(wideOv.map(o => cutOut(o, overlays, run))));
      rsOf.set(img, rs);
    }
  }
  if (V !== run || sceneSig() !== sig) return false;   // something else changed meanwhile
  rememberRender(sig, img, true); S.last.fromVariants = true; prepared.set(renderSpace(img), run); S.before = false; render();
  return true;
}

// called by the colorway / swap buttons after it.vid or it.pid changed
function previewPicked(it) {
  const p = view(it), name = `${p.family || p.name} · ${p.variant}`;
  if (!S.live && !MOCK_VARIANTS && !demoRoom()) { toast(`${name} · turn on AI renders (top right) to preview it instantly`); return; }
  if (!V && lastRender()?.real) {   // nothing prepared yet (e.g. AI renders were just turned on): start now
    prepareVariants();
    toast(`${name} · preparing previews, it shows in a moment`); return;
  }
  const st = V ? lookState(it, S.scene.indexOf(it)) : { s: "none" };
  if (colorsReady()) { showColors(); toast(name); return; }
  if (V && !V.tracked && variantsCover()) { toast(`${name} · preparing previews, it shows in a moment`); return; }
  if (st.s === "queued" || st.s === "loading") { toast(`${name} · preparing the preview, it shows in a moment`); return; }
  toast(`${name} · ${st.s === "error" ? "preview failed" : "no instant preview for this one"}, click Update render to see it`);
}
const colorPicked = previewPicked;

// TEST ONLY (open the app with #testbase): swap the base room photo for any image, then jump straight to a rendered design
// (option 1, no chat/brief), to try the color variants on different rooms. Not part of the product flow.
function testBaseImage(file) {
  const r = new FileReader();
  r.onload = () => {
    const im = new Image();
    im.onload = () => {
      const k = Math.min(1, 1600 / Math.max(im.width, im.height));
      const c = Object.assign(document.createElement("canvas"), { width: Math.round(im.width * k), height: Math.round(im.height * k) });
      c.getContext("2d").drawImage(im, 0, 0, c.width, c.height);
      EXAMPLES.push({ name: "Test " + (EXAMPLES.length - 1), src: c.toDataURL("image/jpeg", 0.9), room: S.needs.room, render: null, furniture: null });
      S.space.ex = EXAMPLES.length - 1; S.space.photo = "demo"; S.space.data = null;
      S.existing = null; S.last = null; S.renders = {}; V = null; S.before = false; S.sel = null; S.preview = null;
      S.options = planOptions(); S.opt = 0; S.scene = structuredClone(S.options[0].items); S.dirty = false; S.step = EDIT;
      if (typeof syncLayout === "function") syncLayout();
      showImage(); render(); renderScene(true);
      toast("Test base image loaded · rendering option 1");
    };
    im.src = r.result;
  };
  r.readAsDataURL(file);
}
if (/(^|[#&])testbase\b/.test(location.hash)) {   // hidden test tool: open with #testbase
  const input = Object.assign(document.createElement("input"), { type: "file", accept: "image/*", hidden: true });
  const btn = Object.assign(document.createElement("button"), { className: "pill", textContent: "Test · change base image",
    title: "Test only: use another room photo as the base image" });
  Object.assign(btn.style, { position: "fixed", left: "16px", bottom: "16px", zIndex: 60, fontSize: "12px", border: "1px dashed currentColor" });
  btn.addEventListener("click", e => { e.stopPropagation(); input.click(); });
  input.addEventListener("change", () => { if (input.files[0]) testBaseImage(input.files[0]); input.value = ""; });
  document.body.append(input, btn);
}

/* ---------------- existing furniture: detect -> crop -> white-background isometric shot ---------------- */
const photoForApi = () => S.space.photo === "demo" ? apiSrc(example().src) : S.space.data;
let _photoImg = null;
function photoImage() {
  const src = photoSrc();
  if (_photoImg && _photoImg.src.endsWith(src.slice(-200))) return Promise.resolve(_photoImg);
  return new Promise((ok, bad) => { const im = new Image(); im.onload = () => ok(_photoImg = im); im.onerror = bad; im.src = src; });
}
async function cropBox(box) {
  const im = await photoImage(), W = im.naturalWidth, H = im.naturalHeight, pad = 0.05;
  const x0 = Math.max(0, box[1] / 1000 - pad) * W, y0 = Math.max(0, box[0] / 1000 - pad) * H;
  const x1 = Math.min(1, box[3] / 1000 + pad) * W, y1 = Math.min(1, box[2] / 1000 + pad) * H;
  const k = Math.min(1, 768 / Math.max(x1 - x0, y1 - y0));
  const c = Object.assign(document.createElement("canvas"), { width: (x1 - x0) * k, height: (y1 - y0) * k });
  c.getContext("2d").drawImage(im, x0, y0, x1 - x0, y1 - y0, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.9);
}

// Example rooms ship with their furniture already found and turned into product shots (no API calls).
// Built by scripts/bake_examples.js; set #nobake=1 to force a live scan instead.
let NO_BAKE = false;
async function loadBakedFurniture() {
  if (NO_BAKE || S.space.photo !== "demo" || S.existing?.photoKey === photoKey()) return;
  const key = photoKey(), ex = example();
  try {
    const r = await fetch(ex.furniture);
    if (!r.ok) return;
    const items = (await r.json()).items;
    if (photoKey() !== key) return;   // user switched photos meanwhile
    S.existing = { photoKey: key, status: "done", baked: true,
                   items: items.map(e => ({ ...e, keep: false, status: e.iso ? "done" : "error" })) };
    S.dirty = true;
  } catch { /* no baked file: the user can still scan */ }
}

async function scanFurniture() {
  if (S.existing?.status === "detecting" || S.existing?.status === "isolating") return;
  const run = S.existing = { photoKey: photoKey(), status: "detecting", items: [] };
  const alive = () => S.existing === run;
  render();
  try {
    const det = await apiPost("/api/detect", { photo: photoForApi() });
    if (!alive()) return;
    run.items = det.items.slice(0, 8).map((d, i) => ({ id: "e" + i, ...d, keep: false, status: "loading", iso: null, crop: null }));
    run.status = run.items.length ? "isolating" : "done";
    S.dirty = true; render();
    if (!run.items.length) { toast("No furniture found in this photo"); return; }
    const queue = run.items.slice();
    const worker = async () => {
      for (let e; (e = queue.shift());) {
        try {
          e.crop = await cropBox(e.box); if (alive()) renderPanel();   // one shot per group of identical pieces
          const r = await apiPost("/api/isolate", { crop: e.crop, label: e.label, description: e.description });
          e.iso = r.image; e.status = "done";
        } catch (err) { e.status = "error"; e.error = err.message; }
        if (alive()) { renderPanel(); if (S.step >= DESIGN) renderHotspots(); }
      }
    };
    await Promise.all([worker(), worker(), worker(), worker()]);
    if (alive()) { run.status = "done"; render(); toast(`Found ${run.items.length} pieces in your photo`); }
  } catch (err) {
    if (alive()) { run.status = "error"; run.error = err.message; render(); toast(err.message.slice(0, 120)); }
  }
}


function renderBoxes() {
  const layer = $("#boxes");
  const ex = S.existing?.photoKey === photoKey() ? S.existing : null;
  if (S.step !== NEEDS || !ex || !ex.items.length) { layer.innerHTML = ""; return; }
  const g = geom();
  layer.innerHTML = ex.items.flatMap(e => (e.boxes || [e.box]).map((box, k) => {
    const [y0, x0, y1, x1] = box;
    const l = g.ox + x0 / 1000 * g.dw, t = g.oy + y0 / 1000 * g.dh, w = (x1 - x0) / 1000 * g.dw, h = (y1 - y0) / 1000 * g.dh;
    return `<div class="bx ${e.keep ? "" : "ditched"}" data-ex="${e.id}" style="left:${l}px;top:${t}px;width:${w}px;height:${h}px">
      ${k === 0 ? `<span>${esc(cap(e.label))}${(e.count || 1) > 1 ? " ×" + e.count : ""}</span>` : ""}</div>`;
  })).join("");
}

// the bottom of the screen, on every step: on Needs it answers the chat, after that it talks to the designer
// (no step pills; each step has its own next button)
function renderSteps() {
  const el = $("#steps");
  const q = S.chat ? QUESTIONS[S.chat.q] : QUESTIONS[0];
  const ph = S.step !== NEEDS ? "What would you like to change?" : q ? "Or just type: budget 2500, seats 4…" : "Add anything else…";
  // every step's "next" is the → beside send (none on the last step)
  const next = ["Design my room", "Edit this design", "Shop the list"][S.step];
  const input = el.querySelector("input");
  if (!input) el.innerHTML = `<form class="chat-input bottom-chat" data-chat>
    <button type="button" class="back-arrow" data-action="back">←</button>
    <button type="button" class="needs-plus" data-action="needs-toggle">+</button>
    <input type="text" aria-label="Message">
    <button class="send" aria-label="Send">↑</button>
    <button type="button" class="next-arrow" data-action="next">→</button></form>`;
  el.querySelector("input").placeholder = ph;   // keep what's being typed across re-renders
  const arrow = el.querySelector(".next-arrow");
  const plus = el.querySelector(".needs-plus");   // Needs only: + opens the window, × (rotated +) minimizes it
  plus.hidden = S.step !== NEEDS; plus.classList.toggle("open", !S.needsMin);
  plus.classList.toggle("dot", !!(S.needsMin && S.chat && QUESTIONS[S.chat.q]));
  plus.title = S.needsMin ? "Open the chat" : "Minimize"; plus.setAttribute("aria-label", plus.title);
  const back = el.querySelector(".back-arrow");   // go back a step: left end of the bar (Needs has none)
  back.hidden = S.step === NEEDS; back.title = STEPS[S.step - 1] ? "Back to " + STEPS[S.step - 1] : ""; back.setAttribute("aria-label", back.title || "Back");
  arrow.hidden = !next; arrow.title = next || ""; arrow.setAttribute("aria-label", next || "Next");
  arrow.classList.toggle("ready", S.step !== NEEDS || !(S.chat && QUESTIONS[S.chat.q]));   // Needs: lights up once the brief is done
}
function renderSides() {
  // the side Back/Next tabs are gone: back is the ← at the left of the bottom bar, next is the → beside send
}
function renderMode() {
  // AI renders on/off: AI_RENDER_ENABLED in .env (no switch on the page)
}

function renderTopbar() {
  const t = $("#topbar");
  if (S.step < DESIGN || !S.scene || S.generating) { t.hidden = true; return; }
  const tot = sceneTotal(S.scene), has = !!currentRender();
  let action = "";
  if (S.rendering) action = `<span class="pill pill-static rendering-pill"><i class="spin"></i>Rendering with Gemini…</span>`;
  else if (!has) {
    const e = editsSinceLast(), n = e ? e.changed.length + e.removed.length : 0;
    const label = !lastRender() ? "Render" : e ? `Update render · ${n} change${n > 1 ? "s" : ""}` : "Re-render all";
    action = `<button class="pill pill-cta" data-action="render">✦ ${label}</button>`;
  }
  else action = `<button class="pill" data-action="before">${S.before ? "Show render" : "Before"}</button>`;
  if (!S.rendering) action += `<button class="pill" data-action="download-image" title="Download this image" aria-label="Download this image">↓ Download</button>`;
  t.hidden = false;
  t.innerHTML = `<span class="pill pill-static ${tot > S.needs.budget ? "over" : ""}">Total <b>${money(tot)}</b> <span style="opacity:.7">/ ${money(S.needs.budget)}</span></span>${action}`;
}

// save what's on screen (the render, or the photo when there's none yet) as a file
async function downloadImage() {
  const src = $("#room").src;
  if (!src) return;
  try {
    const blob = await (await fetch(src)).blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `elephant-room-${S.before || !currentRender() ? "photo" : "design"}.${(blob.type.split("/")[1] || "jpg").replace("jpeg", "jpg")}`;
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  } catch { window.open(src, "_blank"); }
}

function renderMeasure() {
  const m = $("#measure");
  if (S.step !== NEEDS || !S.sizeOpen) { m.hidden = true; return; }
  const [x1, y] = toScreen([10, 47]), [x2] = toScreen([90, 47]);
  Object.assign(m.style, { left: x1 + "px", top: y + "px", width: (x2 - x1) + "px" });
  m.innerHTML = `<span class="pill">Back wall · ${inch(S.space.wallIn)} (${(S.space.wallIn / 12).toFixed(1)} ft)</span>`;
  m.hidden = false;
}

function renderHotspots() {
  const box = $("#hotspots");
  if (S.step < DESIGN || !S.scene || S.generating || S.rendering || S.before || S.verifying) { box.innerHTML = ""; return; }
  const placed = [];   // label rectangles already used, to keep labels from covering each other
  const hit = r => placed.some(q => r.l < q.r + 8 && r.r > q.l - 8 && r.t < q.b + 6 && r.b > q.t - 6);
  // labels only for new products; pieces you keep ("yours") stay unlabeled (they're still in the shopping list)
  const g0 = geom(), onScreen = ([px, py]) => [Math.min(Math.max(g0.ox + px / 100 * g0.dw, 24), g0.W - 24),
                                                Math.min(Math.max(g0.oy + py / 100 * g0.dh, 24), g0.H - 24)];
  // label spot: where the render shows it (it.at); before that's known, the slot's usual spot rather than the shared default
  const spot = it => it.at || (it.pos[0] === 50 && it.pos[1] === 50
    && (TEMPLATES[S.needs.room] || TEMPLATES.living).concat(TEMPLATES.living).find(t => t.cat === it.cat)?.pos) || it.pos;
  const order = S.scene.map((it, i) => ({ it, i, xy: onScreen(spot(it)) })).filter(x => !x.it.own && !(V?.missing?.has(x.it.pid) && variantsCover())).sort((a, b) => b.xy[1] - a.xy[1]);
  const html = [];
  for (const { it, i, xy: [x, y] } of order) {
    const p = view(it);
    const label = p.owned ? `${p.name} · yours` : `${p.family || p.name} · ${money(p.price.amount)}`;
    const w = 86 + label.length * 8.2;
    let flip = x > innerWidth * 0.62, lh = 92, rect, below = false;
    const top = innerHeight * 0.06 + 72, bottom = innerHeight - 110;   // below the top bar, above the chat bar
    const rectFor = (lh, flip, dn) => {
      const l = flip ? x + 38 - w : x - 38;
      return dn ? { l, r: l + w, t: y + lh + 8, b: y + lh + 8 + 54 } : { l, r: l + w, b: y - lh - 8, t: y - lh - 8 - 54 };
    };
    const ok = r => !hit(r) && r.t >= top && r.b <= bottom;
    search: for (const dn of [false, true]) for (const tryFlip of [flip, !flip]) for (lh = 92; lh <= 92 + 64 * 3; lh += 64) {
      rect = rectFor(lh, tryFlip, dn);
      if (ok(rect)) { flip = tryFlip; below = dn; break search; }
    }
    if (!ok(rect)) { below = y < top + 160; lh = 92; rect = rectFor(lh, flip, below); }   // nothing fits: pick the side with room
    // keep the label inside the window: slide it sideways, the line stays on the dot
    const minL = 16, maxR = innerWidth - 84;   // 84: the right rail
    const dx = rect.l < minL ? minL - rect.l : rect.r > maxR ? Math.max(minL - rect.l, maxR - rect.r) : 0;
    rect = { ...rect, l: rect.l + dx, r: rect.r + dx };
    placed.push(rect);
    html.push(`<div class="hs ${S.sel === i ? "sel" : ""} ${flip ? "flip" : ""} ${below ? "below" : ""}" data-idx="${i}" style="left:${x}px;top:${y}px;--lh:${lh}px;--dx:${Math.round(dx)}px">
      <div class="hs-line"></div>
      <button class="hs-pill" data-action="select" data-idx="${i}">
        <img src="${esc(imgOf(p))}" alt="">
        <span><small>${CAT_LABEL[it.cat]}${it.qty > 1 ? " × " + it.qty : ""}${it.sketched ? " · ✎ sketched" : ""}</small><b>${esc(label)}</b></span>
      </button>
      <div class="hs-dot" data-drag="${i}" title="Drag to place"></div>
    </div>`);
  }
  box.innerHTML = html.join("");
}

function renderPanel() {
  const el = $("#panel");
  if (S.step === NEEDS) { el.innerHTML = needsCard(); afterChatRender(); renderSteps(); }
  else if (S.step === DESIGN) el.innerHTML = S.generating ? progressCard() : optionsView();
  else if (S.step === EDIT) el.innerHTML = S.sel != null ? detailCard() : editHint();
  else el.innerHTML = "";   // shop lives in the left drawer
}

/* ① needs, as a chat: one question at a time, quick-reply buttons, or just type */
// guess the room from what was found: whichever room type has the most pieces wins
const ROOM_SIGNS = {
  bedroom: ["bed", "nightstand", "wardrobe", "dresser"], dining: ["dining_table", "dining_chair", "cabinet"],
  office: ["desk", "office_chair"], living: ["sofa", "armchair", "coffee_table", "tv_stand", "side_table"],
};
const ROOM_NOUN = { living: "living room", bedroom: "bedroom", dining: "dining room", office: "office" };
const guessRoom = () => {
  const items = S.existing?.photoKey === photoKey() ? S.existing.items : [];
  if (!items.length) return null;
  const score = k => items.filter(e => ROOM_SIGNS[k].includes(e.category)).reduce((n, e) => n + (e.count || 1), 0);
  const best = Object.keys(ROOM_SIGNS).sort((a, b) => score(b) - score(a) || (b === "living") - (a === "living"))[0];
  return score(best) ? best : "living";
};
const keptCount = () => keptPieces().reduce((n, e) => n + (e.count || 1), 0);
const NOTE_CHIPS = ["Seats 4+", "Pet-friendly", "Kid-friendly", "Lots of storage", "Small space", "Easy to clean"];
const QUESTIONS = [
  { key: "room",
    ask: () => { const g = guessRoom(); return g ? `From your photo this looks like a ${ROOM_NOUN[g]}. Is that the room we're designing?` : "Which room are we designing?"; },
    chips: () => { const g = guessRoom(); return Object.entries(ROOMS).sort(([a], [b]) => (b === g) - (a === g)).map(([k, v]) => ({ label: k === g ? `Yes, ${v.toLowerCase()}` : v, val: k })); },
    apply: v => { S.needs.room = v; return ROOMS[v]; } },
  { key: "style", ask: () => "Nice. Swipe a few real pieces: → or ♥ if you'd live with it, ← or ✕ if not. Or just tap a style.",   // swipe deck: needs-swipe.js
    chips: () => STYLES.map(x => ({ label: x, val: x })), apply: v => (S.needs.style = v) },
  { key: "budget", ask: () => "What's your budget for new pieces?",
    chips: () => [1000, 2000, 3000, 5000, 8000].map(n => ({ label: money(n), val: n })),
    apply: v => { S.needs.budget = +v; return money(+v); } },
  { key: "notes", ask: () => "Anything you need or want to avoid? Tap a few, or type it.",
    chips: () => NOTE_CHIPS.filter(t => !S.needs.notes.includes(t)).map(t => ({ label: t, val: t }))
      .concat([{ label: "That's it →", val: "__done", strong: true }]),
    apply: v => { S.needs.notes = S.needs.notes ? `${S.needs.notes}, ${v}` : v; return v; }, multi: true },
];
const say = (from, text) => S.chat.log.push({ from, text });
function chatStart() {
  S.chat = { q: 0, log: [] };
  const kept = keptCount();
  say("bot", kept ? `Hi! I see your room and the ${kept} piece${kept > 1 ? "s" : ""} you're keeping. A few quick questions.`
    : S.space.photo === "demo" ? `Hi! Upload a photo of your room above, or try our example (${example().name.toLowerCase()}). A few quick questions:`
    : "Hi! A few quick questions about the room.");
  say("bot", QUESTIONS[0].ask());
}
function chatAnswer(val, label) {
  const q = QUESTIONS[S.chat.q];
  if (!q) return;
  S.dirty = true;
  if (val === "__done") { say("me", "That's it"); return chatNext(); }
  say("me", label ?? q.apply(val));
  if (label != null) q.apply(val);
  if (!q.multi) chatNext(); else say("bot", "Got it. Anything else?");
}
function chatNext() {
  S.chat.q++;
  const q = QUESTIONS[S.chat.q];
  if (q) say("bot", q.ask());
  else say("bot", "Perfect, here's your brief. Ready when you are.");
}
// free text: pull out what we can recognize (room, style, budget); everything else becomes a note
function chatFree(text) {
  const t = text.toLowerCase(), q = QUESTIONS[S.chat.q];
  const got = [];
  const room = /bed ?room/.test(t) ? "bedroom" : /dining|kitchen/.test(t) ? "dining" : /office|study|work/.test(t) ? "office" : /living|lounge/.test(t) ? "living" : null;
  if (room) { S.needs.room = room; got.push("room"); }
  const style = STYLES.find(x => t.includes(x.toLowerCase().split(" ")[0].replace("-century", ""))) ||
    (t.includes("scandi") ? "Scandinavian" : t.includes("minimal") ? "Warm minimal" : t.includes("cozy") || t.includes("cosy") ? "Cozy eclectic" : null);
  if (style) { S.needs.style = style; got.push("style"); }
  // budget: first amount >= 300 ("2500", "$3k", "1,800 dollars"); small numbers like "seats 4" are left alone
  const amt = [...t.matchAll(/\$?\s*(\d[\d,]*(?:\.\d+)?)\s*(k\b)?/g)]
    .map(x => parseFloat(x[1].replace(/,/g, "")) * (x[2] ? 1000 : 1)).find(v => v >= 300);
  if (amt) { S.needs.budget = Math.round(amt); got.push("budget"); }
  say("me", text);
  S.dirty = true;
  if (!got.length || q?.key === "notes") {
    if (!got.length) S.needs.notes = S.needs.notes ? `${S.needs.notes}, ${text}` : text;
    if (q?.key === "notes") { say("bot", "Noted. Anything else?"); return; }
    say("bot", "Noted, I'll keep that in mind.");
    say("bot", q ? q.ask() : "Anything else, or shall we design?");
    return;
  }
  // skip questions the message already answered
  say("bot", "Got it: " + got.map(k => k === "budget" ? money(S.needs.budget) : k === "room" ? ROOMS[S.needs.room].toLowerCase() : S.needs.style).join(", ") + ".");
  while (QUESTIONS[S.chat.q] && got.includes(QUESTIONS[S.chat.q].key)) S.chat.q++;
  const nq = QUESTIONS[S.chat.q];
  say("bot", nq ? nq.ask() : "Perfect, here's your brief. Ready when you are.");
}

const ELEPHANT = `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <path d="M3 17v-5c0-3.5 3-6 6.5-6H13c3.9 0 7 3 7 7v3.5c0 1.1.9 2 2 2"/><path d="M3 17h12.5M6 17v3M10 17v3M15 16v4"/>
  <path d="M13 8.5c-1.6.5-2.1 2.6-1 4.2.9 1.2 3 1.1 3.5-.3"/><circle cx="17.2" cy="10.4" r=".6" fill="currentColor"/></svg>`;

// 01 Needs: one centered window (room photo + your furniture + chat); minimized, it's the + left of the bottom input
function needsCard() {
  if (S.needsMin) return "";
  if (!S.chat || (S.chat.q === 0 && S.chat.log.length === 2)) chatStart();   // opening follows the latest photo scan
  const sp = S.space, q = QUESTIONS[S.chat.q], n = S.needs, kept = keptCount(), sk = sketched();
  const ex = S.existing?.photoKey === photoKey() ? S.existing : null;
  const demo = sp.photo === "demo";
  const total = ex ? ex.items.reduce((m, e) => m + (e.count || 1), 0) : 0;
  const strip = !ex ? `<button class="link-btn" data-action="scan">Find furniture in this photo</button>`
    : ex.status === "detecting" ? `<span class="muted"><i class="spin dark"></i> Finding your furniture…</span>`
    : ex.status === "error" ? `<button class="link-btn" data-action="scan-again">Retry furniture scan</button>`
    : `<div class="fx-head"><span>Your furniture</span><span class="muted">${kept ? `keeping ${kept} of ${total} · tap to change` : `${total} found · tap what you keep`}</span></div>
       <div class="fx-strip">${ex.items.map(e => `<button class="fx ${e.keep ? "" : "ditched"}" data-ex="${e.id}" data-action="keep-toggle" data-id="${e.id}"
           title="${esc(cap(e.label))}${e.keep ? " · tap to ditch" : " · tap to keep"}">
           <span class="fx-img">${e.iso ? `<img src="${esc(e.iso)}" alt="">` : e.crop ? `<img src="${esc(e.crop)}" alt=""><i class="shimmer"></i>` : `<i class="shimmer"></i>`}
             ${(e.count || 1) > 1 ? `<em>×${e.count}</em>` : ""}</span>
           <small>${esc(cap(e.label))}</small></button>`).join("")}</div>`;
  const brief = !q ? `<div class="brief">
      <b>${ROOMS[n.room]} · ${esc(n.style)} · ${money(n.budget)}</b>
      ${n.notes ? `<small>${esc(n.notes)}</small>` : ""}
      ${kept ? `<small>Designing around ${kept} piece${kept > 1 ? "s" : ""} you keep</small>` : ""}
      ${sk.length ? `<small>Sketched: ${esc(sk.map(s => CAT_LABEL[s.category]).join(", "))}</small>` : ""}
    </div>` : "";   // next: the → beside send at the bottom
  return `<div class="card needs-win">
    <div class="nw-head">
      <button class="photo-mini" data-action="upload" id="drop" title="Upload or drop a photo of your room"><img src="${esc(photoSrc())}" alt=""><i>↑</i></button>
      <div class="nw-title"><button class="nw-upload" data-action="upload" title="Upload or drop a photo of your room"><b>${demo ? "Upload your room ↑" : "Your room · change photo ↑"}</b></button>
        <span>${demo ? `<button class="link-btn" data-action="demo">Example: ${esc(example().name.toLowerCase())} ↻</button>` : `<button class="link-btn" data-action="demo">Use an example</button>`}
          · <button class="link-btn" data-action="size">${S.sizeOpen ? "Hide size" : "Room size"}</button>${sk.length ? ` · <button class="link-btn" data-sk="remove">Remove sketch</button>` : ""}</span></div>
      ${S.chat.log.length > 2 ? `<button class="icon-btn" data-action="chat-reset" title="Start over" aria-label="Start over">↺</button>` : ""}
      <button class="icon-btn" data-action="needs-min" title="Minimize" aria-label="Minimize">–</button>
    </div>
    ${S.sizeOpen ? `<div class="size-row">
      <label>Back wall <input type="number" min="60" max="600" value="${sp.wallIn}" data-bind="wallIn"> in</label>
      <label>Depth <input type="number" min="60" max="600" value="${sp.depthIn}" data-bind="depthIn"> in</label>
    </div>` : ""}
    <div class="nw-fx">${strip}</div>
    <div class="chat-log">${S.chat.log.map(m => `<div class="msg ${m.from}">${esc(m.text)}</div>`).join("")}
      ${q?.key === "style" ? swipeWidget() : ""}
      ${q ? `<div class="quick">${q.chips().map(c => `<button class="chip ${c.strong ? "on" : ""}" data-action="chat" data-val="${esc(c.val)}" data-label="${esc(c.label)}">${esc(c.label)}</button>`).join("")}</div>` : ""}
      ${brief}
    </div>
  </div>`;   // its input sits at the bottom of the screen (renderSteps)
}
function afterChatRender() {
  const log = $(".chat-log");
  if (log) log.scrollTop = log.scrollHeight;
}

/* ⑤ design */
function progressCard() {
  return `<div class="card card-center" style="width:400px">
    <h2>Designing…</h2>
    <p class="sub">Choosing from the real product catalogue snapshot.</p>
    <ul class="stages">${stagesText().map((t, i) =>
      `<li class="${i < S.stage ? "done" : i === S.stage ? "now" : ""}"><span class="tick">${i < S.stage ? "✓" : ""}</span>${esc(t)}</li>`).join("")}</ul>
  </div>`;
}
function optionsView() {
  return `<div class="options">${S.options.map((o, i) => {
    // sketched pieces first, so what you drew is visible on the card
    const shown = o.items.filter(it => it.sketched).concat(o.items.filter(it => !it.sketched)).slice(0, 4);
    const imgs = shown.map(it => `<img src="${esc(imgOf(view(it)))}" alt="" class="${it.sketched ? "sk-thumb" : ""}">`).join("");
    const nSk = o.items.filter(it => it.sketched).length;
    return `<button class="opt ${S.opt === i ? "on" : ""}" data-action="option" data-idx="${i}">
      <div class="grid">${imgs}</div>
      <b>Option ${i + 1} · ${o.name}</b>
      <small>${money(sceneTotal(o.items))} · ${o.items.length} pieces${nSk ? ` · ✎ ${nSk} sketched` : ""}</small>
    </button>`;
  }).join("")}</div>`;
}

/* edit */
function editHint() { return ""; }
function detailCard() {
  const it = S.scene[S.sel], base = it.own ? null : byId[it.pid], p = view(it);
  const ok = fits(p, it);
  const colorways = base ? [{ id: null, variant: base.variant, image: imgOf(base) }, ...base.variants.map(v => ({ id: v.id, variant: v.variant, image: v.image }))] : [];
  const alts = similarProducts(it);   // same 4 as the product preview; each one is pre-rendered
  return `<div class="card card-right">
    <button class="close" data-action="close" aria-label="Close">×</button>
    <img class="p-img" src="${esc(imgOf(p))}" alt="">
    <p class="p-cat">${CAT_LABEL[it.cat]}${it.qty > 1 ? " × " + it.qty : ""}</p>
    <h3 class="p-name">${esc(p.name)}</h3>
    <p class="p-var">${esc(p.variant || "")}</p>
    <p class="p-price">${p.owned ? `<span class="fit">Already yours · $0</span>` : money(p.price.amount)}${it.qty > 1 ? ` <small style="font-size:13px;color:var(--ink-soft)">each · ${money(p.price.amount * it.qty)}</small>` : ""}</p>
    <dl class="facts">
      <dt>Size</dt><dd>${dimsText(p)}</dd>
      <dt>Fit</dt><dd><span class="fit ${ok ? "" : "no"}">${ok ? "Width check passes" : "Too wide"} · max ${inch(maxWidthFor(it))} wide</span></dd>
      ${p.materials.length ? `<dt>Material</dt><dd>${esc(p.materials.slice(0, 4).join(", "))}</dd>` : ""}
    </dl>
    <div class="selection-reasons"><b>Why this is here</b><p>Within the current budget and width allowance. Width-only check; circulation and depth need verification.</p>${BriefEngine.assess(p,it.cat,B).reasons.map(id=>B.requirements.find(r=>r.id===id)).filter(Boolean).map(r=>`<p>✓ ${esc(r.text)}</p>`).join('')}${BriefEngine.active(B).filter(r=>r.effect==='design_note' && (r.category==='all'||r.category===it.cat)).map(r=>`<p>To verify: ${esc(r.text)}</p>`).join('')}</div>
    ${it.cat==='sofa'?sofaEvidence(p):''}
    ${colorways.length > 1 ? `<label class="field">Colorways · ${colorways.length}</label>
      <div class="swatches">${colorways.slice(0, colorLimit(it)).map(c =>
        `<button class="swatch ${(it.vid || null) === c.id ? "on" : ""}" data-action="colorway" data-vid="${c.id || ""}" title="${esc(c.variant)}"><img src="${esc(c.image)}" alt=""></button>`).join("")}</div>` : ""}
    <label class="field">${p.owned ? "Replace it with · real products that fit" : "Swap · alternatives that fit"}</label>
    <div class="alts">${alts.map(a =>
      `<button class="alt" data-action="swap" data-pid="${a.id}"><img src="${esc(imgOf(a))}" alt=""><b>${esc(a.name)}</b><small>${money(a.price.amount)}</small></button>`).join("")}</div>
    <div class="btn-row">
      <button class="btn ghost" data-action="remove">${p.owned ? "Ditch it" : "Remove"}</button>
      ${p.url ? `<a class="btn" href="${esc(p.url)}" target="_blank" rel="noopener">View product ↗</a>` : ""}
    </div>
  </div>`;
}

/* shop */
/* ---------------- cart: left rail -> slide-out list -> expanded grid ---------------- */
const ICON = {
  cart: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16l-1.5 11.5a2 2 0 0 1-2 1.5H7.5a2 2 0 0 1-2-1.5L4 7z"/><path d="M9 7V5.5a3 3 0 0 1 6 0V7"/></svg>`,
  grid: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="4" y="4" width="6.5" height="6.5" rx="2"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="2"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="2"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="2"/></svg>`,
  home: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="M4 11l8-6.5 8 6.5V19a1 1 0 0 1-1 1h-4.5v-5h-5v5H5a1 1 0 0 1-1-1z"/></svg>`,
  look: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/></svg>`,
  out: `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M14 5h5v5M19 5l-8 8M18 14v4a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h4"/></svg>`,
};
const toBuy = () => (S.scene || []).map((it, i) => ({ it, i })).filter(x => !x.it.own);
const keeping = () => (S.scene || []).map((it, i) => ({ it, i })).filter(x => x.it.own);

function cartSummary() {
  const tot = sceneTotal(S.scene), b = S.needs.budget, over = tot > b;
  return `<div class="sum"><span>Total</span><span>${money(tot)}</span></div>
    <div class="budget ${over ? "over" : ""}"><span>Budget ${money(b)}</span><span>${over ? money(tot - b) + " over" : money(b - tot) + " left"}</span></div>
    <div class="bar ${over ? "over" : ""}"><i style="width:${Math.min(100, tot / b * 100)}%"></i></div>`;
}
function cartRow({ it, i }) {
  const p = view(it);
  return `<li><button class="row-img" data-action="cart-item" data-idx="${i}" aria-label="Select ${esc(p.name)}"><img src="${esc(imgOf(p))}" alt=""></button>
    <div><b>${esc(p.name)}</b><small>${esc(p.owned ? CAT_LABEL[it.cat] : p.variant || "")}</small><small>${dimsText(p)}</small>${it.cat==='sofa'?`<small>${esc(sofaReason(SofaMatcher.assess(p,B)))}</small>`:''}</div>
    <div class="amt">${p.owned ? `${it.qty > 1 ? it.qty + " × " : ""}Yours` : `${it.qty > 1 ? it.qty + " × " : ""}${money(p.price.amount)}<a href="${esc(p.url)}" target="_blank" rel="noopener">${esc(p.brand)} ↗</a>`}</div></li>`;
}

function renderCart() {
  const pen = document.getElementById("skfab");   // grab the sketch pen before the rail is rebuilt, then put it back
  const on = S.step >= DESIGN && S.scene && !S.generating;
  const rail = $("#rail"), drawer = $("#drawer"), big = $("#cartx");
  if (!on) S.cart = "closed";
  rail.hidden = false;   // the rail is always on the right: shopping list (+ home once there's a design) and the sketch pen
  document.body.classList.toggle("has-rail", !!on);
  drawer.classList.toggle("open", S.cart === "open");
  big.classList.toggle("open", S.cart === "expanded");
  drawer.inert = S.cart !== "open";
  big.inert = S.cart !== "expanded";
  document.body.classList.toggle("cart-expanded", S.cart === "expanded");
  document.body.classList.toggle("cart-open", S.cart === "open");
  if (!on) {   // no design yet: the list button is there, it just explains it's empty
    rail.innerHTML = `<button class="rail-btn" data-action="cart" title="Shopping list" aria-label="Shopping list">${ICON.cart}</button>`;
    if (pen) rail.append(pen); return;
  }
  const buy = toBuy(), keep = keeping();
  const keepN = keep.reduce((n, x) => n + (x.it.qty || 1), 0);
  rail.innerHTML = `
    <button class="rail-btn ${S.step === DESIGN ? "on" : ""}" data-action="goto" data-step="${DESIGN}" title="Design options" aria-label="Design options">${ICON.home}</button>
    <button class="rail-btn ${S.cart === "open" ? "on" : ""}" data-action="cart" title="Shopping list" aria-label="Shopping list">${ICON.cart}${buy.length ? `<i class="badge">${buy.length}</i>` : ""}</button>
`;   // "see everything" lives behind the list's expand button
  if (pen) rail.append(pen);   // the sketch pen lives in the rail, under the list (sketch.js keeps it up to date)

  drawer.innerHTML = `<div class="drawer-head">
      <h2>Shopping list</h2>
      <div><button class="icon-btn" data-action="cart-expand" title="Expand" aria-label="Expand">⤢</button>
      <button class="icon-btn" data-action="cart-close" title="Close" aria-label="Close">×</button></div>
    </div>
    <p class="sub">${buy.length} to buy${keep.length ? ` · ${keepN} you keep` : ""} · ${esc(S.needs.style.toLowerCase())}</p>
    ${cartSummary()}
    <button class="btn ghost shop-launch" data-action="shop-view" data-view="room">${typeof shopRoomPreview === "function" ? shopRoomPreview() : ""}
      <span class="shop-launch-label">Explore room view <span aria-hidden="true">↗</span></span></button>
    <div class="drawer-scroll">
      ${S.options[S.opt]?.gaps?.length ? `<p class="chat-warning">Nothing fits your needs for: ${S.options[S.opt].gaps.map(c => CAT_LABEL[c].toLowerCase()).join(", ")}</p>` : ""}
      ${buy.length ? `<label class="field">To buy · ${buy.length}</label><ul class="list">${buy.map(cartRow).join("")}</ul>` : ""}
      ${keep.length ? `<label class="field">Keeping · ${keepN}</label><ul class="list">${keep.map(cartRow).join("")}</ul>` : ""}
    </div>
    <div class="btn-row sched-row">
      <span>FF&amp;E schedule</span>
      <button class="btn" data-action="schedule-pdf" title="Print the schedule, or save it as a PDF">PDF</button>
      <button class="btn ghost" data-action="schedule" title="Download the schedule as a spreadsheet file">CSV</button>
    </div>`;

  // expanded: a frosted-glass window floating over the room (visionOS style), filterable cards, product preview
  const all = (S.scene || []).map((it, i) => ({ it, i }));
  const cats = [...new Set(all.map(x => x.it.cat))];
  const f = S.cartFilter || "all", cat = cats.includes(S.cartCat) ? S.cartCat : "all";
  const chip = (key, label) => `<button class="xchip ${f === key ? "on" : ""}" data-action="cart-filter" data-f="${key}">${label}</button>`;
  const pv = S.preview != null && S.scene[S.preview] ? S.preview : null;
  const roomView = S.cartView === "room" && S.cart === "expanded";
  big.classList.toggle("previewing", pv != null);
  big.innerHTML = `<div class="x-body ${roomView ? "shop-body" : ""}" ${pv != null ? "inert" : ""}>
    <div class="x-head">
      <div><h2>Your room, itemized</h2>
        <p>${roomView ? `${esc(S.options[S.opt]?.name)} · ${esc(ROOMS[S.needs.room])}`
          : `${money(sceneTotal(S.scene))} to buy · ${buy.length} new piece${buy.length === 1 ? "" : "s"}${keep.length ? ` · ${keepN} you keep` : ""}`}</p></div>
      <div class="x-actions">
        <div class="shop-switch" role="group" aria-label="Shopping list view">
          <button class="xchip ${roomView ? "" : "on"}" data-action="shop-view" data-view="list" aria-pressed="${!roomView}">List</button>
          <button class="xchip ${roomView ? "on" : ""}" data-action="shop-view" data-view="room" aria-pressed="${roomView}">Room view</button>
        </div>
        ${roomView ? "" : `<button class="xchip x-copy" data-action="copy">Copy list</button>
        <button class="xchip" data-action="schedule-pdf" title="Print the FF&amp;E schedule, or save it as a PDF">Schedule PDF</button>
        <button class="xchip" data-action="schedule" title="Download the FF&amp;E schedule as a spreadsheet file">CSV</button>`}
        <button class="icon-btn glass" data-action="cart-collapse" title="Back to list" aria-label="Back to list">⤡</button>
        <button class="icon-btn glass" data-action="cart-close" title="Close" aria-label="Close">×</button>
      </div>
    </div>
    ${roomView ? shopRoomMarkup() : `<div class="x-tools">
      <div class="x-chips">${chip("all", "All")}${chip("buy", `To buy · ${buy.length}`)}${keep.length ? chip("keep", `Keeping · ${keepN}`) : ""}</div>
      <div class="x-drop ${S.cartMenu ? "open" : ""}">
        <button class="xchip x-drop-btn ${cat !== "all" ? "on" : ""}" data-action="cart-menu">${cat === "all" ? "All categories" : esc(CAT_LABEL[cat] || "Other")}<i><svg viewBox="0 0 12 12" width="11" height="11" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M3 4.5L6 7.5L9 4.5"/></svg></i></button>
        <div class="x-menu">${["all", ...cats].map(c => `<button class="${c === cat ? "on" : ""}" data-action="cart-cat" data-c="${c}">${c === "all" ? "All categories" : esc(CAT_LABEL[c] || "Other")}<span>${c === "all" ? all.length : all.filter(x => x.it.cat === c).length}</span></button>`).join("")}</div>
      </div>
      <label class="x-search">${ICON.look}<input type="search" placeholder="Search your room" value="${esc(S.cartQ || "")}" data-cart-search aria-label="Search">
        <button class="x-clear" data-action="cart-clear" aria-label="Clear search" ${S.cartQ ? "" : "hidden"}>×</button></label>
    </div>
    <div class="x-grid">${cartGrid()}</div>`}
  </div>
  ${pv != null ? previewMarkup(S.scene[pv], pv, stars) : ""}`;
}

function updateShopSelection() {
  const layoutTop = $(".shop-layout")?.scrollTop;
  const itemsTop = $(".shop-items")?.scrollTop;
  renderCart();
  if (layoutTop) $(".shop-layout").scrollTop = layoutTop;
  if (itemsTop) $(".shop-items").scrollTop = itemsTop;
  const button = $(`.shop-body .shop-item[data-id="${S.shopSelected}"]`);
  button?.focus({ preventScroll: true });
  button?.scrollIntoView({ block: "nearest" });
}

function closeCartPreview() {
  const index = S.preview;
  S.preview = null; S.previewAlt = null;
  renderCart();
  $(`.x-img[data-idx="${index}"]`)?.focus();
}

const stars = r => {
  if (!r || !r.value) return "";
  const full = Math.round(r.value);
  return `<span class="stars" title="${r.value} (${r.count} reviews)">${"★".repeat(full)}<i>${"★".repeat(5 - full)}</i></span>`;
};

// the cards, filtered by chip (all / to buy / keeping), category dropdown and search text
function cartGrid() {
  const all = (S.scene || []).map((it, i) => ({ it, i }));
  const f = S.cartFilter || "all", cat = S.cartCat || "all", q = (S.cartQ || "").trim().toLowerCase();
  const shown = all.filter(({ it }) => {
    if (f === "buy" && it.own) return false;
    if (f === "keep" && !it.own) return false;
    if (cat !== "all" && it.cat !== cat) return false;
    if (!q) return true;
    const p = view(it);
    return [p.name, p.family, p.type_name, p.variant, p.brand, CAT_LABEL[it.cat], p.description, p.materials.join(" ")]
      .join(" ").toLowerCase().includes(q);
  });
  if (!shown.length) return `<p class="x-empty">Nothing matches${q ? ` “${esc(S.cartQ)}”` : ""}.</p>`;
  return shown.map(({ it, i }) => {
    const p = view(it);
    return `<article class="x-card ${p.owned ? "mine" : ""}">
      <button class="x-img" data-action="cart-preview" data-idx="${i}"><img src="${esc(imgOf(p))}" alt="">${p.owned ? `<span class="tag">Yours</span>` : ""}</button>
      <b>${esc(p.owned ? p.name : p.family || p.name)}</b>
      <small>${esc(p.owned ? CAT_LABEL[it.cat] : (p.type_name || CAT_LABEL[it.cat]) + (p.variant ? ", " + p.variant : ""))} · ${dimsText(p)}</small>
      <div class="x-foot">
        <span><span class="x-price">${p.owned ? "Already yours" : `${money(p.price.amount)}<em> / piece${it.qty > 1 ? " · ×" + it.qty : ""}</em>`}</span>
          ${p.owned ? "" : stars(p.rating)}</span>
        <span class="x-btns">${p.url ? `<a class="icon-btn glass" href="${esc(p.url)}" target="_blank" rel="noopener" title="View product">${ICON.out}</a>` : ""}
          <button class="icon-btn glass big" data-action="cart-preview" data-idx="${i}" title="Preview">${ICON.look}</button></span>
      </div>
    </article>`;
  }).join("");
}

// product preview: the piece floats out in front of a glass details panel
function previewMarkup(it, i, stars) {
  // looking at an alternative? show it in place of the current piece until the user swaps or goes back
  const alt = S.previewAlt && byId[S.previewAlt] ? S.previewAlt : null;
  const shown = alt ? { cat: it.cat, qty: it.qty, pid: alt, vid: null } : it;
  const p = view(shown), base = shown.own ? null : byId[shown.pid];
  const d = p.dims_in;
  const row = (title, body, cls = "") => `<details class="pv-row ${cls}" open><summary>${title}<i>+</i></summary><div>${body}</div></details>`;   // open by default

  // finishes: the base record plus its colorways; clicking one applies it to this piece in the design
  const finishes = base ? [{ id: null, variant: base.variant, image: imgOf(base), price: base.price.amount },
    ...base.variants.map(v => ({ id: v.id, variant: v.variant, image: v.image, price: v.price }))].slice(0, colorLimit(shown)) : [];
  const curVid = alt ? null : it.vid || null;
  const finishBody = finishes.length > 1
    ? `<div class="pv-fins">${finishes.map(f => `<button class="pv-fin ${f.id === curVid ? "on" : ""}" ${alt ? "disabled" : `data-action="pv-finish" data-vid="${f.id || ""}"`}
        title="${esc(f.variant)}"><img src="${esc(f.image)}" alt=""><span>${esc(f.variant)}</span>${f.price != null && f.price !== base.price.amount ? `<em>${money(f.price)}</em>` : ""}</button>`).join("")}</div>`
    : `${esc(p.owned ? p.description?.split(/[.,]/)[0] || "As in your photo" : p.variant || "Standard")}${
        p.colors?.length ? `<span class="pv-colors">${p.colors.map(c => `<i style="background:${esc(c.hex)}" title="${esc(c.name)}"></i>`).join("")}</span>` : ""}`;

  // similar items: same category, fits the slot, closest in price (least important, so last)
  const cur = view(it);
  const similar = similarProducts(it);
  const simBody = similar.length ? `<div class="pv-sim">${similar.map(q => `<button class="pv-simcard ${q.id === alt ? "on" : ""}" data-action="pv-alt" data-pid="${q.id}">
      <span class="pv-simimg"><img src="${esc(imgOf(q))}" alt=""></span><b>${esc(q.family || q.name)}</b><small>${money(q.price.amount)}</small></button>`).join("")}</div>`
    : "<small>No other pieces in this category fit.</small>";

  return `<div class="x-preview">
    <div class="pv-media"><img src="${esc(imgOf(p))}" alt=""></div>
    <aside class="pv-panel">
      ${alt ? `<p class="pv-alt-note">Alternative to ${esc(cur.owned ? cur.name : cur.family || cur.name)} <button class="link-btn light" data-action="pv-alt-back">Back</button></p>` : ""}
      <div class="pv-top">
        <div><h3>${esc(p.owned ? p.name : p.family || p.name)}</h3>
          <p>${esc(p.owned ? CAT_LABEL[it.cat] : (p.type_name || CAT_LABEL[it.cat]) + (p.variant ? ", " + p.variant : ""))}</p></div>
        ${p.owned ? `<span class="tag">Yours</span>` : stars(p.rating)}
      </div>
      <p class="pv-desc">${esc(p.description || "")}</p>
      <div class="pv-scroll">
      ${row("Measurements", `<dl class="pv-dl"><dt>Width</dt><dd>${inch(d.width)}</dd><dt>Depth</dt><dd>${inch(d.depth)}</dd><dt>Height</dt><dd>${inch(d.height)}</dd></dl>${p.estimated ? "<small>Estimated from your photo</small>" : ""}`)}
      ${row("Materials", p.materials.length ? esc(p.materials.join(", ")) : p.owned ? "From your photo" : "Not listed")}
      ${row(finishes.length > 1 ? `Finish · ${finishes.length} options` : "Finish", finishBody)}
      ${row("Quantity", `${it.qty} ${it.qty > 1 ? "pieces" : "piece"} in this design${p.owned ? "" : ` · ${money(p.price.amount * it.qty)} total`}`)}
      ${row(`Similar items · ${similar.length}`, simBody, "pv-row-sim")}
      </div>
      <div class="pv-actions">
        ${alt ? `<button class="xchip" data-action="pv-alt-back">Back</button>
                 <button class="pv-buy" data-action="pv-swap" data-idx="${i}">Swap into design (${money(p.price.amount)})</button>`
              : `<button class="xchip" data-action="cart-item" data-idx="${i}">Show in room</button>
                 ${p.url ? `<a class="pv-buy" href="${esc(p.url)}" target="_blank" rel="noopener">View on ${esc(p.brand)} (${money(p.price.amount)}) ↗</a>`
                         : `<span class="pv-buy mine">Already yours</span>`}`}
      </div>
    </aside>
    <button class="pv-close" data-action="cart-preview-close">Close preview <span>×</span></button>
  </div>`;
}

/* ---------------- actions ---------------- */
function goto(i) {
  if(i>=DESIGN && typeof designGate==='function' && !designGate()){chatMode='setup';chatOpen=true;renderDesigner();return;}
  i = Math.max(0, Math.min(STEPS.length - 1, i));
  S.step = i; S.sel = null;
  if (i === SHOP) S.cart = "open";
  else if (S.cart === "open" && i < EDIT) S.cart = "closed";
  if (i >= DESIGN && (S.dirty || !S.options.length) && !S.generating) { S.step = DESIGN; generate(); return; }
  render();
}

function exportScene() {
  return {
    room: { width_in: S.space.wallIn, depth_in: S.space.depthIn, photo: S.space.photo === "demo" ? example().src : "upload" },
    needs: { ...S.needs, budget_usd: S.needs.budget },
    brief: B,
    layout: S.layout,
    items: S.scene.map(it => {
      const p = view(it);
      return { slot: it.cat, qty: it.qty, sku: p.id, name: p.name, variant: p.variant, price_usd: p.price.amount,
               dims_in: p.dims_in, placement: { image_pos_pct: it.pos.map(v => +v.toFixed(1)) },
               image: p.owned ? null : p.images.main, url: p.url, owned: !!p.owned };
    }),
    total_usd: sceneTotal(S.scene),
  };
}

// FF&E schedule: the room as the list a designer hands on. The 13 columns are those of a real FF&E schedule sheet;
// "Room #" stays empty (a photo has no room number) and "Drawing Ref" names the photo the design was made on.
const SCHEDULE_COLS = ["Space", "Room #", "Item #", "Item Description", "Category", "Qty", "Unit", "Spec / Notes",
                       "Vendor", "Unit Cost", "Total Cost", "Drawing Ref", "Status"];
// One list, two files: every schedule line as an object. The CSV and the printed sheet (PDF) both read it.
function scheduleItems() {
  const space = ROOMS[S.needs.room] || S.needs.room;
  const ref = S.space.photo === "demo" ? example().src.split("/").pop() : "Uploaded room photo";
  return S.scene.map((it, i) => {
    const p = view(it), q = it.qty || 1, d = p.dims_in;
    const dims = [["W", d.width], ["D", d.depth], ["H", d.height]].filter(x => x[1] != null)
      .map(x => `${x[0]} ${+(+x[1]).toFixed(1)} in`).join(" x ");
    return { space, ref, no: "FFE-" + String(i + 1).padStart(3, "0"), name: p.name, variant: p.owned ? "" : p.variant || "",
             category: CAT_LABEL[it.cat], qty: q, dims: (p.estimated && dims ? "approx. " : "") + dims,
             materials: (p.materials || []).join(", "), sku: p.owned ? "" : String(p.id).split(":").pop(),
             note: p.owned ? p.description || "" : "", url: p.url || "", vendor: p.owned ? "Existing" : p.brand,
             unit: p.owned ? null : p.price.amount, total: p.owned ? null : p.price.amount * q,
             status: p.owned ? "Existing, keep" : "Selected", owned: !!p.owned, img: imgOf(p), priced: p.scraped_at || "" };
  });
}
function scheduleRows() {
  const rows = scheduleItems().map(x => [x.space, "", x.no, x.variant ? `${x.name}, ${x.variant}` : x.name, x.category, x.qty, "EA",
    [x.dims, x.materials, x.sku && "SKU " + x.sku, x.note, x.url].filter(Boolean).join("; "), x.vendor,
    x.unit == null ? "" : x.unit.toFixed(2), x.total == null ? "" : x.total.toFixed(2), x.ref, x.status]);
  rows.push(["", "", "", "TOTAL TO BUY", "", "", "", "", "", "", sceneTotal(S.scene).toFixed(2), "", ""]);
  return rows;
}

// The same list as a page for paper: the picture, the facts, one row per piece with its photo. It is printed, and the
// browser's "Save as PDF" makes the file, so the app needs no PDF library. Styles: the print block in style.css.
const usd = n => "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
function scheduleSheet() {
  const items = scheduleItems(), tot = sceneTotal(S.scene), b = S.needs.budget, over = tot > b;
  const buy = items.filter(x => !x.owned), keepN = items.filter(x => x.owned).reduce((n, x) => n + x.qty, 0);
  const priced = buy.map(x => x.priced).sort().pop();
  const day = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const fact = (k, v, cls = "") => `<div class="${cls}"><dt>${k}</dt><dd>${v}</dd></div>`;
  const row = x => `<tr>
      <td><img src="${esc(x.img)}" alt=""></td>
      <td class="no">${x.no}</td>
      <td class="name"><b>${esc(x.name)}</b>${x.variant ? `<small>${esc(x.variant)}</small>` : ""}</td>
      <td>${esc(x.category)}</td>
      <td class="n">${x.qty}</td>
      <td class="spec">${esc([x.dims, x.materials, x.note].filter(Boolean).join(" · "))}${x.sku ? `<small>SKU ${esc(x.sku)}</small>` : ""}</td>
      <td>${x.url ? `<a href="${esc(x.url)}">${esc(x.vendor)}</a>` : esc(x.vendor)}</td>
      <td class="n">${x.unit == null ? "" : usd(x.unit)}</td>
      <td class="n">${x.total == null ? "" : usd(x.total)}</td>
      <td><span class="sh-pill ${x.owned ? "keep" : ""}">${x.status}</span></td>
    </tr>`;
  return `<header class="sh-head">
      <div>
        <div class="sh-brand">The Elephant in the Room</div>
        <h1>FF&amp;E schedule</h1>
        <p class="sh-meta">${esc(items[0]?.space || "")} · ${esc(S.needs.style.toLowerCase())} · ${day}</p>
        <dl class="sh-facts">
          ${fact("To buy", `${buy.length} piece${buy.length === 1 ? "" : "s"}`)}
          ${fact("Keeping", keepN)}
          ${fact("Total", usd(tot))}
          ${fact("Budget", `${money(b)} · ${over ? money(tot - b) + " over" : money(b - tot) + " left"}`, over ? "over" : "")}
        </dl>
      </div>
      <img class="sh-room" src="${esc(room.currentSrc || room.src)}" alt="">
    </header>
    <table class="sh-table">
      <thead><tr><th></th><th>Item #</th><th>Item</th><th>Category</th><th class="n">Qty</th><th>Spec / notes</th><th>Vendor</th>
        <th class="n">Unit cost</th><th class="n">Total</th><th>Status</th></tr></thead>
      <tbody>${items.map(row).join("")}</tbody>
      <tfoot><tr><td colspan="8">Total to buy</td><td class="n">${usd(tot)}</td><td></td></tr></tfoot>
    </table>
    <p class="sh-foot">${priced ? `Prices and sizes as listed by the retailer on ${esc(priced)}. ` : ""}Sizes of kept pieces are estimates from the photo. Drawing ref: ${esc(items[0]?.ref || "")}.</p>`;
}
async function printSchedule() {
  const sheet = $("#sheet"), title = document.title;
  sheet.innerHTML = scheduleSheet();
  await Promise.all([...sheet.querySelectorAll("img")].map(im => im.decode().catch(() => {})));   // photos in before the dialog opens
  document.title = `FF&E schedule - ${ROOMS[S.needs.room] || S.needs.room}`;                      // the PDF's default file name
  addEventListener("afterprint", () => { document.title = title; sheet.innerHTML = ""; }, { once: true });
  print();
}
// A cell that starts like a formula gets a leading quote, so a spreadsheet shows it as text instead of running it.
const csvCell = v => {
  let s = String(v ?? "");
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};
const toCsv = rows => "﻿" + rows.map(r => r.map(csvCell).join(",")).join("\r\n") + "\r\n";   // BOM: Excel reads UTF-8

function saveFile(name, text, type) {
  const link = Object.assign(document.createElement("a"), { href: URL.createObjectURL(new Blob([text], { type })), download: name });
  link.click(); URL.revokeObjectURL(link.href);
}

// click on empty room / empty space around a window -> hide every open window
const EMPTY_SPOTS = "#room, #shade, #view, #backdrop, #stage, .frame, .x-preview, .cartx.previewing";
function dismissAll() {
  if (S.step === NEEDS && !S.needsMin) { S.needsMin = true; render(); return true; }
  if (S.preview == null && S.cart === "closed" && S.sel == null && !S.cartMenu) return false;
  S.preview = null; S.previewAlt = null; S.cart = "closed"; S.sel = null; S.cartMenu = false;
  render();
  return true;
}

document.addEventListener("click", e => {
  if (e.target.matches(EMPTY_SPOTS) && dismissAll()) return;
  if (S.cartMenu && !e.target.closest(".x-drop")) { S.cartMenu = false; $(".x-drop")?.classList.remove("open"); }
  const a = e.target.closest("[data-action]");
  if (!a) return;
  const act = a.dataset.action;
  if (act === "goto") goto(+a.dataset.step);
  else if (act === "next") goto(S.step + 1);
  else if (act === "back") goto(S.step - 1);
  else if (act === "set") { S.needs[a.dataset.key] = a.dataset.val; S.dirty = true; renderPanel(); }
  else if (act === "upload") $("#file").click();
  else if (act === "download-image") downloadImage();
  else if (act === "demo") {
    if (S.space.photo === "demo") S.space.ex = (S.space.ex + 1) % EXAMPLES.length;
    B.observations=[]; B.annotations=[]; S.last=null; S.renders={}; S.existing=null;
    S.space.photo = "demo"; S.space.data = null; S.dirty = true;
    if (!S.chat || S.chat.q === 0) S.needs.room = example().room;   // until the user picks a room in the chat
    showImage(); render();
    loadBakedFurniture().then(render);
  }
  else if (act === "option") {
    S.opt = +a.dataset.idx; S.scene = structuredClone(S.options[S.opt].items);
    S.shopSelected = null;
    syncLayout(); saveBrief(); render(); renderScene();
  }
  else if (act === "render") renderScene(true);
  else if (act === "chat") {
    const v = a.dataset.val, q = QUESTIONS[S.chat.q];
    chatAnswer(q?.key === "budget" ? +v : v, v === "__done" ? null : a.dataset.label); renderPanel();
  } else if (act === "chat-reset") { S.chat = null; swipeReset(); renderPanel(); }
  else if (act === "size") { S.sizeOpen = !S.sizeOpen; renderPanel(); renderMeasure(); }
  else if (act === "scan" || act === "scan-again") { if (act === "scan-again") S.existing = null; scanFurniture(); }
  else if (act === "keep-toggle") {
    const e = exById(a.dataset.id); e.keep = !e.keep; S.dirty = true; renderPanel(); renderBoxes();
  }
  else if (act === "needs-min") { S.needsMin = true; render(); }
  else if (act === "needs-open") { S.needsMin = false; render(); }
  else if (act === "needs-toggle") { S.needsMin = !S.needsMin; render(); }
  else if (act === "keep") {
    const e = exById(a.dataset.id); e.keep = a.dataset.keep === "1"; S.dirty = true; renderPanel(); renderBoxes();
  }
  else if (act === "before") { S.before = !S.before; render(); }
  else if (act === "select") { S.sel = +a.dataset.idx; if (S.step !== EDIT) S.step = EDIT; render(); }
  else if (act === "close") { S.sel = null; render(); }
  else if (act === "swap") {
    try{changeSceneProduct(S.sel,a.dataset.pid,null);}catch(e){toast(e.message);}
  } else if (act === "colorway") {
    try{changeSceneProduct(S.sel,S.scene[S.sel].pid,a.dataset.vid||null);}catch(e){toast(e.message);}
  } else if (act === "remove") {
    const [it] = S.scene.splice(S.sel, 1); recordEdit(`I removed ${view(it).name} from this design.`); S.removedCategories.push(it.cat); S.sel = null;
    if (it.own && exById(it.own)) exById(it.own).keep = false;
    render();
    syncLayout();saveBrief();renderDesigner();toast(`Removed ${CAT_LABEL[it.cat].toLowerCase()}`);
  } else if (act === "labels") document.body.classList.toggle("no-labels");
  else if (act === "live") {
    setLive(!S.live);
    render(); toast(S.live ? "AI renders on: each render costs about $0.07" : "Demo renders: no AI spend");
  }
  else if (act === "cart") {
    if (!(S.step >= DESIGN && S.scene && !S.generating)) { toast(S.generating ? "Your list is on its way: the designs are almost ready." : "Your shopping list fills up once you pick a design. Press → to design your room."); return; }
    S.cart = S.cart === "open" ? "closed" : "open"; renderCart();
  }
  else if (act === "cart-expand") { S.cart = "expanded"; S.cartView = "list"; renderCart(); }
  else if (act === "shop-view") {
    S.cart = "expanded"; S.cartView = a.dataset.view; S.cartMenu = false;
    S.preview = null; S.previewAlt = null;
    renderCart();
    $(`#cartx [data-view="${S.cartView}"]`)?.focus();
  }
  else if (act === "shop-pick") {
    S.shopSelected = +a.dataset.id;
    updateShopSelection();
  }
  else if (act === "cart-collapse") { S.cart = "open"; S.preview = null; renderCart(); }
  else if (act === "cart-close") { S.cart = "closed"; S.preview = null; renderCart(); }
  else if (act === "cart-filter") { S.cartFilter = a.dataset.f; renderCart(); }
  else if (act === "cart-menu") { S.cartMenu = !S.cartMenu; $(".x-drop")?.classList.toggle("open", S.cartMenu); }
  else if (act === "cart-clear") { S.cartQ = ""; renderCart(); $("[data-cart-search]")?.focus(); }
  else if (act === "cart-cat") { S.cartCat = a.dataset.c; S.cartMenu = false; renderCart(); }
  else if (act === "cart-preview") {
    S.preview = +a.dataset.idx; S.previewAlt = null; renderCart();
    $(".pv-close")?.focus({ preventScroll: true });
  }
  else if (act === "cart-preview-close") closeCartPreview();
  else if (act === "pv-finish") {
    const it = S.scene[S.preview]; it.vid = a.dataset.vid || null; render();
    colorPicked(it);
  }
  else if (act === "pv-alt") { S.previewAlt = a.dataset.pid; renderCart(); $(".pv-scroll") && ($(".pv-scroll").scrollTop = 0); }
  else if (act === "pv-alt-back") { S.previewAlt = null; renderCart(); }
  else if (act === "pv-swap") {
    const it = S.scene[+a.dataset.idx], wasOwn = it.own; it.pid = S.previewAlt; it.vid = null; delete it.own; S.previewAlt = null; render();
    if (wasOwn) toast(`Swapped to ${byId[it.pid].name} · click Update render to see it`); else previewPicked(it);
  }
  else if (act === "cart-item") {
    S.sel = +a.dataset.idx; S.step = EDIT; S.cart = "closed"; S.preview = null; S.previewAlt = null;
    render();
  }
  else if (act === "copy") {
    const txt = S.scene.filter(it => !it.own).map(it => { const p = view(it); return `${it.qty > 1 ? it.qty + "× " : ""}${p.name} (${p.variant}) — ${money(p.price.amount)} — ${p.url}`; }).join("\n")
      + `\nTotal: ${money(sceneTotal(S.scene))}`;
    navigator.clipboard.writeText(txt).then(() => toast("Shopping list copied"), () => toast("Copy failed"));
  } else if (act === "download") {
    saveFile("scene.json", JSON.stringify(exportScene(), null, 2), "application/json");
  } else if (act === "schedule") {
    saveFile("ffe-schedule.csv", toCsv([SCHEDULE_COLS, ...scheduleRows()]), "text/csv;charset=utf-8");
    toast("FF&E schedule downloaded");
  } else if (act === "schedule-pdf") printSchedule();
});

document.addEventListener("input", e => {
  if (e.target.matches("[data-cart-search]")) {
    S.cartQ = e.target.value; $(".x-grid").innerHTML = cartGrid(); $(".x-clear").hidden = !S.cartQ; return;
  }
  const k = e.target.dataset.bind;
  if (!k) return;
  if (k === "notes") { S.needs.notes = e.target.value; S.dirty = true; return; }
  if (k === "budget") { S.needs.budget = +e.target.value; e.target.nextElementSibling.textContent = money(S.needs.budget); S.dirty = true; return; }
  if (k === "wallIn" || k === "depthIn") {
    const v = +e.target.value; if (!v) return;
    S.space[k] = v; S.dirty = true;
    renderMeasure();
  }
});

/* photo upload (click or drop anywhere on the space step) */
function loadPhoto(file) {
  if (!file || !file.type.startsWith("image/")) return;
  const r = new FileReader();
  r.onload = () => {
    // downscale big phone photos before they go to the render API
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, 1600 / Math.max(img.width, img.height));
      const c = Object.assign(document.createElement("canvas"), { width: img.width * k, height: img.height * k });
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      S.space.data = c.toDataURL("image/jpeg", 0.9); S.space.photo = "upload"; S.dirty = true;
      B.observations=[]; B.annotations=[]; S.last=null; S.renders={}; S.existing=null; S.space.confirmed=false;S.scene=null;S.options=[];S.layout=null;layoutOpen=false;S.sel=null;B.setupApproved=false;chatMode='conversation';chatOpen=false;
      if(typeof selectedObject!=='undefined'){selectedObject=null;objectNotice='';renderObjectSelection();}
      saveBrief(); render(); startPhotoConversation();
    };
    img.src = r.result;
  };
  r.readAsDataURL(file);
}
document.addEventListener("submit", e => {   // the Needs chat input at the bottom
  if (!e.target.matches("[data-chat]")) return;
  e.preventDefault();
  const input = e.target.querySelector("input"), text = input.value.trim();
  if (!text) return;
  input.value = "";
  if (S.step !== NEEDS && typeof sendDesigner === "function") { chatDraft = text; sendDesigner(); return; }   // designer.js
  S.needsMin = false;
  chatFree(text); render();
  $(".bottom-chat input")?.focus();
});
$("#file").addEventListener("change", e => { const file=e.target.files[0]; e.target.value=""; loadPhoto(file); });
addEventListener("dragover", e => { if (S.step === NEEDS) { e.preventDefault(); $("#drop")?.classList.add("over"); } });
addEventListener("dragleave", () => $("#drop")?.classList.remove("over"));
addEventListener("drop", e => { if (S.step === NEEDS) { e.preventDefault(); loadPhoto(e.dataTransfer.files[0]); } });

/* hover a piece in the panel -> highlight its box on the photo */
document.addEventListener("mouseover", e => {
  const card = e.target.closest("[data-ex]");
  document.querySelectorAll(".bx.hl").forEach(b => b.classList.remove("hl"));
  if (card) document.querySelectorAll(`.bx[data-ex="${card.dataset.ex}"]`).forEach(b => b.classList.add("hl"));
});

/* drag pins */
let drag = null;
document.addEventListener("pointerdown", e => {
  const d = e.target.closest("[data-drag]");
  if (!d) return;
  drag = { i: +d.dataset.drag, el: d.parentElement };
  d.setPointerCapture(e.pointerId);
});
document.addEventListener("pointermove", e => {
  if (!drag) return;
  drag.el.style.left = e.clientX + "px"; drag.el.style.top = e.clientY + "px";
  S.scene[drag.i].pos = toImage(e.clientX, e.clientY); delete S.scene[drag.i].at;
});
document.addEventListener("pointerup", () => { if (drag) { drag = null; renderHotspots(); } });

addEventListener("keydown", e => {
  if (/INPUT|TEXTAREA/.test(document.activeElement.tagName)) return;
  if (e.key === "ArrowRight") goto(S.step + 1);
  if (e.key === "ArrowLeft") goto(S.step - 1);
  if (e.key === "Escape" && S.preview != null) closeCartPreview();
  else if (e.key === "Escape" && S.cart !== "closed") { S.cart = S.cart === "expanded" ? "open" : "closed"; renderCart(); }
  else if (e.key === "Escape" && S.sel != null) { S.sel = null; render(); }
});
addEventListener("resize", () => { geom(); renderHotspots(); renderMeasure(); renderBoxes(); renderDiagnosis(); });
room.addEventListener("load", () => { geom(); renderHotspots(); renderMeasure(); renderBoxes(); renderDiagnosis(); });

/* ---------------- boot ---------------- */
Promise.all([
  ...['../data/products.json','../data/sofa-annotations.json','../schema/sofa-ontology.json'].map(url=>fetch(url).then(r=>{if(!r.ok)throw Error(r.status);return r.json();})),
  fetch(API_BASE + '/api/render', { cache: 'no-store' }).then(r => r.ok ? r.json() : null).catch(() => null),
])
  .then(([d,annotations,ontology,health]) => {
    SofaMatcher.configure(ontology,annotations,d);
    P = d; byId = Object.fromEntries(d.map(p => [p.id, p]));
    restoreDesignerProject();
    const config = health?.renderConfig;
    if (typeof config?.aiEnabled === 'boolean') S.live = config.aiEnabled;
    // deep link for demos: #room=bedroom&step=3&sel=0
    const h = new URLSearchParams(location.hash.slice(1));
    if (h.has("ex") && EXAMPLES[+h.get("ex")]) { S.space.ex = +h.get("ex"); S.needs.room = example().room; }   // #ex=1 = bar counter
    NO_BAKE = h.has("nobake");
    MOCK_VARIANTS = h.has("variantsmock");
    SOFA_WIDE_NEW = h.has("sofawide");
    ONLY_SKETCH_NEW = (config?.demoCacheOnly ?? true) && !h.has("newrenders");
    return loadBakedFurniture().then(() => h);
  })
  .then(h => {
    if (ROOMS[h.get("room")]) S.needs.room = h.get("room");
    const step = +h.get("step") || 0;
    if (step >= DESIGN && designGate()) {
      S.options = planOptions(); S.opt = Math.min(+h.get("opt") || 0, 2); S.scene = structuredClone(S.options[S.opt].items); S.dirty = false;
      if (h.has("sel")) S.sel = +h.get("sel");
    }
    S.step = step && S.scene ? Math.min(step, STEPS.length - 1) : NEEDS;   // always open on Needs (a saved design stays loaded); #step=N still deep-links
    if (S.step === SHOP) S.cart = "open";
    if (h.has("live")) S.live = h.get("live") !== "0";
    if (["open", "expanded"].includes(h.get("cart"))) S.cart = h.get("cart");   // #step=3&cart=expanded
    if (h.get("cart") === "room" && S.scene) { S.cart = "expanded"; S.cartView = "room"; }
    render();
    const after = () => { if (h.has("render") && S.scene) renderScene(); };   // #step=3&render=1
    if (h.has("scan")) {                                                       // #step=1&scan=1
      scanFurniture().then(() => {
        if (step >= DESIGN && designGate()) { S.options = planOptions(); S.scene = structuredClone(S.options[0].items); render(); }
        after();
      });
    } else after();
  })
  .catch(() => {
    $("#panel").innerHTML = `<div class="card card-center"><h2>Can't load product data</h2>
      <p class="sub">Run a local server from the repo root:<br><code>python3 -m http.server 8000</code><br>then open <code>http://localhost:8000/app/</code></p></div>`;
  });
window.elephantState = S;   // read by scripts/bake_examples.js
render();
