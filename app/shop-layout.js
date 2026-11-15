/* Approximate floor plans and finishes for the Shop illustration. */

// Coordinates are normalized across the visible floor, from left to right and back to front.
// These two placements and palettes were estimated from the saved final renders.
const SHOP_DEMO_LAYOUTS = {
  living: {
    width: 236, depth: 224, floor: "#a69b8a", leftWall: "#777576", rightWall: "#a6a4a2",
    items: {
      sofa: { positions: [[.54, .52]], body: "#454648", detail: "#333436" },
      shelving: { positions: [[.12, .48]], body: "#d7d3c8" },
      floor_lamp: { positions: [[.85, .51]], body: "#e6d3b1", detail: "#a67c59" },
      pendant_lamp: { positions: [[.54, .59]], body: "#b9936c", detail: "#e5ccaa" },
      "own:e0": { positions: [[.17, .73, 3], [.77, .86, 2], [.83, .65, 1]], body: "#b9b8b0", detail: "#4b4740" },
      "own:e1": { positions: [[.40, .75]], body: "#c3d3d5", detail: "#4d4e49", form: "roundTable" },
      "own:e2": { positions: [[.92, .76, 1]], body: "#aaa8a6", detail: "#936f54" },
      "own:e3": { positions: [.21, .32, .43, .54, .65, .76].map(x => [x, .34]), body: "#303132", detail: "#282827" },
      "own:e4": { positions: [[.49, .18]], body: "#9a7756", detail: "#303132" },
      "own:e5": { positions: [[.48, .79]], body: "#735b4c", detail: "#b39d87" },
    },
  },
  dining: {
    width: 300, depth: 172, floor: "#bcb1a0", leftWall: "#ad8d60", rightWall: "#24384c",
    items: {
      "own:e0": { positions: [.21, .32, .47, .60, .72].map(x => [x, .51, 2]), body: "#b97c59", detail: "#a26d43" },
      "own:e1": { positions: [[.48, .27]], body: "#24252a", detail: "#d4d0c7", form: "counter" },
      "own:e2": { positions: [[.47, .27]], body: "#393e46", form: "linearPendant" },
      dining_chair: { positions: [[.59, .74, 1], [.75, .82, 1], [.37, .77, 3], [.47, .91, 2]], body: "#b9b7b2", detail: "#c2a47c" },
      cabinet: { positions: [[.92, .51]], body: "#d7d3c9" },
      rug: { positions: [[.57, .74]], body: "#cfb9a2", detail: "#a47966" },
    },
  },
};

const SHOP_ROOM_ANCHORS = {
  living: {
    sofa: [.53, .31], armchair: [.22, .64, 3], coffee_table: [.52, .57], rug: [.53, .64],
    floor_lamp: [.84, .28], pendant_lamp: [.53, .57], shelving: [.15, .20],
    tv_stand: [.51, .91, 2], side_table: [.85, .58],
  },
  bedroom: {
    bed: [.51, .42], nightstand: [.22, .23], dresser: [.81, .78, 1], wardrobe: [.16, .23],
    mirror: [.89, .74, 1], table_lamp: [.23, .23], rug: [.51, .56],
  },
  dining: {
    dining_table: [.50, .52], cabinet: [.76, .18], pendant_lamp: [.50, .52], rug: [.50, .53],
  },
  office: {
    desk: [.52, .32], office_chair: [.52, .60, 2], shelving: [.83, .21], rug: [.50, .60],
    table_lamp: [.69, .30],
  },
};

const SHOP_COLORS = {
  "black-brown": "#3c322c", "gray-beige": "#a6a092", "grey-beige": "#a6a092",
  "off-white": "#e9e4d8", charcoal: "#49494a", black: "#363433", white: "#e6e2d9",
  beige: "#c5b49d", cream: "#e3d6bf", grey: "#a29f9a", gray: "#a29f9a",
  brown: "#8f6d55", oak: "#bc9a70", birch: "#cdb68f", walnut: "#78543e",
  ash: "#b9a383", pine: "#c9aa7f", bamboo: "#b79a73", natural: "#b6a082",
  navy: "#36475d", blue: "#68829b", green: "#718571", pink: "#bc9194",
  yellow: "#c4a055", red: "#a56054", orange: "#bc8157", glass: "#c2d2d3",
};
const SHOP_HEX = /^#[\da-f]{6}$/i;

