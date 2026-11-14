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

const STEPS = ["Needs", "Space", "Design", "Edit", "Shop"];

const ROOMS = {
  living: "Living room", bedroom: "Bedroom", dining: "Dining", office: "Office",
};
const STYLES = ["Warm minimal", "Japandi", "Scandinavian", "Mid-century", "Industrial", "Cozy eclectic"];

const CAT_LABEL = {
  sofa: "Sofa", armchair: "Armchair", bed: "Bed", dining_table: "Dining table", coffee_table: "Coffee table",
  side_table: "Side table", desk: "Desk", office_chair: "Office chair", dining_chair: "Dining chair",
  stool_bench: "Bench", dresser: "Dresser", nightstand: "Nightstand", wardrobe: "Wardrobe", shelving: "Shelving",
  tv_stand: "TV stand", cabinet: "Sideboard", floor_lamp: "Floor lamp", table_lamp: "Table lamp",
  pendant_lamp: "Pendant lamp", rug: "Rug", mirror: "Mirror", other: "Other",
};

// Slots per room type. share = share of budget, maxW = max width as a fraction of the wall,
// pos = default pin position on the photo (% of image). Pins can be dragged to match any photo.
const TEMPLATES = {
  living: [
    { cat: "sofa", share: .36, maxW: .75, pos: [47, 53] },
    { cat: "coffee_table", share: .10, maxW: .40, pos: [53, 72] },
    { cat: "armchair", share: .14, maxW: .35, pos: [13, 72] },
    { cat: "rug", share: .12, maxW: .80, pos: [32, 88] },
    { cat: "floor_lamp", share: .06, maxW: .20, pos: [77, 30] },
    { cat: "pendant_lamp", share: .06, maxW: .30, pos: [50, 20] },
    { cat: "shelving", share: .08, maxW: .40, pos: [9, 26] },
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
    { cat: "dining_table", share: .34, maxW: .55, pos: [50, 66] },
    { cat: "dining_chair", share: .26, maxW: .20, pos: [28, 72], qty: 4 },
    { cat: "cabinet", share: .20, maxW: .45, pos: [84, 50] },
    { cat: "pendant_lamp", share: .08, maxW: .30, pos: [50, 20] },
    { cat: "rug", share: .10, maxW: .80, pos: [62, 90] },
  ],
  office: [
    { cat: "desk", share: .34, maxW: .55, pos: [50, 62] },
    { cat: "office_chair", share: .26, maxW: .25, pos: [40, 78] },
    { cat: "shelving", share: .16, maxW: .40, pos: [84, 38] },
    { cat: "table_lamp", share: .06, maxW: .15, pos: [30, 46] },
    { cat: "rug", share: .10, maxW: .80, pos: [62, 90] },
  ],
};

const STRATEGIES = [
  { key: "essentials", name: "Essentials", target: 0.45 },
  { key: "balanced", name: "Balanced", target: 0.85 },
  { key: "statement", name: "Statement", target: 1.2 },
];

const S = {
  step: 0,
  needs: { room: "living", style: "Warm minimal", budget: 3000, notes: "", mode: "non-pro" },
  space: { wallIn: 144, depthIn: 132, photo: "demo" },
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
  existing: null,      // furniture found in the user's photo: {photoKey, status, items:[{id,label,category,box,iso,keep,…}]}
  before: false,       // show the original photo instead of the render
};

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
           description: `${p.name} in ${v.variant}` };
}
const slotOf = item => TEMPLATES[S.needs.room].find(t => t.cat === item.cat) || { maxW: 1 };
const maxWidthFor = item => slotOf(item).maxW * S.space.wallIn;
const fits = (p, item) => p.dims_in.width == null || p.dims_in.width <= maxWidthFor(item);
const sceneTotal = items => items.reduce((s, it) => s + view(it).price.amount * (it.qty || 1), 0);

function toast(msg) {
  const t = $("#toast");
  t.textContent = msg; t.hidden = false;
  clearTimeout(toast._t); toast._t = setTimeout(() => (t.hidden = true), 2200);
}

/* ---------------- image <-> screen mapping (object-fit: cover, position 50% 40%) ---------------- */
function geom() {
  const W = innerWidth, H = innerHeight, nw = room.naturalWidth || 1, nh = room.naturalHeight || 1;
  const sc = Math.max(W / nw, H / nh), dw = nw * sc, dh = nh * sc;
  return { dw, dh, ox: (W - dw) * 0.5, oy: (H - dh) * 0.4, W, H };
}
function toScreen([px, py]) {
  const g = geom();
  const small = innerWidth < 820;
  const fy = small ? 16 : innerHeight * 0.06, fx = small ? 16 : innerWidth * 0.05;
  // keep pins inside the frame so labels never fall off-screen or under the top bar / bottom pills
  const bottomGap = S.step === 2 && !small ? 330 : 110;
  const x = Math.min(Math.max(g.ox + px / 100 * g.dw, fx + 80), g.W - fx - 80);
  const y = Math.min(Math.max(g.oy + py / 100 * g.dh, fy + 230), g.H - fy - bottomGap);
  return [x, y];
}
function toImage(x, y) {
  const g = geom();
  return [((x - g.ox) / g.dw) * 100, ((y - g.oy) / g.dh) * 100];
}

