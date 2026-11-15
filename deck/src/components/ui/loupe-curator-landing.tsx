import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from "react"

// #region story
// Pure: scroll → story beats. No React, no DOM — the test lifts this region and runs it.

export const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x)
/** Smootherstep: zero velocity at both ends, so beats hand over without a jolt. */
export const smooth = (x: number) => {
  x = clamp01(x)
  return x * x * x * (x * (x * 6 - 15) + 10)
}
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t
export const span = (p: number, w: readonly [number, number]) => clamp01((p - w[0]) / (w[1] - w[0]))
/** Frame-rate independent approach toward a target (tau in ms). */
export const approach = (cur: number, target: number, dt: number, tau: number) => target + (cur - target) * Math.exp(-Math.max(0, dt) / tau)

/** 0 → 1 while a stage is pinned inside its track; clamps outside it. */
export const progressFrom = (top: number, height: number, stage: number) => {
  const travel = height - stage
  if (!(travel > 0)) return 0
  return clamp01((0 - top) / travel)
}

/** Track lengths, in stage heights. */
export const TRACK = { intro: 11, words: 3.4, zoom: 8, pile: 3.6 } as const
/** The panel after a pinned stage slides over its last stage-height of travel; the story is over by then. */
export const coverAt = (len: number) => 1 - 1 / (len - 1)

// never = a window that never plays
const NEVER = [2, 3] as const
export const INTRO = {
  fly: [0, 0.09],
  lineOut: [0.02, 0.05],
  open: [0.045, 0.08],
  flip: NEVER,              // no flicking through photos
  grow: [0.07, 0.17],       // the gap grows into the team (the event asks for the team up front)
  teamIn: [0.14, 0.19],     // names fade in, then hold
  shrink: [0.27, 0.31],     // the team shrinks back into the small window…
  close: [0.305, 0.32],      // …and closes
  para: NEVER,
  paraOut: NEVER,
  reopen: [0.32, 0.335],     // a small window opens again…
  regrow: [0.335, 0.44],     // …and zooms out as your room
  caption: [0.45, 0.51],
  captionOut: [0.53, 0.555],
  callouts: [0.555, 0.6],
  strip: [0.58, 0.65],
  swap: [0.61, 0.86],       // every sofa gets its turn before the next panel covers the room (coverAt = 0.9)
} as const
export const ZOOM = { open: [0.02, 0.08], grow: [0.08, 0.2], ui: [0.18, 0.26], drum: [0.26, 0.6], shrink: [0.63, 0.75] } as const
export const PILE = { ink: [0, 0.26], drop: [0.06, 0.5], swap: [0.56, 0.68], type: [0.64, 0.8] } as const
export const WORDS = { from: 0.9, to: -1.9, gap: 0.85 } as const

// ---- the hero's photo field: a fly-through that never runs out
export const FIELD = { depth: 6, near: 0.45, travel: 3.8, idle: 0.07 } as const
/** Screen position, scale and opacity of a photo at world (x, y, z) seen from camera depth cam. */
export function flyAt(x: number, y: number, z: number, cam: number, W: number, H: number) {
  const D = FIELD.depth
  const d = ((((z - cam) % D) + D) % D) || D
  const k = 1 / d
  const o = clamp01((D - d) / 3) * clamp01((d - FIELD.near) / 0.55)
  return { x: W / 2 + x * (W / 2) * k, y: H / 2 + y * (H / 2) * k, s: k, o, d }
}
/** Seeded photo positions that keep clear of the headline in the middle. */
export function fieldLayout(n: number, seed: number) {
  const r = mulberry32(seed)
  const out: { x: number; y: number; z: number }[] = []
  let guard = 0
  while (out.length < n && guard++ < 5000) {
    const x = (r() * 2 - 1) * 1.25
    const y = (r() * 2 - 1) * 1.15
    if (Math.abs(x) < 0.42 && Math.abs(y) < 0.36) continue
    out.push({ x, y, z: (out.length / n) * FIELD.depth + r() * 0.3 })
  }
  return out
}

export type Box = { x: number; y: number; w: number; h: number; r: number }
/** The photo in the gap between two words: it opens to w0 × h0, then grows until it covers the stage. */
export function zoomBox(open: number, grow: number, W: number, H: number, w0: number, h0: number): Box {
  const o = smooth(open)
  const e = smooth(grow)
  const w = lerp(w0 * o, W, e)
  const h = lerp(h0 * (0.55 + 0.45 * o), H, e)
  return { x: (W - w) / 2, y: (H - h) / 2, w, h, r: lerp(5, 0, e) }
}
const px = (n: number) => Math.max(0, n).toFixed(1) + "px"
export const insetOf = (b: Box, W: number, H: number) =>
  "inset(" + px(b.y) + " " + px(W - b.x - b.w) + " " + px(H - b.y - b.h) + " " + px(b.x) + " round " + px(b.r) + ")"
/** The whole picture is shrunk into the box (cover-fit), not cropped by it. */
export const coverScale = (b: Box, W: number, H: number) => (W > 0 && H > 0 ? Math.max(b.w / W, b.h / H, 0.001) : 1)

/** While the gap opens, the photo flicks through faces before settling on today's curator. -1 = settled. */
export const flipAt = (p: number, faces: number) => (p > INTRO.flip[0] && p < INTRO.flip[1] ? Math.floor(span(p, INTRO.flip) * 16) % faces : -1)

/** A card's flight from the manifesto column, through the gap in the grid title, into its grid slot. */
export type Rect = { x: number; y: number; w: number }
export function flightAt(k: number, a: Rect, mid: Rect, b: Rect): Rect {
  if (k <= 0.5) {
    const t = smooth(k / 0.5)
    return { x: lerp(a.x, mid.x, t), y: lerp(a.y, mid.y, t), w: lerp(a.w, mid.w, t) }
  }
  const t = smooth((k - 0.5) / 0.5)
  return { x: lerp(mid.x, b.x, t), y: lerp(mid.y, b.y, t), w: lerp(mid.w, b.w, t) }
}
/** How wide the title's gap is while the card passes through it (0 → 1 → 0). */
export const titleGapAt = (k: number) => smooth(span(k, [0.15, 0.45])) * (1 - smooth(span(k, [0.62, 0.92])))

/** The collections drum: integer = a name dead centre. Each name holds before the drum turns on. */
export function drumAt(p: number, n: number) {
  if (n < 2) return 0
  const raw = span(p, ZOOM.drum) * (n - 1)
  const k = Math.min(n - 2, Math.floor(raw))
  return k + smooth((raw - k - 0.2) / 0.6)
}
/** The scroll progress at which collection i sits dead centre. */
export const drumHold = (i: number, n: number) => ZOOM.drum[0] + (ZOOM.drum[1] - ZOOM.drum[0]) * (n < 2 ? 0 : i / (n - 1))
/** Floating thumbnails drift up and wrap, in stage heights. */
export const floatY = (base: number, q: number, speed: number) => {
  const v = (((base - q * speed) % 1.3) + 1.3) % 1.3
  return v - 0.15
}

/** The giant words: column offset, lime band centre (both px) and each word's "still arriving" amount. */
export function wordsAt(p: number, q: number, H: number, n: number) {
  const col = lerp(WORDS.from, WORDS.to, p) * H
  const band = (p <= 0 ? lerp(-0.1, 0.75, q) : p < 0.65 ? lerp(0.75, 0.45, p / 0.65) : lerp(0.45, -0.75, (p - 0.65) / 0.35)) * H
  const e: number[] = []
  for (let k = 0; k < n; k++) e.push(clamp01((col + k * WORDS.gap * H - 0.5 * H) / (0.45 * H)))
  return { col, band, e }
}

export const pileCount = (p: number, n: number) => Math.min(n, Math.floor(span(p, PILE.drop) * n + 1e-9))

export function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
/** The untouched pile's centre, in fractions of the stage. */
export const PILE_AT = { x: 0.68, y: 0.68 } as const
/** Where tile k lands in the untouched pile (a loose cluster), in fractions of the stage; a new seed reshuffles it. */
export function pileSpot(k: number, seed: number) {
  const r = mulberry32(seed * 977 + k * 131 + 7)
  const a = r() * Math.PI * 2
  const d = Math.sqrt(r())
  return { x: PILE_AT.x + Math.cos(a) * d * 0.1, y: PILE_AT.y + Math.sin(a) * d * 0.14, rot: (r() - 0.5) * 16 }
}

/** The easter egg: every third poke of the sun toggles golden hour. */
export const GOLDEN_TAPS = 3
export const goldenAfter = (taps: number) => Math.floor(taps / GOLDEN_TAPS) % 2 === 1

/** Reduced motion: the scroll snaps between still poses instead of playing the motion. */
export const REDUCED = {
  intro: [[0, 0], [0.2, 0.22], [0.4, 0.48], [0.58, 0.62]],
  pile: [[0, 0.3], [0.5, 1]],
} as const
export function poseFor(p: number, poses: readonly (readonly [number, number])[]) {
  let v = poses[0][1]
  for (const [at, val] of poses) if (p >= at) v = val
  return v
}
export function zoomPoses(n: number) {
  const out: [number, number][] = [[0, 0]]
  for (let i = 0; i < n; i++) out.push([0.1 + (0.75 * i) / n, drumHold(i, n)])
  return out
}

/** The next resting point below the current scroll position, or -1. */
export const nextStop = (stops: number[], y: number) => {
  for (const s of stops) if (s > y + 8) return s
  return -1
}
// #endregion

/* ---------------------------------------------------------------- content */

type Action = { label?: string; href?: string; onClick?: () => void }

export type LoupeCuratorLandingProps = {
  /** Height of every pinned stage. Must be a definite length. */
  height?: string
  brand?: string
  launch?: string
  joinAction?: Action
  signInAction?: Action
  className?: string
  style?: CSSProperties
}

// Products, prices and seat dimensions: data/products.json (catalog snapshot) and data/sofa-annotations.json on main.
// Room images: our venue photo (curator-*) and the in-place sofa renders in demo-renders/highlights (hl-*). Same view, same frame.
type Item = { k: string; name: string; price: number; owned?: boolean; spec?: string; why?: string; need?: string; suggest?: boolean; shop?: string; checks?: string[] }
const usd = (n: number) => "$" + n.toLocaleString("en-US", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })
const meta = (it: Item) => (it.owned ? "Already yours · $0" : (it.shop || "IKEA") + " · " + usd(it.price))
/** The catalog on main: two retailers, one product schema. */
const CATALOG = { total: 371, sources: "IKEA + Home Depot" } as const
const SOURCES: [string, number][] = [
  ["IKEA", 316],
  ["Home Depot", 55],
]

// 2 · your room, and the sofas that can drop into the same spot
type Swap = { img: string; tile: string; name: string; meta: string }
const SWAPS: Swap[] = [
  { img: "curator-0", tile: "armchair", name: "Lounge chairs", meta: "Yours, as it is" },
  { img: "hl-1", tile: "hyltarp", name: "HYLTARP Sectional", meta: "IKEA · $2,149" },
  { img: "hl-5", tile: "stockholm", name: "STOCKHOLM Sofa, leather", meta: "IKEA · $2,499" },
  { img: "hl-6", tile: "vimle", name: "VIMLE Sofa with chaise", meta: "IKEA · $1,899" },
  { img: "hl-7", tile: "soderhamn", name: "SÖDERHAMN Sofa", meta: "IKEA · $1,375" },
  { img: "hl-8", tile: "stockholm25", name: "STOCKHOLM 2025 Sofa", meta: "IKEA · $1,999" },
]
const ROOM_IMGS = ["curator-0", "hl-1", "hl-2", "hl-3", "hl-4", "hl-5", "hl-6", "hl-7", "hl-8"]
/** Where the sofa sits in these frames (fractions of the image), and its rough extent for the highlight. */
const SOFA_AT = { u: 0.27, v: 0.66, ru: 0.23, rv: 0.1 } as const
const IMG_RATIO = 1250 / 1400

// 3 · the talk track opens on the problem alone; it lifts away over this window, then the talk plays
const TALK_PROB = [0.1, 0.24]
// 3 · "Hey Elephant…": what you say, what Elephant decides, and where it lands on the room
type Line = [string, string, string[]?]
const TALK: Line[] = [
  ["you", "Hey Elephant, we\u2019ve got to refine our room."],
  ["you", "I curl up with a book."],
  ["el", "Legs tucked up, or stretched out?", ["posture unclear", "ask, don\u2019t assume"]],
  ["you", "Tucked up."],
  ["el", "Seat depth first, then seat width.", ["seat_depth \u2191 \u00d73", "seat_width \u2191 \u00d71"]],
  ["you", "Keep the rocking chair."],
  ["el", "Kept, in every option.", ["rocking chair: keep", "$0, not in cart"]],
  ["you", "It\u2019s too dark to read at night."],
  ["el", "Adding light where you read.", ["lamp", "aim at the sofa"]],
  ["you", "All in, under $2,500."],
  ["el", "Every pick now checks the total.", ["total \u2264 $2,500"]],
]
/** Decisions pinned on the room: [after TALK line, u, v, category, decision, flip]. */
const PINS: [number, number, number, string, string, boolean, number][] = [
  [4, 0.27, 0.62, "Sofa", "Seat depth first, then width", false, 54],
  [6, 0.84, 0.74, "Rocking chair", "Kept \u00b7 yours", true, 54],
  [8, 0.525, 0.3, "Lamp", "Light the reading spot", false, 44],   // on the rattan pendant over the coffee table
]

// 4 · the comparison: the sofa you have, then real candidates; the last one flies into the room's list
const HYLTARP: Item = { k: "hyltarp", name: "HYLTARP Sectional", price: 0, owned: true, spec: "Seat 23⅝″ deep", why: "Keep it if that’s deep enough.", checks: ["Costs nothing", "Already in place", "Rocking chair still fits"] }
const STOCKHOLM25: Item = { k: "stockholm25", name: "STOCKHOLM 2025 Sofa", price: 1999, spec: "Seat 27⅛″ deep · 84⅝″ wide", why: "Deeper, but most of the budget.", checks: ["Deeper than yours", "Wide seat"] }
const SODERHAMN: Item = { k: "soderhamn", name: "SÖDERHAMN Sleeper sofa", price: 1375, spec: "Seat 36⅝″ deep · 84¼″ wide", why: "Deepest seat here, within budget.", checks: ["Tucked-up reading", "Room to turn"] }
const ROCKSJON: Item = { k: "rocksjon-loveseat", name: "ROCKSJÖN Loveseat", price: 329, spec: "Seat 19⅝″ deep · 18½″ high" }
const PICKS: Item[] = [HYLTARP, STOCKHOLM25, SODERHAMN]
// need: the exact words from the talk this piece answers; suggest: Elephant added it without being asked
const GRID: Item[] = [
  { ...SODERHAMN, need: "I curl up with a book." },
  { k: "poang", name: "Your rocking chair", price: 0, owned: true, need: "Keep the rocking chair.", checks: ["Kept in every option", "Second reading seat", "Costs nothing"] },
  { k: "hd-gooseneck", name: "Hampton Bay Gooseneck Floor Lamp", price: 49.97, shop: "Home Depot", need: "It\u2019s too dark to read at night.", checks: ["Aims at the page", "Light to read"] },
  { k: "coffee", name: "LACK Coffee table", price: 29.99, need: "All in, under $2,500.", checks: ["Reach from the sofa", "Leaves budget for the sofa"] },
  { k: "side", name: "LACK Side table", price: 16.99, need: "I curl up with a book.", checks: ["Book and tea within reach", "Fits by the sofa"] },
  { k: "pendant", name: "SINNERLIG Pendant lamp", price: 99.99, need: "It\u2019s too dark to read at night.", checks: ["Warm evening light", "Light to read"] },
  { k: "rug", name: "STOENSE Rug, low pile", price: 119.99, suggest: true, checks: ["Soft reading corner", "Low pile"] },
  { k: "hd-bookcase", name: "StyleWell 5-Shelf Classic Bookcase", price: 96.75, shop: "Home Depot", need: "I curl up with a book.", checks: ["Home for books", "Near the reading spot"] },
  { k: "cabinet", name: "VIHALS Sideboard", price: 199, suggest: true, checks: ["Hides clutter"] },
  { k: "mirror", name: "NISSEDAL Mirror", price: 99.99, need: "It\u2019s too dark to read at night.", checks: ["Bounces light", "Brighter room"] },
  { k: "stool", name: "TJUSIG Bench with shoe storage", price: 69.99, suggest: true, checks: ["Shoes off at the door", "Seat + storage"] },
  { k: "dchair", name: "TEODORES Chair", price: 55, suggest: true, checks: ["Spare seat for friends"] },
]
const total = (items: Item[]) => items.reduce((a, it) => a + it.price, 0)
// 5 · life changes: a lasting change (moving in together, with a cat) re-plans the room; each move says why
type Move = { op: "Keep" | "Upgrade" | "Add"; it: Item; was?: Item; why: string; tag?: string }
const TEODORES = GRID.find((g) => g.k === "dchair") as Item
const ROCKER = GRID.find((g) => g.k === "poang") as Item
const BOOKCASE = GRID.find((g) => g.k === "hd-bookcase") as Item
const ARMCHAIR: Item = { k: "rocksjon-armchair", name: "ROCKSJÖN Armchair", price: 199, spec: "Seat 19⅝″ deep · 18½″ high" }
const MOVES: Move[] = [
  { op: "Keep", it: SODERHAMN, why: "Already works: the cover comes off and machine-washes (IKEA documents both).", tag: "covers: washable" },
  { op: "Keep", it: ROCKER, why: "Already works: still a reading seat, now one of two." },
  { op: "Upgrade", was: TEODORES, it: ARMCHAIR, why: "The spare guest chair becomes a real seat for someone who lives here.", tag: "seats: 2 people" },
  { op: "Add", it: { ...BOOKCASE, name: "A second StyleWell bookcase" }, why: "Two people’s books, same shelf line, side by side.", tag: "storage \u2191" },
]
const GONE = new Set(MOVES.flatMap((m) => (m.was ? [m.was.k] : [])))
const AFTER: Item[] = MOVES.filter((m) => m.op !== "Keep").map((m) => m.it)
const BUDGET = 2500
// the life change plays on the room board: checks, one swap, one addition, then the budget moves (scroll phases)
const LB = { ok1: [0.06, 0.16], ok2: [0.2, 0.3], swap: [0.36, 0.5], add: [0.54, 0.66], budget: [0.7, 0.86] } as const
const LB_PHASE = ["ok1", "ok2", "swap", "add"] as const
// screen recordings (16:9); drop the files in deck/public/video/ and set src
// tech stack: one real labeled record (data/products.json + data/sofa-annotations.json, ikea:s59580059) and the pipeline from the README
type Label = [attr: string, value: string, status: "documented" | "derived" | "unknown", source?: string]
// "how it understands you": one sentence turned into a purchase, phase by phase as you scroll
// values: data/sofa-annotations.json (ikea:s59580059 and the two next-deepest seats), schema/sofa-ontology.json (cross_legged)
const HOW = { quote: [0.03, 0.14], mark: [0.13, 0.2], toDecision: [0.22, 0.36], decision: [0.33, 0.43], toLabels: [0.47, 0.6], labels: [0.57, 0.66], rank: [0.69, 0.8], buy: [0.84, 0.93] } as const
const HOW_LABELS: [attr: string, value: string, status: "documented" | "derived" | "unknown", hit?: boolean][] = [
  ["seat_depth", "36⅝″", "documented", true],
  ["seat_width", "84¼″", "documented", true],
  ["seat_height", "15¾″", "documented"],
  ["washable_cover", "yes", "documented"],
  ["firmness", "?", "unknown"],
]
const HOW_RANK: [name: string, seat: number][] = [
  ["SÖDERHAMN Sleeper sofa", 36.625],
  ["GRUNNARP Sleeper sofa", 34.25],
  ["NYHAMN Sleeper sofa", 28.75],
]
// render speed and cost: fill in once measured (shows "—" until then)
const RENDER = { secs: "", usd: "" }
// after the one example: it is saved to your living brief, then the view zooms out to a wall of the same move
// (a need in your words -> a catalog label -> a real product photo); labels are real field names in data/products.json
const ZO = { brief: [0.04, 0.24], cap1: [0.06, 0.16], out: [0.3, 0.78], tiles: [0.34, 0.7], cap2: [0.42, 0.52], head: [0.78, 0.9] } as const
const ZCOLS = 9
const ZROWS = 7
const ZTILE = { w: 220, h: 270, gap: 16 }
// the example person: a teammate's collage cut-out; the habits are the demo story from this page
const BRIEF_WHO = { key: "jiahao", name: "Jiahao", life: "Reads curled up at night. Partner and her cat moving in." }
const BRIEF: [say: string, label: string, got: string][] = [
  ["I curl up with a book.", "seat_depth", "SÖDERHAMN Sleeper sofa"],
  ["Keep the rocking chair.", "keep", "Your rocking chair, $0"],
  ["It’s too dark to read at night.", "light", "Hampton Bay Gooseneck lamp"],
  ["All in, under $2,500.", "total", "$2,212.66 so far"],
  ["Partner moving in, with her cat.", "washable_cover", "Sofa already fits"],
]
const WALL: [say: string, label: string, tile: string][] = [
  ["We sit up and talk.", "seat_height", "rocksjon-loveseat"],
  ["Books everywhere.", "max_load_shelf", "hd-bookcase"],
  ["I work from home now.", "desk_height", "desk"],
  ["Shoes pile up at the door.", "storage", "stool"],
  ["My parents stay over.", "bed_width", "bed"],
  ["Tiny bedroom.", "width", "nightstand"],
  ["More clothes than drawers.", "drawer_depth_inside", "dresser"],
  ["One chair, just for me.", "seat_width", "armchair"],
  ["Coffee by the window.", "height", "side"],
  ["Hide the clutter.", "storage", "cabinet"],
  ["Warm light over the table.", "shade_diameter", "pendant"],
  ["Light I can aim.", "max_height", "floorlamp"],
  ["Must fit an 84″ wall.", "width", "sofa"],
  ["Leather, easy to wipe.", "materials", "stockholm"],
  ["Deep, not too deep.", "seat_depth", "stockholm25"],
  ["Low, nothing bulky.", "height", "vimle"],
  ["Soft under bare feet.", "pile", "rug"],
  ["Check my outfit.", "height", "mirror"],
  ["A seat when friends come.", "seat_height", "dchair"],
  ["Somewhere for plants.", "shelf", "shelf"],
  ["Mugs within reach.", "height", "coffee"],
  ["The cat sheds.", "washable_cover", "soderhamn"],
  ["Big enough for two.", "seat_width", "hyltarp"],
]
// step, what it does, what it runs on
const FLOW: [title: string, body: string, tool: string][] = [
  ["Understand", "Turns what you say into needs you confirm.", "Gemini 3.8 Flash · Claude for sketches"],
  ["See what you own", "Finds your furniture in the photo.", "Gemini vision"],
  ["Match", "Ranks real products against the labels.", "Sofa ontology on Schema.org · rules"],
  ["Show", "Renders the picture from the product list.", "Gemini 3.1 Flash Image · " + (RENDER.secs || "—") + " s · $" + (RENDER.usd || "—") + " per render"],
  ["Shop", "List, budget, FF&E schedule.", "Python + Vercel functions · plain JS"],
]
// kinds of product compared, not brands: we have no head-to-head evidence
const VS: [who: string, gives: string, misses: string][] = [
  ["AI room-image generators", "A nice picture of a room.", "The furniture may not exist, and you can’t buy it."],
  ["Store AR, try-in-room apps", "One item from one store, in your room.", "Doesn’t know how you live. Remembers nothing."],
  ["Interior designers", "Thoughtful, made to measure.", "Slow and costly. Not there when your life changes."],
]
const REELS: { title: string; src?: string; poster?: string }[] = [
  { title: "Elephant, start to finish", src: "/video/elephant-start-to-finish.mp4", poster: "/video/elephant-start-to-finish.jpg" },
  // feature demos recorded by the team (deck/public/video/README-feature-demos.md)
  { title: "Evaluate your existing space", src: "/video/1-evaluate-environment.mp4", poster: "/video/1-evaluate-environment.jpg" },
  { title: "Customize with a sketch", src: "/video/2-sketch.mp4", poster: "/video/2-sketch.jpg" },
  { title: "Fast local iteration", src: "/video/3-switch.mp4", poster: "/video/3-switch.jpg" },
  { title: "Plan, list and export", src: "/video/4-multiple-export.mp4", poster: "/video/4-multiple-export.jpg" },
]
const GRID_AFTER = [...AFTER, ...GRID.filter((g) => !GONE.has(g.k))]