// typical size (inches: width, depth, height) when a product or a piece in the picture has no measurement
const SHOP_TYPICAL = {
  sofa: [84, 36, 33], armchair: [30, 32, 32], coffee_table: [40, 24, 17], side_table: [18, 18, 22], rug: [96, 60, 1],
  bed: [64, 84, 40], nightstand: [18, 16, 24], dresser: [48, 18, 32], wardrobe: [40, 24, 78], desk: [48, 24, 30],
  office_chair: [26, 26, 40], dining_table: [60, 36, 30], dining_chair: [18, 20, 32], stool_bench: [16, 16, 30],
  shelving: [32, 14, 72], cabinet: [36, 18, 34], tv_stand: [60, 16, 20], floor_lamp: [14, 14, 60], table_lamp: [8, 8, 18],
  pendant_lamp: [18, 18, 14], mirror: [24, 2, 60], other: [24, 20, 24],
};
function shopDims(item) {
  const dims = view(item)?.dims_in || {}, [tw, td, th] = SHOP_TYPICAL[item.cat] || SHOP_TYPICAL.other;
  const w = shopPositive(dims.width, tw);
  return { w, d: shopPositive(dims.depth, dims.width > 0 ? Math.min(w, td) : td), h: shopPositive(dims.height, th) };
}
const shopPositive = (n, fallback) => Number.isFinite(n) && n > 0 ? n : fallback;
const shopColorText = text => String(text || "").toLowerCase().match(/[a-z]+(?:-[a-z]+)*/g)
  ?.map(word => SHOP_COLORS[word]).filter(Boolean) || [];

function shopFinish(item, sample) {
  const p = view(item);
  const colorway = shopColorText(p.variant);
  const catalog = (p.colors || []).map(c => c.hex).filter(hex => SHOP_HEX.test(hex));
  const named = p.owned ? shopColorText(p.name + " " + (p.description || "")) : colorway;
  const colors = item.vid ? [...named, ...catalog] : [...catalog, ...named];
  const body = SHOP_HEX.test(sample?.body) ? sample.body : colors[0] || "#a99b88";
  const detail = SHOP_HEX.test(sample?.detail) ? sample.detail
    : SHOP_HEX.test(sample?.body) ? body : colors.find(c => c !== body) || body;
  return { body, detail };
}

function shopSample(ref, item) {
  return ref?.items?.[item.slotId] || ref?.profile?.items[item.own ? "own:" + item.own : item.cat];
}

/* Where each piece sits on the floor, roughly, from where it is in the room photo (item.pos, % of the image).
 * A level default camera (horizon a little above the middle): lower in the picture = nearer, and the
 * left/right offset widens with distance. The result is spread over the floor so front/back and
 * left/right relationships match the picture.
 * Every spot is where the piece meets the floor: the bottom of its box. Boxes come from the AI render of this
 * design when Gemini has read it (renderBoxes, by slot id), else from the photo scan for pieces you keep; a
 * piece with neither uses its planned spot (item.pos, the center the render was asked to draw it at). */
