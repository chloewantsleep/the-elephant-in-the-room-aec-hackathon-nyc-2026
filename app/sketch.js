/* Sketch furniture into your room (Needs, Design and Edit steps).
 *
 * The white pen ball in the top-left corner starts a fresh board: draw rough shapes where you want pieces (a long
 * box for a sofa, a tall line for a lamp, a blob up top for a pendant). Saying what each shape is stays optional:
 *   - pick a type on a shape's chip, or
 *   - "Guess with AI" sends the photo with the shapes drawn on to /api/sketch (sketch_ai.py), or
 *   - just press Done: any shape without a type gets a free, instant guess from its size and place (quick: true).
 * Done saves the shapes; the planner (app.js planOptions) then designs only these pieces, where they were drawn.
 * From Design or Edit, Done re-plans right away and lands on Design.
 *
 * Loaded after app.js and uses its globals (S, render, goto, apiPost, toImage, geom, photoKey, CAT_LABEL, ...).
 * Shapes are stored in image % so they stay put when the window resizes (renders keep the photo's framing).
 */

const SK_ENGINE = { claude: "Claude", gemini: "Gemini", rules: "shape rules" };
const SK_JOIN_MS = 1400;   // a stroke right after another, near it, belongs to the same shape (e.g. a chair's back)
const SK_TYPES = Object.keys(CAT_LABEL).filter(c => c !== "other");
const SK_STEPS = [NEEDS, DESIGN, EDIT];   // where the pen ball lives

const SK = {
  on: false,
  marks: [],        // shapes being drawn: [{strokes: [[[x%, y%], ...], ...], t, cat, widthIn, mine, why}]
  busy: null,       // "ai" while the AI looks, "done" while saving
  result: null,     // last AI reading: {engine, ms, cached, note}
  error: null,
};
S.sketch = null;    // saved: {photoKey, items: [{category, widthIn, pos, strokes}]} -> used by planOptions()

const skCanvas = document.getElementById("sketch");
const skBar = document.getElementById("sketchbar");
const skFab = document.getElementById("skfab");
const skCtx = skCanvas.getContext("2d");

/* ---------------- geometry ---------------- */
const skScreen = ([px, py]) => { const g = geom(); return [g.ox + px / 100 * g.dw, g.oy + py / 100 * g.dh]; };
function skBox(strokes) {
  const pts = strokes.flat(), c = v => Math.max(0, Math.min(100, v));
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  return [c(Math.min(...xs)), c(Math.min(...ys)), c(Math.max(...xs)), c(Math.max(...ys))];
}
const skCenter = strokes => { const [x0, y0, x1, y1] = skBox(strokes); return [(x0 + x1) / 2, (y0 + y1) / 2]; };
const skLabel = cat => CAT_LABEL[cat] || "?";
const skWidth = m => { const [x0, , x1] = skBox(m.strokes); return Math.round((x1 - x0) / 100 * S.space.wallIn); };