/* ---------------- ⑤ the planner (MOCK of the AI layout agent) ---------------- */
const keptPieces = () => S.existing?.photoKey === photoKey() ? S.existing.items.filter(e => e.keep && e.status !== "error") : [];
const boxCenter = b => [(b[1] + b[3]) / 20, (b[0] + b[2]) / 20];   // box 0-1000 -> image %
const ownedItem = e => ({ cat: CAT_LABEL[e.category] && e.category !== "other" ? e.category : "other", qty: 1,
                          own: e.id, pid: null, vid: null, pos: boxCenter(e.box) });

function planOptions() {
  const tpl = TEMPLATES[S.needs.room];
  const used = {};
  const kept = keptPieces();
  return STRATEGIES.map(strat => {
    const usedOwn = new Set();
    const items = tpl.map(slot => {
      const mine = kept.find(e => e.category === slot.cat && !usedOwn.has(e.id));
      if (mine) { usedOwn.add(mine.id); return ownedItem(mine); }   // you already have one: keep it, don't buy
      return null;
    }).map((own, k) => own || tpl[k]).map(slot => {
      if (slot.own) return slot;
      const budget = S.needs.budget * slot.share / (slot.qty || 1);
      const maxW = slot.maxW * S.space.wallIn;
      let pool = P.filter(p => p.category === slot.cat && (p.dims_in.width == null || p.dims_in.width <= maxW));
      if (!pool.length) pool = P.filter(p => p.category === slot.cat);
      const fresh = pool.filter(p => !(used[slot.cat] || []).includes(p.id));
      const cands = (fresh.length ? fresh : pool).filter(p => p.price.amount <= budget * 1.35);
      const list = cands.length ? cands : pool.slice().sort((a, b) => a.price.amount - b.price.amount).slice(0, 1);
      const target = budget * strat.target;
      const pick = list.slice().sort((a, b) => Math.abs(a.price.amount - target) - Math.abs(b.price.amount - target))[0];
      (used[slot.cat] = used[slot.cat] || []).push(pick.id);
      return { cat: slot.cat, qty: slot.qty || 1, pid: pick.id, vid: null, pos: slot.pos.slice() };
    });
    kept.filter(e => !usedOwn.has(e.id)).forEach(e => items.push(ownedItem(e)));   // other pieces you keep
    return { name: strat.name, items };
  });
}

function generate() {
  S.generating = true; S.stage = 0; S.sel = null;
  render();
  const n = stagesText().length;
  const tick = () => {
    S.stage++;
    if (S.stage >= n) {
      S.options = planOptions(); S.opt = 0;
      S.scene = structuredClone(S.options[0].items);
      S.generating = false; S.dirty = false;
      render();
      renderScene();
      return;
    }
    renderPanel();
    setTimeout(tick, 520);
  };
  setTimeout(tick, 520);
}
function stagesText() {
  return [
    `Reading your needs · ${S.needs.style.toLowerCase()}, ${money(S.needs.budget)}`,
    `Scaling the room · back wall ${inch(S.space.wallIn)}`,
    ...(keptPieces().length ? [`Keeping ${keptPieces().length} of your pieces`] : []),
    `Searching ${P.length} real products`,
    "Checking fit and budget",
    "Composing 3 options",
  ];
}

/* ---------------- rendering ---------------- */
function render() {
  document.body.classList.toggle("dim", S.step < 2 || S.generating);
  document.body.classList.toggle("rendering", S.rendering);
  showImage();
  renderSteps(); renderSides(); renderPanel(); renderHotspots(); renderMeasure(); renderBoxes(); renderTopbar();
}

/* ---------------- real render via server.py -> Gemini ---------------- */
const photoSrc = () => S.space.photo === "demo" ? "assets/demo-room.jpg" : S.space.data;
const sceneSig = () => JSON.stringify([S.space.photo === "demo" ? "demo" : S.space.data.length, S.space.wallIn,
  S.needs.style, S.scene.map(it => [it.pid, it.vid, it.qty, it.own])]);
const currentRender = () => S.scene && S.renders[sceneSig()];
const photoKey = () => S.space.photo === "demo" ? "demo" : String(S.space.data.length);
// the latest render for this photo; kept on screen after edits until the user updates it
const lastRender = () => S.last && S.last.photoKey === photoKey() ? S.last : null;

function showImage() {
  const r = S.step >= 2 && !S.before && (currentRender() || lastRender()?.image);
  const want = r || photoSrc();
  if (room.dataset.src !== want) { room.dataset.src = want; room.src = want; }
}

