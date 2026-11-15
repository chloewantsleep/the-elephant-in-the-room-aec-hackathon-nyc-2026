/* First screen: no room photo yet. Real products fly out of the middle (the pitch site's hero field) around a
 * centered dialog that asks for a photo of your room. Upload -> the normal flow; or try the example / watch the
 * walkthrough. Any deep link (#step=…, #walkthrough, #ex=…) skips it.
 */
(() => {
  if (location.hash.length > 1) return;
  const KINDS = ["sofa", "armchair", "coffee", "pendant", "rug", "floorlamp", "shelf", "side", "bed", "nightstand",
                 "dresser", "desk", "dchair", "stool", "mirror", "cabinet", "armchair", "sofa"];
  const DEPTH = 6, NEAR = 0.45, SPEED = 0.5;   // world depth, closest a piece gets, depth units per second
  const clamp01 = v => Math.max(0, Math.min(1, v));
  // seeded spots that keep clear of the dialog in the middle (same scheme as the pitch hero)
  const rnd = (seed => () => { seed = (seed + 0x6d2b79f5) >>> 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; })(11);
  const pts = [];
  while (pts.length < KINDS.length) {
    const x = (rnd() * 2 - 1) * 1.25, y = (rnd() * 2 - 1) * 1.15;
    if (Math.abs(x) < 0.42 && Math.abs(y) < 0.36) continue;
    pts.push({ x, y, z: (pts.length / KINDS.length) * DEPTH + rnd() * 0.3 });
  }

  const ELEPHANT = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M3 17v-5c0-3.5 3-6 6.5-6H13c3.9 0 7 3 7 7v3.5c0 1.1.9 2 2 2"/><path d="M3 17h12.5M6 17v3M10 17v3M15 16v4"/>
    <path d="M13 8.5c-1.6.5-2.1 2.6-1 4.2.9 1.2 3 1.1 3.5-.3"/><circle cx="17.2" cy="10.4" r=".6" fill="currentColor" stroke="none"/></svg>`;
  const el = document.createElement("section");
  el.id = "landing";
  el.setAttribute("aria-label", "Start: upload a photo of your room");
  el.innerHTML = `<div class="ld-field" aria-hidden="true">${KINDS.map(k => `<img src="assets/landing/${k}.png" alt="" draggable="false">`).join("")}</div>
    <div class="ld-brand">${ELEPHANT}</div>
    <div class="ld-card" role="dialog" aria-labelledby="ld-hi">
      <div class="ld-msg"><span class="ld-ava">${ELEPHANT}</span>
        <div><p id="ld-hi"><b>Hi, I'm Elephant.</b></p><p>Show me the room you want to change. One photo is all I need.</p></div></div>
      <button class="ld-drop" data-ld="upload"><b>Upload a room photo ↑</b><small>or drop it here</small></button>
      <p class="ld-alt"><button data-ld="example">Try the example lounge</button><span>·</span><button data-ld="walk">▶ Watch the walkthrough</button></p>
    </div>`;
  document.body.append(el);
  document.body.classList.add("landing-on");
  const imgs = [...el.querySelectorAll(".ld-field img")];

  let open = true, last = performance.now(), cam = 0;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  function frame(now) {
    if (!open) return;
    cam += reduce ? 0 : Math.min(0.05, (now - last) / 1000) * SPEED; last = now;
    const W = innerWidth, H = innerHeight, tw = Math.min(170, Math.max(70, W * 0.095));
    imgs.forEach((im, j) => {
      const f = pts[j], d = ((((f.z - cam) % DEPTH) + DEPTH) % DEPTH) || DEPTH, k = 1 / d;
      const x = W / 2 + f.x * (W / 2) * k, y = H / 2 + f.y * (H / 2) * k;
      // fade in from far away, out as it passes the camera; dim behind the dialog so it stays readable
      const behind = Math.abs(x - W / 2) < 260 && Math.abs(y - H / 2) < 190 ? 0.15 : 1;
      im.style.opacity = (clamp01((DEPTH - d) / 3) * clamp01((d - NEAR) / 0.55) * behind).toFixed(3);
      im.style.width = tw + "px";
      im.style.transform = `translate3d(${(x - tw / 2).toFixed(1)}px,${(y - tw / 2).toFixed(1)}px,0) scale(${(k * 1.2).toFixed(4)})`;
      im.style.zIndex = String(Math.round(100 - d * 2));
    });
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  function close() {
    if (!open) return;
    open = false;
    document.body.classList.remove("landing-on");
    el.classList.add("out");
    setTimeout(() => el.remove(), 600);
  }
  function fromFile(file) {
    if (!file || !file.type.startsWith("image/")) return;
    close(); loadPhoto(file);   // app.js: the normal upload flow
  }
  const input = Object.assign(document.createElement("input"), { type: "file", accept: "image/*", hidden: true });
  el.append(input);
  input.addEventListener("change", () => { fromFile(input.files[0]); input.value = ""; });
  el.addEventListener("click", e => {
    const a = e.target.closest("[data-ld]")?.dataset.ld;
    e.stopPropagation();   // nothing behind reacts while this is up
    if (a === "upload") input.click();
    else if (a === "example") { close(); S.needsMin = false; render(); }
    else if (a === "walk") { close(); document.getElementById("wt-btn")?.click(); }
  });
  const drop = el.querySelector(".ld-drop");
  el.addEventListener("dragover", e => { e.preventDefault(); e.stopPropagation(); drop.classList.add("over"); });
  el.addEventListener("dragleave", e => { if (!el.contains(e.relatedTarget)) drop.classList.remove("over"); });
  el.addEventListener("drop", e => { e.preventDefault(); e.stopPropagation(); drop.classList.remove("over"); fromFile(e.dataTransfer.files[0]); });
  // the app's arrow keys would step through the design behind this screen
  addEventListener("keydown", e => { if (open && /^Arrow/.test(e.key)) e.stopImmediatePropagation(); }, true);
})();