// 6 · one room, one view, different times of life; then every stage shrinks into a row
// one dining nook, one camera, six moments of a life (renders/11.5 on main); each stage changes one real catalog product; one crop for all, so the view never jumps
const COLLECTIONS = [
  { name: "Moving in", img: "life-1", thumbs: ["d-stockholm-sb"] },              // render-02
  { name: "Partner moves in", img: "life-2", thumbs: ["d-lanesund"] },          // LANESUND Sideboard, ikea 90466546: storage for two
  { name: "A cat arrives", img: "life-3", thumbs: ["d-markblamme"] },           // MARKBLÅMME low-pile rug, ikea 90625705
  { name: "Friends over", img: "life-4", thumbs: ["d-tarsele"] },               // TARSELE Extendable table, ikea 70581359
  { name: "New colors", img: "life-5", thumbs: ["d-lommarp"] },                 // LOMMARP Cabinet, dark blue-green, ikea 90483027
  { name: "Next chapter", img: "life-6", thumbs: ["d-sputnik"] },               // Gold Sputnik pendant, homedepot 331469608
]

const FIELD_KINDS = ["sofa", "armchair", "coffee", "pendant", "rug", "floorlamp", "shelf", "side", "bed", "nightstand", "dresser", "desk", "dchair", "stool", "mirror", "cabinet", "armchair", "sofa"]
const FLICK = ["tile-sofa", "hl-5", "tile-armchair", "hl-6", "tile-rug", "tile-pendant", "hl-8", "curator-0"]

// Meet the team: each member's cut-out (from the tape collage) on a glass card; hover shows their photo
const TEAM: { name: string; url: string; key: string }[] = [
  { name: "Yimeng Ding", url: "https://www.linkedin.com/in/yimeng-ding/", key: "yimeng" },
  { name: "Yu Chen", url: "https://www.linkedin.com/in/yu-chen-2a586b249/", key: "yu" },
  { name: "Chloe", url: "https://www.linkedin.com/in/jiayueni/", key: "chloe" },
  { name: "Jiahao Li", url: "https://www.linkedin.com/in/jiahao-li-no-on/", key: "jiahao" },
  { name: "Shicong Cao", url: "https://www.linkedin.com/in/shicong-cao/", key: "shicong" },
  { name: "Han Zhao", url: "https://www.linkedin.com/in/han-zhao-52b78a249/", key: "han" },
]
const COL_SPEED = [0, 0.16, 0.06, 0.22, 0.1, 0.26]
const PILE_KINDS = ["armchair", "sofa", "rug", "shelf", "coffee", "pendant", "floorlamp", "side", "mirror", "cabinet", "dchair", "stool", "desk", "bed", "dresser", "nightstand", "sofa", "armchair"]
const BITS = [
  [-0.19, -0.12, 0], [0.16, -0.17, 1], [0.22, 0.04, 2], [-0.24, 0.1, 0], [0.05, 0.21, 1], [-0.08, -0.22, 2], [0.27, -0.05, 0],
  [-0.15, 0.2, 1], [0.12, 0.13, 0], [-0.28, -0.03, 2], [0.02, -0.26, 0], [0.19, 0.24, 2], [-0.04, 0.27, 1], [0.3, 0.16, 0],
]
const BIG_WORDS: [string, string][] = [
  ["Life", "-16vw"],
  ["changes.", "-4vw"],
  ["Rooms too.", "6vw"],
]

/* --------------------------------------------------------------- artwork */
// Photos were generated for this template and are embedded as WebP (see IMG at the end of the file).

/** The product's elephant mark (app/index.html): three strokes and an eye, each stroke drawn in turn. */
function ElephantMark() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path pathLength={1} style={{ "--k": 0 } as CSSProperties} d="M3 17v-5c0-3.5 3-6 6.5-6H13c3.9 0 7 3 7 7v3.5c0 1.1.9 2 2 2" />
      <path pathLength={1} style={{ "--k": 1 } as CSSProperties} d="M3 17h12.5M6 17v3M10 17v3M15 16v4" />
      <path pathLength={1} style={{ "--k": 2 } as CSSProperties} d="M13 8.5c-1.6.5-2.1 2.6-1 4.2.9 1.2 3 1.1 3.5-.3" />
      <circle cx="17.2" cy="10.4" r=".6" fill="currentColor" stroke="none" />
    </svg>
  )
}

function Tile({ k }: { k: string }) {
  const src = IMG["tile-" + k] || IMG["tile-sofa"]
  return <img className={"lcl-img lcl-prod" + (src.endsWith(".jpg") ? " lcl-white" : "")} src={src} alt="" draggable={false} />
}

function Sun() {
  const rays: ReactNode[] = []
  for (let k = 0; k < 18; k++) rays.push(<path key={k} d="M50 0L53.6 18L46.4 18Z" transform={"rotate(" + k * 20 + " 50 50)"} />)
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true">
      <path className="lcl-sd" pathLength={1} d="M50 20C60 4 80 16 68 32C86 30 90 52 72 56C84 72 66 88 54 74C50 94 28 88 34 72C14 76 10 52 28 48C12 36 26 16 42 28C40 22 44 18 50 20ZM44 52C44 43 57 43 57 51C57 58 49 60 47 55" />
      <g className="lcl-sf" fill="currentColor">
        {rays}
        <circle cx="50" cy="50" r="34" />
      </g>
    </svg>
  )
}

const Plus = ({ on }: { on: boolean }) => (
  <svg viewBox="0 0 12 12" aria-hidden="true">
    <path d={on ? "M2.5 6.2L5 8.6L9.6 3.4" : "M6 2V10M2 6H10"} stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round" />
  </svg>
)

/* ------------------------------------------------------------------- css */