function itemPayload(it) {
  const p = view(it);
  return { name: p.name, variant: p.variant, category: CAT_LABEL[it.cat], qty: it.qty, dims_in: p.dims_in,
           description: p.description, image: p.images.main_local || p.images.main, pos: it.pos.map(Math.round) };
}

// What changed since the last render? null = too different, do a full render instead.
function editsSinceLast() {
  const L = lastRender();
  if (!L || L.wallIn !== S.space.wallIn || L.style !== S.needs.style) return null;
  const before = Object.fromEntries(L.items.map(it => [it.cat, it]));
  const now = Object.fromEntries(S.scene.map(it => [it.cat, it]));
  const same = (a, b) => a.pid === b.pid && a.vid === b.vid && a.own === b.own;
  const changed = S.scene.filter(it => !before[it.cat] || !same(before[it.cat], it))
    .map(it => ({ ...itemPayload(it), replaces: before[it.cat] ? view(before[it.cat]).name : null }));
  const removed = L.items.filter(it => !now[it.cat]).map(it => ({ category: CAT_LABEL[it.cat], name: view(it).name }));
  const n = changed.length + removed.length;
  return n && n <= 3 ? { changed, removed } : null;
}

function renderRequest() {
  const base = { room: { width_in: S.space.wallIn, depth_in: S.space.depthIn }, needs: { style: S.needs.style } };
  const edits = editsSinceLast();
  if (edits) {
    // edit mode: start from the current render and change only these pieces (keeps everything else stable)
    return { ...base, mode: "edit", base_image: lastRender().image, items: edits.changed, removed: edits.removed };
  }
  const ex = S.existing?.photoKey === photoKey() ? S.existing.items : [];
  const here = e => ({ label: e.label, category: e.category, pos: boxCenter(e.box).map(Math.round) });
  return { ...base, room_image: S.space.photo === "demo" ? "app/assets/demo-room.jpg" : S.space.data,
           items: S.scene.filter(it => !it.own).map(itemPayload),
           keep: S.scene.filter(it => it.own && exById(it.own)).map(it => here(exById(it.own))),
           remove_existing: ex.filter(e => !S.scene.some(it => it.own === e.id)).map(here) };
}

function rememberRender(sig, image) {
  S.renders[sig] = image;
  S.last = { image, photoKey: photoKey(), wallIn: S.space.wallIn, style: S.needs.style,
             items: structuredClone(S.scene) };
}

// remembered per browser so teammates only type it once
const passcode = {
  get() { try { return localStorage.getItem("elephant-passcode") || ""; } catch { return ""; } },
  set(v) { try { localStorage.setItem("elephant-passcode", v); } catch { /* private mode: ask again next time */ } },
};

