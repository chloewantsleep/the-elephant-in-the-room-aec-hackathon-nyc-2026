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

function shopSceneLayout(items, space, room, ref) {
  const anchors = SHOP_ROOM_ANCHORS[room] || SHOP_ROOM_ANCHORS.living;
  const profile = space.confirmed ? null : ref?.profile;
  let width = Math.max(36, shopPositive(space.wallIn, 144), profile?.width || 0);
  let depth = Math.max(36, shopPositive(space.depthIn, 132), profile?.depth || 0);
  const distance = 5;

  function arrange() {
    const entries = items.map((item, index) => {
      const sample = shopSample(ref, item);
      const dimensions = view(item).dims_in;
      const useColor = !ref?.profile || item.own || ref.demoExact;
      return { id: item.slotId, number: index + 1, item, sample, finish: shopFinish(item, useColor ? sample : null),
        form: sample?.form, w: shopPositive(dimensions.width, 22), d: shopPositive(dimensions.depth, shopPositive(dimensions.width, 18)),
        h: shopPositive(dimensions.height, 20), pieces: [] };
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
    const priority = { sofa: 0, bed: 0, dining_table: 0, desk: 0, coffee_table: 1,
      rug: 3, table_lamp: 4, pendant_lamp: 4 };
    entries.sort((a, b) => (priority[a.item.cat] ?? 2) - (priority[b.item.cat] ?? 2));
    const first = cat => entries.find(row => row.item.cat === cat)?.pieces[0];

    function openSpot(x, y, rw, rd) {
      const x0 = rw / 2 + 3, x1 = width - x0, y0 = rd / 2 + 3, y1 = depth - y0;
      if (x1 < x0 || y1 < y0) return null;
      const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
      const boundedX = clamp(x, x0, x1), boundedY = clamp(y, y0, y1);
      const clear = (px, py) => occupied.every(p => (
        Math.abs(px - p.x) >= (rw + p.rw) / 2 + distance - .001 ||
        Math.abs(py - p.y) >= (rd + p.rd) / 2 + distance - .001
      ));
      if (clear(boundedX, boundedY)) return [boundedX, boundedY];
      const xs = [boundedX, x0, x1], ys = [boundedY, y0, y1];
      for (const p of occupied) {
        const gx = (rw + p.rw) / 2 + distance, gy = (rd + p.rd) / 2 + distance;
        xs.push(p.x - gx, p.x + gx); ys.push(p.y - gy, p.y + gy);
      }
      let choice = null, score = Infinity;
      for (const px of xs) for (const py of ys) {
        if (px < x0 || px > x1 || py < y0 || py > y1) continue;
        const cost = ((px - x) / width) ** 2 + ((py - y) / depth) ** 2;
        if (cost < score && clear(px, py)) { score = cost; choice = [px, py]; }
      }
      return choice;
    }

    for (const row of entries) {
      const { item, sample, w, d, h } = row, cat = item.cat;
      const parent = cat === "table_lamp" ? first(room === "office" ? "desk" : "nightstand") : null;
      const support = cat === "pendant_lamp" ? first(room === "dining" ? "dining_table" : "coffee_table") : null;
      const table = first("dining_table"), bed = first("bed"), sofa = first("sofa"), desk = first("desk");
      const z = parent?.h || (cat === "mirror" ? 32 : cat === "pendant_lamp" ? 80 : 0);
      const imageAnchor = [item.pos[0] / 100, (item.pos[1] - 15) / 95];
      const [u, v, direction = 0] = item.sketched ? imageAnchor : anchors[cat] || imageAnchor;
      const qty = item.qty || 1;
      for (let i = 0; i < qty; i++) {
        const confirmed = fixed.get(`${row.id}:${i}`);
        if (confirmed) {
          row.pieces.push({ ...confirmed, z, w, d, h });
          continue;
        }
        let x = u * width, y = v * depth, turn = direction;
        if (cat === "nightstand" && bed) {
          x = bed.x + (i % 2 ? 1 : -1) * (bed.rw / 2 + w / 2 + distance);
          y = bed.y - bed.rd * .32;
        } else if (cat === "coffee_table" && sofa) {
          x = sofa.x; y = sofa.y + sofa.rd / 2 + d / 2 + 12;
        } else if (cat === "office_chair" && desk) {
          x = desk.x; y = desk.y + desk.rd / 2 + d / 2 + 12;
        } else if (cat === "dining_chair" && table) {
          x = table.x + (Math.floor(i / 2) - (Math.ceil(qty / 2) - 1) / 2) * (w + 10);
          y = table.y + (i % 2 ? 1 : -1) * (table.rd / 2 + d / 2 + 9);
          turn = i % 2 ? 2 : 0;
        } else if (parent || support) {
          x = parent ? parent.x + parent.rw * .25 : support.x;
          y = parent ? parent.y - parent.rd * .18 : support.y;
        } else if (qty > 1) {
          x += (i % 3 - Math.min(2, qty - 1) / 2) * (w + 6);
          y += Math.floor(i / 3) * (d + 6);
        }

        const hint = item.sketched && ref?.profile ? null : sample?.positions?.[i];
        if (item.sketched && !hint) [x, y, turn] = [u * width, v * depth, direction];
        if (hint) [x, y, turn] = [hint[0] * width, hint[1] * depth, hint[2] || 0];
        const rw = turn % 2 ? d : w, rd = turn % 2 ? w : d;
        const piece = { x, y, z, turn, w, d, h, rw, rd };
        if (cat === "rug" || z > 0) {
          piece.x = Math.min(width - rw / 2, Math.max(rw / 2, x));
          piece.y = Math.min(depth - rd / 2, Math.max(rd / 2, y));
          if (rw > width || rd > depth) return null;
        } else {
          const spot = openSpot(x, y, rw, rd);
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
    if (placed) return { width, depth, items: placed };
    width = Math.ceil(width * 1.16);
    depth = Math.ceil(depth * 1.16);
  }
}

const shopReferenceCache = new Map();

function shopReference(items) {
  const image = S.renders[sceneSig(items)];
  if (image?.startsWith("data:image/") && image !== photoSrc()) {
    return shopReferenceCache.get(image) || { image, status: "pending" };
  }
  const profile = S.space.photo === "demo" && example().room === S.needs.room
    ? SHOP_DEMO_LAYOUTS[S.needs.room] : null;
  const demoExact = profile && S.opt === 0 && S.existing?.baked &&
    S.existing.items.every(piece => items.some(item => item.own === piece.id));
  return { image, profile, demoExact };
}

async function loadShopReference(items, ref) {
  if (ref.status !== "pending" || shopReferenceCache.has(ref.image)) return;
  shopReferenceCache.set(ref.image, ref);
  try {
    const layout = items.map(item => {
      const p = view(item);
      return { id: item.slotId, category: item.cat, name: p.name, finish: p.variant, qty: item.qty };
    });
    const image = new Image();
    image.src = ref.image;
    await image.decode();
    const scale = Math.min(1, 1024 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = Object.assign(document.createElement("canvas"), {
      width: Math.max(1, Math.round(image.naturalWidth * scale)), height: Math.max(1, Math.round(image.naturalHeight * scale)),
    });
    canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
    const result = await apiPost("/api/detect", { photo: canvas.toDataURL("image/jpeg", .88), layout });
    shopReferenceCache.set(ref.image, { ...result, image: ref.image, status: "ready" });
  } catch {
    shopReferenceCache.set(ref.image, { image: ref.image, status: "unavailable" });
  }
  if (S.cart === "expanded" && S.cartView === "room" && S.preview == null) renderCart();
}
