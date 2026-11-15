/* Color variants: switch a product's color on the render instantly, without rendering the room again.
 *
 * After the normal full render (one Gemini image with every product), this:
 *   1. track():          finds where each newly placed product is in the render (one cheap vision call)
 *   2. cropForRecolor(): cuts each product out (padded to an aspect ratio Gemini can output)
 *   3. recolor():        asks Gemini for that small crop in each available colorway
 *   4. makeOverlay():    keeps only the pixels that changed (soft mask, feathered edges)
 *   5. flatten():        lays the chosen colors over the render -> one image, shown in place of the render
 *
 * Hooked into app.js (see "color variants" there): prepared after each render, used by the existing
 * colorway buttons. `mock: true` runs everything in the browser without Gemini (for testing).
 */
(function () {
  const RATIOS = [["1:1", 1], ["4:5", .8], ["5:4", 1.25], ["3:4", .75], ["4:3", 4 / 3], ["2:3", 2 / 3], ["3:2", 1.5],
                  ["9:16", 9 / 16], ["16:9", 16 / 9], ["21:9", 21 / 9]];

  const loadImage = src => new Promise((ok, bad) => {
    const im = new Image();
    im.onload = () => ok(im); im.onerror = () => bad(new Error("Could not load image"));
    im.src = src;
  });
  const canvas = (w, h) => Object.assign(document.createElement("canvas"), { width: Math.round(w), height: Math.round(h) });

  /* ---------- 1. where is each new product in the render ---------- */
  // items: [{name, category, image, pos:[x%, y%]}] -> [[ymin, xmin, ymax, xmax] 0-1000 | null]
  async function track({ image, items, api, mock }) {
    if (!mock) return (await api("/api/track", { image, items })).boxes;
    await new Promise(r => setTimeout(r, 300));
    return items.map(({ pos: [x, y] }) => {   // mock: a box around the pin
      const w = 22, h = 26, x0 = Math.max(0, Math.min(100 - w, x - w / 2)), y0 = Math.max(0, Math.min(100 - h, y - h / 2));
      return [y0 * 10, x0 * 10, (y0 + h) * 10, (x0 + w) * 10].map(Math.round);
    });
  }

  /* ---------- 2. crop one product out of the render ---------- */
  // Pads the box, then grows it to the nearest aspect ratio Gemini outputs, so the recolored crop
  // comes back the same shape and lines up when scaled back.
  async function cropForRecolor(renderSrc, box, pad = 0.12) {
    const im = await loadImage(renderSrc), W = im.naturalWidth, H = im.naturalHeight;
    let x0 = box[1] / 1000 * W, y0 = box[0] / 1000 * H, x1 = box[3] / 1000 * W, y1 = box[2] / 1000 * H;
    const px = (x1 - x0) * pad, py = (y1 - y0) * pad;
    x0 -= px; x1 += px; y0 -= py; y1 += py;
    let w = x1 - x0, h = y1 - y0;
    const [aspect, r] = RATIOS.reduce((best, cur) => Math.abs(Math.log(cur[1] / (w / h))) < Math.abs(Math.log(best[1] / (w / h))) ? cur : best);
    if (w / h < r) w = h * r; else h = w / r;
    w = Math.min(w, W); h = Math.min(h, H);
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    const rect = { x: Math.round(Math.min(Math.max(0, cx - w / 2), W - w)), y: Math.round(Math.min(Math.max(0, cy - h / 2), H - h)),
                   w: Math.round(w), h: Math.round(h) };
    const full = canvas(rect.w, rect.h);
    full.getContext("2d").drawImage(im, rect.x, rect.y, rect.w, rect.h, 0, 0, rect.w, rect.h);
    const k = Math.min(1, 1024 / Math.max(rect.w, rect.h)), send = canvas(rect.w * k, rect.h * k);   // at most 1024 px to Gemini
    send.getContext("2d").drawImage(full, 0, 0, send.width, send.height);
    return { dataUrl: send.toDataURL("image/jpeg", 0.92), full, rect, aspect, W, H, box };
  }

  /* ---------- 3. the same crop in another colorway ---------- */
  // product: {name, category, variant}; colorway: {variant, image (URL Gemini can fetch)}
  async function recolor({ crop, product, colorway, api, mock }) {
    if (!mock) {
      return (await api("/api/recolor", {
        crop: crop.dataUrl, aspect: crop.aspect, name: product.name, category: product.category,
        from_variant: product.variant, to_variant: colorway.variant, to_image: colorway.image,
      })).image;
    }
    await new Promise(r => setTimeout(r, 250 + Math.random() * 400));
    return mockTint(crop, colorway.variant);
  }

  /* ---------- 3b. the same crop with a similar product in place of this one (its default color) ---------- */
  // product: {name, category, variant} now in the crop; to: {name, variant, image, dims_in}
  async function swap({ crop, product, to, api, mock }) {
    if (!mock) {
      return (await api("/api/swap", {
        crop: crop.dataUrl, aspect: crop.aspect, name: product.name, category: product.category, from_variant: product.variant,
        to_name: to.name, to_variant: to.variant, to_image: to.image, to_dims: to.dims_in,
      })).image;
    }
    await new Promise(r => setTimeout(r, 250 + Math.random() * 400));
    return mockTint(crop, "swap " + to.name);
  }

  /* ---------- 3c. a sketched piece: add the product into a small crop around what the user drew ---------- */
  // strokes: the user's sketch, [[[x%, y%], ...], ...] of the whole image; product: {name, variant, category, image, dims_in, description}
  async function place({ crop, strokes, product, api, mock }) {
    if (mock) { await new Promise(r => setTimeout(r, 300)); return mockTint(crop, "place " + product.name); }
    const t = sketchBox(crop, strokes);   // the outline in % of the crop: the product must fill exactly this
    return (await api("/api/place", {
      crop: crop.dataUrl, guide: drawGuide(crop, strokes), aspect: crop.aspect, name: product.name, variant: product.variant,
      category: product.category, image: product.image, dims_in: product.dims_in, description: product.description,
      target: [t.x0 / crop.rect.w, t.y0 / crop.rect.h, t.x1 / crop.rect.w, t.y1 / crop.rect.h].map(v => Math.round(v * 100)),   // % of the crop
    })).image;
  }
  // the user's outline in crop pixels
  function sketchBox(crop, strokes) {
    const { rect, W, H } = crop, pts = strokes.flat();
    const xs = pts.map(([x]) => x / 100 * W - rect.x), ys = pts.map(([, y]) => y / 100 * H - rect.y);
    return { x0: Math.max(0, Math.min(...xs)), x1: Math.min(rect.w, Math.max(...xs)), y0: Math.max(0, Math.min(...ys)), y1: Math.min(rect.h, Math.max(...ys)) };
  }
  // the crop with the user's outline drawn on it (where the piece goes)
  function drawGuide(crop, strokes) {
    const { full, rect, W, H } = crop, k = Math.min(1, 1024 / Math.max(full.width, full.height));
    const c = canvas(full.width * k, full.height * k), g = c.getContext("2d");
    g.drawImage(full, 0, 0, c.width, c.height);
    const at = ([x, y]) => [(x / 100 * W - rect.x) * k, (y / 100 * H - rect.y) * k];
    g.lineCap = g.lineJoin = "round";
    for (const [w, color] of [[Math.max(8, c.width / 60), "rgba(255,0,200,.35)"], [Math.max(3, c.width / 160), "#ff00c8"]]) {
      g.lineWidth = w; g.strokeStyle = color;
      for (const s of strokes) { g.beginPath(); s.forEach((p, i) => g[i ? "lineTo" : "moveTo"](...at(p))); g.stroke(); }
    }
    return c.toDataURL("image/jpeg", 0.9);
  }

  // mock recolor: tint an ellipse inside the tracked box toward a color picked from the colorway name
  function mockTint(crop, name) {
    const { full, rect, box, W, H } = crop;
    const c = canvas(full.width, full.height), g = c.getContext("2d");
    g.drawImage(full, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height), px = d.data;
    let hash = 0; for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
    const [tr, tg, tb] = hsl(hash % 360, .55, .5);
    const bx0 = box[1] / 1000 * W - rect.x, by0 = box[0] / 1000 * H - rect.y, bx1 = box[3] / 1000 * W - rect.x, by1 = box[2] / 1000 * H - rect.y;
    const cx = (bx0 + bx1) / 2, cy = (by0 + by1) / 2, rx = (bx1 - bx0) / 2.4, ry = (by1 - by0) / 2.4;
    for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) {
      if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 > 1) continue;
      const i = (y * c.width + x) * 4, l = (px[i] * .3 + px[i + 1] * .59 + px[i + 2] * .11) / 255;
      px[i] = tr * l * 1.6; px[i + 1] = tg * l * 1.6; px[i + 2] = tb * l * 1.6;
    }
    g.putImageData(d, 0, 0);
    return c.toDataURL("image/jpeg", 0.92);
  }
  function hsl(h, s, l) {
    const f = n => { const k = (n + h / 30) % 12, a = s * Math.min(l, 1 - l); return 255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))); };
    return [f(0), f(8), f(4)];
  }

  /* ---------- 4. recolored crop -> transparent overlay ---------- */
  // Only pixels that really changed are kept (soft mask), edges feathered, so it blends into the render.
  // limit: {x0, y0, x1, y1} in crop pixels: anything changed outside it (plus a margin; more below, for the shadow) is dropped
  // cover: another result made on the same crop (e.g. the sketched piece that's in the picture now); its changed pixels
  // are covered too, so this overlay also hides that piece (used for a sketched piece's similar products)
  // solid: holes inside the changed piece are filled, so where the new product looks like the old one (or the floor)
  // the old one doesn't show through
  async function makeOverlay(crop, recoloredSrc, limit, cover, solid) {
    const { full, rect } = crop, w = full.width, h = full.height;
    const rec = await loadImage(recoloredSrc);
    const c = canvas(w, h), g = c.getContext("2d");
    g.drawImage(rec, 0, 0, w, h);                                   // back to the exact size of the crop
    const out = g.getImageData(0, 0, w, h), o = out.data;
    const base = full.getContext("2d").getImageData(0, 0, w, h).data;
    let cv = null;
    if (cover) { const t = canvas(w, h), tg = t.getContext("2d"); tg.drawImage(await loadImage(cover), 0, 0, w, h); cv = tg.getImageData(0, 0, w, h).data; }
    const diff = (p, i) => Math.max(Math.abs(p[i] - base[i]), Math.abs(p[i + 1] - base[i + 1]), Math.abs(p[i + 2] - base[i + 2]));
    let a = new Float32Array(w * h);
    for (let i = 0, j = 0; j < a.length; i += 4, j++) {
      a[j] = Math.max(smooth(14, 42, diff(o, i)), cv ? smooth(14, 42, diff(cv, i)) : 0);
    }
    if (solid) { const f = fillShape(a, w, h); for (let j = 0; j < a.length; j++) a[j] = Math.max(a[j], f[j]); }
    const r = Math.max(1, Math.round(Math.min(w, h) * 0.012));
    a = boxBlur(boxBlur(a, w, h, r), w, h, r);
    const feather = Math.max(2, Math.min(w, h) * 0.06);
    for (let y = 0, j = 0; y < h; y++) for (let x = 0; x < w; x++, j++) {
      // no fade on a side that is the picture's own edge (nothing beyond it to blend into)
      let edge = Math.min(1, Math.min(rect.x > 0 ? x : 1e9, rect.x + rect.w < crop.W ? w - 1 - x : 1e9,
                                      rect.y > 0 ? y : 1e9, rect.y + rect.h < crop.H ? h - 1 - y : 1e9) / feather);
      if (limit) {
        const mx = (limit.x1 - limit.x0) * 0.15 + feather, my = (limit.y1 - limit.y0) * 0.15 + feather;
        const out = Math.max(limit.x0 - mx - x, x - (limit.x1 + mx), limit.y0 - my - y, y - (limit.y1 + my * 1.6), 0);
        edge *= Math.max(0, 1 - out / feather);
      }
      o[j * 4 + 3] = 255 * Math.min(1, a[j] * 1.4) * edge;
    }
    g.putImageData(out, 0, 0);
    return { canvas: c, rect };
  }
  // the changed piece's outline: clearly changed pixels, slightly closed, only big pieces kept (noise and specks
  // dropped), every hole inside them filled; nothing grows past the outline
  function fillShape(a, w, h) {
    const n = w * h, r = Math.max(1, Math.round(Math.min(w, h) * 0.006));
    const g = boxBlur(boxBlur(Float32Array.from(a, v => v > 0.6 ? 1 : 0), w, h, r), w, h, r);
    const d = new Float32Array(n); for (let j = 0; j < n; j++) d[j] = g[j] > 0.02 ? 1 : 0;
    const e = boxBlur(boxBlur(d, w, h, r), w, h, r), m = new Uint8Array(n);
    for (let j = 0; j < n; j++) m[j] = e[j] > 0.98 ? 1 : 0;
    const lab = new Int32Array(n), sizes = [0], st = [];
    for (let s0 = 0; s0 < n; s0++) if (m[s0] && !lab[s0]) {
      const id = sizes.length; let cnt = 0; lab[s0] = id; st.push(s0);
      while (st.length) { const j = st.pop(), x = j % w; cnt++;
        if (x > 0 && m[j - 1] && !lab[j - 1]) { lab[j - 1] = id; st.push(j - 1); }
        if (x < w - 1 && m[j + 1] && !lab[j + 1]) { lab[j + 1] = id; st.push(j + 1); }
        if (j >= w && m[j - w] && !lab[j - w]) { lab[j - w] = id; st.push(j - w); }
        if (j < n - w && m[j + w] && !lab[j + w]) { lab[j + w] = id; st.push(j + w); } }
      sizes.push(cnt);
    }
    const keep = sizes.map(c => c > n * 0.03), out = new Uint8Array(n);
    const push = j => { if (!keep[lab[j]] && !out[j]) { out[j] = 1; st.push(j); } };
    for (let x = 0; x < w; x++) { push(x); push((h - 1) * w + x); }
    for (let y = 0; y < h; y++) { push(y * w); push(y * w + w - 1); }
    while (st.length) { const j = st.pop(), x = j % w;
      if (x > 0) push(j - 1); if (x < w - 1) push(j + 1); if (j >= w) push(j - w); if (j < n - w) push(j + w); }
    const res = new Float32Array(n); for (let j = 0; j < n; j++) res[j] = out[j] ? 0 : 1;
    return res;
  }
  const smooth = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
  function boxBlur(src, w, h, r) {
    const tmp = new Float32Array(src.length), dst = new Float32Array(src.length);
    for (let y = 0; y < h; y++) {
      let s = 0; const row = y * w;
      for (let x = -r; x <= r; x++) s += src[row + Math.min(w - 1, Math.max(0, x))];
      for (let x = 0; x < w; x++) {
        tmp[row + x] = s / (2 * r + 1);
        s += src[row + Math.min(w - 1, x + r + 1)] - src[row + Math.max(0, x - r)];
      }
    }
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let y = -r; y <= r; y++) s += tmp[Math.min(h - 1, Math.max(0, y)) * w + x];
      for (let y = 0; y < h; y++) {
        dst[y * w + x] = s / (2 * r + 1);
        s += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x];
      }
    }
    return dst;
  }

  /* ---------- 5. render + chosen overlays -> one image ---------- */
  async function flatten(renderSrc, overlays) {
    const im = await loadImage(renderSrc), c = canvas(im.naturalWidth, im.naturalHeight), g = c.getContext("2d");
    g.drawImage(im, 0, 0);
    for (const o of overlays) g.drawImage(o.canvas, o.rect.x, o.rect.y, o.rect.w, o.rect.h);
    return c.toDataURL("image/jpeg", 0.93);
  }

  /* ---------- 6. a picture made on a crop of a photo -> pasted back onto the whole photo ---------- */
  // sp = {x, y, w, h}: where that crop sits in the photo (fractions). Inner edges are feathered so there's no seam.
  async function pasteInto(photoSrc, imgSrc, sp) {
    const [ph, im] = await Promise.all([loadImage(photoSrc), loadImage(imgSrc)]);
    const W = ph.naturalWidth, H = ph.naturalHeight, c = canvas(W, H), g = c.getContext("2d");
    g.drawImage(ph, 0, 0);
    const rx = Math.round(sp.x * W), ry = Math.round(sp.y * H), rw = Math.round(sp.w * W), rh = Math.round(sp.h * H);
    const t = canvas(rw, rh), tg = t.getContext("2d");
    tg.drawImage(im, 0, 0, rw, rh);
    const f = Math.max(8, Math.round(rw * 0.04));
    tg.globalCompositeOperation = "destination-in";
    const edges = [[rx > 1, [0, 0, f, 0]], [rx + rw < W - 1, [rw, 0, rw - f, 0]], [ry > 1, [0, 0, 0, f]], [ry + rh < H - 1, [0, rh, 0, rh - f]]];
    for (const [inner, [x0, y0, x1, y1]] of edges) if (inner) {
      const grad = tg.createLinearGradient(x0, y0, x1, y1);
      grad.addColorStop(0, "rgba(0,0,0,0)"); grad.addColorStop(1, "rgba(0,0,0,1)");
      tg.fillStyle = grad; tg.fillRect(0, 0, rw, rh);
    }
    g.drawImage(t, rx, ry);
    return c.toDataURL("image/jpeg", 0.93);
  }

  window.Variants = { pasteInto, track, cropForRecolor, recolor, swap, place, sketchBox, makeOverlay, flatten };
})();