/* ---------------- drawing: a white, glowing pen ---------------- */
// Draws shapes onto ctx. map: image % -> pixels; unit: base line width in pixels; label(m, i) -> text by the badge.
function skPaint(ctx, shapes, map, unit, { alpha = 1, label } = {}) {
  ctx.save();
  ctx.lineCap = "round"; ctx.lineJoin = "round";
  const path = s => {
    ctx.beginPath();
    s.forEach((p, k) => { const [x, y] = map(p); k ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
    if (s.length === 1) { const [x, y] = map(s[0]); ctx.lineTo(x + 0.1, y); }
  };
  shapes.forEach((m, i) => {
    ctx.globalAlpha = alpha;   // only the strokes fade; labels stay crisp
    // a soft dark bed so the line reads on white walls, then the white line with its glow
    ctx.shadowBlur = 0; ctx.lineWidth = unit * 2.6; ctx.strokeStyle = "rgba(20,20,18,.18)";
    m.strokes.forEach(s => { path(s); ctx.stroke(); });
    const dpr = ctx.getTransform().a;   // shadowBlur ignores the transform, so scale it by hand
    ctx.shadowColor = "#fff"; ctx.shadowBlur = unit * 6 * dpr; ctx.lineWidth = unit * 3; ctx.strokeStyle = "rgba(255,255,255,.35)";
    m.strokes.forEach(s => { path(s); ctx.stroke(); });   // the halo
    ctx.shadowBlur = unit * 3 * dpr; ctx.lineWidth = unit; ctx.strokeStyle = "#fff";
    m.strokes.forEach(s => { path(s); ctx.stroke(); ctx.stroke(); });   // the bright core
    ctx.shadowBlur = 0;

    // numbered badge at the top-left corner, so chip 2 in the toolbar matches 2 in the picture
    ctx.globalAlpha = 1;
    const [x0, y0] = map(skBox(m.strokes).slice(0, 2));
    const r = unit * 3.4, cx = Math.max(r, x0 - r * 0.6), cy = Math.max(r, y0 - r * 0.6);
    const text = label?.(m, i);
    ctx.font = `500 ${r * 1.05}px Poppins, system-ui, sans-serif`;
    ctx.shadowColor = "rgba(0,0,0,.18)"; ctx.shadowBlur = unit * 3 * dpr;
    if (text) {   // label pill: "2  Side table"
      const tw = ctx.measureText(text).width;
      ctx.fillStyle = "rgba(250,248,245,.92)";
      ctx.beginPath(); ctx.roundRect(cx, cy - r, r * 1.5 + tw + r * 0.9, r * 2, r); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = "#1f1e1c"; ctx.textAlign = "left"; ctx.textBaseline = "middle";
      ctx.fillText(text, cx + r * 1.5, cy + r * 0.05);
    }
    ctx.shadowColor = "rgba(255,255,255,.9)"; ctx.shadowBlur = unit * 4 * dpr;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fillStyle = "#fff"; ctx.fill();
    ctx.shadowBlur = 0;
    ctx.font = `600 ${r * 1.05}px Poppins, system-ui, sans-serif`;
    ctx.fillStyle = "#1f1e1c"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(String(i + 1), cx, cy + r * 0.05);
  });
  ctx.restore();
}

const savedShapes = () => S.sketch?.photoKey === photoKey() ? S.sketch.items : [];

function skDraw() {
  const dpr = devicePixelRatio || 1, W = innerWidth, H = innerHeight;
  if (skCanvas.width !== W * dpr || skCanvas.height !== H * dpr) { skCanvas.width = W * dpr; skCanvas.height = H * dpr; }
  skCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  skCtx.clearRect(0, 0, W, H);
  if (SK.on) skPaint(skCtx, SK.marks, skScreen, 3.5, { label: m => m.cat ? skLabel(m.cat) : null });
  else if (S.step === NEEDS) skPaint(skCtx, savedShapes(), skScreen, 3, { alpha: 0.9, label: m => skLabel(m.category) });
}

const skPhoto = () => new Promise((ok, bad) => {
  const i = new Image(); i.onload = () => ok(i); i.onerror = () => bad(new Error("Couldn't load the photo")); i.src = photoSrc();
});

// The picture the AI sees: the room photo with the shapes burned in (numbers only, no labels).
async function skComposite() {
  const im = await skPhoto();
  const k = Math.min(1, 1568 / Math.max(im.naturalWidth, im.naturalHeight));
  const W = Math.round(im.naturalWidth * k), H = Math.round(im.naturalHeight * k);
  const c = Object.assign(document.createElement("canvas"), { width: W, height: H });
  const ctx = c.getContext("2d");
  ctx.drawImage(im, 0, 0, W, H);
  skPaint(ctx, SK.marks, ([x, y]) => [x / 100 * W, y / 100 * H], Math.max(3, W / 260));
  return c.toDataURL("image/jpeg", 0.88);
}

// Layout guide for the render (app.js renderScene): the photo with each sketched piece that is still in the
// scene outlined and labeled with what was picked for it, e.g. "Side table · VALNÄS".
async function sketchGuide() {
  const shapes = savedShapes();
  const placed = (S.scene || []).filter(it => it.sketched && shapes[it.sk])
    .map(it => ({ strokes: shapes[it.sk].strokes, text: `${CAT_LABEL[it.cat]} · ${view(it).family || view(it).name}` }));
  if (!placed.length) return null;
  const im = await skPhoto();
  const k = Math.min(1, 1280 / Math.max(im.naturalWidth, im.naturalHeight));
  const W = Math.round(im.naturalWidth * k), H = Math.round(im.naturalHeight * k);
  const c = Object.assign(document.createElement("canvas"), { width: W, height: H });
  const ctx = c.getContext("2d");
  ctx.drawImage(im, 0, 0, W, H);
  skPaint(ctx, placed, ([x, y]) => [x / 100 * W, y / 100 * H], Math.max(3, W / 240), { label: m => m.text });
  return c.toDataURL("image/jpeg", 0.85);
}

/* ---------------- pointer input ---------------- */
let skStroke = null;
skCanvas.addEventListener("pointerdown", e => {
  if (!SK.on || SK.busy || e.button > 0) return;
  e.preventDefault();
  skCanvas.setPointerCapture(e.pointerId);
  const p = toImage(e.clientX, e.clientY);
  // continue the last shape if this stroke starts soon after it and close to it
  const last = SK.marks[SK.marks.length - 1];
  let mark = null;
  if (last && Date.now() - last.t < SK_JOIN_MS) {
    const [x0, y0, x1, y1] = skBox(last.strokes), pad = 6;
    if (p[0] > x0 - pad && p[0] < x1 + pad && p[1] > y0 - pad && p[1] < y1 + pad) mark = last;
  }
  if (!mark) { mark = { strokes: [], t: Date.now(), cat: null, widthIn: null }; SK.marks.push(mark); }
  if (!mark.mine) mark.cat = null;   // its shape changed, so a guess is stale (a type you picked stays)
  skStroke = [p];
  mark.strokes.push(skStroke);
  skDraw();
});
skCanvas.addEventListener("pointermove", e => {
  if (!skStroke) return;
  const p = toImage(e.clientX, e.clientY), q = skStroke[skStroke.length - 1];
  if (Math.hypot(p[0] - q[0], p[1] - q[1]) < 0.25) return;
  skStroke.push(p);
  skDraw();
});
const skEnd = () => {
  if (!skStroke) return;
  skStroke = null;
  SK.marks[SK.marks.length - 1].t = Date.now();
  skRenderBar(); skDraw();
};
skCanvas.addEventListener("pointerup", skEnd);
skCanvas.addEventListener("pointercancel", skEnd);

/* ---------------- what is each shape? ---------------- */
// quick: free, instant guesses from size and place (no AI). Otherwise the AI looks at the photo too.
async function skAsk(quick) {
  const req = {
    marks: SK.marks.map((m, i) => ({ n: i + 1, box: skBox(m.strokes).map(v => +v.toFixed(1)), note: m.mine ? CAT_LABEL[m.cat] : "" })),
    room: { key: S.needs.room, type: ROOMS[S.needs.room], width_in: S.space.wallIn, depth_in: S.space.depthIn },
    ...(quick ? { quick: true } : { image: await skComposite() }),
  };
  const j = await apiPost("/api/sketch", req);
  for (const it of j.items) {
    const m = SK.marks[it.mark - 1];
    if (m && !m.mine) Object.assign(m, { cat: it.category, widthIn: it.width_in, why: it.reason });
  }
  for (const u of j.unclear || []) { const m = SK.marks[u.mark - 1]; if (m && !m.mine && !m.cat) m.why = u.question; }
  return j;
}

async function skGuess() {   // optional: "Guess with AI"
  if (!SK.marks.length || SK.busy) return;
  SK.busy = "ai"; SK.error = null; skRenderBar();
  try { SK.result = await skAsk(false); }
  catch (e) { SK.error = e.message; }
  finally { SK.busy = null; skRenderBar(); skDraw(); }
}

async function skDone() {
  if (!SK.marks.length || SK.busy) return;
  if (SK.marks.some(m => !m.cat)) {   // nothing has to be named: unnamed shapes get a quick, free guess
    SK.busy = "done"; SK.error = null; skRenderBar();
    try { await skAsk(true); }
    catch (e) { SK.error = e.message; SK.busy = null; skRenderBar(); return; }
    SK.busy = null;
  }
  const items = SK.marks.filter(m => m.cat).map(m => ({
    category: m.cat, widthIn: m.widthIn || skWidth(m), pos: skCenter(m.strokes), strokes: m.strokes,
  }));
  if (!items.length) { SK.error = "Couldn't tell what those are. Draw them a bit bigger, or pick a type."; skRenderBar(); return; }
  S.sketch = { photoKey: photoKey(), items };
  S.dirty = true;   // the next design plans around these
  SK.on = false; SK.result = null; SK.marks = [];
  toast(`Designing only your sketch: ${items.map(it => skLabel(it.category)).join(", ")}`);
  if (S.step === NEEDS) render();
  else goto(DESIGN);   // from Design / Edit: re-plan now (goto sees S.dirty)
}

function skRemove() {
  S.sketch = null; S.dirty = true;
  render();
  toast("Sketch removed · back to a full room design");
}

/* ---------------- the toolbar ---------------- */
function skChip(m, i) {
  return `<label class="sk-chip" title="${esc(m.why || "What is it? (optional)")}">
    <span class="sk-dot">${i + 1}</span>
    <select data-sk-type="${i}" aria-label="What is shape ${i + 1}? (optional)">
      <option value="">${m.cat ? "Not sure" : "What is it?"}</option>
      ${SK_TYPES.map(c => `<option value="${c}" ${m.cat === c ? "selected" : ""}>${esc(skLabel(c))}</option>`).join("")}
    </select>
    <button type="button" class="sk-x" data-sk="del" data-i="${i}" aria-label="Erase shape ${i + 1}">×</button>
  </label>`;
}

const PEN_SVG = `<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20l1.2-4.6L15.8 4.8a2.1 2.1 0 0 1 3 0l.4.4a2.1 2.1 0 0 1 0 3L8.6 18.8z"/><path d="M13.6 7l3.4 3.4"/></svg>`;

function skRenderBar() {
  if (!SK.on) { skBar.innerHTML = ""; skBar.hidden = true; return; }
  skBar.hidden = false;
  const n = SK.marks.length, r = SK.result;
  const tip = SK.error ? `<div class="pill pill-static sk-tip sk-bad">${esc(SK.error)}</div>`
    : SK.busy === "ai" ? `<div class="pill pill-static sk-tip"><span class="spin"></span>Looking at your ${n} shape${n > 1 ? "s" : ""}…</div>`
    : !n ? `<div class="pill pill-static sk-tip">Draw where you want a piece · naming it is optional</div>`
    : r?.note ? `<div class="pill pill-static sk-tip">${esc(r.note)}</div>`
    : r ? `<div class="pill pill-static sk-tip">✦ Guessed by ${SK_ENGINE[r.engine] || r.engine}${r.cached ? "" : ` in ${(r.ms / 1000).toFixed(1)}s`} · change any that are off</div>`
    : "";
  skBar.innerHTML = `${tip}
    ${n ? `<div class="sk-chips">${SK.marks.map(skChip).join("")}</div>` : ""}
    <div class="sk-tools">
      <button class="pill" data-sk="undo" ${n ? "" : "disabled"} title="Undo (Ctrl+Z)">Undo</button>
      <button class="pill" data-sk="clear" ${n ? "" : "disabled"}>Clear</button>
      <button class="pill" data-sk="guess" ${n && !SK.busy ? "" : "disabled"} title="Optional: let AI say what each shape is">✦ Guess with AI</button>
      <button class="pill pill-cta" data-sk="done" ${n && !SK.busy ? "" : "disabled"}>${SK.busy === "done" ? `<span class="spin sk-spin-ink"></span>` : ""}Done</button>
    </div>`;
}

/* ---------------- enter / leave ---------------- */
function skEnter() {   // the pen ball: a clean board (your saved sketch stays until you press Done)
  SK.marks = [];
  SK.on = true; SK.busy = null; SK.error = null; SK.result = null;
  render();
}
function skExit() { SK.on = false; SK.result = null; SK.error = null; render(); }

// Called from app.js render(): keeps the overlay in sync with the rest of the UI.
function renderSketch() {
  const here = SK_STEPS.includes(S.step) && !S.generating;
  if (SK.on && !here) SK.on = false;
  document.body.classList.toggle("sketching", SK.on);
  skCanvas.hidden = !(SK.on || (S.step === NEEDS && savedShapes().length));
  const saved = savedShapes().length;
  skFab.hidden = !here;
  skFab.classList.toggle("on", SK.on);
  skFab.dataset.sk = SK.on ? "exit" : "enter";
  const label = SK.on ? "Close sketch" : saved ? "New sketch" : "Sketch furniture";
  skFab.innerHTML = `${PEN_SVG}<span class="sk-fab-label">${label}</span>${saved && !SK.on ? `<b>${saved}</b>` : ""}`;
  skFab.setAttribute("aria-label", label);
  skFab.title = SK.on ? "Close without saving (Esc)" : saved ? "Start a new sketch (your current one stays until you press Done)" : "Draw furniture on your room";
  skRenderBar();
  skDraw();
}

document.addEventListener("click", e => {
  const a = e.target.closest("[data-sk]");
  if (!a) return;
  const act = a.dataset.sk;
  if (act === "enter") skEnter();
  else if (act === "exit") skExit();
  else if (act === "remove") skRemove();
  else if (act === "undo") {
    const m = SK.marks[SK.marks.length - 1];
    if (m) { m.strokes.pop(); if (!m.strokes.length) SK.marks.pop(); }
    SK.error = null; skRenderBar(); skDraw();
  } else if (act === "clear") { SK.marks = []; SK.error = null; SK.result = null; skRenderBar(); skDraw(); }
  else if (act === "del") { e.preventDefault(); SK.marks.splice(+a.dataset.i, 1); skRenderBar(); skDraw(); }
  else if (act === "guess") skGuess();
  else if (act === "done") skDone();
});
document.addEventListener("change", e => {   // picking a type by hand (optional)
  const i = e.target.dataset.skType;
  if (i == null || !SK.marks[+i]) return;
  const m = SK.marks[+i];
  m.cat = e.target.value || null;
  m.mine = !!m.cat;
  m.widthIn = m.cat ? skWidth(m) : null;   // estimated from the drawing
  m.why = m.cat ? "Your pick" : null;
  SK.error = null; skRenderBar(); skDraw();
});
addEventListener("keydown", e => {
  if (!SK.on) return;
  if (/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return;
  if (e.key === "Escape" || e.key === "ArrowLeft" || e.key === "ArrowRight") {
    e.stopImmediatePropagation();   // don't change steps while drawing
    if (e.key === "Escape") skExit();
  } else if ((e.ctrlKey || e.metaKey) && e.key === "z") {
    e.preventDefault(); skBar.querySelector('[data-sk="undo"]')?.click();
  }
}, true);
addEventListener("resize", skDraw);
room.addEventListener("load", skDraw);
renderSketch();
