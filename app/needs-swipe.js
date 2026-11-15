/* Needs chat, style question: swipe 8 real products, then sum up your style.
 *
 *   ♥ / → / drag right = like     ✕ / ← / drag left = skip
 *   after the last card: "You're a Warm Woody Minimalist. I'll lean toward beige, brown, solid wood."
 *   and S.needs.style becomes that name (it flows into the brief and the render prompt).
 *   Tapping a style chip still works as before.
 *
 * Loaded before app.js; uses its globals (S, P, byId, TEMPLATES, QUESTIONS, NEEDS, money, esc, imgOf,
 * say, chatNext, renderPanel) only at call time.
 */
const DECK_SIZE = 8;
const colorsOf = p => (p.colors || []).map(c => c.name);

function swipeReset() {
  S.deck = null; S.deckAt = 0;
  S.taste = { liked: [], skipped: [], colors: {}, materials: {} };
}

// real products from this room's categories, spread over different colors so the deck shows real choices
function buildDeck() {
  const cats = (TEMPLATES[S.needs.room] || []).map(s => s.cat);
  const seenColor = {}, deck = [];
  const pools = cats.map(c => P.filter(p => p.category === c && p.images && (p.images.main_local || p.images.main))
    .sort((a, b) => a.id.localeCompare(b.id)));   // stable order for demos
  for (let round = 0; deck.length < DECK_SIZE && round < 6; round++) {
    for (const pool of pools) {
      if (deck.length >= DECK_SIZE) break;
      const pick = pool.filter(p => !deck.includes(p.id))
        .sort((a, b) => (seenColor[colorsOf(a)[0]] || 0) - (seenColor[colorsOf(b)[0]] || 0))[0];
      if (!pick) continue;
      deck.push(pick.id);
      const c = colorsOf(pick)[0]; seenColor[c] = (seenColor[c] || 0) + 1;
    }
  }
  return deck;
}

const swiping = () => S.step === NEEDS && !S.needsMin && QUESTIONS[S.chat?.q]?.key === "style" && S.deck && S.deckAt < S.deck.length;

function swipe(like) {
  if (!S.taste) swipeReset();
  const id = S.deck?.[S.deckAt];
  if (!id) return;
  const t = S.taste;
  (like ? t.liked : t.skipped).push(id);
  S.deckAt++;
  recomputeTaste();
  S.dirty = true;
  if (S.deckAt >= S.deck.length) {
    say("me", `Liked ${t.liked.length} of ${S.deck.length}`);
    say("bot", t.liked.length ? `You're ${/^[aeiou]/i.test(S.needs.style) ? "an" : "a"} ${S.needs.style}. I'll lean toward ${tasteWords()}.`
      : "None of those, noted. Tap a style below, or tell me what you like.");
    if (t.liked.length) chatNext();
  }
}

function recomputeTaste() {
  const t = S.taste;
  t.colors = {}; t.materials = {};
  const add = (bag, k, d) => { bag[k] = (bag[k] || 0) + d; };
  for (const id of t.liked) { const p = byId[id]; colorsOf(p).forEach(c => add(t.colors, c, 1)); (p.materials || []).forEach(m => add(t.materials, m, 1)); }
  for (const id of t.skipped) { const p = byId[id]; colorsOf(p).forEach(c => add(t.colors, c, -0.5)); (p.materials || []).forEach(m => add(t.materials, m, -0.25)); }
  if (t.liked.length) S.needs.style = personaName();
}

const topKeys = (bag, n) => Object.entries(bag).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k]) => k);
const tasteWords = () => [...topKeys(S.taste.colors, 2), ...topKeys(S.taste.materials, 2)].join(", ") || "a bit of everything";

// top color + top material -> a style name
function personaName() {
  const ADJ = { white: "Bright", beige: "Warm", black: "Bold", brown: "Woody", gray: "Calm", green: "Botanical",
                yellow: "Sunny", red: "Spirited", pink: "Soft", orange: "Retro", blue: "Coastal" };
  const NOUN = { "solid wood": "Natural Wood", "wood veneer": "Warm Wood", steel: "Industrial", aluminum: "Sleek",
                 glass: "Airy", polyester: "Cozy", cotton: "Cozy", linen: "Linen", leather: "Leather", rattan: "Rattan",
                 bamboo: "Bamboo", plywood: "Modern", particleboard: "Modern", fiberboard: "Modern", plastic: "Playful" };
  const c = topKeys(S.taste.colors, 1)[0], m = topKeys(S.taste.materials, 3).find(x => NOUN[x]);
  return `${ADJ[c] || "Easygoing"} ${NOUN[m] || "Modern"} Minimalist`;
}

// the card, shown inside the chat while the style question is open
function swipeWidget() {
  if (!P.length) return "";
  if (!S.taste) swipeReset();
  if (!S.deck) { S.deck = buildDeck(); S.deckAt = 0; }
  const p = byId[S.deck[S.deckAt]];
  if (!p) return "";
  return `<div class="swipe">
    <div class="swipe-card" data-swipe>
      <img src="${esc(imgOf(p))}" alt="" draggable="false">
      <div class="meta"><b>${esc(p.name)}</b><small>${esc(p.variant || "")} · ${money(p.price.amount)}</small></div>
      <span class="count">${S.deckAt + 1} / ${S.deck.length}</span>
    </div>
    <div class="swipe-btns">
      <button class="round" data-action="swipe" data-like="0" aria-label="Skip" title="Skip (←)">✕</button>
      <button class="round like" data-action="swipe" data-like="1" aria-label="Like" title="Like (→)">♥</button>
    </div>
  </div>`;
}

/* like / skip buttons */
document.addEventListener("click", e => {
  const b = e.target.closest('[data-action="swipe"]');
  if (!b) return;
  swipe(b.dataset.like === "1"); renderPanel();
});

/* drag the card left or right */
let swipeDrag = null;
document.addEventListener("pointerdown", e => {
  const c = e.target.closest("[data-swipe]");
  if (!c) return;
  swipeDrag = { x: e.clientX, el: c, dx: 0 };
  c.setPointerCapture(e.pointerId);
});
document.addEventListener("pointermove", e => {
  if (!swipeDrag) return;
  swipeDrag.dx = e.clientX - swipeDrag.x;
  swipeDrag.el.style.transform = `translateX(${swipeDrag.dx}px) rotate(${swipeDrag.dx / 20}deg)`;
  swipeDrag.el.dataset.hint = swipeDrag.dx > 40 ? "like" : swipeDrag.dx < -40 ? "skip" : "";
});
document.addEventListener("pointerup", () => {
  if (!swipeDrag) return;
  const { dx, el } = swipeDrag; swipeDrag = null;
  if (Math.abs(dx) > 90) { swipe(dx > 0); renderPanel(); }
  else { el.style.transform = ""; el.dataset.hint = ""; }
});

/* ← / → swipe while the deck is up (registered before app.js, so it runs before step navigation) */
addEventListener("keydown", e => {
  if (/INPUT|TEXTAREA/.test(document.activeElement.tagName)) return;
  if (!swiping() || (e.key !== "ArrowRight" && e.key !== "ArrowLeft")) return;
  e.stopImmediatePropagation();
  swipe(e.key === "ArrowRight"); renderPanel();
});