const CSS =
  // product photos are white-background shots: fit them whole instead of cropping
  ".lcl-img.lcl-prod{object-fit:contain;background:#fff;padding:7%;box-sizing:border-box}" +
  ".lcl-root{--paper:#f1efea;--ink:#1c1b19;--band:var(--lime);--soft:#9b988f;--card:#ffffff;--lime:#d9f26b;--onlime:#1c1b19;--rule:rgba(28,27,25,.14);position:relative;overflow-x:clip;background:var(--paper);color:var(--ink);font-family:LclSans,ui-sans-serif,system-ui,sans-serif;font-weight:400;letter-spacing:-.01em;-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}" +
  ".dark .lcl-root{--paper:#131312;--ink:#edebe5;--soft:#78756e;--card:#1d1d1b;--rule:rgba(237,235,229,.14);--band:color-mix(in srgb,var(--lime) 30%,#131312)}" +
  ".lcl-root[data-golden]{--lime:#f6b444}" +
  ".lcl-root *{box-sizing:border-box}" +
  ".lcl-root svg,.lcl-root img{max-width:none}" +
  ".lcl-mono{font-family:LclMono,ui-monospace,monospace;font-size:10.5px;line-height:1.3;letter-spacing:.08em;text-transform:uppercase}" +
  ".lcl-track{position:relative;height:calc(var(--h) * var(--len))}" +
  ".lcl-stage{position:sticky;top:0;height:var(--h);overflow:hidden;background:var(--paper)}" +
  ".lcl-full{position:absolute;inset:0;will-change:clip-path,transform}" +
  ".lcl-zin{position:absolute;inset:0;transform-origin:50% 50%;will-change:transform}" +
  ".lcl-pv{position:absolute;inset:0}" +
  ".lcl-img{display:block;width:100%;height:100%;max-width:none;object-fit:cover;user-select:none;-webkit-user-drag:none}" +
  ".lcl-pv>img,.lcl-scene>img,.lcl-flick{position:absolute;inset:0}" +
  /* chrome */
  ".lcl-chrome{position:sticky;top:0;height:0;z-index:40;pointer-events:none}" +
  ".lcl-chrome-in{position:absolute;left:0;right:0;top:0;height:var(--h);opacity:calc(1 - var(--hide,0))}" +
  ".lcl-launch{position:absolute;left:20px;bottom:27px;color:#fff;mix-blend-mode:difference}" +
  ".lcl-nav{position:absolute;left:50%;bottom:16px;transform:translateX(-50%);display:flex;align-items:center;gap:4px;padding:5px 5px 5px 16px;border-radius:9px;background:var(--card);color:var(--ink);box-shadow:0 8px 30px rgba(0,0,0,.08);pointer-events:auto}" +
  ".lcl-nav[data-off]{pointer-events:none}" +
  ".lcl-wordmark{font-weight:700;font-size:17px;letter-spacing:-.045em;margin-right:clamp(16px,6vw,96px)}" +
  ".lcl-btn{display:inline-flex;align-items:center;justify-content:center;height:32px;padding:0 13px;border:0;border-radius:6px;background:transparent;color:inherit;cursor:pointer;text-decoration:none;white-space:nowrap;transition:transform .55s cubic-bezier(.2,1.6,.4,1),background-color .2s}" +
  ".lcl-btn>span{display:inline-block;transition:transform .55s cubic-bezier(.2,1.6,.4,1)}" +
  ".lcl-btn[data-near],.lcl-btn[data-near]>span{transition:transform .1s linear,background-color .2s}" +
  ".lcl-btn-lime{background:var(--lime);color:var(--onlime);transition:transform .55s cubic-bezier(.2,1.6,.4,1),background-color .6s}" +
  ".lcl-btn:focus-visible,.lcl-hit:focus-visible{outline:2px solid var(--ink);outline-offset:2px}" +
  ".lcl-scroll{position:absolute;right:16px;bottom:18px;display:flex;align-items:center;gap:10px;padding:0;border:0;background:none;color:#fff;mix-blend-mode:difference;cursor:pointer;pointer-events:auto}" +
  ".lcl-scroll i{display:grid;place-items:center;width:30px;height:30px;border-radius:50%;border:1px solid currentColor;font-style:normal}" +
  ".lcl-scroll svg{width:12px;height:12px;animation:lcl-nudge 1.8s ease-in-out infinite}" +
  "@keyframes lcl-nudge{50%{transform:translateY(2px)}}" +
  /* intro: the photo field */
  ".lcl-th{position:absolute;left:0;top:0;width:clamp(70px,9.5vw,170px);aspect-ratio:4/5;will-change:transform,opacity;opacity:0}" +
  ".lcl-th>img{box-shadow:0 8px 18px rgba(0,0,0,.09)}" +
  ".lcl-h1{position:absolute;left:0;right:0;margin:0;font-weight:400;font-size:clamp(26px,3.3vw,56px);line-height:1.1;text-align:center;letter-spacing:-.028em;white-space:nowrap;z-index:200;pointer-events:none}" +
  ".lcl-w{display:inline-block;animation:lcl-word 1.1s cubic-bezier(.2,.8,.2,1) both;animation-delay:var(--dl,0s)}" +
  "@keyframes lcl-word{from{opacity:0;filter:blur(8px);transform:translateY(.25em)}60%{opacity:.5}to{opacity:1;filter:blur(0);transform:none}}" +
  ".lcl-l1{top:calc(50% - 1.75em)}" +
  ".lcl-l1>span{display:block;opacity:calc(1 - var(--l1,0));transform:translateY(calc(var(--l1,0) * -.4em))}" +
  ".lcl-l2{top:50%;height:1.1em;transform:translateY(-50%)}" +
  ".lcl-wl,.lcl-wr{position:absolute;top:0;white-space:nowrap}" +
  ".lcl-wl{right:50%;transform:translateX(calc(var(--g,0px) * -.5 - .14em))}" +
  ".lcl-wr{left:50%;transform:translateX(calc(var(--g,0px) * .5 + .14em))}" +
  ".lcl-pv{opacity:0;transition:opacity .6s}" +
  ".lcl-full[data-v=v0] .lcl-pv0,.lcl-full[data-v=v1] .lcl-pv1,.lcl-full[data-v=v2] .lcl-pv2{opacity:1}" +
  ".lcl-flick{opacity:0}" +
  ".lcl-full[data-flip] .lcl-flick{opacity:1}" +
  ".lcl-cap{position:absolute;left:0;right:0;top:50%;margin:0;transform:translateY(-50%);color:#fff;text-align:center;font-weight:400;font-size:clamp(22px,3vw,50px);letter-spacing:-.025em;padding:0 16px;text-shadow:0 1px 30px rgba(0,0,0,.25)}" +
  ".lcl-cap>span>span{opacity:calc(clamp(0, var(--cap,0) * (var(--n) + 6) - var(--i), 1) * var(--capo,1))}" +
  ".lcl-co{position:absolute;inset:0;color:#fff;opacity:clamp(0, var(--c,0) * 3, 1);pointer-events:none}" +
  ".lcl-co[data-live] .lcl-hit,.lcl-ui[data-live] .lcl-hit{pointer-events:auto}" +
  ".lcl-vx{position:absolute;inset:0;width:100%;height:100%;overflow:visible}" +
  ".lcl-vx line{stroke:rgba(255,255,255,.8);stroke-width:1;stroke-dasharray:1 1;stroke-dashoffset:calc(1 - var(--c,0))}" +
  ".lcl-vlab{position:absolute;transform:translate(-100%,-50%);padding-right:10px;font-size:clamp(15px,1.5vw,24px);letter-spacing:-.02em;white-space:nowrap;opacity:clamp(0, (var(--c,0) - .3) * 3, 1)}" +
  ".lcl-bio{position:absolute;top:16px;right:16px;width:min(270px,30%);margin:0;font-size:12.5px;line-height:1.4;opacity:clamp(0, (var(--c,0) - .45) * 2.4, .92);transform:translateY(calc((1 - var(--c,0)) * -12px))}" +
  ".lcl-tags{position:absolute;right:12%;top:36%;display:flex;flex-direction:column;font-size:clamp(20px,2.2vw,34px);line-height:1.08;letter-spacing:-.02em}" +
  ".lcl-tags>span{opacity:clamp(0, (var(--c,0) - .25 - var(--k) * .2) * 5, 1);transform:translateY(calc((1 - clamp(0, (var(--c,0) - .25 - var(--k) * .2) * 5, 1)) * 14px))}" +
  ".lcl-tags>span:last-child{color:rgba(255,255,255,.45)}" +
  ".lcl-dots{position:absolute;left:14px;top:50%;display:flex;flex-direction:column;gap:2px;transform:translateY(-50%)}" +
  ".lcl-dot{display:grid;place-items:center;width:18px;height:18px;padding:0;border:0;background:none;cursor:pointer}" +
  ".lcl-dot::after{content:\"\";width:5px;height:5px;border-radius:50%;background:#fff;opacity:.4;transition:opacity .3s}" +
  ".lcl-dot[aria-current]::after{opacity:1}" +
  ".lcl-next{position:absolute;right:12%;top:68%;width:44px;height:44px;padding:0;border-radius:50%;transform:scale(clamp(0, (var(--c,0) - .5) * 3, 1))}" +
  ".lcl-next svg{width:14px;height:14px}" +
  ".lcl-deck{position:absolute;right:10px;bottom:10px;width:clamp(64px,7.4vw,116px);aspect-ratio:4/5;--up:clamp(0, var(--s,0) * 3.3, 1);--fan:clamp(0, (var(--s,0) - .3) * 1.43, 1)}" +
  ".lcl-sc{position:absolute;inset:0;padding:0;border:0;background:none;cursor:pointer;z-index:calc(10 - var(--k));box-shadow:0 10px 26px rgba(0,0,0,.28);transform:translateY(calc((1 - var(--up)) * 160%)) translateX(calc(var(--k) * (-100% - 4px) * var(--fan))) rotate(calc((1 - var(--fan)) * var(--k) * -5deg));transition:transform .2s}" +
  ".lcl-sc:hover{transform:translateY(calc((1 - var(--up)) * 160% - 8px)) translateX(calc(var(--k) * (-100% - 4px) * var(--fan)))}" +
  /* manifesto */
  ".lcl-mani{position:relative;z-index:2;margin-top:calc(var(--h) * -1);background:var(--paper);display:grid;grid-template-columns:1fr minmax(200px,23vw);gap:5vw;padding:clamp(20px,2.4vw,40px) clamp(16px,2vw,32px) 30vh}" +
  ".lcl-mani::after{content:\"\";position:absolute;inset:0;background:#000;opacity:calc(var(--dim,0) * .14);pointer-events:none}" +
  ".lcl-para{position:sticky;top:clamp(20px,5vh,56px);align-self:start;margin:0;max-width:21em;font-weight:400;font-size:clamp(26px,3.15vw,54px);line-height:1.17;letter-spacing:-.028em}" +
  ".lcl-ink{opacity:calc(.24 + .76 * clamp(0, var(--t,0) * (var(--n) + 4) - var(--i), 1))}" +
  ".lcl-box{position:relative;white-space:nowrap}" +
  ".lcl-box::after{content:\"\";position:absolute;inset:-.02em -.1em -.06em;border:1.5px solid currentColor;border-radius:3px;opacity:clamp(0, var(--t,0) * (var(--n) + 4) - var(--i), 1)}" +
  ".lcl-col{display:flex;flex-direction:column;gap:clamp(28px,5vw,72px);padding-top:34vh}" +
  ".lcl-card{display:block;width:100%;padding:0;border:0;background:none;text-align:left;color:inherit;font:inherit;cursor:pointer}" +
  ".lcl-card[data-away] .lcl-pic{visibility:hidden}" +
  ".lcl-pic{position:relative;display:block;aspect-ratio:4/5;background:var(--card);overflow:hidden}" +
  ".lcl-pic>img{transition:transform .8s cubic-bezier(.2,.8,.2,1)}" +
  ".lcl-card:hover .lcl-pic>img{transform:scale(1.04)}" +
  ".lcl-plus{position:absolute;right:8px;bottom:8px;display:grid;place-items:center;width:22px;height:22px;border-radius:4px;background:var(--card);color:var(--ink);transition:background-color .2s}" +
  ".lcl-plus[data-on]{background:var(--lime);color:var(--onlime)}" +
  ".lcl-plus svg{width:11px;height:11px}" +
  ".lcl-cname{display:block;margin-top:8px;font-size:13px;letter-spacing:-.01em}" +
  ".lcl-cmeta{display:block;margin-top:2px;color:var(--soft);font-size:9.5px}" +
  ".lcl-fly{position:absolute;left:0;top:0;z-index:6;aspect-ratio:4/5;pointer-events:none;visibility:hidden;transform-origin:0 0;will-change:transform;box-shadow:0 20px 50px rgba(0,0,0,.18)}" +
  ".lcl-fly[data-on]{visibility:visible}" +
  ".lcl-grid{position:relative;z-index:3;margin-top:calc(var(--h) * -.3);background:var(--card);border-radius:14px 14px 0 0;padding:9vh clamp(16px,2vw,32px) 26vh;overflow:hidden}" +
  ".lcl-ghead{display:flex;flex-direction:column;align-items:center;gap:10px;margin-bottom:clamp(28px,5vh,56px);text-align:center}" +
  ".lcl-gtitle{position:relative;display:flex;justify-content:center;align-items:center;margin:0;font-weight:400;font-size:clamp(26px,3vw,48px);letter-spacing:-.03em;white-space:nowrap}" +
  ".lcl-gtitle i{display:block;width:var(--tg,0px);flex:none}" +
  ".lcl-gtitle>span:first-child{margin-right:.26em}" +
  ".lcl-tile[data-jump],.lcl-tile[data-jump][data-on]{transition:opacity .2s}" +
  ".lcl-chips{display:flex;gap:14px;color:var(--soft)}" +
  ".lcl-gr{display:flex;gap:clamp(8px,1vw,16px);align-items:flex-start}" +
  ".lcl-gc{flex:1;display:flex;flex-direction:column;gap:clamp(18px,2.4vw,36px);will-change:transform}" +
  /* giant words */
  ".lcl-words .lcl-stage{background:transparent;overflow:visible}" +
  ".lcl-sweep{position:absolute;left:-40%;width:180%;top:0;height:calc(var(--h) * .5);background:var(--band);transition:background-color .6s;will-change:transform}" +
  ".lcl-wclip{position:absolute;inset:0;overflow:hidden}" +
  ".lcl-wcol{position:absolute;left:0;right:0;top:0;will-change:transform}" +
  ".lcl-big{position:absolute;left:0;right:0;margin:0;transform:translate(var(--x,0px),-50%);font-weight:400;font-size:clamp(84px,17vw,300px);line-height:1;letter-spacing:-.055em;text-align:center;white-space:nowrap}" +
  ".lcl-big>span{position:relative;display:inline-block}" +
  ".lcl-big>span>span{display:inline-block;white-space:pre;transform:translateY(calc(var(--e,0) * (.1em + var(--i) * .16em) + sin(var(--i) * 1.7) * var(--e,0) * .18em)) rotate(calc(var(--e,0) * var(--i) * 5deg));opacity:calc(1 - var(--e,0) * .3)}" +
  ".lcl-doodle{position:absolute;right:-.42em;top:-.32em;width:.46em;height:.46em;overflow:visible}" +
  ".lcl-doodle path{fill:none;stroke:currentColor;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:1 1;stroke-dashoffset:calc(1 - var(--dd,0))}" +
  /* zoom + collections */
  ".lcl-scene{position:absolute;inset:0;will-change:transform,opacity;visibility:hidden;overflow:hidden}" +
  ".lcl-scene>.lcl-scene-img{object-fit:cover;object-position:50% 56%}" +
  ".lcl-ui{position:absolute;inset:0;color:#fff;opacity:var(--u,0);pointer-events:none}" +
  ".lcl-ui::before{content:\"\";position:absolute;inset:0;background:linear-gradient(90deg,rgba(0,0,0,.34),rgba(0,0,0,0) 62%)}" +
  ".lcl-drum{position:absolute;left:30%;top:50%;width:62%;height:0;transform:translateY(calc((1 - var(--u,0)) * 50vh))}" +
  ".lcl-di{position:absolute;left:0;top:0;will-change:transform,opacity;padding:0;border:0;background:none;color:inherit;font:inherit;font-size:clamp(26px,3.8vw,64px);letter-spacing:-.03em;white-space:nowrap;text-align:left;cursor:pointer;text-shadow:0 1px 24px rgba(0,0,0,.28);transform:perspective(700px) translateY(calc((var(--i) - var(--a,0)) * 1.22em - 50%)) rotateX(calc((var(--i) - var(--a,0)) * -16deg));transform-origin:0 50%;opacity:calc(1 - .34 * max(var(--i) - var(--a,0), var(--a,0) - var(--i)))}" +
  ".lcl-chip{position:absolute;top:14px;right:14px;display:flex;align-items:center;gap:10px;min-width:210px;padding:7px 14px 7px 7px;border:0;border-radius:7px;background:var(--card);color:var(--ink);font:inherit;text-align:left;cursor:pointer;transform:translateY(calc((1 - var(--u,0)) * -70px))}" +
  ".lcl-chip b{display:block;font-weight:400;font-size:13px}" +
  ".lcl-chip .lcl-mono{color:var(--soft);font-size:8.5px}" +
  ".lcl-av{display:block;width:28px;height:28px;border-radius:50%;overflow:hidden;flex:none}" +
  ".lcl-av>img{display:block;width:100%;height:100%;max-width:none;object-fit:cover;transform:scale(2.3);transform-origin:50% 34%}" +
  ".lcl-ft{position:absolute;top:0;width:clamp(40px,4.4vw,74px);aspect-ratio:4/5;will-change:transform}" +
  ".lcl-ft>img{box-shadow:0 8px 24px rgba(0,0,0,.25);animation:lcl-swap .5s cubic-bezier(.2,.8,.2,1)}" +
  "@keyframes lcl-swap{from{opacity:0;transform:scale(.8)}}" +
  /* pile */
  ".lcl-pilesec{position:relative;z-index:3;margin-top:calc(var(--h) * -1)}" +
  ".lcl-pilesec .lcl-stage::after{content:\"\";position:absolute;inset:0;background:#000;opacity:calc(var(--fd,0) * .12);pointer-events:none;z-index:50}" +
  ".lcl-pl{position:absolute;left:0;right:0;margin:0;padding:0 16px;text-align:center;font-weight:400;font-size:clamp(24px,2.9vw,48px);line-height:1.16;letter-spacing:-.028em;z-index:20}" +
  ".lcl-pab{top:42%;transform:translateY(-50%);opacity:calc(1 - var(--sw,0));pointer-events:none}" +
  ".lcl-pc{top:58%;display:flex;flex-direction:column;align-items:center;gap:22px}" +
  ".lcl-pc>span>span{opacity:clamp(0, var(--ty,0) * (var(--n) + 4) - var(--i), 1)}" +
  ".lcl-pc .lcl-btn{height:40px;padding:0 18px;opacity:clamp(0, (var(--ty,0) - .7) * 3.3, 1);transform:scale(calc(.8 + .2 * clamp(0, (var(--ty,0) - .7) * 3.3, 1)))}" +
  ".lcl-pc[data-off]{pointer-events:none}" +
  ".lcl-pf{position:absolute;inset:0;z-index:10;pointer-events:none;--tw:clamp(64px,7vw,124px)}" +
  ".lcl-tile{position:absolute;will-change:transform;left:calc(var(--tw) * -.5);top:calc(var(--tw) * -.625);width:var(--tw);aspect-ratio:4/5;pointer-events:auto;cursor:pointer;box-shadow:0 10px 24px rgba(0,0,0,.14);opacity:0;transform:translate(calc(var(--x) + (var(--cx) - var(--x)) * var(--g,0) * .78), calc(var(--y) + (var(--cy) - var(--y)) * var(--g,0) * .78)) rotate(calc(var(--r) * (1 - var(--g,0) * .8))) scale(1.4);transition:transform .45s cubic-bezier(.2,1.3,.4,1),opacity .2s}" +
  ".lcl-tile[data-on]{opacity:1;transform:translate(calc(var(--x) + (var(--cx) - var(--x)) * var(--g,0) * .78), calc(var(--y) + (var(--cy) - var(--y)) * var(--g,0) * .78)) rotate(calc(var(--r) * (1 - var(--g,0) * .8)))}" +
  ".lcl-bit{position:absolute;will-change:transform;left:0;top:0;width:5px;height:5px;background:var(--ink);opacity:0;transform:translate(calc(var(--cx) + var(--bx) * (1 - var(--g,0) * .5)), calc(var(--cy) + var(--by) * (1 - var(--g,0) * .5)));animation:lcl-bit 2.6s ease-in-out infinite;animation-delay:var(--dl)}" +
  ".lcl-bit:nth-child(3n){background:#c8452c}.lcl-bit:nth-child(4n){background:var(--lime)}" +
  ".lcl-pf[data-bits] .lcl-bit{opacity:.8}" +
  "@keyframes lcl-bit{50%{translate:6px -10px}}" +
  /* footer */
  ".lcl-foot{position:relative;z-index:5;margin-top:calc(var(--h) * -.5);padding:12px}" +
  ".lcl-fcard{display:flex;flex-direction:column;justify-content:space-between;gap:28px;min-height:calc(var(--h) * .62);padding:16px 18px;border-radius:14px;background:var(--card);box-shadow:0 -10px 40px rgba(0,0,0,.06)}" +
  ".lcl-frow{display:flex;align-items:center;justify-content:space-between;gap:12px 24px;flex-wrap:wrap}" +
  ".lcl-frow a,.lcl-frow span{color:inherit;text-decoration:none}" +
  ".lcl-flinks{display:flex;gap:18px}" +
  ".lcl-big2{margin:0;font-weight:700;font-size:clamp(76px,19vw,340px);line-height:.9;letter-spacing:-.07em;text-align:center;white-space:nowrap}" +
  ".lcl-sun{display:inline-block;color:var(--lime);width:.64em;height:.64em;margin:0 .01em 0 .02em;padding:0;border:0;background:none;vertical-align:-.04em;cursor:pointer}" +
  ".lcl-sun svg{display:block;width:100%;height:100%;overflow:visible}" +
  ".lcl-sd{fill:none;stroke:var(--ink);stroke-width:4;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:1 1;stroke-dashoffset:calc(1 - clamp(0, (var(--f,1) - .2) * 2.2, 1));opacity:calc(1 - clamp(0, (var(--f,1) - .78) * 5, 1))}" +
  ".lcl-sf{transform-origin:50% 50%;transform:scale(clamp(0, (var(--f,1) - .7) * 3.4, 1))}" +
  ".lcl-sf{animation:lcl-spin 30s linear infinite}" +
  ".lcl-sun:hover .lcl-sf{animation-duration:3s}" +
  ".lcl-root[data-golden] .lcl-sf{animation-duration:4s}" +
  "@keyframes lcl-spin{to{rotate:360deg}}" +
  /* cursor + toast */
  ".lcl-cursor{display:none;position:fixed;left:0;top:0;z-index:60;pointer-events:none;opacity:0;transition:opacity .25s}" +
  ".lcl-cursor[data-on]{opacity:1}" +
  ".lcl-cdot{position:absolute;left:-5px;top:-5px;width:10px;height:10px;border-radius:50%;background:#fff;mix-blend-mode:difference;transition:transform .35s cubic-bezier(.2,1.4,.4,1)}" +
  ".lcl-clab{position:absolute;left:14px;top:14px;padding:7px 11px;border-radius:6px;background:var(--lime);color:var(--onlime);white-space:nowrap;opacity:0;transform:translateY(4px) scale(.94);transform-origin:0 0;transition:opacity .2s,transform .3s cubic-bezier(.2,1.4,.4,1)}" +
  ".lcl-cursor[data-label] .lcl-clab{opacity:1;transform:none}" +
  ".lcl-cursor[data-label] .lcl-cdot{transform:scale(.45)}" +
  ".lcl-toast{position:fixed;left:50%;top:22px;z-index:61;padding:10px 16px;border-radius:8px;background:var(--ink);color:var(--paper);font-size:13px;opacity:0;transform:translate(-50%,-12px);transition:opacity .3s,transform .4s cubic-bezier(.2,1.4,.4,1);pointer-events:none}" +
  ".lcl-toast[data-on]{opacity:1;transform:translate(-50%,0)}" +
  "@media (hover:hover) and (pointer:fine){.lcl-cursor{display:block}.lcl-root [data-cursor]{cursor:none}}" +
  /* still: reduced motion */
  ".lcl-root[data-still] .lcl-wcol{transform:none!important;inset:0;display:flex;flex-direction:column;justify-content:center;align-items:stretch}" +
  ".lcl-root[data-still] .lcl-big{position:relative;top:auto!important;transform:translateX(var(--x,0px));font-size:clamp(56px,11vw,180px)}" +
  "@media (prefers-reduced-motion:reduce){.lcl-w,.lcl-sf,.lcl-bit,.lcl-scroll svg,.lcl-ft>img{animation:none}.lcl-tile,.lcl-sc,.lcl-btn,.lcl-btn>span,.lcl-pv,.lcl-pic>img,.lcl-toast,.lcl-clab,.lcl-cdot{transition:none}}" +
  "@media (max-width:720px){.lcl-launch,.lcl-scroll,.lcl-bio,.lcl-disc{display:none}.lcl-nav{left:12px;right:12px;transform:none;justify-content:space-between}.lcl-wordmark{margin-right:auto}.lcl-mani{grid-template-columns:1fr;gap:28px}.lcl-para{position:relative;top:0}.lcl-col{padding-top:0;display:grid;grid-template-columns:1fr 1fr;gap:10px}.lcl-col>:first-child{display:none}.lcl-gr{display:grid;grid-template-columns:1fr 1fr}.lcl-gc{display:contents}.lcl-tags{right:16px;top:20%}.lcl-next{right:16px;top:auto;bottom:calc(16vw + 70px)}.lcl-drum{left:16px;width:calc(100% - 32px)}.lcl-chip{min-width:0;left:14px;right:auto;top:14px}.lcl-ft{display:none}.lcl-vlab{font-size:11px}.lcl-frow{justify-content:center}}"