const SHOP_HORIZON = .42, SHOP_FAR = .1;
// -> Map: slotId -> [u, v] (first copy) and "slotId:i" -> [u, v] for every copy with its own spot in the photo
const shopBottom = b => [(b[1] + b[3]) / 20, b[2] / 10];   // box 0-1000 -> bottom middle, image %
function shopPhotoAnchors(items, renderBoxes = null) {
  const spots = [];   // [key, x, near]
  items.forEach((item, k) => {
    const id = item.slotId ?? k;
    // a piece found in the photo has a box per copy; anything else has one spot
    const seen = renderBoxes?.[id];
    const boxes = seen?.length ? seen : item.own && typeof exById === "function" ? exById(item.own)?.boxes : null;
    // a rug lies flat: its middle is where it is; anything else stands on the bottom of its box
    const pts = boxes?.length ? boxes.map(b => item.cat === "rug" ? [(b[1] + b[3]) / 20, (b[0] + b[2]) / 20] : shopBottom(b))
      : Array.isArray(item.pos) ? [[item.pos[0], Math.min(100, item.pos[1] + 6)]] : [];   // center -> about where it stands
    pts.forEach((pos, i) => {
      const u = pos[0] / 100, v = pos[1] / 100;
      const near = Math.max(SHOP_FAR, (v - SHOP_HORIZON) / (1 - SHOP_HORIZON));   // 1 at the bottom edge, small near the horizon
      // left/right widens a little with distance (not the full 1/near, which would fling far pieces to the walls
      // and squeeze everything near the camera into the middle)
      spots.push([`${id}:${i}`, (u - .5) * (1 + .6 * (1 - near)), near]);
    });
  });
  const out = new Map();
  if (!spots.length) return out;
  for (const [key, x, n] of spots) {
    // the picture's frame is the room: its left and right edges are the side walls far away (closer to the
    // middle near the camera), the horizon is the back wall and the bottom edge the front. Fixed, not stretched
    // to the pieces, so a room whose right half is empty in the picture stays empty here too.
    const uv = [.04 + .92 * (.5 + x / 1.6), .06 + .88 * (n - SHOP_FAR) / (1 - SHOP_FAR)];
    out.set(key, uv);
    if (key.endsWith(":0")) out.set(+key.slice(0, -2), uv);
  }
  return out;
}

