/* Demo walkthrough: one button plays the whole pipeline on the lounge example for presentations.
 * It drives the real UI: a fake cursor glides to each control and clicks it. No AI calls (demo renders).
 *   Space = pause / play · → = next beat · ← = previous beat · Esc = stop
 * Deep link: #walkthrough starts it on load.
 */
(() => {
  const DWELL = 3200;   // ms a beat stays on screen after its actions, before the next one starts
  // one runner at a time: skip/back bump `gen` and queue `pending`; the runner's waits see gen !== live and unwind
  let on = false, beat = 0, fast = false, paused = false, gen = 0, live = 0, running = false, pending = null;
  const $ = s => document.querySelector(s);
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  // waits that respect fast-forward (skip/back) and pause; throw when the walkthrough is stopped or restarted
  const check = () => { if (gen !== live) throw "stop"; };
  async function wait(ms) {
    check();
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
    await wait(fast ? 0 : 750);
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
  const sofaPin = () => { const i = (S.scene || []).findIndex(it => it.cat === "sofa"); return i < 0 ? null : document.querySelector(`.hs-pill[data-idx="${i}"]`); };

  // back to a clean start: lounge example, nothing kept, demo renders, Needs open
  async function reset() {
    await until(() => !S.rendering, 3000);   // a demo render still landing from a skipped beat would bring its picture back
    Object.assign(S, { step: NEEDS, needsMin: false, chat: null, options: [], opt: 0, scene: null, sel: null, dirty: true,
      cart: "closed", cartView: "list", preview: null, previewAlt: null, last: null, renders: {}, before: false, live: false,
      existing: null, sizeOpen: false, shopSelected: null });
    Object.assign(S.needs, { room: "living", style: "Warm minimal", budget: 3000, notes: "" });
    Object.assign(S.space, { photo: "demo", ex: 0, data: null });
    if (typeof chatOpen !== "undefined") chatOpen = false;
    showImage(); render();
    await loadBakedFurniture(); render();
  }

  const BEATS = [
    { t: "Start from one photo", s: "Any room. Here: the lounge at the AEC Hackathon venue.",
      run: async () => { await wait(1200); await hover(".photo-mini", 1200); } },
    { t: "It sees what's already there", s: "Each piece in the photo is found and cut out. Tap to keep it or ditch it.",
      run: async () => {
        await hover(".fx-strip", 800);
        await tap('.fx[data-id="e1"]', 900);   // keep the glass coffee table…
        await tap('.fx[data-id="e1"]', 500);   // …then start fresh for today's demo
      } },
    { t: "A 30-second brief", s: "Room, style, budget, what you need. Tap or just type.",
      run: async () => {
        await tap(chip("living"), 700);
        await tap(chip("Warm minimal"), 700);
        await tap(chip("3000"), 700);
        await tap(chip("Pet-friendly"), 600);
        await tap(chip("Easy to clean"), 600);
        await tap(chip("__done"), 900);
      } },
    { t: "Three complete designs", s: "Real products with real prices and sizes, checked against the wall and the budget.",
      run: async () => {
        await tap(".next-arrow", 300);
        await until(() => S.step === DESIGN && !S.generating && S.scene);
        await wait(900);
        await hover('.opt[data-idx="1"]', 900); await hover('.opt[data-idx="2"]', 900); await hover('.opt[data-idx="0"]', 600);
      } },
    { t: "Rendered into your room", s: "The picked pieces, placed in your own photo.",
      run: async () => {
        await tap('[data-action="render"]', 300);
        await until(() => !S.rendering && currentRender());
        await wait(1700);
        await tap('[data-action="before"]', 1300);   // before…
        await tap('[data-action="before"]', 600);    // …and after
      } },
    { t: "Change anything", s: "Click a piece: why it's there, colorways, and swaps that still fit.",
      run: async () => {
        await tap(sofaPin, 1200);
        await hover(".selection-reasons", 1200);
        await hover(".facts .fit", 900);
      } },
    { t: "Shop the list", s: "Every piece with a link to buy, the budget left, and an FF&E schedule for the designer.",
      run: async () => {
        await tap(".next-arrow", 1400);
        await hover("#drawer .amt a", 1000);
        await hover('#drawer [data-action="schedule-pdf"]', 900);
      } },
    { t: "Your room, itemized", s: "The same design as a plan, every piece numbered against the list.",
      run: async () => { await tap('[data-action="shop-view"][data-view="room"]', 1400); await hover("#cartx .shop-marker", 1000); await hover("#cartx .shop-item", 800); } },
    { t: "Photo → brief → design → render → shop", s: "The Elephant in the Room.", end: true,
      run: async () => { cursor.classList.remove("show"); await tap('[data-action="cart-close"]', 300); cursor.classList.remove("show"); } },
  ];

  function caption() {
    const b = BEATS[beat];
    cap.innerHTML = `<div class="wt-top"><span>${beat + 1} / ${BEATS.length}</span>
        <span class="wt-ctl"><button data-wt="prev" aria-label="Previous">‹</button><button data-wt="pause" aria-label="${paused ? "Play" : "Pause"}">${paused ? "▶" : "❚❚"}</button><button data-wt="next" aria-label="Next">›</button><button data-wt="stop" aria-label="Stop">×</button></span></div>
      <b>${b.t}</b><p>${b.s}</p><i class="wt-bar"><i></i></i>`;
    cap.classList.toggle("paused", paused);
  }
  function bar(ms) {
    const i = cap.querySelector(".wt-bar i");
    if (!i) return;
    i.style.transition = "none"; i.style.width = "0";
    void i.offsetWidth;
    i.style.transition = `width ${ms}ms linear`; i.style.width = "100%";
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
      cap.querySelector(".wt-bar")?.classList.add("go"); bar(DWELL);
      await wait(DWELL);
    }
    cursor.classList.remove("show");
    cap.classList.add("done");
  }
  function next() {
    if (beat >= BEATS.length - 1) return stop();
    paused = false; play(beat + 1);
  }
  function prev() { paused = false; play(Math.max(0, beat - 1)); }
  function start() {
    on = true; paused = false; document.body.classList.add("walkthrough");
    cap.classList.remove("done"); play(0);
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