/* ----------------------------------------------------------------- fonts */
// Inter Tight (400, 700) and JetBrains Mono (500), both SIL OFL 1.1, subset and renamed per the licence.
// Elephant look: black / white / gray with frosted glass and a lime accent, products as cut-outs (matches the app)
const THEME =
  ".lcl-root{--paper:#ececec;--ink:#141414;--soft:#8a8a8a;--card:rgba(255,255,255,.6);--lime:#d9f26b;--onlime:#141414;--band:var(--lime);--rule:rgba(20,20,20,.12)}" +
  ".dark .lcl-root{--paper:#111;--ink:#ececec;--soft:#8a8a8a;--card:rgba(34,34,34,.6);--lime:#d9f26b;--onlime:#141414;--band:color-mix(in srgb,var(--lime) 30%,#111);--rule:rgba(255,255,255,.12)}" +
  ".lcl-root[data-golden]{--lime:#f6b444}" +
  ".lcl-img.lcl-prod{background:transparent;padding:6%;filter:drop-shadow(0 16px 18px rgba(0,0,0,.16))}" +
  ".lcl-th>img,.lcl-ft>img,.lcl-sc,.lcl-tile,.lcl-fly{box-shadow:none}" +
  ".lcl-th{pointer-events:none}" +
  ".lcl-para-in{position:absolute;left:50%;top:50%;z-index:150;transform:translate(-50%,-50%);width:min(21em,calc(100% - 40px));max-width:none;text-align:left;pointer-events:none}" +
  // the manifesto moved into the intro, so the three picks sit as a centered row
  ".lcl-mani{grid-template-columns:1fr}.lcl-mani .lcl-col{display:grid;grid-template-columns:repeat(3,1fr);align-items:start;gap:clamp(12px,1.6vw,24px);width:100%;max-width:1040px;margin:0 auto;padding-top:16vh}" +
  "@media (max-width:720px){.lcl-mani .lcl-col{grid-template-columns:1fr 1fr;padding-top:8vh}}" +   // the hero's flying products are decoration; never block clicks/hover underneath
  ".lcl-pic{border-radius:16px;background:linear-gradient(180deg,rgba(255,255,255,.75),rgba(255,255,255,.35));box-shadow:inset 0 0 0 1px rgba(255,255,255,.7)}" +
  ".lcl-nav,.lcl-chip,.lcl-fcard,.lcl-plus,.lcl-grid{backdrop-filter:blur(26px) saturate(1.1);-webkit-backdrop-filter:blur(26px) saturate(1.1);box-shadow:inset 0 0 0 1px rgba(255,255,255,.55),0 12px 34px rgba(0,0,0,.08)}" +
  ".lcl-nav{border-radius:999px;padding-left:20px}.lcl-btn{border-radius:999px}.lcl-chip{border-radius:999px}.lcl-plus{border-radius:50%}" +
  ".lcl-grid{border-radius:28px 28px 0 0}.lcl-fcard{border-radius:28px}" +
  ".lcl-bit:nth-child(3n){background:#9a9a9a}.lcl-bit:nth-child(4n){background:var(--lime)}" +
  ".lcl-clab{border-radius:999px}" +
  // meet the team: a layer inside the growing gap photo, then it fades into the room photo
  ".lcl-track{position:relative}.lcl-anchor{position:absolute;left:0;width:1px;height:1px}" +
  ".lcl-tm{position:absolute;inset:0;z-index:3;display:flex;flex-direction:column;justify-content:center;align-items:center;gap:clamp(8px,1.6vh,16px);padding:0 clamp(16px,5vw,80px);background:var(--paper);color:var(--ink);opacity:var(--tm,1);pointer-events:none}" +
  ".lcl-tm-label{color:var(--soft);font-size:11px;letter-spacing:.08em;text-transform:uppercase}" +
  ".lcl-tm-title{margin:0 0 clamp(10px,2.4vh,26px);font-weight:400;font-size:clamp(28px,3.6vw,58px);letter-spacing:-.04em;line-height:1}" +
  ".lcl-tm-row{display:grid;grid-template-columns:repeat(6,1fr);gap:clamp(10px,1.4vw,22px);width:100%;max-width:1400px;opacity:var(--tn,0);transform:translateY(calc((1 - var(--tn,0)) * 16px))}" +
  ".lcl-tm-card{display:flex;flex-direction:column;align-items:center;gap:12px;color:var(--ink);text-decoration:none}" +
  ".lcl-tm-fig{position:relative;display:block;width:100%;aspect-ratio:3/4;max-height:52vh;border-radius:22px;overflow:hidden;" +
  "background:linear-gradient(180deg,rgba(255,255,255,.75),rgba(255,255,255,.35));box-shadow:inset 0 0 0 1px rgba(255,255,255,.75),0 14px 34px rgba(0,0,0,.06);" +
  "transition:transform .45s cubic-bezier(.2,.8,.2,1),box-shadow .45s}" +
  ".lcl-tm-cut{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;padding:10% 8%;box-sizing:border-box;filter:drop-shadow(0 14px 14px rgba(0,0,0,.16));transition:opacity .2s,transform .45s cubic-bezier(.2,.8,.2,1)}" +
  ".lcl-tm-photo{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:0;transform:scale(1.03);transition:opacity .2s,transform .45s cubic-bezier(.2,.8,.2,1)}" +
  ".lcl-tm-card:hover .lcl-tm-fig,.lcl-tm-card:focus-visible .lcl-tm-fig{transform:translateY(-8px);box-shadow:inset 0 0 0 1px rgba(255,255,255,.75),0 30px 60px rgba(0,0,0,.16)}" +
  ".lcl-tm-card:hover .lcl-tm-photo,.lcl-tm-card:focus-visible .lcl-tm-photo{opacity:1;transform:none}" +
  ".lcl-tm-card:hover .lcl-tm-cut,.lcl-tm-card:focus-visible .lcl-tm-cut{opacity:0;transform:scale(.96)}" +
  ".lcl-tm-card b{font-weight:400;font-size:clamp(13px,1.15vw,18px);letter-spacing:-.01em;border-bottom:1px solid transparent;transition:border-color .2s}" +
  ".lcl-tm-card:hover b{border-color:currentColor}" +
  "@media (max-width:720px){.lcl-tm-row{grid-template-columns:repeat(3,1fr)}.lcl-tm-fig{max-height:24vh}}" +
  ".lcl-root .lcl-btn-lime,.lcl-root .lcl-plus[data-on],.lcl-root .lcl-clab{background:var(--lime);color:#141414}" +
  // the story: habit -> condition -> comparison -> revision, in the deck's own type and glass cards
  ".lcl-img.lcl-prod.lcl-white{mix-blend-mode:multiply;filter:none;padding:12%}.lcl-fly{mix-blend-mode:multiply}" +
  ".lcl-mani{padding-bottom:70vh}.lcl-grid{padding-bottom:46vh;-webkit-mask-image:linear-gradient(to bottom,#000 calc(100% - 40vh),transparent);mask-image:linear-gradient(to bottom,#000 calc(100% - 40vh),transparent)}" +   // the white panel fades into the paper instead of ending on an edge
  ".lcl-story{width:100%;max-width:1040px;margin:0 auto;padding-top:14vh}" +
  ".lcl-sh{margin:0 0 clamp(18px,3.2vh,34px);font-weight:400;font-size:clamp(30px,3.6vw,60px);line-height:1.05;letter-spacing:-.035em}" +
  ".lcl-chat{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:clamp(10px,1.6vh,18px);font-size:clamp(20px,2.2vw,36px);line-height:1.15;letter-spacing:-.025em}" +
  ".lcl-chat li{opacity:clamp(0, var(--tc,0) * 5 - var(--i), 1);transform:translateY(calc((1 - clamp(0, var(--tc,0) * 5 - var(--i), 1)) * 14px))}" +
  ".lcl-chat li{display:flex;align-items:baseline;gap:16px}" +
  ".lcl-chat li>span:first-child{flex:none;width:76px;color:var(--soft)}" +
  ".lcl-chat li[data-el]{color:color-mix(in srgb,var(--ink) 58%,transparent)}" +
  ".lcl-note{margin:0;color:var(--soft);font-size:13px;line-height:1.4}" +
  ".lcl-cmp{padding-top:12vh}.lcl-cmp .lcl-sh{margin-bottom:10px}" +
  ".lcl-mani .lcl-col{padding-top:clamp(20px,4vh,40px)}.lcl-mani .lcl-col>:first-child{display:block}" +
  ".lcl-ctag{position:absolute;left:10px;top:10px;padding:6px 10px;border-radius:999px;background:var(--lime);color:#141414;font-size:9px}" +
  ".lcl-cwhy{display:block;margin-top:7px;font-size:13.5px;line-height:1.3}" +
  ".lcl-life{position:relative;z-index:5;margin-top:calc(var(--h) * -.7);background:var(--paper);padding:0 clamp(16px,2vw,32px) 24vh}" +
  ".lcl-life>.lcl-story{padding-top:4vh}" +
  ".lcl-lb{position:relative;height:calc(var(--h) * 3.2)}" +
  ".lcl-lb-in{position:sticky;top:0;height:var(--h);display:flex;flex-direction:column;justify-content:center;align-items:center;gap:18px;max-width:1240px;margin:0 auto}" +
  ".lcl-lb-grid{display:flex;flex-wrap:wrap;justify-content:center;gap:12px}" +
  ".lcl-lbc{position:relative;width:clamp(112px,10.5vw,150px);perspective:900px;transition:none}" +
  ".lcl-lbc-face{position:relative;display:flex;flex-direction:column;gap:4px;padding:8px;border-radius:16px;background:#fff;box-shadow:0 0 0 1px rgba(0,0,0,.05);backface-visibility:hidden;-webkit-backface-visibility:hidden}" +
  ".lcl-lbc-pic{position:relative;display:block;aspect-ratio:1;border-radius:11px;overflow:hidden;background:var(--card)}" +
  ".lcl-lbc-face b{font-weight:400;font-size:11.5px;line-height:1.2;letter-spacing:-.01em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.lcl-lbc-face em{font-style:normal;font-size:9px;color:var(--soft)}" +
  // who is in focus right now: its card lifts and rings while its phase plays
  ".lcl-lbc[data-role=ok1]{--on:calc(var(--lb-ok1,0) - var(--lb-ok2,0))}.lcl-lbc[data-role=ok2]{--on:calc(var(--lb-ok2,0) - var(--lb-swap,0))}.lcl-lbc[data-role=swap]{--on:calc(var(--lb-swap,0) - var(--lb-add,0))}.lcl-lbc[data-role=add]{--on:calc(var(--lb-add,0) - var(--lb-budget,0))}" +
  ".lcl-lbc[data-role] .lcl-lbc-face{box-shadow:0 0 0 calc(var(--on,0) * 2px) #141414,0 calc(var(--on,0) * 18px) calc(var(--on,0) * 40px) rgba(0,0,0,.14)}.lcl-lbc[data-role]{transform:translateY(calc(var(--on,0) * -8px))}" +
  ".lcl-lbok{position:absolute;left:12px;top:12px;padding:3px 8px;border-radius:999px;background:#2fae5b;color:#fff;font-style:normal;font-size:9px}" +
  ".lcl-lbc[data-role=ok1] .lcl-lbok{opacity:var(--lb-ok1,0);transform:scale(calc(.6 + var(--lb-ok1,0) * .4))}.lcl-lbc[data-role=ok2] .lcl-lbok{opacity:var(--lb-ok2,0);transform:scale(calc(.6 + var(--lb-ok2,0) * .4))}" +
  ".lcl-lbc-in{position:relative;transform-style:preserve-3d;transform:rotateY(calc(var(--lb-swap,0) * 180deg))}.lcl-lbc-back{position:absolute;inset:0;transform:rotateY(180deg)}" +
  ".lcl-lbc-slot{position:absolute;inset:0;display:grid;place-items:center;border:1.5px dashed rgba(0,0,0,.2);border-radius:16px;color:var(--soft);font-size:9px;opacity:calc(1 - var(--lb-add,0))}" +
  ".lcl-lbc-add .lcl-lbc-face{opacity:var(--lb-add,0);transform:translateY(calc((1 - var(--lb-add,0)) * -40px))}" +
  ".lcl-lb-caps{position:relative;width:min(760px,100%);height:3.2em}" +
  ".lcl-lb-cap{position:absolute;inset:0;margin:0;display:flex;align-items:center;justify-content:center;gap:10px;text-align:center;font-size:clamp(15px,1.3vw,19px);line-height:1.3;opacity:clamp(0, (var(--on,0) - .5) * 6, 1)}" +
  ".lcl-lb-cap[data-role=ok1]{--on:calc(var(--lb-ok1,0) - var(--lb-ok2,0))}.lcl-lb-cap[data-role=ok2]{--on:calc(var(--lb-ok2,0) - var(--lb-swap,0))}.lcl-lb-cap[data-role=swap]{--on:calc(var(--lb-swap,0) - var(--lb-add,0))}.lcl-lb-cap[data-role=add]{--on:calc(var(--lb-add,0) - var(--lb-budget,0))}" +
  ".lcl-lb-cap code{flex:none;padding:3px 9px;border-radius:999px;background:var(--lime);color:#141414;font-size:10px}" +
  ".lcl-lb-bud{display:flex;flex-direction:column;align-items:center;gap:8px;width:min(560px,100%)}.lcl-lb-bud b{font-weight:500;color:var(--ink)}" +
  ".lcl-lb-bar{position:relative;display:block;width:100%;height:8px;border-radius:4px;background:rgba(0,0,0,.08)}.lcl-lb-bar i{position:absolute;left:0;top:0;bottom:0;width:calc(var(--lb-fill,.885) * 100%);border-radius:4px;background:#2fae5b}.lcl-lb-bar::after{content:'';position:absolute;right:0;top:-4px;bottom:-4px;width:2px;background:var(--ink)}" +
  ".lcl-lb-in>.lcl-note{text-align:center}" +
  "@media (max-width:720px){.lcl-lbc:not([data-role]){display:none}.lcl-lbc{width:40vw}.lcl-lb-caps{height:4.6em}.lcl-lb-cap{font-size:14px;flex-direction:column;gap:4px}}" +
  ".lcl-life>.lcl-note{max-width:1040px;margin:0 auto}" +
  ".lcl-ghead .lcl-note{margin-top:4px}" +
  ".lcl-tm-sub{margin:0;max-width:30em;text-align:center;font-size:clamp(16px,1.5vw,24px);line-height:1.3;color:var(--soft);opacity:var(--tn,0);transform:translateY(calc((1 - var(--tn,0)) * 12px))}" +
  ".lcl-life0 .lcl-tm-title{max-width:16em;text-align:center;line-height:1.05}" +
  "@media (max-width:720px){.lcl-chat li{flex-direction:column;gap:4px}}" +
  // 2 · the sofa hotspot (the product's pill + line + dot), its highlight, the quick picks
  ".lcl-spot{position:absolute;inset:0;pointer-events:none;opacity:0;background:radial-gradient(ellipse var(--rx) var(--ry) at var(--hx) var(--hy),transparent 82%,rgba(0,0,0,.5) 100%);animation:lcl-pulse 1.8s ease;transition:opacity .3s}" +
  ".lcl-spot::after{content:\"\";position:absolute;left:calc(var(--hx) - var(--rx));top:calc(var(--hy) - var(--ry));width:calc(var(--rx) * 2);height:calc(var(--ry) * 2);border-radius:50%;box-shadow:0 0 0 2px var(--lime),0 0 46px 12px rgba(217,242,107,.32)}" +
  "@keyframes lcl-pulse{0%{opacity:0}30%{opacity:1}100%{opacity:0}}" +
  ".lcl-co:has(.lcl-hot:hover,.lcl-hs-pill:hover,.lcl-deck:hover) .lcl-spot{opacity:1;animation:none}" +
  ".lcl-hot{position:absolute;left:calc(var(--hx) - var(--rx));top:calc(var(--hy) - var(--ry));width:calc(var(--rx) * 2);height:calc(var(--ry) * 2);border-radius:50%;cursor:pointer}" +
  ".lcl-hs{position:absolute;left:var(--hx);top:var(--hy);width:0;height:0}" +
  ".lcl-hs-dot{position:absolute;left:-8px;top:-8px;width:16px;height:16px;border-radius:50%;background:#fff;box-shadow:0 0 0 6px rgba(255,255,255,.35),0 2px 10px rgba(0,0,0,.25)}" +
  ".lcl-hs-line{position:absolute;left:-.75px;bottom:8px;width:1.5px;height:var(--lh,92px);background:rgba(255,255,255,.9)}" +
  ".lcl-hs-pill{position:absolute;bottom:calc(var(--lh,92px) + 8px);left:-38px;display:flex;align-items:center;gap:12px;padding:7px 20px 7px 7px;border:0;border-radius:999px;background:rgba(255,255,255,.3);backdrop-filter:blur(18px) saturate(1.15);-webkit-backdrop-filter:blur(18px) saturate(1.15);color:#fff;font:inherit;text-align:left;white-space:nowrap;cursor:pointer;transition:background .2s}" +
  ".lcl-hs-pill:hover{background:rgba(255,255,255,.45)}" +
  ".lcl-hs-pill img{width:40px;height:40px;border-radius:50%;object-fit:contain;background:#fff;padding:3px}" +
  ".lcl-hs-pill small{display:block;font-size:11px;opacity:.85;line-height:1.3}.lcl-hs-pill b{display:block;font-weight:600;font-size:14px;line-height:1.35}" +
  ".lcl-flip .lcl-hs-pill{left:auto;right:-38px}" +
  ".lcl-sc{background:#fff;border-radius:12px;overflow:hidden}.lcl-sc .lcl-img.lcl-white{mix-blend-mode:normal}.lcl-sc[data-on]{outline:2px solid var(--lime);outline-offset:3px}" +
  // 3 · the talk: spoken lines in pills (as in the app's chat), decisions pinned on the room
  ".lcl-say{display:inline}.lcl-chat li:not([data-el]) .lcl-say{padding:.3em .85em;border-radius:999px;background:var(--ink);color:var(--paper)}" +
  ".lcl-talk{position:relative;height:calc(var(--h) * 4.2)}" +
  ".lcl-probbig{position:sticky;top:0;z-index:1;height:var(--h);margin:0 0 calc(var(--h) * -1);display:flex;align-items:center;justify-content:center;text-align:center;padding:0 clamp(16px,4vw,64px);font-weight:400;font-size:clamp(40px,5.6vw,96px);line-height:1.02;letter-spacing:-.045em;text-wrap:balance;pointer-events:none;opacity:calc(1 - var(--pq,0));transform:translateY(calc(var(--pq,0) * -14vh))}" +
  ".lcl-talk-in{opacity:var(--pq,0);transform:translateY(calc((1 - var(--pq,0)) * 10vh))}" +
  ".lcl-talk-in{position:sticky;top:0;height:var(--h);display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:clamp(20px,4vw,64px);max-width:1240px;margin:0 auto;padding:0 clamp(0px,2vw,24px)}" +
  ".lcl-talk .lcl-sh{font-size:clamp(22px,2.5vw,42px);max-width:none}" +
  ".lcl-talk .lcl-chat{font-size:clamp(15px,1.4vw,22px);gap:clamp(6px,1.1vh,12px)}" +
  ".lcl-talk .lcl-chat li{opacity:clamp(0, (var(--tc,0) * 12 - var(--i)) * 3, 1);transform:translateY(calc((1 - clamp(0, (var(--tc,0) * 12 - var(--i)) * 3, 1)) * 12px))}" +
  ".lcl-room{position:relative;width:min(44vw,calc((var(--h) - 96px) * .893));aspect-ratio:1250/1400}.lcl-room>img{border-radius:26px}" +
  ".lcl-pin{opacity:clamp(0, var(--tc,0) * 12 - var(--i), 1)}.lcl-pin .lcl-hs-pill{padding:8px 16px;cursor:default}" +
  ".lcl-budget{position:absolute;left:14px;bottom:14px;padding:8px 14px;border-radius:999px;background:var(--lime);color:#141414;opacity:clamp(0, var(--tc,0) * 12 - var(--i), 1)}" +
  ".lcl-brief{position:absolute;left:16px;top:16px;color:#fff;font-size:9.5px;text-shadow:0 1px 8px rgba(0,0,0,.4)}" +
  // 6 · the row the stages shrink into
  ".lcl-row{position:absolute;inset:0;z-index:2;pointer-events:none}" +
  ".lcl-rt{position:absolute;margin:0;opacity:clamp(0, var(--sh,0) * 2.2 - (5 - var(--k)) * .18, 1)}" +
  ".lcl-rt img{border-radius:12px}.lcl-rt:last-child img{visibility:hidden}" +
  ".lcl-rt figcaption{margin-top:10px;text-align:center;font-size:9.5px;color:var(--ink)}" +
  // voice input: mic + live waveform while it "records", then the transcript
  ".lcl-chat li{--x:calc(var(--tc,0) * 12 - var(--i))}" +
  ".lcl-voice{position:relative;display:inline-flex;align-items:center;gap:8px}" +
  ".lcl-mic{width:11px;height:15px;flex:none;fill:none;stroke:currentColor;stroke-width:1.4;stroke-linecap:round}" +
  ".lcl-wave{position:absolute;left:30px;top:50%;display:flex;align-items:center;gap:3px;height:16px;transform:translateY(-50%);opacity:clamp(0, min(var(--x) * 5, (.75 - var(--x)) * 6), 1)}" +
  ".lcl-wave i{display:block;width:3px;height:100%;border-radius:2px;background:var(--lime);animation:lcl-wv .9s ease-in-out infinite;animation-delay:calc(var(--k) * -.13s)}" +
  "@keyframes lcl-wv{0%,100%{transform:scaleY(.25)}50%{transform:scaleY(1)}}" +
  ".lcl-txt{opacity:clamp(0, (var(--x) - .6) * 4, 1)}" +
  ".lcl-trace{display:flex;flex-wrap:wrap;gap:6px;margin-top:5px;opacity:clamp(0, (var(--x) - .5) * 3, 1)}" +
  ".lcl-trace b{font-weight:500;font-size:9.5px;padding:3px 8px;border-radius:999px;background:color-mix(in srgb,var(--lime) 55%,transparent);color:#141414}" +
  ".lcl-trace b:first-child::before{content:\"\\2192  \"}" +
  // the room's list: why each piece, one at a time
  ".lcl-need{--x:calc(var(--gr,0) * 14 - var(--i));display:block;margin-top:8px;font-size:13px;line-height:1.3;opacity:clamp(0, var(--x) * 3, 1);transform:translateY(calc((1 - clamp(0, var(--x) * 3, 1)) * 8px))}" +
  ".lcl-need .lcl-say{padding:.35em .9em;border-radius:999px;background:var(--ink);color:var(--paper)}.lcl-need .lcl-wave{height:12px}" +
  // any line that sits on a photo gets a translucent pill behind it
  ".lcl-pillbg,.lcl-tags>span,.lcl-di,.lcl-vlab{background:rgba(20,20,20,.4);backdrop-filter:blur(14px) saturate(1.1);-webkit-backdrop-filter:blur(14px) saturate(1.1);border-radius:999px}" +
  ".lcl-pillbg{display:inline-block;padding:.12em .6em;opacity:calc(clamp(0, var(--cap,0) * 5, 1) * var(--capo,1))}" +
  ".lcl-tags{align-items:flex-start;gap:6px}.lcl-tags>span{padding:.1em .5em}.lcl-tags>span:last-child{color:rgba(255,255,255,.75)}" +
  ".lcl-di{padding:.04em .45em}" +
  ".lcl-vlab{padding:.3em .8em;margin-right:10px}" +
  ".lcl-lede{margin:-10px 0 clamp(14px,2.4vh,26px);max-width:30em;color:var(--soft);font-size:clamp(14px,1.2vw,18px);line-height:1.35}" +
  ".lcl-src{display:flex;flex-wrap:wrap;align-items:stretch;gap:10px;margin:18px 0 12px}" +
  ".lcl-src-card{display:flex;flex-direction:column;justify-content:center;gap:4px;padding:12px 18px;border-radius:18px;background:rgba(255,255,255,.6);box-shadow:inset 0 0 0 1px rgba(255,255,255,.7),0 8px 24px rgba(0,0,0,.05)}" +
  ".lcl-src-card b{font-weight:500;font-size:clamp(16px,1.4vw,22px);letter-spacing:-.02em}.lcl-src-card small{color:var(--soft);font-size:9.5px}" +
  ".lcl-src-one{background:var(--lime);box-shadow:none}.lcl-src-one small{color:#141414;opacity:.7}" +
  ".lcl-src-more{background:transparent;box-shadow:none;border:1.5px dashed rgba(20,20,20,.22)}.lcl-src-more b{color:var(--soft)}" +
  ".lcl-src-arrow{display:grid;place-items:center;width:32px}.lcl-src-arrow svg{width:14px;height:14px}" +
  // what a piece checks off: a green tick per need it meets
  ".lcl-checks{display:flex;flex-wrap:wrap;gap:4px 10px;margin-top:7px}" +
  ".lcl-check{display:inline-flex;align-items:center;gap:5px;font-size:12px;line-height:1.2;color:var(--ink)}" +
  ".lcl-check svg{width:15px;height:15px;flex:none}.lcl-check circle{fill:#2fae5b}.lcl-check path{fill:none;stroke:#fff;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}" +
  ".lcl-reels{position:relative;z-index:3;display:grid;grid-template-columns:repeat(4,1fr);gap:clamp(12px,1.6vw,22px);max-width:1240px;margin:0 auto;padding:4vh clamp(16px,2vw,32px) 22vh;background:var(--paper)}" +
  ".lcl-reels>.lcl-ghead{grid-column:1 / -1}.lcl-reels .lcl-sh{margin:0;font-weight:400;font-size:clamp(30px,3.4vw,56px);letter-spacing:-.035em;line-height:1.04}" +
  ".lcl-reel{margin:0;min-width:0}.lcl-reel-main{grid-column:1 / -1}" +
  ".lcl-reel-box{position:relative;display:block;aspect-ratio:16/9;border-radius:18px;overflow:hidden;background:linear-gradient(180deg,rgba(255,255,255,.75),rgba(255,255,255,.35));box-shadow:inset 0 0 0 1px rgba(255,255,255,.7),0 14px 34px rgba(0,0,0,.06)}" +
  ".lcl-reel-main .lcl-reel-box{border-radius:26px}" +
  ".lcl-reel-box video{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}" +
  ".lcl-reel-ph{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;color:var(--soft);font-size:9.5px}" +
  ".lcl-reel-ph svg{width:30px;height:30px;padding:9px;box-sizing:content-box;border-radius:50%;background:var(--lime);fill:#141414}" +
  ".lcl-reel figcaption{margin-top:10px;font-size:clamp(14px,1.15vw,18px);letter-spacing:-.01em}" +
  ".lcl-reel-main figcaption{font-size:clamp(18px,1.6vw,26px)}" +
  "@media (max-width:720px){.lcl-reels{grid-template-columns:1fr 1fr}}" +
  // living-room grid: six narrow columns, mixed picture heights (pinterest board)
  ".lcl-gr{max-width:1320px;margin:0 auto}.lcl-gr .lcl-cname{font-size:12px}.lcl-gr .lcl-check{font-size:10.5px}.lcl-gr .lcl-check svg{width:13px;height:13px}.lcl-gr .lcl-need{font-size:11px}.lcl-gr .lcl-need .lcl-say{border-radius:10px;line-height:1.75;-webkit-box-decoration-break:clone;box-decoration-break:clone}" +
  ".lcl-gc:nth-child(even) .lcl-card:first-child .lcl-pic,.lcl-gc:nth-child(odd) .lcl-card:nth-child(2) .lcl-pic{aspect-ratio:1}.lcl-gc:nth-child(3n) .lcl-card:nth-child(2) .lcl-pic{aspect-ratio:3/4}" +
  // tech stack: one feature panel (the labels), then plain type for everything else: no more boxes
  ".lcl-stack{position:relative;z-index:3;max-width:1240px;margin:0 auto;padding:8vh clamp(16px,2vw,32px) 22vh;background:var(--paper)}" +
  ".lcl-stack .lcl-sh{margin:0;font-weight:400;font-size:clamp(30px,3.4vw,56px);letter-spacing:-.035em;line-height:1.04}" +
  // how it understands you: sticky stage; --h-* are phase progresses (0..1) set by the frame loop
  ".lcl-how{position:relative;z-index:3;height:calc(var(--h) * 5);background:var(--paper)}" +
  ".lcl-how-in{position:sticky;top:0;height:var(--h);display:flex;flex-direction:column;justify-content:center;gap:clamp(24px,5vh,56px);max-width:1240px;margin:0 auto;padding:0 clamp(16px,2vw,32px)}" +
  ".lcl-how-head{text-align:center}.lcl-how-head .lcl-sh{margin:8px 0 0;font-size:clamp(30px,3.4vw,56px)}" +
  ".lcl-how-cols{position:relative;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:clamp(12px,2vw,28px);align-items:start}" +
  ".lcl-hc{display:flex;flex-direction:column;gap:10px;min-height:340px;padding-top:14px;border-top:2px solid rgba(0,0,0,.1)}" +
  ".lcl-hc1{border-top-color:rgba(20,20,20,calc(.1 + var(--h-quote,0) * .9 - var(--h-toDecision,0) * .9))}.lcl-hc2{border-top-color:rgba(20,20,20,calc(.1 + var(--h-decision,0) * .9 - var(--h-toLabels,0) * .9))}.lcl-hc3{border-top-color:rgba(20,20,20,calc(.1 + var(--h-labels,0) * .9 - var(--h-rank,0) * .9))}.lcl-hc4{border-top-color:rgba(20,20,20,calc(.1 + var(--h-rank,0) * .9))}" +
  ".lcl-hc1{opacity:calc(1 - var(--h-toDecision,0) * .5)}.lcl-hc2{opacity:calc(1 - var(--h-toLabels,0) * .5)}.lcl-hc3{opacity:calc(1 - var(--h-rank,0) * .45)}" +
  ".lcl-hq{margin:0;font-size:clamp(17px,1.5vw,22px);opacity:var(--h-quote,0);transform:translateY(calc((1 - var(--h-quote,0)) * 14px))}.lcl-hq2{opacity:clamp(0, var(--h-quote,0) * 2 - 1, 1)}" +
  ".lcl-hq .lcl-say{display:inline-block;padding:.35em .9em;border-radius:999px;background:var(--ink);color:var(--paper)}" +
  ".lcl-hq mark{color:inherit;background:linear-gradient(var(--lime),var(--lime)) no-repeat 0 100% / calc(var(--h-mark,0) * 100%) 100%;border-radius:4px;padding:0 .1em}" +
  ".lcl-hc1 mark{color:color-mix(in srgb, #141414 calc(var(--h-mark,0) * 100%), var(--paper))}" +
  ".lcl-hel{margin:0;color:var(--soft);font-size:14px;opacity:clamp(0, var(--h-quote,0) * 2 - .6, 1)}" +
  ".lcl-htag,.lcl-hw b{align-self:flex-start;padding:4px 10px;border-radius:999px;background:var(--lime);color:#141414;font-size:10.5px;font-weight:500}" +
  ".lcl-htag{opacity:var(--h-decision,0);transform:scale(calc(.8 + var(--h-decision,0) * .2))}" +
  ".lcl-hdec{margin:0;font-size:clamp(17px,1.5vw,22px);line-height:1.3;letter-spacing:-.015em;opacity:clamp(0, var(--h-decision,0) * 2 - .5, 1)}" +
  ".lcl-hw{display:flex;flex-wrap:wrap;gap:6px;opacity:clamp(0, var(--h-decision,0) * 2 - 1, 1)}.lcl-hw b{background:var(--ink);color:var(--paper)}" +
  ".lcl-hrec{display:flex;flex-direction:column;gap:6px;padding:12px;border-radius:18px;background:#fff;box-shadow:0 18px 50px rgba(0,0,0,.07);opacity:calc(.25 + var(--h-toLabels,0) * .75)}" +
  ".lcl-hrec-pic{position:relative;display:block;aspect-ratio:16/10;border-radius:12px;overflow:hidden;background:var(--card)}.lcl-hrec>b{font-weight:400;font-size:15px}" +
  ".lcl-hrec ul{list-style:none;margin:0;padding:0;font-size:10.5px}.lcl-hrec li{display:flex;justify-content:space-between;gap:8px;padding:5px 6px;border-top:1px solid rgba(0,0,0,.06);border-radius:6px}" +
  ".lcl-hrec li[data-hit]{background:rgba(214,240,92,calc(var(--h-labels,0) * .6));font-weight:500}.lcl-hrec li[data-st=unknown]{color:var(--soft)}.lcl-hrec small{color:var(--soft);font-size:9.5px}" +
  ".lcl-hrank{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:12px;opacity:clamp(0, var(--h-rank,0) * 3, 1)}" +
  ".lcl-hrank li{display:grid;grid-template-columns:1fr auto;gap:4px 8px;font-size:13.5px}.lcl-hrank i{grid-column:1 / -1;order:3;height:6px;border-radius:3px;background:rgba(0,0,0,.08);overflow:hidden;position:relative}" +
  ".lcl-hrank i::after{content:'';position:absolute;inset:0;width:calc(var(--w) * var(--h-rank,0) * 100%);background:var(--ink);border-radius:3px}.lcl-hrank li:first-child i::after{background:#2fae5b}.lcl-hrank em{font-style:normal;color:var(--soft);font-size:10px}" +
  ".lcl-hc4>.lcl-cmeta:not(:first-child){opacity:clamp(0, var(--h-rank,0) * 3 - 1, 1)}" +
  ".lcl-hbuy{display:flex;align-items:center;gap:10px;margin-top:6px;padding:8px 14px 8px 8px;border-radius:999px;background:var(--ink);color:var(--paper);opacity:var(--h-buy,0);transform:translateY(calc((1 - var(--h-buy,0)) * 30px)) scale(calc(.9 + var(--h-buy,0) * .1))}" +
  ".lcl-hbuy-pic{position:relative;flex:none;width:40px;height:40px;border-radius:50%;overflow:hidden;background:#fff}.lcl-hbuy>span{display:flex;flex-direction:column}.lcl-hbuy b{font-weight:400;font-size:14px}.lcl-hbuy em{font-style:normal;font-size:9.5px;color:rgba(255,255,255,.7)}" +
  // the travelling chips: column centres sit at 12.5% / 37.5% / 62.5% of the row
  ".lcl-hfly{position:absolute;top:120px;z-index:5;padding:8px 16px;border-radius:999px;background:var(--lime);color:#141414;font-size:13px;font-weight:500;white-space:nowrap;pointer-events:none;box-shadow:0 10px 26px rgba(0,0,0,.12);transform:translate(-50%,-50%)}" +
  ".lcl-hfly1{left:calc(12.5% + var(--h-toDecision,0) * 25%);top:calc(110px - sin(calc(var(--h-toDecision,0) * 180deg)) * 60px);opacity:calc(clamp(0, var(--h-toDecision,0) * 12, 1) * clamp(0, (1 - var(--h-toDecision,0)) * 12, 1))}" +
  ".lcl-hfly2,.lcl-hfly3{background:var(--ink);color:var(--paper);opacity:calc(clamp(0, var(--h-toLabels,0) * 12, 1) * clamp(0, (1 - var(--h-toLabels,0)) * 12, 1))}" +
  ".lcl-hfly2{left:calc(32% + var(--h-toLabels,0) * 30%);top:calc(250px - var(--h-toLabels,0) * 10px - sin(calc(var(--h-toLabels,0) * 180deg)) * 70px)}" +
  ".lcl-hfly3{left:calc(42% + var(--h-toLabels,0) * 20%);top:calc(250px + var(--h-toLabels,0) * 18px - sin(calc(var(--h-toLabels,0) * 180deg)) * 50px)}" +
  "@media (max-width:860px){.lcl-how{height:calc(var(--h) * 4)}.lcl-how-cols{grid-template-columns:1fr 1fr;gap:14px}.lcl-hc{min-height:0}.lcl-hfly{display:none}.lcl-how-in{justify-content:flex-start;padding-top:12vh;gap:20px}.lcl-hrec-pic{display:none}}" +
  // zoom-out: one sticky stage; the grid scales from the brief tile to the whole wall
  ".lcl-zo{position:relative;z-index:3;height:calc(var(--h) * 4);background:var(--paper)}" +
  ".lcl-zo-in{position:sticky;top:0;height:var(--h);overflow:hidden}" +
  ".lcl-zo-grid{position:absolute;left:50%;top:50%;width:calc(var(--zc) * (var(--zw) + var(--zg)) - var(--zg));display:flex;flex-direction:column;gap:var(--zg);transform-origin:50% 50%}" +
  // each row drifts sideways once the view has zoomed out (amplitude follows --z-out, so the brief holds still first)
  ".lcl-zrow{--per:calc(var(--zc) * (var(--zw) + var(--zg)));display:grid;grid-template-columns:repeat(calc(var(--zc) * 3),var(--zw));grid-auto-rows:var(--zh);gap:var(--zg);margin-left:calc(-1 * var(--per));animation:lcl-zloop var(--dur) linear infinite}.lcl-zrow-still{animation:none}" +
  "@keyframes lcl-zloop{from{transform:translateX(0)}to{transform:translateX(calc(var(--dir) * var(--per)))}}" +
  "@media (prefers-reduced-motion:reduce){.lcl-zrow{animation:none}}" +
  ".lcl-zt{display:flex;flex-direction:column;gap:8px;padding:12px;border-radius:18px;background:#fff;box-shadow:0 0 0 1px rgba(0,0,0,.05);overflow:hidden;opacity:clamp(0, var(--z-tiles,0) * 4 - var(--d,0) * .45, 1)}" +
  ".lcl-zt-pic{position:relative;display:block;flex:1;min-height:0;border-radius:12px;overflow:hidden;background:var(--card)}" +
  ".lcl-zq{align-self:flex-start;padding:5px 11px;border-radius:999px;background:var(--ink);color:var(--paper);font-size:12.5px;line-height:1.25}" +
  ".lcl-zt code{align-self:flex-start;padding:3px 8px;border-radius:999px;background:var(--lime);color:#141414;font-size:10px}" +
  ".lcl-zme{display:flex;align-items:center;gap:8px;padding-bottom:6px;border-bottom:1px solid rgba(0,0,0,.08)}.lcl-zme img{width:44px;height:44px;object-fit:contain;flex:none}.lcl-zme>span{display:flex;flex-direction:column;gap:1px}.lcl-zme b{font-weight:500;font-size:11.5px}.lcl-zme small{font-size:8.5px;line-height:1.25;color:var(--soft)}" +
  ".lcl-zt-me{opacity:1;gap:6px;padding:12px;box-shadow:0 0 0 2px var(--ink),0 20px 60px rgba(0,0,0,.12)}" +
  ".lcl-zt-me ol{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:7px}" +
  ".lcl-zt-me li{display:flex;flex-direction:column;gap:3px;align-items:flex-start;opacity:clamp(0, var(--z-brief,0) * 6 - var(--i), 1);transform:translateY(calc((1 - clamp(0, var(--z-brief,0) * 6 - var(--i), 1)) * 8px))}" +
  ".lcl-zt-me .lcl-zq{font-size:10px;padding:3px 8px}.lcl-zt-me code{font-size:8.5px;padding:2px 6px}.lcl-zt-me li b{font-weight:500;font-size:9.5px;color:#2fae5b}.lcl-zgot{display:flex;align-items:center;gap:6px;white-space:nowrap}.lcl-zt-me ol{gap:6px}.lcl-zt-me .lcl-zq{font-size:9.5px;padding:2px 7px}" +
  ".lcl-zcap,.lcl-zhead{position:absolute;left:0;right:0;margin:0;padding:0 16px;text-align:center;color:#fff;pointer-events:none}" +
  ".lcl-zcap{bottom:10vh;font-size:clamp(15px,1.3vw,19px)}.lcl-zpill{display:inline-block;padding:.5em 1em;border-radius:999px;background:rgba(20,20,20,.72);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px)}" +
  ".lcl-zcap1{opacity:calc(var(--z-cap1,0) - var(--z-out,0) * 3)}.lcl-zcap2{opacity:calc(var(--z-cap2,0) - var(--z-head,0) * 3)}" +
  ".lcl-zhead{top:50%;transform:translateY(-50%) scale(calc(.92 + var(--z-head,0) * .08));font-weight:400;font-size:clamp(28px,3.6vw,60px);line-height:1.12;letter-spacing:-.035em;opacity:var(--z-head,0)}.lcl-zhead .lcl-zpill{padding:.35em .8em;border-radius:.6em}@media (max-width:720px){.lcl-zhead{font-size:22px}}" +
  ".lcl-vs{position:relative;z-index:3;max-width:1240px;margin:0 auto;padding:10vh clamp(16px,2vw,32px) 0;background:var(--paper)}" +
  ".lcl-vs .lcl-sh{margin:0;font-weight:400;font-size:clamp(30px,3.4vw,56px);letter-spacing:-.035em;line-height:1.04}" +
  ".lcl-vs-t{max-width:1040px;margin:0 auto}" +
  ".lcl-vs-r{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,1fr) minmax(0,1.2fr);gap:24px;align-items:baseline;padding:18px 20px;border-top:1px solid rgba(0,0,0,.1);font-size:clamp(15px,1.25vw,18px);line-height:1.35}" +
  ".lcl-vs-r b{font-weight:400;letter-spacing:-.015em}.lcl-vs-r span{color:var(--soft)}" +
  ".lcl-vs-h{padding-top:0;padding-bottom:10px;border-top:0;font-size:10px;color:var(--soft)}" +
  ".lcl-vs-me{margin-top:10px;border:0;border-radius:20px;background:var(--ink);color:var(--paper);font-size:clamp(17px,1.45vw,21px)}.lcl-vs-me span{color:rgba(255,255,255,.75)}.lcl-vs-me span:last-child{color:var(--lime)}" +
  ".lcl-vs-me b{display:flex;align-items:center;gap:10px;font-weight:500}.lcl-vs-mark{width:1.4em;color:var(--paper)}" +
  ".lcl-vs .lcl-diff{margin:clamp(56px,9vh,110px) auto clamp(72px,12vh,140px)}" +
  "@media (max-width:720px){.lcl-vs-r{grid-template-columns:1fr;gap:4px}.lcl-vs-h{display:none}}" +
  ".lcl-steps{list-style:none;max-width:1040px;margin:0 auto;padding:0;counter-reset:st}" +
  ".lcl-steps li{counter-increment:st;display:grid;grid-template-columns:12em minmax(0,1fr) auto;gap:20px;align-items:baseline;padding:16px 0;border-top:1px solid rgba(0,0,0,.1)}.lcl-steps li:last-child{border-bottom:1px solid rgba(0,0,0,.1)}" +
  ".lcl-steps b{font-weight:400;font-size:clamp(18px,1.5vw,22px);letter-spacing:-.02em}.lcl-steps b::before{content:counter(st, decimal-leading-zero) '  ';font:10px ui-monospace,monospace;color:var(--soft);white-space:pre}.lcl-steps span{color:var(--soft);font-size:14.5px}.lcl-steps em{font-style:normal;font-size:10.5px;text-align:right}" +
  // the elephant mark: draws itself on load in the hero, and draws again with the closing line
  ".lcl-mark{display:block;color:var(--ink)}.lcl-mark svg{display:block;width:100%;height:auto;overflow:visible}.lcl-mark path{stroke-dasharray:1}" +
  ".lcl-mark-hero{display:inline-block;vertical-align:-.12em;width:1.15em;margin-right:.28em}" +
  ".lcl-mark-hero path{stroke-dashoffset:1;animation:lcl-draw 1.1s cubic-bezier(.6,0,.3,1) calc(var(--k) * .3s) forwards}.lcl-mark-hero circle{opacity:0;animation:lcl-fade .3s ease 1.15s forwards}" +
  "@keyframes lcl-draw{to{stroke-dashoffset:0}}@keyframes lcl-fade{to{opacity:1}}" +
  ".lcl-mark-end{width:clamp(44px,4.4vw,72px);margin:0 auto 22px}.lcl-mark-end path{stroke-dashoffset:calc(1 - clamp(0, var(--t,0) * 3 - var(--k) * .45, 1))}.lcl-mark-end circle{opacity:clamp(0, var(--t,0) * 3 - 1.2, 1)}" +
  "@media (prefers-reduced-motion:reduce){.lcl-mark-hero path,.lcl-mark-hero circle{animation:none;stroke-dashoffset:0;opacity:1}}" +
  ".lcl-diff{margin:clamp(72px,12vh,140px) auto;max-width:none;text-align:center;font-size:clamp(26px,3vw,48px);letter-spacing:-.035em;line-height:1.1}" +
  "@media (max-width:720px){.lcl-steps li{grid-template-columns:1fr;gap:2px}.lcl-gr .lcl-need{font-size:12px}}" +
  ".lcl-sh,.lcl-tm-title,.lcl-diff,.lcl-lede,.lcl-note,.lcl-cap{text-wrap:balance}.lcl-cap .lcl-pillbg{border-radius:.7em;padding:.2em .7em}" +
  "@media (max-width:720px){.lcl-probbig{font-size:34px}}" +
  "" +
  "@media (max-width:720px){.lcl-talk-in{grid-template-columns:1fr;align-content:center;gap:16px;padding:0 4px}.lcl-room{width:min(70vw,34vh);justify-self:center;order:-1}.lcl-talk .lcl-sh{font-size:22px;margin-bottom:10px}.lcl-talk .lcl-chat li{flex-direction:row;gap:8px}.lcl-talk .lcl-chat li>span:first-child{width:56px}.lcl-hs-pill b{font-size:12px}.lcl-pin .lcl-hs-pill{padding:6px 10px}.lcl-co .lcl-hs-pill{left:-14px}.lcl-rt figcaption{display:none}}"