function shopSceneLayout(items, space, room, ref) {
  const anchors = SHOP_ROOM_ANCHORS[room] || SHOP_ROOM_ANCHORS.living;
  const profile = space.confirmed || !ref?.demoExact ? null : ref.profile;   // the baked demo room size, only for that render
  let width = Math.max(36, shopPositive(space.wallIn, 144), profile?.width || 0);
  let depth = Math.max(36, shopPositive(space.depthIn, 132), profile?.depth || 0);
  // a walkway between different pieces; pieces that are used together sit close
  const distance = 26, sameDistance = 4;
  const PAIRS = { "dining_chair|dining_table": 4, "stool_bench|dining_table": 4, "office_chair|desk": 4,
    "nightstand|bed": 4, "coffee_table|sofa": 16, "coffee_table|armchair": 16, "side_table|sofa": 4,
    "side_table|armchair": 4 };
  const gapBetween = (a, b) => a.id != null && a.id === b.id ? sameDistance
    : PAIRS[`${a.cat}|${b.cat}`] ?? PAIRS[`${b.cat}|${a.cat}`] ?? distance;
  const fromPhoto = shopPhotoAnchors(items, ref?.boxes);

  // A bigger floor when the pieces need it (unless the room was measured): enough area for the footprints,
  // and far enough apart that pieces at their photo spots keep a walkway between them.
  if (!space.confirmed) {
    const NO_ROOM = new Set(["rug", "table_lamp", "pendant_lamp", "mirror"]);
    const spots = [];
    let area = 0;
    items.forEach(item => {
      if (NO_ROOM.has(item.cat)) return;
      const { w, d } = shopDims(item);
      area += w * d * (item.qty || 1);
      for (let i = 0; i < (item.qty || 1); i++) {
        const uv = fromPhoto.get(`${item.slotId}:${i}`);
        if (uv) spots.push({ id: item.slotId, cat: item.cat, uv, w, d });
      }
    });
    const byArea = Math.sqrt(area * 3 / (width * depth));   // pieces cover at most about a third of the floor
    const needs = [];
    for (let a = 0; a < spots.length; a++) for (let b = a + 1; b < spots.length; b++) {
      const p = spots[a], q = spots[b], gap = gapBetween(p, q);
      const du = Math.abs(p.uv[0] - q.uv[0]) * width, dv = Math.abs(p.uv[1] - q.uv[1]) * depth;
      const need = Math.min(du > 1e-6 ? ((p.w + q.w) / 2 + gap) / du : Infinity, dv > 1e-6 ? ((p.d + q.d) / 2 + gap) / dv : Infinity);
      if (Number.isFinite(need)) needs.push(need);
    }
    // most pairs get their walkway from the bigger floor; the few on almost the same spot are left to the clearance check
    needs.sort((a, b) => a - b);
    const bySpacing = needs.length ? needs[Math.floor(needs.length * .85)] : 1;
    const grow = Math.min(2.2, Math.max(1, byArea, bySpacing));
    width = Math.round(width * grow); depth = Math.round(depth * grow);
  }

  function arrange() {
    const entries = items.map((item, index) => {
      const sample = shopSample(ref, item);
      const useColor = !ref?.profile || item.own || ref.demoExact;
      return { id: item.slotId, number: index + 1, item, sample, finish: shopFinish(item, useColor ? sample : null),
        form: sample?.form, ...shopDims(item), pieces: [] };
    });
    const measured = space.confirmed ? LayoutEngine.plan(entries.map(row => row.item), space, view) : null;
    const fixed = new Map();
    const occupied = [];
    if (measured?.ready) {
      for (const rect of measured.reserved) {
        occupied.push({ x: rect.x + rect.w / 2, y: rect.y + rect.d / 2, rw: rect.w, rd: rect.d });
      }
      for (const rect of measured.placed) {
        const piece = { x: rect.x + rect.w / 2, y: rect.y + rect.d / 2, rw: rect.w, rd: rect.d, turn: rect.rotated ? 1 : 0 };
        fixed.set(`${entries[rect.i].id}:${rect.q}`, piece);
        if (!rect.layer) occupied.push(piece);
      }
    }
    // storage against the walls goes first (it can only stand there), then the tables and seats that belong to them
    const priority = { wardrobe: -1, cabinet: -1, shelving: -1, dresser: -1, tv_stand: -1, sofa: 0, bed: 0, dining_table: 0, stool_bench: .5, dining_chair: .5, desk: .7, coffee_table: 1,
      rug: 3, table_lamp: 4, pendant_lamp: 4 };
    entries.sort((a, b) => (priority[a.item.cat] ?? 2) - (priority[b.item.cat] ?? 2));
    const first = cat => entries.find(row => row.item.cat === cat)?.pieces[0];

    // uv: this piece's spot in the photo. A spot that would put it on the wrong side of a piece already placed
    // (left/right or front/back, compared with the photo) costs extra, so moving aside keeps the picture's order.
    function openSpot(x, y, rw, rd, id, cat, uv) {
      const flips = (px, py) => uv ? occupied.reduce((n, p) => n + (!p.uv ? 0
        : (Math.abs(uv[0] - p.uv[0]) > .1 && Math.sign(uv[0] - p.uv[0]) !== Math.sign(px - p.x) ? 1 : 0)
        + (Math.abs(uv[1] - p.uv[1]) > .1 && Math.sign(uv[1] - p.uv[1]) !== Math.sign(py - p.y) ? 1 : 0)), 0) : 0;
      const x0 = rw / 2 + 3, x1 = width - x0, y0 = rd / 2 + 3, y1 = depth - y0;
      if (x1 < x0 || y1 < y0) return null;
      const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
      const boundedX = clamp(x, x0, x1), boundedY = clamp(y, y0, y1);
      const gapTo = p => gapBetween({ id, cat }, p);
      const clear = (px, py) => occupied.every(p => (
        Math.abs(px - p.x) >= (rw + p.rw) / 2 + gapTo(p) - .001 ||
        Math.abs(py - p.y) >= (rd + p.rd) / 2 + gapTo(p) - .001
      ));
      if (clear(boundedX, boundedY)) return [boundedX, boundedY];
      const xs = [boundedX, x0, x1], ys = [boundedY, y0, y1];
      for (const p of occupied) {
        const gx = (rw + p.rw) / 2 + gapTo(p), gy = (rd + p.rd) / 2 + gapTo(p);
        xs.push(p.x - gx, p.x + gx); ys.push(p.y - gy, p.y + gy);
      }
      let choice = null, score = Infinity;
      for (const px of xs) for (const py of ys) {
        if (px < x0 || px > x1 || py < y0 || py > y1) continue;
        const cost = ((px - x) / width) ** 2 + ((py - y) / depth) ** 2 + .25 * flips(px, py);
        if (cost < score && clear(px, py)) { score = cost; choice = [px, py]; }
      }
      return choice;
    }

    for (const row of entries) {
      const { item, sample, w, d, h } = row, cat = item.cat;
      // what the render shows wins over the usual arrangement: a lamp the render puts beside the desk stays on
      // the floor, and a rug the render shows goes where it is
      const box = ref?.boxes?.[item.slotId]?.[0], boxOf = cat2 => ref?.boxes?.[entries.find(r => r.item.cat === cat2)?.id]?.[0];
      const host = cat === "table_lamp" ? (room === "office" ? "desk" : "nightstand") : null;
      const onHost = !box || !boxOf(host) || (box[1] < boxOf(host)[3] && box[3] > boxOf(host)[1] && box[2] < boxOf(host)[2]);
      const parent = host && onHost ? first(host) : null;
      const support = cat === "pendant_lamp" ? first(room === "dining" ? "dining_table" : "coffee_table") : null;
      const table = first("dining_table"), bed = first("bed"), sofa = first("sofa"), desk = first("desk");
      let main = null;
      const z = parent?.h || (cat === "mirror" ? 32 : cat === "pendant_lamp" ? 80 : 0);
      const seen = fromPhoto.get(item.slotId);   // where the picture has it; the room-type default only if it has no spot
      const [u, v] = seen || anchors[cat] || [.5, .5], direction = anchors[cat]?.[2] || 0;
      const qty = item.qty || 1;
      for (let i = 0; i < qty; i++) {
        const confirmed = fixed.get(`${row.id}:${i}`);
        if (confirmed) {
          row.pieces.push({ ...confirmed, z, w, d, h });
          continue;
        }
        let x = u * width, y = v * depth, turn = direction;
        if (cat === "nightstand" && bed) {
          x = bed.x + (i % 2 ? 1 : -1) * (bed.rw / 2 + w / 2 + 4);
          y = bed.y - bed.rd * .32;
        } else if (cat === "coffee_table" && sofa) {
          x = sofa.x; y = sofa.y + sofa.rd / 2 + d / 2 + 18;
        } else if (cat === "office_chair" && desk) {
          x = desk.x; y = desk.y + desk.rd / 2 + d / 2 + 4;
        } else if (cat === "dining_chair" && table) {
          x = table.x + (Math.floor(i / 2) - (Math.ceil(qty / 2) - 1) / 2) * (w + 10);
          y = table.y + (i % 2 ? 1 : -1) * (table.rd / 2 + d / 2 + 9);
          turn = i % 2 ? 2 : 0;
        } else if (cat === "stool_bench" && table) {
          // counter stools in a row along the table's front, in the order the photo shows them left to right
          const order = Array.from({ length: qty }, (_, k) => k)
            .sort((a, b) => (fromPhoto.get(`${item.slotId}:${a}`)?.[0] ?? a) - (fromPhoto.get(`${item.slotId}:${b}`)?.[0] ?? b));
          const step = Math.max(w + 4, Math.min(w * 1.8, table.rw / qty));
          x = table.x + (order.indexOf(i) - (qty - 1) / 2) * step;
          y = table.y + table.rd / 2 + d / 2 + 4;
          turn = 2;
        } else if (cat === "rug" && !box && (main = { living: sofa, bedroom: bed, dining: table, office: desk }[room] || sofa || bed || table || desk)) {
          // the rug lies under the room's main piece, reaching a little in front of it
          x = main.x; y = main.y + Math.max(0, d / 2 - main.rd / 2 - 6);
        } else if (parent || support) {
          x = parent ? parent.x + parent.rw * .25 : support.x;
          y = parent ? parent.y - parent.rd * .18 : support.y;
        } else if (i > 0 && fromPhoto.has(`${item.slotId}:${i}`)) {   // this copy has its own spot in the photo
          const [cu, cv] = fromPhoto.get(`${item.slotId}:${i}`);
          x = cu * width; y = cv * depth;
        } else if (qty > 1) {
          x += (i % 3 - Math.min(2, qty - 1) / 2) * (w + 6);
          y += Math.floor(i / 3) * (d + 6);
        }

        const hint = null;   // the hand-measured demo spots were taken on the old demo render; the render is read instead
        if (hint) [x, y, turn] = [hint[0] * width, hint[1] * depth, hint[2] || 0];
        const rw = turn % 2 ? d : w, rd = turn % 2 ? w : d;
        const piece = { x, y, z, turn, w, d, h, rw, rd, id: row.id, cat };
        if (cat === "rug" || z > 0) {
          piece.x = Math.min(width - rw / 2, Math.max(rw / 2, x));
          piece.y = Math.min(depth - rd / 2, Math.max(rd / 2, y));
          if (rw > width || rd > depth) return null;
        } else {
          const ruled = (cat === "nightstand" && bed) || (cat === "coffee_table" && sofa) || (cat === "office_chair" && desk)
            || ((cat === "dining_chair" || cat === "stool_bench") && table);   // placed by its partner, not by the photo
          const uv = ruled ? null : fromPhoto.get(`${item.slotId}:${i}`) || seen;
          const spot = openSpot(x, y, rw, rd, row.id, cat, uv);
          piece.uv = uv;
          if (!spot) return null;
          [piece.x, piece.y] = spot;
          occupied.push(piece);
        }
        row.pieces.push(piece);
      }
    }
    return entries.sort((a, b) => a.number - b.number);
  }

  for (;;) {
    const placed = arrange();
    if (placed) {
      if (!space.confirmed) {   // no measured room: trim the open front and right side to the furniture plus a walkway
        const pieces = placed.flatMap(row => row.pieces);
        width = Math.round(Math.min(width, Math.max(96, ...pieces.map(p => p.x + p.rw / 2 + 30))));
        depth = Math.round(Math.min(depth, Math.max(96, ...pieces.map(p => p.y + p.rd / 2 + 30))));
      }
      return { width, depth, items: placed };
    }
    width = Math.ceil(width * 1.16);
    depth = Math.ceil(depth * 1.16);
  }
}

