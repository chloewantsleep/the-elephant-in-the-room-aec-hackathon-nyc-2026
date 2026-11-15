/* Demo walkthrough: one button plays the whole pipeline on the lounge example for presentations.
 * It drives the real UI: a fake cursor glides to each control and clicks it. No AI calls (demo renders).
 *   Space = pause / play · → = next beat · ← = previous beat · Esc = stop
 * Deep link: #walkthrough starts it on load.
 */
(() => {
  const DWELL = 1500;   // ms a beat stays on screen after its actions, before the next one starts
  const PACE = 0.6;     // scales every scripted pause (not the app's own render/plan time)
  const SWAP_RENDER = "assets/walkthrough-swap.jpg";   // the baked AI edit for these swaps (scripts/bake_walkthrough.js)
  let SWAPS = { sofa: "ikea:s29318319", armchair: "ikea:30533493", rug: "ikea:20595698" };
  fetch("walkthrough-swaps.json").then(r => r.json()).then(j => { SWAPS = j; }).catch(() => {});
  // the sample lounge demo (app.js demoRoom): swap to its prepared similar products and show them instantly, no baked picture
  const DEMO_SWAPS = { sofa: "ikea:20245049", armchair: "ikea:30533493", coffee_table: "ikea:70497582" };   // STOCKHOLM, EKENÄSET, FRÖTORP
  const demo = () => typeof demoRoom === "function" && demoRoom();
  // swapping pieces + re-rendering: shown again now that saved looks are found by content (demo-cache/demo-index.json),
  // so they match on any machine; #noswaps leaves those two steps out
  const SHOW_SWAPS = !/(^|[#&])noswaps\b/.test(location.hash);
  // one runner at a time: skip/back bump `gen` and queue `pending`; the runner's waits see gen !== live and unwind
  let on = false, beat = 0, fast = false, paused = false, gen = 0, live = 0, running = false, pending = null;
  const $ = s => document.querySelector(s);
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  // waits that respect fast-forward (skip/back) and pause; throw when the walkthrough is stopped or restarted
  const check = () => { if (gen !== live) throw "stop"; };
  async function wait(ms) {
    check();
    ms *= PACE;
    for (let t = 0; t < ms && !fast; ) {
      await sleep(50); check();
      if (!paused) t += 50;
    }
  }

  // real-time wait for the app (renders, panels), even while fast-forwarding
  async function until(cond, ms = 5000) {
    check();
    for (let t = 0; !cond() && t < ms; t += 50) { await sleep(50); check(); }
  }

  const cursor = Object.assign(document.createElement("div"), { id: "wt-cursor" });
  const cap = Object.assign(document.createElement("div"), { id: "wt-cap" });
  const btn = Object.assign(document.createElement("button"), { id: "wt-btn", className: "pill", textContent: "▶ Walkthrough",
    title: "Play the demo walkthrough (Space pause · ← → step · Esc stop)" });
  btn.addEventListener("click", e => { e.stopPropagation(); start(); });
  document.body.append(cursor, cap);
  (document.querySelector(".frame") || document.body).append(btn);   // beside the logo, moves with the frame

  async function moveTo(el) {
    const r = el.getBoundingClientRect();
    cursor.style.left = r.left + r.width / 2 + "px"; cursor.style.top = r.top + r.height / 2 + "px";
    cursor.classList.add("show");
    await wait(fast ? 0 : 700);   // ×PACE, matches the cursor glide
  }
  const find = sel => typeof sel === "function" ? sel() : document.querySelector(sel);
  async function hover(sel, ms = 900) { const el = find(sel); if (el) { await moveTo(el); await wait(ms); } }
  async function tap(sel, after = 500) {
    await until(() => find(sel), 4000);   // it may still be rendering
    const el = find(sel);
    if (!el) return;
    el.scrollIntoView?.({ block: "nearest" });
    await moveTo(el);
    cursor.classList.remove("press"); void cursor.offsetWidth; cursor.classList.add("press");
    el.click();
    await wait(after);
  }
  const chip = label => () => [...document.querySelectorAll('.quick [data-action="chat"]')].find(b => b.dataset.label === label || b.dataset.val === label);
  const pin = cat => () => { const i = (S.scene || []).findIndex(it => it.cat === cat); return i < 0 ? null : document.querySelector(`.hs-pill[data-idx="${i}"]`); };
  // click a piece's pin, then the alternative to swap in (straight through the app if it isn't listed)
  async function swap(cat, pid) {
    await tap(pin(cat), 700);
    const i = S.scene.findIndex(it => it.cat === cat);
    if (i < 0) return;
    const alt = `.alt[data-pid="${pid}"]`;
    await until(() => find(alt), 1200);
    if (find(alt)) { find(alt).closest("details")?.setAttribute("open", ""); await tap(alt, 700); }
    else { changeSceneProduct(i, pid, null); render(); }
  }
  // the labels button (bottom right): hide every pin to show the whole picture, then bring them back
  async function fullView(ms) {
    await tap('[data-action="labels"]', ms);
    await tap('[data-action="labels"]', 300);
  }

  // back to a clean start: lounge example, nothing kept, demo renders, Needs open
  async function reset() {
    await until(() => !S.rendering, 3000);
    document.body.classList.remove("no-labels");   // a demo render still landing from a skipped beat would bring its picture back
    Object.assign(S, { step: NEEDS, needsMin: false, chat: null, options: [], opt: 0, scene: null, sel: null, dirty: true,
      cart: "closed", cartView: "list", preview: null, previewAlt: null, last: null, renders: {}, before: false, live: false,
      existing: null, sizeOpen: false, shopSelected: null });
    Object.assign(S.needs, { room: "living", style: "Warm minimal", budget: 3000, notes: "" });
    Object.assign(S.space, { photo: "demo", ex: 0, data: null });
    if (typeof chatOpen !== "undefined") chatOpen = false;
    showImage(); render();
    await loadBakedFurniture(); render();
    // demo: load the saved picture and every look (options, colors, swaps) before the first beat, so switching is instant
    if (typeof demoWarm === "function" && demoRoom()) {
      const w = demoWarm();
      let done = false; w.finally(() => { done = true; });
      if (!done) cap.innerHTML = `<span class="wt-s">Getting the demo ready…</span>`;
      await until(() => done, 30000);
      caption();
    }
  }

  const BEATS = [
    { t: "Start from one photo", s: "here: the lounge at the AEC Hackathon venue",
      run: async () => { await wait(1200); await hover(".photo-mini", 1200); } },
    { t: "It sees what's already there", s: "each piece is found and cut out; keep it or ditch it",
      run: async () => {
        await hover(".fx-strip", 800);
        await tap('.fx[data-id="e1"]', 900);   // keep the glass coffee table…
        await tap('.fx[data-id="e1"]', 500);   // …then start fresh for today's demo
      } },
    { t: "A 30-second brief", s: "room, style, budget, what you need",
      run: async () => {
        await tap(chip("living"), 700);
        await tap(chip("Warm minimal"), 700);
        await tap(chip("3000"), 700);
        await tap(chip("Pet-friendly"), 600);
        await tap(chip("Easy to clean"), 600);
        await tap(chip("__done"), 900);
      } },
    { t: "Three complete designs", s: "real products, real prices, checked against the wall and the budget",
      run: async () => {
        await tap(".next-arrow", 300);
        await until(() => S.step === DESIGN && !S.generating && S.scene);
        await wait(900);
        for (const k of [1, 2, 0]) {   // pick each option: the picture switches to it (demo: saved, instant)
          await tap(`.opt[data-idx="${k}"]`, 300);
          await until(() => !S.rendering && currentRender(), 6000);
          await wait(k ? 1100 : 700);
        }
      } },
    { t: "Rendered into your room", s: "the picked pieces, placed in your own photo",
      run: async () => {
        await tap('[data-action="render"]', 200);
        await until(() => !S.rendering && currentRender());
        await wait(1000);
        await tap('[data-action="before"]', 1100);   // before…
        await tap('[data-action="before"]', 400);    // …and after
      } },
    { t: "The whole picture", s: "labels off: this is the render",
      run: async () => { await fullView(2600); } },
    { t: "Swap anything", hidden: !SHOW_SWAPS, s: "click a piece, pick another that fits: sofa, armchair, coffee table",
      run: async () => {
        for (const [cat, pid] of Object.entries(demo() ? DEMO_SWAPS : SWAPS)) await swap(cat, pid);
        await tap('[data-action="close"]', 300);
      } },
    { t: "Re-render just what changed", hidden: !SHOW_SWAPS, s: "the AI edits only the swapped pieces, everything else stays put",
      run: async () => {
        // the baked edit stands in for the live Gemini call (same request, rendered ahead of time)
        const b = find('[data-action="render"]');
        if (b) { await moveTo(b); cursor.classList.remove("press"); void cursor.offsetWidth; cursor.classList.add("press"); }
        if (demo()) { await renderScene(); await until(() => !S.rendering && currentRender(), 4000); }   // already prepared: shown at once
        else {
          S.rendering = true; S.before = false; render();
          await wait(fast ? 0 : 2200);
          S.rendering = false; rememberRender(sceneSig(), SWAP_RENDER, true); render();
        }
        await wait(900);
        await fullView(2600);
      } },
    { t: "Shop the list", s: "every piece with a link to buy, the budget left, an FF&E schedule",
      run: async () => {
        await tap('#rail [data-action="cart"]', 1400);   // the list beside the room (works from Design or Edit)
        await hover("#drawer .amt a", 1000);
        await hover('#drawer [data-action="schedule-pdf"]', 900);
      } },
    { t: "Your room, itemized", s: "the same design as a plan, numbered against the list",
      run: async () => { await tap('[data-action="shop-view"][data-view="room"]', 1400); await hover("#cartx .shop-marker", 1000); await hover("#cartx .shop-item", 800); } },
    { t: "Photo → brief → design → render → shop", s: "The Elephant in the Room", end: true,
      run: async () => { cursor.classList.remove("show"); await tap('[data-action="cart-close"]', 300); cursor.classList.remove("show"); } },
  ].filter(b => !b.hidden);

  function caption() {
    const b = BEATS[beat];
    // a one-line subtitle: step, title, a few words; × stops (keys: Space pause, ← → step, Esc stop)
    cap.innerHTML = `<span class="wt-n">${beat + 1}/${BEATS.length}</span><b>${b.t}</b><span class="wt-s">${b.s}</span>${paused ? `<span class="wt-n">paused</span>` : ""}<button data-wt="stop" aria-label="Stop the walkthrough">×</button>`;
    cap.classList.toggle("paused", paused);
  }

  // play from beat `from`: reset, fast-forward through the earlier beats, then play normally
  async function play(from) {
    beat = from; caption();   // next/prev count from the beat asked for, even before it's reached
    if (running) { pending = from; gen++; return; }
    running = true;
    for (let f = from; f != null; f = pending) {
      pending = null; live = ++gen;
      try { await playFrom(f); }
      catch (e) { if (e !== "stop") { console.error(e); pending = null; stop(); } }
    }
    running = false; fast = false;
  }
  async function playFrom(from) {
    fast = from > 0;
    await reset();
    for (let b = 0; b < BEATS.length; b++) {
      check();
      if (b >= from) { fast = false; beat = b; caption(); }
      await BEATS[b].run();
      if (fast) continue;
      if (BEATS[b].end) break;
      await wait(DWELL);
    }
    cursor.classList.remove("show");
    await wait(5000);   // the closing line stays a moment, then the subtitle goes
    stop();
  }
  function next() {
    if (beat >= BEATS.length - 1) return stop();
    paused = false; play(beat + 1);
  }
  function prev() { paused = false; play(Math.max(0, beat - 1)); }
  function start() {
    on = true; paused = false; document.body.classList.add("walkthrough");
    play(0);
  }
  function stop() {
    pending = null; gen++; on = false; fast = false; paused = false;
    document.body.classList.remove("walkthrough");
    cursor.classList.remove("show"); cap.innerHTML = "";
  }

  cap.addEventListener("click", e => {
    const a = e.target.closest("[data-wt]")?.dataset.wt;
    if (!a) return;
    e.stopPropagation();
    if (a === "next") next(); else if (a === "prev") prev(); else if (a === "stop") stop();
    else { paused = !paused; caption(); }
  });
  // while playing, the presenter's keys drive the walkthrough instead of the app
  addEventListener("keydown", e => {
    if (!on) return;   // the app focuses the chat input after answers; the presenter isn't typing during the walkthrough
    const k = e.key;
    if (!["ArrowRight", "ArrowLeft", " ", "Escape", "PageDown", "PageUp"].includes(k)) return;
    e.preventDefault(); e.stopImmediatePropagation();
    if (k === "ArrowRight" || k === "PageDown") next();
    else if (k === "ArrowLeft" || k === "PageUp") prev();
    else if (k === "Escape") stop();
    else { paused = !paused; caption(); }
  }, true);

  if (/(^|[#&])walkthrough\b/.test(location.hash)) {
    // after the intro and the product data
    const go = () => (typeof P !== "undefined" && P.length) ? setTimeout(start, 2600) : setTimeout(go, 200);
    go();
  }
})();