const FONTS =
  "@font-face{font-family:LclSans;font-weight:400;font-display:swap;src:url(data:font/woff2;base64,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) format(\"woff2\")}" +
  "@font-face{font-family:LclSans;font-weight:700;font-display:swap;src:url(data:font/woff2;base64,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) format(\"woff2\")}" +
  "@font-face{font-family:LclMono;font-weight:400 700;font-display:swap;src:url(data:font/woff2;base64,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) format(\"woff2\")}"

/* ------------------------------------------------------------- helpers */

function ActionEl({ a, label, className, cursor, children }: { a: Action; label: string; className: string; cursor: string; children?: ReactNode }) {
  const props = { className, "data-magnet": "", "data-cursor": cursor }
  const inner = children || <span>{a.label || label}</span>
  if (a.href) {
    return (
      <a href={a.href} onClick={a.onClick} {...props}>
        {inner}
      </a>
    )
  }
  return (
    <button type="button" onClick={a.onClick} {...props}>
      {inner}
    </button>
  )
}

const Chevron = ({ d = "M3 4.5L6 7.5L9 4.5" }: { d?: string }) => (
  <svg viewBox="0 0 12 12" aria-hidden="true">
    <path d={d} stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

const letters = (text: string, key: string) => text.split("").map((ch, i) => <span key={key + i} style={{ "--i": i } as CSSProperties}>{ch === " " ? " " : ch}</span>)
const words = (text: string, delay: number, step: number) =>
  text.split(" ").flatMap((w, i) => [
    i > 0 ? " " : null,
    <span key={w + i} className="lcl-w" style={{ "--dl": (delay + i * step).toFixed(2) + "s" } as CSSProperties}>
      {w}
    </span>,
  ])

type El = HTMLElement | SVGElement
type Flight = { a: Rect; m: Rect; b: Rect }

const FIELD_PTS = fieldLayout(FIELD_KINDS.length, 11)
const FLOATS: [number, number][] = [
  [4, 0.05],
  [14, 0.3],
  [5, 0.55],
  [17, 0.78],
  [3, 0.98],
  [11, 1.18],
]

/* ------------------------------------------------------------- component */

export default function LoupeCuratorLanding({
  height = "100svh",
  brand = "Elephant",
  launch = "AEC Hackathon NYC 2026",
  joinAction = { label: "Open live demo", href: "https://the-elephant-in-the-room.vercel.app" },
  signInAction = { label: "GitHub", href: "https://github.com/chloewantsleep/the-elephant-in-the-room-aec-hackathon-nyc-2026" },
  className,
  style,
}: LoupeCuratorLandingProps) {
  const rootRef = useRef(null as HTMLDivElement | null)
  const cursorRef = useRef(null as HTMLDivElement | null)
  const labelRef = useRef(null as HTMLSpanElement | null)
  const els = useRef({} as Record<string, El | null>)
  const reg = (k: string) => (el: El | null) => {
    els.current[k] = el
  }
  const [view, setView] = useState("curator-0")
  const [col, setCol] = useState(0)
  const [saved, setSaved] = useState({} as Record<string, boolean>)
  const [seed, setSeed] = useState(1)
  const [taps, setTaps] = useState(0)
  const [still, setStill] = useState(false)
  const [toast, setToast] = useState({ text: "", on: false })
  const toastTimer = useRef(0)
  const s = useRef({
    W: 0,
    H: 0,
    tw: 120,
    off: {} as Record<string, number>,
    len: {} as Record<string, number>,
    thumbs: [] as El[],
    words: [] as El[],
    floats: [] as El[],
    tiles: [] as El[],
    cols: [] as El[],
    scenes: [] as El[],
    flight: null as Flight | null,
    fine: false,
    still: false,
    ready: false,
    top: 0,
    last: 0,
    clock: 0,
    view: "curator-0",
    picked: false,
    row: [] as Box[],
    col: 0,
    fk: -1,
    count: -1,
    pileOn: false,
    pileTop: 0,
    sw: 0,
    l2dx: 0, // half the width difference of the two halves of hero line 2
    user: false,
    spawn: 0,
    z: 100,
    topTile: PILE_KINDS.length - 1,
    kind: 0,
    lx: -999,
    ly: -999,
    label: "",
    magnet: null as HTMLElement | null,
    magnetBox: null as DOMRect | null,
    raf: 0,
    cache: new WeakMap() as WeakMap<object, Record<string, string>>,
  })
  s.current.view = view
  const pick = SWAPS.find((sw) => sw.img === view) || SWAPS[1]   // a HYLTARP color still reads as HYLTARP
  const choose = (img: string) => {
    s.current.picked = true
    setView(img)
  }
  const nextPick = () => {
    const i = SWAPS.indexOf(SWAPS.find((sw) => sw.img === view) || SWAPS[1])
    choose(SWAPS[(i + 1) % SWAPS.length].img)
  }

  const put = (el: El | null | undefined, prop: string, val: string) => {
    if (!el) return
    const c = s.current.cache
    let m = c.get(el)
    if (!m) c.set(el, (m = {}))
    if (m[prop] === val) return
    m[prop] = val
    if (prop.charCodeAt(0) === 45) el.style.setProperty(prop, val)
    else (el.style as unknown as Record<string, string>)[prop] = val
  }
  const flag = (el: El | null | undefined, name: string, on: boolean) => {
    if (!el) return
    if (on !== el.hasAttribute(name)) on ? el.setAttribute(name, "") : el.removeAttribute(name)
  }

  const say = (text: string) => {
    setToast({ text, on: true })
    window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast((t) => ({ ...t, on: false })), 2600)
  }

  // decode the team photos up front so hovering a card swaps instantly
  useEffect(() => {
    ROOM_IMGS.forEach((k) => {
      const im = new Image()
      im.src = IMG[k]
      im.decode?.().catch(() => {})
    })
    TEAM.forEach((m) => {
      const im = new Image()
      im.src = "/img/team-" + m.key + ".jpg"
      im.decode?.().catch(() => {})
    })
  }, [])

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return
    const rm = window.matchMedia("(prefers-reduced-motion: reduce)")
    const fp = window.matchMedia("(hover: hover) and (pointer: fine)")
    const sync = () => {
      s.current.still = rm.matches
      s.current.fine = fp.matches
      setStill(rm.matches)
    }
    sync()
    rm.addEventListener("change", sync)
    fp.addEventListener("change", sync)
    return () => {
      rm.removeEventListener("change", sync)
      fp.removeEventListener("change", sync)
    }
  }, [])

  // ---- the frame: one layout read (the root's top), eased for inertia, then writes only
  const frame = (now: number) => {
    const st = s.current
    st.raf = 0
    const root = rootRef.current
    if (!root || !st.H) return
    const dt = st.last ? Math.min(64, now - st.last) : 16
    st.last = now
    const raw = root.getBoundingClientRect().top
    st.top = !st.ready || st.still ? raw : approach(st.top, raw, dt, 85)
    st.ready = true
    let again = Math.abs(st.top - raw) > 0.4
    const top = st.top
    const W = st.W
    const H = st.H
    const e = els.current
    const at = (k: string) => top + (st.off[k] || 0)
    const seen = (k: string) => at(k) < H && at(k) + (st.len[k] || 0) > 0
    const pin = (k: string) => progressFrom(at(k), st.len[k] || 0, H)

    // 1 · the photo field, the gap, your room; 2 · the sofa swaps in place
    if (seen("intro")) {
      let p = pin("intro")
      if (st.still) p = poseFor(p, REDUCED.intro)
      else {
        st.clock += dt / 1000
        again = true
      }
      const fade = 1 - span(p, [0.03, 0.06])
      const cam = span(p, INTRO.fly) * FIELD.travel + st.clock * FIELD.idle
      const tw = st.tw
      st.thumbs.forEach((el, j) => {
        const f = FIELD_PTS[j]
        if (!f) return
        const q = flyAt(f.x, f.y, f.z, cam, W, H)
        // a photo passing behind the headline steps back so the words stay readable
        const behind = Math.abs(q.x - W / 2) < W * 0.24 && Math.abs(q.y - H / 2) < H * 0.11 ? 0.18 : 1
        const o = q.o * fade * behind
        put(el, "opacity", o.toFixed(3))
        if (o > 0.002) {
          put(el, "transform", "translate3d(" + (q.x - tw / 2).toFixed(1) + "px," + (q.y - tw * 0.625).toFixed(1) + "px,0) scale(" + (q.s * 1.2).toFixed(4) + ")")
          put(el, "zIndex", String(Math.round(100 - q.d * 2)))
        }
      })
      const I = e.intro
      const l1 = span(p, INTRO.lineOut)
      put(I, "--l1", l1.toFixed(3))
      put(e.l1, "filter", l1 > 0 && l1 < 1 ? "blur(" + (l1 * 10).toFixed(1) + "px)" : "none")
      const w0 = Math.min(W * 0.14, 190)
      // grow -> (team) -> shrink back to the small window -> regrow (room photo)
      const g1 = span(p, INTRO.grow)
      const op = clamp01(span(p, INTRO.open) - span(p, INTRO.close) + span(p, INTRO.reopen))
      const b = zoomBox(op, clamp01(g1 - span(p, INTRO.shrink) + span(p, INTRO.regrow)), W, H, w0, w0 * 0.62)
      const bWords = zoomBox(span(p, INTRO.open), g1, W, H, w0, w0 * 0.62)   // the headline stays pushed out
      put(e.portrait, "clipPath", insetOf(b, W, H))
      put(e.portrait, "visibility", b.w < 1 ? "hidden" : "visible")
      put(e.portrait, "transform", "translate3d(0," + (-span(p, [coverAt(TRACK.intro), 1]) * H * 0.32).toFixed(1) + "px,0)")
      put(e.portraitIn, "transform", "scale(" + coverScale(b, W, H).toFixed(4) + ")")
      put(I, "--g", bWords.w.toFixed(1) + "px")
      // keep the headline centered while the gap is closed; drift back to the true center as it opens
      put(e.l2, "transform", "translate(" + (st.l2dx * (1 - smooth(span(p, INTRO.open)))).toFixed(1) + "px,-50%)")
      // the team lives in the window until it closes; the room takes over when it reopens
      const tm = p < INTRO.close[1] ? 1 : 0
      put(I, "--tm", String(tm))
      put(I, "--tn", span(p, INTRO.teamIn).toFixed(3))
      put(e.team, "visibility", tm ? "visible" : "hidden")
      put(e.team, "pointerEvents", tm && span(p, INTRO.teamIn) > 0.5 && p < INTRO.shrink[0] ? "auto" : "none")
      put(I, "--cap", span(p, INTRO.caption).toFixed(3))
      put(I, "--capo", (1 - span(p, INTRO.captionOut)).toFixed(3))
      const c = span(p, INTRO.callouts)
      put(I, "--c", c.toFixed(3))
      put(I, "--s", smooth(span(p, INTRO.strip)).toFixed(3))
      const f = flipAt(p, FLICK.length)
      if (f >= 0 && f !== st.fk) {
        st.fk = f
        ;(e.flick as HTMLImageElement | null)?.setAttribute("src", IMG[FLICK[f]])
      }
      flag(e.portrait, "data-flip", f >= 0)
      // with no hand on it, the room tries the next sofa every few scrolls; a click takes over until you scroll back up
      if (p < INTRO.callouts[0]) st.picked = false
      if (!st.picked) {
        const sw = span(p, INTRO.swap)
        const img = SWAPS[sw <= 0 ? 0 : 1 + Math.min(SWAPS.length - 2, Math.floor(sw * (SWAPS.length - 1)))].img
        if (img !== st.view) {
          st.view = img
          setView(img)
        }
      }
      flag(e.callouts, "data-live", c > 0.6)
    }

    // 3 · the talk lands on the room; 4 · the grid panel rises; the last pick flies into the grid
    if (seen("mani") || seen("grid")) {
      put(e.mani, "--t", clamp01((H * 0.7 - at("mani")) / (H * 1.6)).toFixed(3))
      const tr = st.still ? 1 : progressFrom(at("talk"), st.len.talk || 0, H)
      put(e.talk, "--pq", smooth(clamp01((tr - TALK_PROB[0]) / (TALK_PROB[1] - TALK_PROB[0]))).toFixed(3))
      put(e.talk, "--tc", (clamp01((tr - TALK_PROB[1]) / (1 - TALK_PROB[1])) * 1.15).toFixed(3))
      const gTop = at("grid")
      put(e.mani, "--dim", smooth(clamp01((H - gTop) / H)).toFixed(3))
      const k = st.still ? (gTop < H * 0.5 ? 1 : 0) : clamp01((H * 0.95 - gTop) / (H * 0.75))
      const fl = st.flight
      if (fl) {
        const r = flightAt(k, fl.a, fl.m, fl.b)
        put(e.fly, "transform", "translate3d(" + r.x.toFixed(1) + "px," + r.y.toFixed(1) + "px,0) scale(" + (r.w / fl.a.w).toFixed(4) + ")")
        flag(e.fly, "data-on", k > 0 && k < 1)
        flag(e.flySrc, "data-away", k > 0)
        flag(e.flyDst, "data-away", k < 1)
        put(e.gtitle, "--tg", (titleGapAt(k) * fl.m.w * 1.06).toFixed(1) + "px")
      }
      put(e.grid, "--gr", (st.still ? 1 : clamp01((H * 0.8 - gTop) / ((st.len.grid || H) * 0.5))).toFixed(3))
      const gp = clamp01((H - gTop) / ((st.len.grid || H) + H))
      st.cols.forEach((el, j) => put(el, "transform", "translate3d(0," + (st.still ? 0 : -gp * H * (COL_SPEED[j] || 0)).toFixed(1) + "px,0)"))
    }

    // the revision: its conversation inks in as it rises
    if (seen("how")) {
      const u = st.still ? 1 : progressFrom(at("how"), st.len.how || 0, H)
      for (const [k, w] of Object.entries(HOW)) put(e.how, "--h-" + k, smooth(span(u, w)).toFixed(3))
    }
    if (seen("zo")) {
      const u = st.still ? 1 : progressFrom(at("zo"), st.len.zo || 0, H)
      for (const [k, w] of Object.entries(ZO)) put(e.zo, "--z-" + k, smooth(span(u, w)).toFixed(3))
      const gw = ZCOLS * ZTILE.w + (ZCOLS - 1) * ZTILE.gap
      const gh = ZROWS * ZTILE.h + (ZROWS - 1) * ZTILE.gap
      const s0 = Math.min((H * 0.7) / ZTILE.h, (W * 0.88) / ZTILE.w)
      const s1 = H / gh   // exactly ZROWS rows tall: the screen edge lands between rows; rows loop sideways, so width never runs out
      const z = smooth(span(u, ZO.out))
      put(e.zoGrid, "transform", "translate(-50%,-50%) scale(" + (s0 * Math.pow(s1 / s0, z)).toFixed(4) + ")")
    }
    if (seen("life") && st.len.lb) {
      const u = st.still ? 1 : progressFrom(at("lb"), st.len.lb, H)
      for (const [k, w] of Object.entries(LB)) put(e.lb, "--lb-" + k, smooth(span(u, w)).toFixed(3))
      const b0 = total(GRID), b1 = total(GRID_AFTER)
      const t = b0 + (b1 - b0) * smooth(span(u, LB.budget))
      put(e.lb, "--lb-fill", (t / BUDGET).toFixed(4))
      const tx = els.current.lbTotal as HTMLElement | null
      const v = usd(Math.round(t * 100) / 100)
      if (tx && tx.textContent !== v) tx.textContent = v
    }
    if (seen("life")) put(e.life, "--tc", (st.still ? 1 : clamp01((H * 0.85 - at("life")) / (H * 0.7))).toFixed(3))

    // 5 · giant words over the lime sweep
    if (st.words.length && seen("words")) {
      const q = clamp01((H - at("words")) / H)
      const p = st.still ? 0.4 : pin("words")
      const n = st.words.length
      const w = wordsAt(p, q, H, n)
      put(e.wcol, "transform", "translate3d(0," + w.col.toFixed(1) + "px,0)")
      put(e.sweep, "transform", "translate3d(0," + (st.still ? H * 0.42 : w.band - H * 0.25).toFixed(1) + "px,0) rotate(-8deg)")
      st.words.forEach((el, k) => put(el, "--e", (st.still ? 0 : w.e[k]).toFixed(3)))
      put(e.wcol, "--dd", (st.still ? 1 : clamp01(1 - w.e[n - 1] * 2.4)).toFixed(3))
    }

    // 4 · second zoom → the collections drum
    if (seen("zoom")) {
      let p = pin("zoom")
      const n = COLLECTIONS.length
      if (st.still) p = poseFor(p, zoomPoses(n))
      const Z = e.zoom
      const w0 = Math.min(W * 0.1, 130)
      const g = zoomBox(span(p, ZOOM.open), span(p, ZOOM.grow), W, H, w0, w0 * 0.66)
      // at the end the full-bleed stage shrinks into the last slot of a row of every stage
      const sh = st.still ? 0 : smooth(span(p, ZOOM.shrink))
      const t = st.row[n - 1]
      const b: Box = sh > 0 && t ? { x: lerp(g.x, t.x, sh), y: lerp(g.y, t.y, sh), w: lerp(g.w, t.w, sh), h: lerp(g.h, t.h, sh), r: lerp(g.r, 12, sh) } : g
      put(e.scenes, "clipPath", insetOf(b, W, H))
      put(e.scenes, "visibility", b.w < 1 ? "hidden" : "visible")
      put(e.scenesIn, "transform", "translate3d(" + (b.x + b.w / 2 - W / 2).toFixed(1) + "px," + (b.y + b.h / 2 - H / 2).toFixed(1) + "px,0) scale(" + coverScale(b, W, H).toFixed(4) + ")")
      put(Z, "--g", g.w.toFixed(1) + "px")
      put(Z, "--sh", sh.toFixed(3))
      const u = smooth(span(p, ZOOM.ui)) * (1 - smooth(span(p, [ZOOM.shrink[0], ZOOM.shrink[0] + 0.04])))
      put(Z, "--u", u.toFixed(3))
      const a = drumAt(p, n)
      put(Z, "--a", a.toFixed(4))
      // scenes: only the one arriving is blurred; anything fully covered is not drawn at all
      const sv = st.scenes.map((_, i) => clamp01((a - i + 0.6) * 2))
      st.scenes.forEach((el, i) => {
        const v = sv[i]
        const hidden = v <= 0 || (i + 1 < sv.length && sv[i + 1] >= 1)
        put(el, "visibility", hidden ? "hidden" : "visible")
        if (hidden) return
        put(el, "opacity", v.toFixed(3))
        put(el, "filter", v < 1 && !st.still ? "blur(" + ((1 - v) * 18).toFixed(1) + "px)" : "none")
        put(el, "transform", "scale(" + (1.12 - 0.12 * clamp01(a - i + 1)).toFixed(4) + ")")
      })
      const q = span(p, ZOOM.drum)
      st.floats.forEach((el, j) => put(el, "transform", "translate3d(0," + (floatY(FLOATS[j] ? FLOATS[j][1] : 0, q, 1.3 + j * 0.18) * H).toFixed(1) + "px,0)"))
      flag(e.ui, "data-live", u > 0.6)
      const k = Math.round(a)
      if (k !== st.col) {
        st.col = k
        setCol(k)
      }
    }

    // 5 · no feeds; the photo trail gathers into a pile; the waitlist
    st.pileOn = seen("pile")
    const fd = clamp01((H - at("foot")) / (H * 0.62))
    if (st.pileOn) {
      let p = pin("pile")
      if (st.still) p = poseFor(p, REDUCED.pile)
      const pa = at("pile")
      st.pileTop = pa > 0 ? pa : Math.min(0, pa + (st.len.pile || 0) - H)
      const P = e.pile
      put(P, "--t", span(p, PILE.ink).toFixed(3))
      const sw = smooth(span(p, PILE.swap))
      st.sw = sw
      put(P, "--sw", sw.toFixed(3))
      put(P, "--ty", span(p, PILE.type).toFixed(3))
      put(P, "--fd", fd.toFixed(3))
      put(e.pf, "--g", sw.toFixed(3))
      put(e.pf, "--cx", (lerp(PILE_AT.x, 0.5, sw) * W).toFixed(1) + "px")
      put(e.pf, "--cy", (lerp(PILE_AT.y, lerp(0.33, 0.17, fd), sw) * H).toFixed(1) + "px")
      flag(e.pf, "data-bits", p > 0.06)
      const n = st.tiles.length
      const count = pileCount(p, n)
      if (count !== st.count) {
        st.count = count
        st.tiles.forEach((t, k) => {
          if (k < count) t.setAttribute("data-on", "")
          else if (!st.user) t.removeAttribute("data-on")
        })
      }
      flag(e.cta, "data-off", sw < 0.6)
    }

    // 6 · footer: the sun is drawn, then fills; the floating nav steps aside
    put(e.foot, "--f", fd.toFixed(3))
    put(e.chrome, "--hide", smooth(clamp01(fd * 1.6)).toFixed(3))
    flag(e.nav, "data-off", fd > 0.4)

    if (again) schedule()
  }

  const schedule = () => {
    if (!s.current.raf && typeof window !== "undefined") s.current.raf = window.requestAnimationFrame(frame)
  }

  // the untouched pile: a loose trail of photos, revealed by scroll
  const layoutPile = () => {
    const st = s.current
    st.tiles.forEach((t, k) => {
      const sp = pileSpot(k, seed)
      t.style.setProperty("--x", (sp.x * st.W).toFixed(1) + "px")
      t.style.setProperty("--y", (sp.y * st.H).toFixed(1) + "px")
      t.style.setProperty("--r", sp.rot.toFixed(1) + "deg")
    })
  }

  // measure on mount and on resize; never inside the frame
  useEffect(() => {
    const root = rootRef.current
    if (!root || typeof window === "undefined") return
    const st = s.current
    const offIn = (el: HTMLElement | null) => {
      let x = 0
      let y = 0
      let n = el
      while (n && n !== root) {
        x += n.offsetLeft
        y += n.offsetTop
        n = n.offsetParent as HTMLElement | null
      }
      return { x, y }
    }
    const measure = () => {
      const stage = els.current.introStage as HTMLElement | null
      st.W = root.clientWidth
      st.H = stage ? stage.clientHeight : window.innerHeight
      for (const k of ["intro", "mani", "grid", "life", "words", "zoom", "pile", "foot", "how", "zo"]) {
        const el = els.current[k] as HTMLElement | null
        st.off[k] = el ? el.offsetTop : 0   // (measured per section)
        st.len[k] = el ? el.offsetHeight : 0
      }
      // the talk sits inside the comparison section, so its offset is the section's plus its own
      const talk = els.current.talk as HTMLElement | null
      st.off.talk = talk ? st.off.mani + talk.offsetTop : 0
      st.len.talk = talk ? talk.offsetHeight : 0
      const lb = els.current.lb as HTMLElement | null
      st.off.lb = lb ? (st.off.life || 0) + lb.offsetTop : 0
      st.len.lb = lb ? lb.offsetHeight : 0
      // where the sofa lands on screen with the room photo cover-fitted to the stage
      const cs = Math.max(st.W / IMG_RATIO, st.H)
      const iw = IMG_RATIO * cs
      const co = els.current.callouts as HTMLElement | null
      if (co) {
        co.style.setProperty("--hx", ((st.W - iw) / 2 + SOFA_AT.u * iw).toFixed(1) + "px")
        co.style.setProperty("--hy", ((st.H - cs) / 2 + SOFA_AT.v * cs).toFixed(1) + "px")
        co.style.setProperty("--rx", (SOFA_AT.ru * iw).toFixed(1) + "px")
        co.style.setProperty("--ry", (SOFA_AT.rv * cs).toFixed(1) + "px")
      }
      // the closing row of life stages
      const n = COLLECTIONS.length
      const rw = Math.min(st.W * 0.13, 168)
      const gap = Math.min(st.W * 0.012, 16)
      const x0 = (st.W - (n * rw + (n - 1) * gap)) / 2
      st.row = COLLECTIONS.map((_, i) => ({ x: x0 + i * (rw + gap), y: st.H / 2 - rw * 0.62, w: rw, h: rw * 1.12, r: 12 }))
      Array.from(root.querySelectorAll("[data-rt]")).forEach((el, i) => {
        const b = st.row[i]
        const h = el as HTMLElement
        h.style.cssText = "left:" + b.x + "px;top:" + b.y + "px;width:" + b.w + "px;height:" + b.h + "px;--k:" + i
      })
      const wl = els.current.wl as HTMLElement | null, wr = els.current.wr as HTMLElement | null
      st.l2dx = wl && wr ? (wl.offsetWidth - wr.offsetWidth) / 2 : 0
      st.thumbs = Array.from(root.querySelectorAll("[data-th]")) as El[]
      st.tw = st.thumbs[0] ? (st.thumbs[0] as HTMLElement).offsetWidth : 120
      st.words = Array.from(root.querySelectorAll("[data-word]")) as El[]
      st.floats = Array.from(root.querySelectorAll("[data-float]")) as El[]
      st.tiles = Array.from(root.querySelectorAll("[data-tile]")) as El[]
      st.cols = Array.from(root.querySelectorAll("[data-gcol]")) as El[]
      st.scenes = Array.from(root.querySelectorAll("[data-scene]")) as El[]
      const src = (els.current.flySrc as HTMLElement | null)?.firstElementChild as HTMLElement | null
      const dst = (els.current.flyDst as HTMLElement | null)?.firstElementChild as HTMLElement | null
      const ttl = els.current.gtitle as HTMLElement | null
      if (src && dst && ttl && src.offsetWidth > 0 && dst.offsetWidth > 0) {
        const a = offIn(src)
        const b = offIn(dst)
        const t = offIn(ttl)
        const mw = dst.offsetWidth * 0.62
        st.flight = {
          a: { x: a.x, y: a.y, w: src.offsetWidth },
          m: { x: t.x + ttl.offsetWidth / 2 - mw / 2, y: t.y + ttl.offsetHeight / 2 - (mw * 1.25) / 2, w: mw },
          b: { x: b.x, y: b.y, w: dst.offsetWidth },
        }
        const fly = els.current.fly as HTMLElement | null
        if (fly) fly.style.width = src.offsetWidth + "px"
      } else st.flight = null
      if (!st.user) layoutPile()
      st.count = -1
      st.cache = new WeakMap()
      schedule()
    }
    measure()
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null
    ro?.observe(root)
    window.addEventListener("resize", measure)
    window.addEventListener("scroll", schedule, { passive: true })
    const fonts = document.fonts
    fonts?.ready.then(measure).catch(() => null)
    // the pile flips through photos once it has gathered
    const flip = window.setInterval(() => {
      if (!st.pileOn || st.still || st.sw < 0.4) return
      const t = st.tiles[st.topTile]
      const img = t ? (t.firstElementChild as HTMLImageElement | null) : null
      if (img) img.src = IMG["tile-" + PILE_KINDS[st.kind++ % PILE_KINDS.length]]
    }, 170)
    return () => {
      ro?.disconnect()
      window.removeEventListener("resize", measure)
      window.removeEventListener("scroll", schedule)
      window.clearInterval(flip)
      if (st.raf) window.cancelAnimationFrame(st.raf)
      st.raf = 0
      window.clearTimeout(toastTimer.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // state the frame reads: re-run it when they change
  useEffect(() => {
    const st = s.current
    st.count = -1
    st.user = false
    layoutPile()
    schedule()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [still, seed])

  // ---- jumps (a click may read layout; the frame may not)
  const scrollToY = (y: number) => window.scrollTo({ top: Math.max(0, y), behavior: s.current.still ? "auto" : "smooth" })
  const absTop = () => (rootRef.current ? rootRef.current.getBoundingClientRect().top + window.scrollY : 0)
  const travel = (k: string) => (s.current.len[k] || 0) - s.current.H
  const jumpToCollection = (i: number) => {
    const st = s.current
    scrollToY(absTop() + st.off.zoom + drumHold(i, COLLECTIONS.length) * travel("zoom"))
  }
  const next = () => {
    const st = s.current
    const base = absTop()
    const stops = [
      base + st.off.intro + 0.22 * travel("intro"),
      base + st.off.intro + 0.48 * travel("intro"),
      base + st.off.intro + 0.62 * travel("intro"),
      base + st.off.intro + 0.86 * travel("intro"),
      base + st.off.talk + 0.5 * ((st.len.talk || 0) - st.H),
      base + st.off.talk + (st.len.talk || 0),
      base + st.off.grid + st.H * 0.3,
      base + st.off.life - st.H * 0.05,
      ...(st.len.words ? [base + st.off.words + 0.45 * travel("words")] : []),
      base + st.off.zoom + 0.06 * travel("zoom"),
      base + st.off.zoom + drumHold(0, COLLECTIONS.length) * travel("zoom"),
      base + st.off.pile + 0.3 * travel("pile"),
      base + st.off.pile + 0.8 * travel("pile"),
      base + st.off.foot,
    ]
    const y = nextStop(stops, window.scrollY)
    scrollToY(y < 0 ? base : y)
  }

  const poke = () => setTaps((n) => n + 1)
  useEffect(() => {
    if (taps > 0 && taps % GOLDEN_TAPS === 0) say(goldenAfter(taps) ? "Golden hour. Every room looks better now." : "Back to daylight.")
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taps])
  const toggleSave = (key: string) => setSaved((m) => ({ ...m, [key]: !m[key] }))

  // a photo drops where the cursor is; a trail of them becomes the pile
  const spawn = (x: number, y: number) => {
    const st = s.current
    const n = st.tiles.length
    if (!n) return
    const k = st.spawn++ % n
    const t = st.tiles[k] as HTMLElement
    t.setAttribute("data-jump", "")
    t.style.setProperty("--x", x.toFixed(1) + "px")
    t.style.setProperty("--y", y.toFixed(1) + "px")
    t.style.setProperty("--r", ((Math.random() - 0.5) * 14).toFixed(1) + "deg")
    t.style.zIndex = String(++st.z)
    t.setAttribute("data-on", "")
    st.topTile = k
    st.user = true
    const img = t.firstElementChild as HTMLImageElement | null
    if (img) {
      img.src = IMG["tile-" + PILE_KINDS[st.kind++ % PILE_KINDS.length]]
      if (img.animate) img.animate([{ transform: "scale(1.35)", opacity: 0 }, { transform: "scale(1)", opacity: 1 }], { duration: 380, easing: "cubic-bezier(.2,1.3,.4,1)" })
    }
  }

  // ---- pointer: context cursor, magnets, the photo trail — mouse only
  const release = () => {
    const st = s.current
    const m = st.magnet
    if (m) {
      m.style.transform = ""
      const inner = m.firstElementChild as HTMLElement | null
      if (inner) inner.style.transform = ""
      m.removeAttribute("data-near")
    }
    st.magnet = null
    st.magnetBox = null
  }
  const onMove = (ev: ReactPointerEvent) => {
    const st = s.current
    if (ev.pointerType !== "mouse" || !st.fine) return
    const cur = cursorRef.current
    if (cur) {
      cur.style.transform = "translate3d(" + ev.clientX + "px," + ev.clientY + "px,0)"
      cur.setAttribute("data-on", "")
    }
    const t = ev.target as Element
    const hit = t.closest ? (t.closest("[data-cursor]") as HTMLElement | null) : null
    const label = hit ? hit.getAttribute("data-cursor") || "" : ""
    if (label !== st.label) {
      st.label = label
      if (labelRef.current && label) labelRef.current.textContent = label
      if (cur) label ? cur.setAttribute("data-label", "") : cur.removeAttribute("data-label")
    }
    const mag = t.closest ? (t.closest("[data-magnet]") as HTMLElement | null) : null
    if (mag !== st.magnet) {
      release()
      if (mag) {
        st.magnet = mag
        st.magnetBox = mag.getBoundingClientRect()
        mag.setAttribute("data-near", "")
      }
    }
    if (st.magnet && st.magnetBox) {
      const bx = st.magnetBox
      const dx = ev.clientX - (bx.left + bx.width / 2)
      const dy = ev.clientY - (bx.top + bx.height / 2)
      st.magnet.style.transform = "translate(" + (dx * 0.3).toFixed(1) + "px," + (dy * 0.38).toFixed(1) + "px)"
      const inner = st.magnet.firstElementChild as HTMLElement | null
      if (inner) inner.style.transform = "translate(" + (dx * 0.12).toFixed(1) + "px," + (dy * 0.14).toFixed(1) + "px)"
    }
    if (st.pileOn && !st.still && st.sw < 0.45) {
      const y = ev.clientY - st.pileTop
      if (y > 0 && y < st.H * 0.92 && Math.hypot(ev.clientX - st.lx, y - st.ly) > 52) {
        st.lx = ev.clientX
        st.ly = y
        spawn(ev.clientX, y)
      }
    }
  }
  const onLeave = () => {
    release()
    cursorRef.current?.removeAttribute("data-on")
  }

  const collection = COLLECTIONS[Math.max(0, Math.min(COLLECTIONS.length - 1, col))]
  const golden = goldenAfter(taps)
  const sunAt = brand.toLowerCase().indexOf("o")
  const pileA = (brand + " starts with what you have,").split(" ")
  const pileB = "finds what fits, and adapts as your life changes.".split(" ")
  const pileN = pileA.length + pileB.length
  const ctaText = "Try it in your own room"

  const micWave = (
    <>
      <svg className="lcl-mic" viewBox="0 0 12 16" aria-hidden="true">
        <path d="M6 1.5a2 2 0 0 1 2 2v4a2 2 0 0 1-4 0v-4a2 2 0 0 1 2-2ZM2.5 7.5a3.5 3.5 0 0 0 7 0M6 11v3" />
      </svg>
      <span className="lcl-wave" aria-hidden="true">
        {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13].map((k) => (
          <i key={k} style={{ "--k": k } as CSSProperties} />
        ))}
      </span>
    </>
  )
  const card = (item: Item, key: string, refKey?: string, detail = false, tag?: string, need?: number) => (
    <button type="button" key={key} ref={refKey ? reg(refKey) : undefined} className="lcl-card" onClick={() => toggleSave(key)} data-cursor={saved[key] ? "Saved" : "Save pick"} aria-pressed={!!saved[key]}>
      <span className="lcl-pic">
        <Tile k={item.k} />
        {tag && <span className="lcl-ctag lcl-mono">{tag}</span>}
        <span className="lcl-plus" data-on={saved[key] ? "" : undefined}>
          <Plus on={!!saved[key]} />
        </span>
      </span>
      <span className="lcl-cname">{item.name}</span>
      <span className="lcl-cmeta lcl-mono">{meta(item)}</span>
      {item.checks && (
        <span className="lcl-checks">
          {item.checks.map((c) => (
            <span key={c} className="lcl-check">
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <circle cx="8" cy="8" r="8" />
                <path d="M4.6 8.3L7 10.6L11.4 5.8" />
              </svg>
              {c}
            </span>
          ))}
        </span>
      )}
      {detail && item.spec && <span className="lcl-cmeta lcl-mono">{item.spec}</span>}
      {detail && item.why && <span className="lcl-cwhy">{item.why}</span>}
      {need != null && item.need && (
        <span className="lcl-need" style={{ "--i": need } as CSSProperties}>
          <span className="lcl-say lcl-voice">
            {micWave}
            <span className="lcl-txt">{item.need}</span>
          </span>
        </span>
      )}
    </button>
  )
  // spoken lines arrive like voice input: a live waveform, then the transcript; Elephant's lines show what it turned them into
  const chat = (lines: Line[]) => (
    <ol className="lcl-chat">
      {lines.map(([who, text, trace], i) => (
        <li key={i} data-el={who === "el" ? "" : undefined} style={{ "--i": i } as CSSProperties}>
          <span className="lcl-mono">{who === "el" ? brand : "You"}</span>
          {who === "el" ? (
            <span className="lcl-say">
              {text}
              {trace && (
                <span className="lcl-trace lcl-mono">
                  {trace.map((t) => (
                    <b key={t}>{t}</b>
                  ))}
                </span>
              )}
            </span>
          ) : (
            <span className="lcl-say lcl-voice">
              {micWave}
              <span className="lcl-txt">{text}</span>
            </span>
          )}
        </li>
      ))}
    </ol>
  )

  return (
    <div
      ref={rootRef}
      className={"lcl-root" + (className ? " " + className : "")}
      style={{ "--h": height, ...style } as CSSProperties}
      data-golden={golden ? "" : undefined}
      data-still={still ? "" : undefined}
      onPointerMove={onMove}
      onPointerLeave={onLeave}
    >
      <style>{FONTS + CSS + THEME}</style>

      {/* floating chrome */}
      <div className="lcl-chrome" ref={reg("chrome")}>
        <div className="lcl-chrome-in">
          <span className="lcl-launch lcl-mono">{launch}</span>
          <nav className="lcl-nav" ref={reg("nav")} aria-label={brand}>
            <span className="lcl-wordmark">{brand}</span>
            <ActionEl a={signInAction} label="Sign in" className="lcl-btn lcl-mono" cursor="Sign in" />
            <ActionEl a={joinAction} label="Join waitlist" className="lcl-btn lcl-btn-lime lcl-mono" cursor="Join" />
          </nav>
          <button type="button" className="lcl-scroll lcl-mono" onClick={next} data-cursor="Next" aria-label="Scroll to the next part">
            <span>Scroll</span>
            <i>
              <Chevron />
            </i>
          </button>
        </div>
      </div>

      {/* 1 · intro: the photo field, the gap, the curator */}
      <section className="lcl-track" ref={reg("intro")} style={{ "--len": TRACK.intro } as CSSProperties}>
        <i id="team" className="lcl-anchor" style={{ top: "calc(var(--h) * " + ((TRACK.intro - 1) * 0.22).toFixed(2) + ")" } as CSSProperties} />
        <div className="lcl-stage" ref={reg("introStage")}>
          {FIELD_KINDS.map((k, j) => (
            <div key={j} className="lcl-th" data-th="">
              <Tile k={k} />
            </div>
          ))}
          <h1 className="lcl-h1 lcl-l1">
            <span ref={reg("l1")}>
              <span className="lcl-mark lcl-mark-hero" aria-hidden="true">
                <ElephantMark />
              </span>
              {words(brand, 0.1, 0.16)}
            </span>
          </h1>
          <p className="lcl-h1 lcl-l2" ref={reg("l2")}>
            <span className="lcl-wl" ref={reg("wl")}>{words("brings a room", 0.5, 0.16)}</span>
            <span className="lcl-wr" ref={reg("wr")}>{words("that fits your life", 0.9, 0.16)}</span>
          </p>
          <div className="lcl-full" ref={reg("portrait")} data-v="v0" style={{ clipPath: "inset(50%)" }}>
            <div className="lcl-zin" ref={reg("portraitIn")}>
              {ROOM_IMGS.map((k) => (
                <div key={k} className="lcl-pv" style={{ opacity: k === view ? 1 : 0 }}>
                  <img className="lcl-img" src={IMG[k]} alt={k === view ? "Your room with " + pick.name : ""} draggable={false} />
                </div>
              ))}
              <img className="lcl-img lcl-flick" ref={reg("flick")} src={IMG[FLICK[0]]} alt="" draggable={false} />
              {/* meet the team: inside the growing window, right after the opening line */}
              <div className="lcl-tm" ref={reg("team")}>
                <span className="lcl-mono lcl-tm-label">Meet the team</span>
                <h2 className="lcl-tm-title">The people behind {brand}</h2>
                <div className="lcl-tm-row">
                  {TEAM.map((m, k) => (
                    <a key={m.key} className="lcl-tm-card" href={m.url} target="_blank" rel="noopener noreferrer" data-cursor="LinkedIn" style={{ "--k": k } as CSSProperties}>
                      <span className="lcl-tm-fig">
                        <img className="lcl-tm-cut" src={"/img/team-cut-" + m.key + ".webp"} alt="" draggable={false} />
                        <img className="lcl-tm-photo" src={"/img/team-" + m.key + ".jpg"} alt={m.name} decoding="async" draggable={false} />
                      </span>
                      <b>{m.name}</b>
                    </a>
                  ))}
                </div>
              </div>

            </div>
            <p className="lcl-cap" style={{ "--n": 60 } as CSSProperties} aria-label="Start with your room. No empty room required.">
              <span className="lcl-pillbg">{letters("Start with your room. No empty room required.", "cap").map((el, i) => (i === 21 ? <br key="capbr" /> : el))}</span>
            </p>
            <div className="lcl-co" ref={reg("callouts")}>
              {/* hover the sofa: it lights up; pick another and it drops into the same spot */}
              <i key={view} className="lcl-spot" aria-hidden="true" />
              <span className="lcl-hot lcl-hit" data-cursor="Swap it" onClick={nextPick} aria-hidden="true" />
              <div className="lcl-hs">
                <i className="lcl-hs-line" />
                <button type="button" className="lcl-hs-pill lcl-hit" onClick={nextPick} data-cursor="Swap it">
                  <img src={IMG["tile-" + pick.tile]} alt="" draggable={false} />
                  <span>
                    <small>{view === "curator-0" ? "Already in your room" : "Sofa \u00b7 " + pick.meta.replace("IKEA \u00b7 ", "")}</small>
                    <b>{pick.name}</b>
                  </span>
                </button>
                <i className="lcl-hs-dot" />
              </div>
              <div className="lcl-tags">
                <span style={{ "--k": 0 } as CSSProperties}>Pick furniture fast.</span>
                <span style={{ "--k": 1 } as CSSProperties}>See it in your room.</span>
                <span style={{ "--k": 2 } as CSSProperties}>What you see is what you get.</span>
              </div>
              <div className="lcl-deck">
                {SWAPS.slice(1).map((sw, j) => (
                  <button key={sw.img} type="button" className="lcl-sc lcl-hit" style={{ "--k": j } as CSSProperties} data-on={pick === sw ? "" : undefined} data-cursor={sw.name} aria-label={"Try " + sw.name} onClick={() => choose(sw.img)}>
                    <Tile k={sw.tile} />
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 4 + 5 · a habit becomes a design condition, then a comparison; slides over the pinned intro */}
      <section className="lcl-mani" ref={reg("mani")}>
        <div className="lcl-talk" ref={reg("talk")}>
          {/* the problem holds the screen alone, then lifts away and the talk comes in */}
          <h2 className="lcl-probbig">
            A sofa can look perfect
            <br />
            and still be wrong for how you live.
          </h2>
          <div className="lcl-talk-in">
            <div className="lcl-talk-l">
              <h2 className="lcl-sh">
                More than picking furniture.
                <br />
                {brand} picks for how you live.
              </h2>
              <p className="lcl-lede">It listens for what you really need, turns it into design decisions, and keeps them.</p>
              {chat(TALK)}
            </div>
            <div className="lcl-room">
              <img className="lcl-img" src={IMG["hl-1"]} alt="The room being refined" draggable={false} />
              {PINS.map(([after, u, v, cat, text, flip, lh]) => (
                <div key={cat} className={"lcl-hs lcl-pin" + (flip ? " lcl-flip" : "")} style={{ left: u * 100 + "%", top: v * 100 + "%", "--i": after, "--lh": lh + "px" } as CSSProperties}>
                  <i className="lcl-hs-line" />
                  <span className="lcl-hs-pill">
                    <span>
                      <small>{cat}</small>
                      <b>{text}</b>
                    </span>
                  </span>
                  <i className="lcl-hs-dot" />
                </div>
              ))}
              <span className="lcl-budget lcl-mono" style={{ "--i": 10 } as CSSProperties}>
                Budget · {usd(BUDGET)} total
              </span>
              <span className="lcl-brief lcl-mono">Room brief · updates as you talk</span>
            </div>
          </div>
        </div>
        <div className="lcl-story lcl-cmp">
          <h2 className="lcl-sh">
            Then it goes shopping.
            <br />
            Real stores, checked against your words.
          </h2>
          <div className="lcl-src">
            {SOURCES.map(([name, n]) => (
              <span key={name} className="lcl-src-card">
                <b>{name}</b>
                <small className="lcl-mono">{n} products</small>
              </span>
            ))}
            {/* the catalog today is these two; the schema is store-agnostic, so more stores plug in the same way */}
            <span className="lcl-src-card lcl-src-more">
              <b>+ more stores</b>
              <small className="lcl-mono">Same schema, next up</small>
            </span>
            <i className="lcl-src-arrow" aria-hidden="true">
              <Chevron d="M4.5 3L7.5 6L4.5 9" />
            </i>
            <span className="lcl-src-card lcl-src-one">
              <b>One catalog</b>
              <small className="lcl-mono">{CATALOG.total} products today · size · price · photo · link</small>
            </span>
          </div>
          <p className="lcl-note">Different stores, compared side by side. Prices are a snapshot, not live stock.</p>
        </div>
        <div className="lcl-col">{PICKS.map((it, k) => card(it, "pick" + k, k === PICKS.length - 1 ? "flySrc" : undefined, true, k === 0 ? "Yours" : k === PICKS.length - 1 ? "Fits tucked up" : undefined))}</div>
      </section>

      {/* the white collection panel; its first pick arrives from the column above */}
      <section className="lcl-grid" ref={reg("grid")}>
        <div className="lcl-ghead">
          <span className="lcl-mono lcl-cmeta">From one sofa to the whole room</span>
          <h2 className="lcl-gtitle" ref={reg("gtitle")}>
            <span>Living</span>
            <i aria-hidden="true" />
            <span>Room</span>
          </h2>
          <div className="lcl-chips lcl-mono">
            <span>{GRID.length} pieces from {CATALOG.sources}</span>
            <span>{usd(total(GRID))} of {usd(BUDGET)} budget</span>
          </div>
          <p className="lcl-note">The sofa is where it starts. Tables, lights and storage come next.</p>
        </div>
        <div className="lcl-gr">
          {COL_SPEED.map((_, cIdx) => (
            <div key={cIdx} className="lcl-gc" data-gcol="">
              {GRID.map((it, i) => (i % COL_SPEED.length === cIdx ? card(it, "grid" + i, i === 0 ? "flyDst" : undefined, false, it.suggest ? "Elephant suggests" : undefined, i) : null))}
            </div>
          ))}
        </div>
      </section>

      {/* 5 · the big state: life changes */}
      <section className="lcl-track lcl-words" ref={reg("words")} style={{ "--len": TRACK.words } as CSSProperties}>
        <div className="lcl-stage">
          <div className="lcl-sweep" ref={reg("sweep")} />
          <div className="lcl-wclip">
            <div className="lcl-wcol" ref={reg("wcol")}>
              {BIG_WORDS.map(([w, x], k) => (
                <h2 key={w} className="lcl-big" data-word="" style={{ top: "calc(var(--h) * " + k * WORDS.gap + ")", "--x": x } as CSSProperties}>
                  <span>
                    {letters(w, "w" + k)}
                    {k === BIG_WORDS.length - 1 && (
                      <svg className="lcl-doodle" viewBox="0 0 40 40" aria-hidden="true">
                        <path pathLength={1} d="M8 30C4 22 10 10 20 9C30 8 35 18 29 24C24 29 15 25 17 19C19 13 27 15 26 20M30 6L34 2M36 12L39 10" />
                      </svg>
                    )}
                  </span>
                </h2>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* a revised need changes the pick; what didn't change still holds */}
      <section className="lcl-life" ref={reg("life")}>
        <div className="lcl-story">
          {chat([
            ["you", "My partner is moving in next month. With her cat."],
            ["el", "Room for two now, and a cat. First, what already works. Budget and the rocking chair stay.", ["seats: 2 people", "covers: washable", "storage \u2191"]],
            ["you", "Yes."],
          ])}
        </div>
        <div className="lcl-lb" ref={reg("lb")}>
          <div className="lcl-lb-in">
            <div className="lcl-lb-grid">
              {GRID.map((it) => {
                const m = MOVES.findIndex((mv) => mv.op !== "Add" && (mv.it.k === it.k || mv.was?.k === it.k))
                const mv = MOVES[m]
                if (mv?.op === "Upgrade" && mv.was)
                  return (
                    <div key={it.k} className="lcl-lbc lcl-lbc-flip" data-role={LB_PHASE[m]}>
                      <div className="lcl-lbc-in">
                        <div className="lcl-lbc-face">
                          <span className="lcl-lbc-pic"><Tile k={mv.was.k} /></span>
                          <b>{mv.was.name}</b>
                          <em className="lcl-mono">{usd(mv.was.price)}</em>
                        </div>
                        <div className="lcl-lbc-face lcl-lbc-back">
                          <span className="lcl-lbc-pic"><Tile k={mv.it.k} /></span>
                          <b>{mv.it.name}</b>
                          <em className="lcl-mono">{usd(mv.it.price)}</em>
                        </div>
                      </div>
                    </div>
                  )
                return (
                  <div key={it.k} className="lcl-lbc" data-role={mv ? LB_PHASE[m] : undefined}>
                    <div className="lcl-lbc-face">
                      <span className="lcl-lbc-pic"><Tile k={it.k} /></span>
                      <b>{it.name}</b>
                      <em className="lcl-mono">{meta(it)}</em>
                      {mv?.op === "Keep" && <i className="lcl-lbok lcl-mono">✓ Already works</i>}
                    </div>
                  </div>
                )
              })}
              <div className="lcl-lbc lcl-lbc-add" data-role="add">
                <span className="lcl-lbc-slot lcl-mono">Free wall</span>
                <div className="lcl-lbc-face">
                  <span className="lcl-lbc-pic"><Tile k={BOOKCASE.k} /></span>
                  <b>{MOVES[3].it.name}</b>
                  <em className="lcl-mono">+{usd(BOOKCASE.price)}</em>
                </div>
              </div>
            </div>
            <div className="lcl-lb-caps">
              {MOVES.map((mv, k) => (
                <p key={k} className="lcl-lb-cap" data-role={LB_PHASE[k]}>
                  {mv.tag && <code className="lcl-mono">{mv.tag}</code>}
                  <span>{mv.why}</span>
                </p>
              ))}
            </div>
            <div className="lcl-lb-bud">
              <span className="lcl-lb-bar"><i /></span>
              <span className="lcl-mono lcl-cmeta">
                Room total <b ref={reg("lbTotal")}>{usd(total(GRID))}</b> of {usd(BUDGET)} · sofa and rocking chair kept
              </span>
            </div>
            <p className="lcl-note">Back angle and cushion feel aren't in the data. Sit-test before you buy.</p>
          </div>
        </div>
      </section>

      {/* product recordings, 16:9: the whole flow, then four close-ups */}
      <section className="lcl-reels">
        <div className="lcl-ghead">
          <span className="lcl-mono lcl-cmeta">Recorded in the product</span>
          <h2 className="lcl-sh">
            That’s the story.
            <br />
            Here it is, running.
          </h2>
        </div>
        {REELS.map((rl, k) => (
          <figure key={rl.title} className={"lcl-reel" + (k === 0 ? " lcl-reel-main" : "")}>
            <span className="lcl-reel-box">
              {rl.src ? (
                <video src={rl.src} poster={rl.poster} autoPlay muted loop playsInline preload="metadata" controls={k === 0} />
              ) : (
                <span className="lcl-reel-ph lcl-mono">
                  <svg viewBox="0 0 16 16" aria-hidden="true">
                    <path d="M6 4.5v7l5.5-3.5Z" />
                  </svg>
                  Recording · 16:9
                </span>
              )}
            </span>
            <figcaption>{rl.title}</figcaption>
          </figure>
        ))}
      </section>

      {/* how this differs: kinds of product, not named competitors (no head-to-head evidence) */}
      <section className="lcl-vs">
        <div className="lcl-ghead">
          <span className="lcl-mono lcl-cmeta">Why Elephant</span>
          <h2 className="lcl-sh">So how is this different?</h2>
        </div>
        <div className="lcl-vs-t" role="table">
          <div className="lcl-vs-r lcl-vs-h lcl-mono" role="row">
            <span role="columnheader" />
            <span role="columnheader">Gives you</span>
            <span role="columnheader">Misses</span>
          </div>
          {VS.map(([who, gives, miss]) => (
            <div key={who} className="lcl-vs-r" role="row">
              <b role="cell">{who}</b>
              <span role="cell">{gives}</span>
              <span role="cell">{miss}</span>
            </div>
          ))}
          <div className="lcl-vs-r lcl-vs-me" role="row">
            <b role="cell">
              <span className="lcl-mark lcl-vs-mark" aria-hidden="true">
                <ElephantMark />
              </span>
              Elephant
            </b>
            <span role="cell">Your real room, your habits, real products from more than one store.</span>
            <span role="cell">It remembers, and adapts when your life changes.</span>
          </div>
        </div>
        <p className="lcl-diff">
          The picture never invents furniture.
          <br />
          Every object in it is a real product with a size, a price and a link.
        </p>
      </section>

      {/* how it understands you: a spoken sentence becomes a decision, then labels, then a pick in the cart; scroll drives it */}
      <section className="lcl-how" ref={reg("how")}>
        <div className="lcl-how-in">
          <div className="lcl-how-head">
            <span className="lcl-mono lcl-cmeta">Under the hood</span>
            <h2 className="lcl-sh">So how does it understand you?</h2>
          </div>
          <div className="lcl-how-cols">
            <div className="lcl-hc lcl-hc1">
              <span className="lcl-mono lcl-cmeta">01 · You say</span>
              <p className="lcl-hq">
                <span className="lcl-say">
                  I <mark>curl up</mark> with a book.
                </span>
              </p>
              <p className="lcl-hel">Tucked up, or stretched out?</p>
              <p className="lcl-hq lcl-hq2">
                <span className="lcl-say">
                  <mark>Tucked up.</mark>
                </span>
              </p>
            </div>
            <div className="lcl-hc lcl-hc2">
              <span className="lcl-mono lcl-cmeta">02 · Design decision</span>
              <b className="lcl-mono lcl-htag">habit: cross_legged</b>
              <p className="lcl-hdec">Usable seat depth first, then seat width. Not the sofa’s outside depth.</p>
              <span className="lcl-hw lcl-mono">
                <b>seat_depth ×3</b>
                <b>seat_width ×1</b>
              </span>
            </div>
            <div className="lcl-hc lcl-hc3">
              <span className="lcl-mono lcl-cmeta">03 · Product labels</span>
              <div className="lcl-hrec">
                <span className="lcl-hrec-pic">
                  <Tile k={SODERHAMN.k} />
                </span>
                <b>{SODERHAMN.name}</b>
                <ul className="lcl-mono">
                  {HOW_LABELS.map(([a, v, st, hit]) => (
                    <li key={a} data-st={st} data-hit={hit ? "" : undefined}>
                      <span>{a}</span>
                      <b>{v}</b>
                    </li>
                  ))}
                </ul>
                <small className="lcl-mono">Quoted from ikea.com</small>
              </div>
            </div>
            <div className="lcl-hc lcl-hc4">
              <span className="lcl-mono lcl-cmeta">04 · Match & buy</span>
              <ol className="lcl-hrank">
                {HOW_RANK.map(([n, v], i) => (
                  <li key={n} style={{ "--w": (v / HOW_RANK[0][1]).toFixed(3) } as CSSProperties}>
                    <span>
                      {i + 1}. {n}
                    </span>
                    <i />
                    <em className="lcl-mono">{v}″ seat</em>
                  </li>
                ))}
              </ol>
              <small className="lcl-mono lcl-cmeta">of 27 sofas with a documented seat depth</small>
              <span className="lcl-hbuy">
                <span className="lcl-hbuy-pic">
                  <Tile k={SODERHAMN.k} />
                </span>
                <span>
                  <b>In your room</b>
                  <em className="lcl-mono">{usd(SODERHAMN.price)} · within {usd(BUDGET)}</em>
                </span>
              </span>
            </div>
            {/* what travels between the columns */}
            <span className="lcl-hfly lcl-hfly1 lcl-mono">tucked up</span>
            <span className="lcl-hfly lcl-hfly2 lcl-mono">seat_depth</span>
            <span className="lcl-hfly lcl-hfly3 lcl-mono">seat_width</span>
          </div>
        </div>
      </section>

      {/* the one example is saved to your brief; then the view zooms out to every need, every room */}
      <section className="lcl-zo" ref={reg("zo")}>
        <div className="lcl-zo-in">
          <div className="lcl-zo-grid" ref={reg("zoGrid")} style={{ "--zc": ZCOLS, "--zw": ZTILE.w + "px", "--zh": ZTILE.h + "px", "--zg": ZTILE.gap + "px" } as CSSProperties}>
            {Array.from({ length: ZROWS }, (_, r) => {
              const mid = Math.floor((ZCOLS * ZROWS) / 2)
              const midR = Math.floor(mid / ZCOLS)
              // three copies of each row so it can loop sideways forever; the brief's row holds still
              return (
                <div key={r} className={"lcl-zrow" + (r === midR ? " lcl-zrow-still" : "")} style={{ "--dir": r % 2 ? 1 : -1, "--dur": 46 + ((r * 7) % 19) + "s" } as CSSProperties}>
                  {Array.from({ length: ZCOLS * 3 }, (_, j) => {
                    const c = j - ZCOLS
                    const cm = ((c % ZCOLS) + ZCOLS) % ZCOLS
                    const i = r * ZCOLS + cm
                    if (i === mid && c === cm)
                      return (
                        <div key={j} className="lcl-zt lcl-zt-me">
                          <span className="lcl-zme">
                            <img src={"/img/team-cut-" + BRIEF_WHO.key + ".webp"} alt="" draggable={false} />
                            <span>
                              <b>{BRIEF_WHO.name}’s living brief</b>
                              <small>{BRIEF_WHO.life}</small>
                            </span>
                          </span>
                          <ol>
                            {BRIEF.map(([say, label, got], k) => (
                              <li key={say} style={{ "--i": k } as CSSProperties}>
                                <span className="lcl-zq">{say}</span>
                                <span className="lcl-zgot">
                                  <code className="lcl-mono">{label}</code>
                                  <b>✓ {got}</b>
                                </span>
                              </li>
                            ))}
                          </ol>
                        </div>
                      )
                    const [say, label, tile] = WALL[((i === mid ? i + 3 : i) * 7) % WALL.length]
                    const d = Math.min(6, Math.hypot(c - (mid % ZCOLS), r - midR))
                    return (
                      <div key={j} className="lcl-zt" style={{ "--d": d.toFixed(2) } as CSSProperties} aria-hidden="true">
                        <span className="lcl-zt-pic">
                          <Tile k={tile} />
                        </span>
                        <span className="lcl-zq">{say}</span>
                        <code className="lcl-mono">{label}</code>
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>
          <p className="lcl-zcap lcl-zcap1">
            <span className="lcl-zpill">Saved. Next time you choose, Elephant starts from here.</span>
          </p>
          <p className="lcl-zcap lcl-zcap2">
            <span className="lcl-zpill">That was one need. It works the same for every piece, in every room.</span>
          </p>
          <h2 className="lcl-zhead">
            <span className="lcl-zpill">
              Every piece is described in words,
              <br />
              so your words can find it.
            </span>
          </h2>
        </div>
      </section>

      {/* tech stack: the steps and what they run on */}
      <section className="lcl-stack" id="stack">
        <ol className="lcl-steps">
          {FLOW.map(([t, b, tool]) => (
            <li key={t}>
              <b>{t}</b>
              <span>{b}</span>
              <em className="lcl-mono">{tool}</em>
            </li>
          ))}
        </ol>
      </section>

      {/* 6 · one room, one view, different times of life → a row of them */}
      <section className="lcl-track" ref={reg("zoom")} style={{ "--len": TRACK.zoom } as CSSProperties}>
        <div className="lcl-stage">
          <p className="lcl-h1 lcl-l2">
            <span className="lcl-wl">
              <span>Your room,</span>
            </span>
            <span className="lcl-wr">
              <span>through life</span>
            </span>
          </p>
          <div className="lcl-full" ref={reg("scenes")} style={{ clipPath: "inset(50%)" }}>
            <div className="lcl-zin" ref={reg("scenesIn")}>
              {COLLECTIONS.map((co, k) => (
                <div key={k} className="lcl-scene" data-scene="">
                  <img className="lcl-img lcl-scene-img" src={IMG[co.img]} alt={k === col ? "The same room: " + co.name : ""} draggable={false} />
                </div>
              ))}
            </div>
            <div className="lcl-ui" ref={reg("ui")}>
              <svg className="lcl-vx" aria-hidden="true" style={{ "--c": "var(--u)" } as CSSProperties}>
                <line x1="20%" y1="50%" x2="44%" y2="0%" pathLength={1} />
                <line x1="20%" y1="50%" x2="40%" y2="100%" pathLength={1} />
              </svg>
              <span className="lcl-vlab lcl-disc"style={{ left: "20%", top: "50%", "--c": "var(--u)" } as CSSProperties}>
                Same room, same view
              </span>
              <div className="lcl-drum">
                {COLLECTIONS.map((co, k) => (
                  <button key={k} type="button" className="lcl-di lcl-hit" style={{ "--i": k } as CSSProperties} onClick={() => jumpToCollection(k)} data-cursor={k === col ? "Open render" : "Spin to it"}>
                    {co.name}
                  </button>
                ))}
              </div>
              {FLOATS.slice(0, collection.thumbs.length).map(([x], j) => (
                <div key={col + "-" + j} className="lcl-ft" data-float="" style={{ right: x + "%" }}>
                  <Tile k={collection.thumbs[j % collection.thumbs.length]} />
                </div>
              ))}
            </div>
          </div>
          <div className="lcl-row" aria-hidden="true">
            {COLLECTIONS.map((co, k) => (
              <figure key={k} className="lcl-rt" data-rt="">
                <img className="lcl-img" src={IMG[co.img]} alt="" draggable={false} />
                <figcaption className="lcl-mono">{co.name}</figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>

      {/* 5 · no feeds, the photo trail, the waitlist */}
      <section className="lcl-track lcl-pilesec" ref={reg("pile")} style={{ "--len": TRACK.pile } as CSSProperties}>
        <div className="lcl-stage" ref={reg("pileStage")}>
          <div className="lcl-pf" ref={reg("pf")} onClick={() => setSeed((n) => n + 1)} data-cursor="Shuffle" aria-hidden="true">
            {BITS.map((b, j) => (
              <i key={"b" + j} className="lcl-bit" style={{ "--bx": (b[0] * 55).toFixed(0) + "vw", "--by": "calc(var(--h) * " + (b[1] * 0.75).toFixed(3) + ")", "--dl": (j * 0.19).toFixed(2) + "s" } as CSSProperties} />
            ))}
            {PILE_KINDS.map((k, j) => (
              <span key={j} className="lcl-tile" data-tile="" style={{ zIndex: j }}>
                <Tile k={k} />
              </span>
            ))}
          </div>
          <p className="lcl-pl lcl-pab" style={{ "--n": pileN } as CSSProperties}>
            <span className="lcl-mark lcl-mark-end" aria-hidden="true">
              <ElephantMark />
            </span>
            {pileA.map((w, i) => (
              <span key={"a" + i} className="lcl-ink" style={{ "--i": i } as CSSProperties}>
                {w}{" "}
              </span>
            ))}
            <br />
            {pileB.map((w, i) => (
              <span key={"b" + i} className="lcl-ink" style={{ "--i": pileA.length + i } as CSSProperties}>
                {w}{" "}
              </span>
            ))}
          </p>
          <div className="lcl-pl lcl-pc" ref={reg("cta")} data-off="">
            <span style={{ "--n": ctaText.length } as CSSProperties} aria-label={ctaText}>
              {letters(ctaText, "cta")}
            </span>
            <ActionEl a={joinAction} label="Join waitlist" className="lcl-btn lcl-btn-lime lcl-mono" cursor="Join" />
          </div>
        </div>
      </section>

      {/* 6 · footer */}
      <footer className="lcl-foot" ref={reg("foot")}>
        <div className="lcl-fcard">
          <div className="lcl-frow lcl-mono">
            <span className="lcl-flinks">
              <a href="https://the-elephant-in-the-room.vercel.app" data-cursor="Open">Live demo</a>
              <a href="https://github.com/chloewantsleep/the-elephant-in-the-room-aec-hackathon-nyc-2026" data-cursor="Open">GitHub</a>
            </span>
            <span className="lcl-flinks">
              <a href="https://github.com/chloewantsleep/the-elephant-in-the-room-aec-hackathon-nyc-2026#the-pipeline" data-cursor="Open">Pipeline</a>
              <a href="https://github.com/chloewantsleep/the-elephant-in-the-room-aec-hackathon-nyc-2026/tree/main/data" data-cursor="Open">Dataset</a>
              <a href="#team" data-cursor="Open">Team</a>
            </span>
            <span className="lcl-flinks">
              <ActionEl a={signInAction} label="Sign in" className="lcl-btn lcl-mono" cursor="Sign in" />
              <ActionEl a={joinAction} label="Join waitlist" className="lcl-btn lcl-btn-lime lcl-mono" cursor="Join" />
            </span>
          </div>
          <p className="lcl-big2" aria-label={brand}>
            {sunAt < 0 ? brand : brand.slice(0, sunAt)}
            {sunAt >= 0 && (
              <button type="button" className="lcl-sun" onClick={poke} data-cursor="Poke the sun" aria-label="Poke the sun">
                <Sun />
              </button>
            )}
            {sunAt < 0 ? null : brand.slice(sunAt + 1)}
          </p>
          <div className="lcl-frow lcl-mono">
            <span>{launch}</span>
            <span>{"Starts with what you have."}</span>
          </div>
        </div>
      </footer>

      {/* the pick in flight between the manifesto and the collection */}
      <div className="lcl-fly" ref={reg("fly")} aria-hidden="true">
        <Tile k={PICKS[PICKS.length - 1].k} />
      </div>

      <div ref={cursorRef} className="lcl-cursor" aria-hidden="true">
        <span className="lcl-cdot" />
        <span ref={labelRef} className="lcl-clab lcl-mono" />
      </div>
      <div className="lcl-toast" role="status" data-on={toast.on ? "" : undefined}>
        {toast.text}
      </div>
    </div>
  )
}

// #region images
// Generated for this template (ChatGPT image generation), 1152 × 768 and 400 × 500 WebP.
// Our own images: room photo + renders (curator-*, scene-*) and real IKEA product photos (tile-*).
const IMG: Record<string, string> = {
  "curator-0": "/img/curator-0.jpg",
  "life-1": "/img/life-1.jpg",
  "life-2": "/img/life-2.jpg",
  "life-3": "/img/life-3.jpg",
  "life-4": "/img/life-4.jpg",
  "life-5": "/img/life-5.jpg",
  "life-6": "/img/life-6.jpg",
  "tile-d-stockholm-sb": "/img/tile-d-stockholm-sb.jpg",
  "tile-d-lanesund": "/img/tile-d-lanesund.jpg",
  "tile-d-markblamme": "/img/tile-d-markblamme.jpg",
  "tile-d-tarsele": "/img/tile-d-tarsele.jpg",
  "tile-d-lommarp": "/img/tile-d-lommarp.jpg",
  "tile-d-sputnik": "/img/tile-d-sputnik.jpg",
  "curator-1": "/img/curator-1.jpg",
  "curator-2": "/img/curator-2.jpg",
  "scene-0": "/img/scene-0.jpg",
  "scene-1": "/img/scene-1.jpg",
  "scene-2": "/img/scene-2.jpg",
  "scene-3": "/img/scene-3.jpg",
  "scene-4": "/img/scene-4.jpg",
  "scene-5": "/img/scene-5.jpg",
  "tile-sofa": "/img/tile-sofa.png",
  "tile-armchair": "/img/tile-armchair.png",
  "tile-coffee": "/img/tile-coffee.png",
  "tile-side": "/img/tile-side.png",
  "tile-floorlamp": "/img/tile-floorlamp.png",
  "tile-pendant": "/img/tile-pendant.png",
  "tile-rug": "/img/tile-rug.png",
  "tile-shelf": "/img/tile-shelf.png",
  "tile-bed": "/img/tile-bed.png",
  "tile-nightstand": "/img/tile-nightstand.png",
  "tile-dresser": "/img/tile-dresser.png",
  "tile-desk": "/img/tile-desk.png",
  "tile-dchair": "/img/tile-dchair.png",
  "tile-stool": "/img/tile-stool.png",
  "tile-mirror": "/img/tile-mirror.png",
  "tile-cabinet": "/img/tile-cabinet.png",
  "tile-soderhamn": "/img/tile-soderhamn.jpg",
  "tile-rocksjon-loveseat": "/img/tile-rocksjon-loveseat.jpg",
  "tile-rocksjon-armchair": "/img/tile-rocksjon-armchair.jpg",
  "tile-hyltarp": "/img/tile-hyltarp.jpg",
  "tile-stockholm": "/img/tile-stockholm.jpg",
  "tile-vimle": "/img/tile-vimle.jpg",
  "tile-stockholm25": "/img/tile-stockholm25.jpg",
  "tile-poang": "/img/tile-poang.jpg",
  "tile-hd-gooseneck": "/img/tile-hd-gooseneck.jpg",
  "tile-hd-bookcase": "/img/tile-hd-bookcase.jpg",
  "hl-1": "/img/hl-1.jpg",
  "hl-2": "/img/hl-2.jpg",
  "hl-3": "/img/hl-3.jpg",
  "hl-4": "/img/hl-4.jpg",
  "hl-5": "/img/hl-5.jpg",
  "hl-6": "/img/hl-6.jpg",
  "hl-7": "/img/hl-7.jpg",
  "hl-8": "/img/hl-8.jpg",
}