// the picture shown beside the plan, and the hand-measured demo layouts (no AI call: the plan comes from item.pos)
function shopReference(items) {
  const image = S.renders[sceneSig(items)];
  const profile = S.space.photo === "demo" && example().room === S.needs.room
    ? SHOP_DEMO_LAYOUTS[S.needs.room] : null;
  const demoExact = profile && S.opt === 0 && S.existing?.baked &&
    S.existing.items.every(piece => items.some(item => item.own === piece.id));
  const read = image && shopRenderBoxes.get(image);
  return { image, profile, demoExact, boxes: read?.boxes || null, others: read?.others || [], reading: read?.status === "pending" };
}

// Gemini reads where each piece landed in this design's AI render (boxes only; cached on the server too).
// Until it answers, or if it can't, the plan uses the planned spots.
const shopRenderBoxes = new Map();
async function readRenderBoxes(items, image) {
  // an AI render of this design, or the baked demo render when this is exactly its design
  const demoRender = typeof example === "function" && image === example().render && shopReference(items).demoExact;
  if (!image || image === photoSrc() || (!image.startsWith("data:image/") && !demoRender) || shopRenderBoxes.has(image)) return;
  shopRenderBoxes.set(image, { status: "pending" });
  try {
    const locate = items.filter(it => !it.own || exById(it.own)).map(it => {
      const p = view(it);
      return { id: it.slotId, category: it.cat, name: [p.name, p.variant].filter(Boolean).join(", ").slice(0, 120), qty: it.qty || 1 };
    });
    const pic = new Image();   // onload, not decode(): decode() can stall while the tab is in the background
    await new Promise((done, fail) => { pic.onload = done; pic.onerror = fail; pic.src = image; });
    const scale = Math.min(1, 1024 / Math.max(pic.naturalWidth, pic.naturalHeight));
    const canvas = Object.assign(document.createElement("canvas"),
      { width: Math.round(pic.naturalWidth * scale), height: Math.round(pic.naturalHeight * scale) });
    canvas.getContext("2d").drawImage(pic, 0, 0, canvas.width, canvas.height);
    const res = await apiPost("/api/detect", { photo: canvas.toDataURL("image/jpeg", .88), locate });
    shopRenderBoxes.set(image, { status: "ready", boxes: res.boxes || {}, others: res.others || [] });
  } catch {
    shopRenderBoxes.set(image, { status: "failed" });
  }
  if (S.cart !== "closed" && S.preview == null) renderCart();   // the room view, or the list's small preview
}