async function apiPost(path, obj) {
  const body = JSON.stringify(obj);
  const call = () => fetch(path, { method: "POST", body,
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

async function renderScene() {
  if (S.rendering || !S.scene || !S.scene.length) return;
  const sig = sceneSig();
  if (S.renders[sig]) { rememberRender(sig, S.renders[sig]); S.before = false; render(); return; }
  const reqObj = renderRequest();
  if (reqObj.mode !== "edit" && !reqObj.items.length && !(reqObj.remove_existing || []).length) {
    S.before = true; render(); toast("You're keeping everything, so there's nothing new to render yet");   // don't pay for a copy
    return;
  }
  S.rendering = true; S.before = false; render();
  try {
    const j = await apiPost("/api/render", reqObj);
    rememberRender(sig, j.image);
    const what = reqObj.mode === "edit" ? `Updated ${reqObj.items.length + reqObj.removed.length} piece(s)` : "Rendered";
    toast(j.cached ? "Loaded saved render" : `${what} in ${(j.ms / 1000).toFixed(1)}s`);
  } catch (e) {
    toast(e.message.slice(0, 120));
  } finally {
    S.rendering = false; render();
  }
}

/* ---------------- existing furniture: detect -> crop -> white-background isometric shot ---------------- */
const photoForApi = () => S.space.photo === "demo" ? "app/assets/demo-room.jpg" : S.space.data;
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

async function scanFurniture() {
  if (S.existing?.status === "detecting" || S.existing?.status === "isolating") return;
  const run = S.existing = { photoKey: photoKey(), status: "detecting", items: [] };
  const alive = () => S.existing === run;
  render();
  try {
    const det = await apiPost("/api/detect", { photo: photoForApi() });
    if (!alive()) return;
    run.items = det.items.slice(0, 8).map((d, i) => ({ id: "e" + i, ...d, keep: true, status: "loading", iso: null, crop: null }));
    run.status = run.items.length ? "isolating" : "done";
    S.dirty = true; render();
    if (!run.items.length) { toast("No furniture found in this photo"); return; }
    const queue = run.items.slice();
    const worker = async () => {
      for (let e; (e = queue.shift());) {
        try {
          e.crop = await cropBox(e.box); if (alive()) renderPanel();
          const r = await apiPost("/api/isolate", { crop: e.crop, label: e.label, description: e.description });
          e.iso = r.image; e.status = "done";
        } catch (err) { e.status = "error"; e.error = err.message; }
        if (alive()) { renderPanel(); if (S.step >= 2) renderHotspots(); }
      }
    };
    await Promise.all([worker(), worker(), worker(), worker()]);
    if (alive()) { run.status = "done"; render(); toast(`Found ${run.items.length} pieces in your photo`); }
  } catch (err) {
    if (alive()) { run.status = "error"; run.error = err.message; render(); toast(err.message.slice(0, 120)); }
  }
}

function existingCard() {
  const ex = S.existing?.photoKey === photoKey() ? S.existing : null;
  if (!ex) {
    return `<div class="card card-right ex-card">
      <h2>Already have furniture?</h2>
      <p class="sub">We can find the pieces in your photo, turn each into a clean product shot, and you decide what to keep.</p>
      <button class="btn block" data-action="scan">Find my furniture</button>
    </div>`;
  }
  if (ex.status === "detecting") {
    return `<div class="card card-right ex-card"><h2>Your furniture</h2>
      <ul class="stages"><li class="now"><span class="tick"></span>Looking for furniture in your photo…</li></ul></div>`;
  }
  if (ex.status === "error") {
    return `<div class="card card-right ex-card"><h2>Your furniture</h2><p class="sub">${esc(ex.error)}</p>
      <button class="btn block" data-action="scan">Try again</button></div>`;
  }
  const kept = ex.items.filter(e => e.keep).length, busy = ex.items.filter(e => e.status === "loading").length;
  return `<div class="card card-right ex-card">
    <h2>Your furniture</h2>
    <p class="sub">${ex.items.length} pieces found${busy ? ` · making product shots (${ex.items.length - busy}/${ex.items.length})` : ""}.
      Keep what you love, ditch the rest. We design around what you keep.</p>
    <div class="ex-grid">${ex.items.map(e => `
      <div class="ex ${e.keep ? "" : "ditched"}" data-ex="${e.id}">
        <div class="ex-img">${e.iso ? `<img src="${esc(e.iso)}" alt="">`
          : e.status === "error" ? `<span class="ex-err">Couldn't extract</span>` : `<i class="shimmer"></i>${e.crop ? `<img class="ex-crop" src="${esc(e.crop)}" alt="">` : ""}`}</div>
        <b>${esc(cap(e.label))}</b>
        <small>${esc(CAT_LABEL[e.category] || "Other")} · ${dimsText(ownedProduct(e))}</small>
        <div class="seg">
          <button class="${e.keep ? "on" : ""}" data-action="keep" data-id="${e.id}" data-keep="1">Keep</button>
          <button class="${e.keep ? "" : "on"}" data-action="keep" data-id="${e.id}" data-keep="0">Ditch</button>
        </div>
      </div>`).join("")}</div>
    <p class="hint">Keeping ${kept} of ${ex.items.length}. <button class="link-btn" data-action="scan-again">Scan again</button></p>
  </div>`;
}

function renderBoxes() {
  const layer = $("#boxes");
  const ex = S.existing?.photoKey === photoKey() ? S.existing : null;
  if (S.step !== 1 || !ex || !ex.items.length) { layer.innerHTML = ""; return; }
  const g = geom();
  layer.innerHTML = ex.items.map(e => {
    const [y0, x0, y1, x1] = e.box;
    const l = g.ox + x0 / 1000 * g.dw, t = g.oy + y0 / 1000 * g.dh, w = (x1 - x0) / 1000 * g.dw, h = (y1 - y0) / 1000 * g.dh;
    return `<div class="bx ${e.keep ? "" : "ditched"}" id="bx-${e.id}" style="left:${l}px;top:${t}px;width:${w}px;height:${h}px">
      <span>${esc(cap(e.label))}</span></div>`;
  }).join("");
}

function renderSteps() {
  $("#steps").innerHTML = STEPS.map((s, i) =>
    `<button class="pill ${i === S.step ? "active" : ""}" data-action="goto" data-step="${i}"><span class="num">0${i + 1}</span>${s}</button>`).join("");
}
function renderSides() {
  const b = $("#back"), n = $("#next");
  b.hidden = S.step === 0; n.hidden = S.step === STEPS.length - 1;
  b.innerHTML = `<span class="chev">‹</span>${STEPS[S.step - 1] || ""}`;
  n.innerHTML = `${STEPS[S.step + 1] || ""}<span class="chev">›</span>`;
}
function renderTopbar() {
  const t = $("#topbar");
  if (S.step < 2 || !S.scene || S.generating) { t.hidden = true; return; }
  const tot = sceneTotal(S.scene), has = !!currentRender();
  let action = "";
  if (S.rendering) action = `<span class="pill pill-static rendering-pill"><i class="spin"></i>Rendering with Gemini…</span>`;
  else if (!has) {
    const e = editsSinceLast(), n = e ? e.changed.length + e.removed.length : 0;
    const label = !lastRender() ? "Render" : e ? `Update render · ${n} change${n > 1 ? "s" : ""}` : "Re-render all";
    action = `<button class="pill pill-cta" data-action="render">✦ ${label}</button>`;
  }
  else action = `<button class="pill" data-action="before">${S.before ? "Show render" : "Before"}</button>`;
  t.hidden = false;
  t.innerHTML = `<span class="pill pill-static ${tot > S.needs.budget ? "over" : ""}">Total <b>${money(tot)}</b> <span style="opacity:.7">/ ${money(S.needs.budget)}</span></span>${action}`;
}

function renderMeasure() {
  const m = $("#measure");
  if (S.step !== 1) { m.hidden = true; return; }
  const [x1, y] = toScreen([10, 47]), [x2] = toScreen([90, 47]);
  Object.assign(m.style, { left: x1 + "px", top: y + "px", width: (x2 - x1) + "px" });
  m.innerHTML = `<span class="pill">Back wall · ${inch(S.space.wallIn)} (${(S.space.wallIn / 12).toFixed(1)} ft)</span>`;
  m.hidden = false;
}

function renderHotspots() {
  const box = $("#hotspots");
  if (S.step < 2 || !S.scene || S.generating || S.rendering || S.before) { box.innerHTML = ""; return; }
  const placed = [];   // label rectangles already used, to keep labels from covering each other
  const hit = r => placed.some(q => r.l < q.r + 8 && r.r > q.l - 8 && r.t < q.b + 6 && r.b > q.t - 6);
  const order = S.scene.map((it, i) => ({ it, i, xy: toScreen(it.pos) })).sort((a, b) => b.xy[1] - a.xy[1]);
  const html = [];
  for (const { it, i, xy: [x, y] } of order) {
    const p = view(it);
    const label = p.owned ? `${p.name} · yours` : `${p.family || p.name} · ${money(p.price.amount)}`;
    const w = 86 + label.length * 8.2;
    let flip = x > innerWidth * 0.62, lh = 92, rect;
    const rectFor = (lh, flip) => {
      const l = flip ? x + 38 - w : x - 38;
      return { l, r: l + w, b: y - lh - 8, t: y - lh - 8 - 54 };
    };
    for (const tryFlip of [flip, !flip]) {
      for (lh = 92; lh <= 92 + 64 * 3; lh += 64) {
        rect = rectFor(lh, tryFlip);
        if (!hit(rect) && rect.t > innerHeight * 0.06 + 72) break;   // stay below the top bar
      }
      if (!hit(rect)) { flip = tryFlip; break; }
    }
    placed.push(rect);
    html.push(`<div class="hs ${S.sel === i ? "sel" : ""} ${flip ? "flip" : ""}" data-idx="${i}" style="left:${x}px;top:${y}px;--lh:${lh}px">
      <div class="hs-line"></div>
      <button class="hs-pill" data-action="select" data-idx="${i}">
        <img src="${esc(imgOf(p))}" alt="">
        <span><small>${CAT_LABEL[it.cat]}${it.qty > 1 ? " × " + it.qty : ""}</small><b>${esc(label)}</b></span>
      </button>
      <div class="hs-dot" data-drag="${i}" title="Drag to place"></div>
    </div>`);
  }
  box.innerHTML = html.join("");
}

function renderPanel() {
  const el = $("#panel");
  if (S.step === 0) el.innerHTML = needsCard();
  else if (S.step === 1) el.innerHTML = spaceCard() + existingCard();
  else if (S.step === 2) el.innerHTML = S.generating ? progressCard() : optionsView();
  else if (S.step === 3) el.innerHTML = S.sel != null ? detailCard() : editHint();
  else el.innerHTML = shopCard();
}

/* ① needs */
function needsCard() {
  const n = S.needs;
  return `<div class="card card-left">
    <h2>What do you need?</h2>
    <p class="sub">Tell us about the room. We only suggest real furniture that fits.</p>
    <label class="field">Room</label>
    <div class="chips">${Object.entries(ROOMS).map(([k, v]) => `<button class="chip ${n.room === k ? "on" : ""}" data-action="set" data-key="room" data-val="${k}">${v}</button>`).join("")}</div>
    <label class="field">Style</label>
    <div class="chips">${STYLES.map(s => `<button class="chip ${n.style === s ? "on" : ""}" data-action="set" data-key="style" data-val="${s}">${s}</button>`).join("")}</div>
    <label class="field">Budget</label>
    <div class="range-row"><input type="range" min="500" max="10000" step="100" value="${n.budget}" data-bind="budget"><output>${money(n.budget)}</output></div>
    <label class="field">Must-haves</label>
    <textarea rows="2" data-bind="notes" placeholder="e.g. seats 4, pet-friendly fabric, keep my bookshelf">${esc(n.notes)}</textarea>
    <label class="field">I am</label>
    <div class="chips">
      <button class="chip ${n.mode === "non-pro" ? "on" : ""}" data-action="set" data-key="mode" data-val="non-pro">Furnishing my home</button>
      <button class="chip ${n.mode === "pro" ? "on" : ""}" data-action="set" data-key="mode" data-val="pro">A design professional</button>
    </div>
    <button class="btn block" data-action="next">Next: your space →</button>
  </div>`;
}

/* ② space */
function spaceCard() {
  const s = S.space;
  return `<div class="card card-left">
    <h2>Your space</h2>
    <p class="sub">Upload a photo of the room, then give us one real length so every product is shown at true scale.</p>
    <button class="drop" data-action="upload" id="drop">
      <b>${s.photo === "demo" ? "Upload a room photo" : "Replace photo"}</b>
      <span>Drop an image here or click to browse</span>
    </button>
    ${s.photo !== "demo" ? `<button class="btn ghost block" style="margin-top:10px" data-action="demo">Use the demo room</button>` : ""}
    <label class="field">Back wall width</label>
    <div class="num-row"><input type="number" min="60" max="600" value="${s.wallIn}" data-bind="wallIn"><span>inches · ${(s.wallIn / 12).toFixed(1)} ft</span></div>
    <label class="field">Room depth (approx.)</label>
    <div class="num-row"><input type="number" min="60" max="600" value="${s.depthIn}" data-bind="depthIn"><span>inches · ${(s.depthIn / 12).toFixed(1)} ft</span></div>
    <p class="hint">The dashed line shows the wall we measure. Later this step can use a vision model, depth estimation or a LiDAR scan instead of typing.</p>
    <button class="btn block" data-action="next">Design my room →</button>
  </div>`;
}

/* ⑤ design */
function progressCard() {
  return `<div class="card card-center" style="width:400px">
    <h2>Designing…</h2>
    <p class="sub">Choosing from real, in-stock furniture.</p>
    <ul class="stages">${stagesText().map((t, i) =>
      `<li class="${i < S.stage ? "done" : i === S.stage ? "now" : ""}"><span class="tick">${i < S.stage ? "✓" : ""}</span>${esc(t)}</li>`).join("")}</ul>
  </div>`;
}
function optionsView() {
  return `<div class="options">${S.options.map((o, i) => {
    const imgs = o.items.slice(0, 4).map(it => `<img src="${esc(imgOf(view(it)))}" alt="">`).join("");
    return `<button class="opt ${S.opt === i ? "on" : ""}" data-action="option" data-idx="${i}">
      <div class="grid">${imgs}</div>
      <b>Option ${i + 1} · ${o.name}</b>
      <small>${money(sceneTotal(o.items))} · ${o.items.length} pieces</small>
    </button>`;
  }).join("")}</div>
  <button class="btn options-cta" data-action="next">Edit this design →</button>`;
}

/* edit */
function editHint() {
  return `<div class="card card-right" style="width:300px">
    <h2>Edit by image</h2>
    <p class="sub" style="margin:0">Click any label to swap the piece, change its color or remove it. Drag the white dots to line pins up with your photo.</p>
  </div>`;
}
function detailCard() {
  const it = S.scene[S.sel], base = it.own ? null : byId[it.pid], p = view(it);
  const ok = fits(p, it);
  const colorways = base ? [{ id: null, variant: base.variant, image: imgOf(base) }, ...base.variants.map(v => ({ id: v.id, variant: v.variant, image: v.image }))] : [];
  const alts = P.filter(q => q.category === it.cat && q.id !== it.pid && fits(q, it))
    .sort((a, b) => Math.abs(a.price.amount - p.price.amount) - Math.abs(b.price.amount - p.price.amount)).slice(0, 6);
  return `<div class="card card-right">
    <button class="close" data-action="close" aria-label="Close">×</button>
    <img class="p-img" src="${esc(imgOf(p))}" alt="">
    <p class="p-cat">${CAT_LABEL[it.cat]}${it.qty > 1 ? " × " + it.qty : ""}</p>
    <h3 class="p-name">${esc(p.name)}</h3>
    <p class="p-var">${esc(p.variant || "")}</p>
    <p class="p-price">${p.owned ? `<span class="fit">Already yours · $0</span>` : money(p.price.amount)}${it.qty > 1 ? ` <small style="font-size:13px;color:var(--ink-soft)">each · ${money(p.price.amount * it.qty)}</small>` : ""}</p>
    <dl class="facts">
      <dt>Size</dt><dd>${dimsText(p)}</dd>
      <dt>Fit</dt><dd><span class="fit ${ok ? "" : "no"}">${ok ? "Fits" : "Too wide"} · max ${inch(maxWidthFor(it))} wide</span></dd>
      ${p.materials.length ? `<dt>Material</dt><dd>${esc(p.materials.slice(0, 4).join(", "))}</dd>` : ""}
    </dl>
    ${colorways.length > 1 ? `<label class="field">Colorways · ${colorways.length}</label>
      <div class="swatches">${colorways.slice(0, 10).map(c =>
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
function shopCard() {
  if (!S.scene) return `<div class="card card-right"><h2>Shopping list</h2><p class="sub">Design a room first.</p><button class="btn block" data-action="goto" data-step="2">Design my room →</button></div>`;
  const tot = sceneTotal(S.scene), b = S.needs.budget, over = tot > b;
  return `<div class="card card-right">
    <h2>Shopping list</h2>
    <p class="sub">${S.scene.filter(it => !it.own).length} to buy${S.scene.some(it => it.own) ? ` · ${S.scene.filter(it => it.own).length} you keep` : ""} · ${ROOMS[S.needs.room].toLowerCase()} · ${S.needs.style.toLowerCase()}</p>
    <div class="sum"><span>Total</span><span>${money(tot)}</span></div>
    <div class="budget ${over ? "over" : ""}"><span>Budget ${money(b)}</span><span>${over ? money(tot - b) + " over" : money(b - tot) + " left"}</span></div>
    <div class="bar ${over ? "over" : ""}"><i style="width:${Math.min(100, tot / b * 100)}%"></i></div>
    <div class="btn-row">
      <button class="btn ghost" data-action="copy">Copy list</button>
      <button class="btn" data-action="download">Download scene.json</button>
    </div>
    <ul class="list" style="margin-top:14px">${S.scene.map(it => {
      const p = view(it);
      return `<li><img src="${esc(imgOf(p))}" alt="">
        <div><b>${esc(p.name)}</b><small>${esc(p.variant || "")}</small><small>${dimsText(p)}</small></div>
        <div class="amt">${p.owned ? "Yours" : `${it.qty > 1 ? it.qty + " × " : ""}${money(p.price.amount)}<a href="${esc(p.url)}" target="_blank" rel="noopener">${esc(p.brand)} ↗</a>`}</div></li>`;
    }).join("")}</ul>
  </div>`;
}

/* ---------------- actions ---------------- */
function goto(i) {
  i = Math.max(0, Math.min(STEPS.length - 1, i));
  S.step = i; S.sel = null;
  if (i >= 2 && (S.dirty || !S.options.length) && !S.generating) { S.step = 2; generate(); return; }
  render();
}

function exportScene() {
  return {
    room: { width_in: S.space.wallIn, depth_in: S.space.depthIn, photo: S.space.photo === "demo" ? "demo-room.jpg" : "upload" },
    needs: { ...S.needs, budget_usd: S.needs.budget },
    items: S.scene.map(it => {
      const p = view(it);
      return { slot: it.cat, qty: it.qty, sku: p.id, name: p.name, variant: p.variant, price_usd: p.price.amount,
               dims_in: p.dims_in, placement: { image_pos_pct: it.pos.map(v => +v.toFixed(1)) },
               image: p.owned ? null : p.images.main, url: p.url, owned: !!p.owned };
    }),
    total_usd: sceneTotal(S.scene),
  };
}

document.addEventListener("click", e => {
  const a = e.target.closest("[data-action]");
  if (!a) return;
  const act = a.dataset.action;
  if (act === "goto") goto(+a.dataset.step);
  else if (act === "next") goto(S.step + 1);
  else if (act === "back") goto(S.step - 1);
  else if (act === "set") { S.needs[a.dataset.key] = a.dataset.val; S.dirty = true; renderPanel(); }
  else if (act === "upload") $("#file").click();
  else if (act === "demo") { S.space.photo = "demo"; S.space.data = null; S.dirty = true; showImage(); render(); }
  else if (act === "option") { S.opt = +a.dataset.idx; S.scene = structuredClone(S.options[S.opt].items); render(); renderScene(); }
  else if (act === "render") renderScene();
  else if (act === "scan" || act === "scan-again") { if (act === "scan-again") S.existing = null; scanFurniture(); }
  else if (act === "keep") {
    const e = exById(a.dataset.id); e.keep = a.dataset.keep === "1"; S.dirty = true; renderPanel(); renderBoxes();
  }
  else if (act === "before") { S.before = !S.before; render(); }
  else if (act === "select") { S.sel = +a.dataset.idx; if (S.step !== 3) S.step = 3; render(); }
  else if (act === "close") { S.sel = null; render(); }
  else if (act === "swap") {
    const it = S.scene[S.sel]; it.pid = a.dataset.pid; it.vid = null; delete it.own;
    render(); toast(`Swapped to ${byId[it.pid].name} · click Update render`);
  } else if (act === "colorway") {
    S.scene[S.sel].vid = a.dataset.vid || null; render();
    toast(`Color · ${view(S.scene[S.sel]).variant}`);
  } else if (act === "remove") {
    const [it] = S.scene.splice(S.sel, 1); S.sel = null;
    if (it.own && exById(it.own)) exById(it.own).keep = false;
    render();
    toast(`Removed ${CAT_LABEL[it.cat].toLowerCase()}`);
  } else if (act === "labels") document.body.classList.toggle("no-labels");
  else if (act === "copy") {
    const txt = S.scene.filter(it => !it.own).map(it => { const p = view(it); return `${it.qty > 1 ? it.qty + "× " : ""}${p.name} (${p.variant}) — ${money(p.price.amount)} — ${p.url}`; }).join("\n")
      + `\nTotal: ${money(sceneTotal(S.scene))}`;
    navigator.clipboard.writeText(txt).then(() => toast("Shopping list copied"), () => toast("Copy failed"));
  } else if (act === "download") {
    const blob = new Blob([JSON.stringify(exportScene(), null, 2)], { type: "application/json" });
    const link = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: "scene.json" });
    link.click(); URL.revokeObjectURL(link.href);
  }
});

document.addEventListener("input", e => {
  const k = e.target.dataset.bind;
  if (!k) return;
  if (k === "notes") { S.needs.notes = e.target.value; S.dirty = true; return; }
  if (k === "budget") { S.needs.budget = +e.target.value; e.target.nextElementSibling.textContent = money(S.needs.budget); S.dirty = true; return; }
  if (k === "wallIn" || k === "depthIn") {
    const v = +e.target.value; if (!v) return;
    S.space[k] = v; S.dirty = true;
    e.target.nextElementSibling.textContent = `inches · ${(v / 12).toFixed(1)} ft`;
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
      showImage(); render(); toast("Room photo loaded · looking for your furniture");
      scanFurniture();
    };
    img.src = r.result;
  };
  r.readAsDataURL(file);
}
$("#file").addEventListener("change", e => loadPhoto(e.target.files[0]));
addEventListener("dragover", e => { if (S.step === 1) { e.preventDefault(); $("#drop")?.classList.add("over"); } });
addEventListener("dragleave", () => $("#drop")?.classList.remove("over"));
addEventListener("drop", e => { if (S.step === 1) { e.preventDefault(); loadPhoto(e.dataTransfer.files[0]); } });

/* hover a piece in the panel -> highlight its box on the photo */
document.addEventListener("mouseover", e => {
  const card = e.target.closest("[data-ex]");
  document.querySelectorAll(".bx.hl").forEach(b => b.classList.remove("hl"));
  if (card) $("#bx-" + card.dataset.ex)?.classList.add("hl");
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
  S.scene[drag.i].pos = toImage(e.clientX, e.clientY);
});
document.addEventListener("pointerup", () => { if (drag) { drag = null; renderHotspots(); } });

addEventListener("keydown", e => {
  if (/INPUT|TEXTAREA/.test(document.activeElement.tagName)) return;
  if (e.key === "ArrowRight") goto(S.step + 1);
  if (e.key === "ArrowLeft") goto(S.step - 1);
  if (e.key === "Escape" && S.sel != null) { S.sel = null; render(); }
});
addEventListener("resize", () => { renderHotspots(); renderMeasure(); renderBoxes(); });
room.addEventListener("load", () => { renderHotspots(); renderMeasure(); renderBoxes(); });

/* ---------------- boot ---------------- */
fetch("../data/products.json")
  .then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
  .then(d => {
    P = d; byId = Object.fromEntries(d.map(p => [p.id, p]));
    // deep link for demos: #room=bedroom&step=3&sel=0
    const h = new URLSearchParams(location.hash.slice(1));
    if (ROOMS[h.get("room")]) S.needs.room = h.get("room");
    const step = +h.get("step") || 0;
    if (step >= 2) {
      S.options = planOptions(); S.scene = structuredClone(S.options[0].items); S.dirty = false;
      if (h.has("sel")) S.sel = +h.get("sel");
    }
    S.step = Math.min(step, STEPS.length - 1);
    render();
    const after = () => { if (h.has("render") && S.scene) renderScene(); };   // #step=3&render=1
    if (h.has("scan")) {                                                       // #step=1&scan=1
      scanFurniture().then(() => {
        if (step >= 2) { S.options = planOptions(); S.scene = structuredClone(S.options[0].items); render(); }
        after();
      });
    } else after();
  })
  .catch(() => {
    $("#panel").innerHTML = `<div class="card card-center"><h2>Can't load product data</h2>
      <p class="sub">Run a local server from the repo root:<br><code>python3 -m http.server 8000</code><br>then open <code>http://localhost:8000/app/</code></p></div>`;
  });
render();
