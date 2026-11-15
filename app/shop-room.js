/* Shop's isometric illustration of the original design. */

// Parts use [x, y, z, width, depth, height, material] as fractions of the furniture envelope.
const shopLegs = height => [[.08, .08], [.83, .08], [.08, .83], [.83, .83]]
  .map(([x, y]) => [x, y, 0, .09, .09, height, "wood"]);

function shopSeatParts(count) {
  const cushions = Array.from({ length: count }, (_, i) => {
    const x = .15 + .70 * i / count, w = .70 / count;
    return [[x, .11, .52, w - .012, .16, .42, "fabric"], [x, .26, .37, w - .012, .67, .15, "fabric"]];
  }).flat();
  return [
    ...shopLegs(.13), [.035, .035, .12, .93, .93, .26, "fabric"],
    [.035, .035, .38, .93, .13, .62, "fabric"], ...cushions,
    [0, .10, .36, .14, .88, .34, "fabric"], [.86, .10, .36, .14, .88, .34, "fabric"],
  ];
}

const SHOP_SHAPES = {
  sofa: shopSeatParts(2),
  armchair: shopSeatParts(1),
  chair: [
    ...shopLegs(.46), [.09, .04, .15, .10, .09, .76, "wood"], [.81, .04, .15, .10, .09, .76, "wood"],
    [.04, .02, .65, .92, .17, .35, "fabric"], [.035, .12, .45, .93, .86, .14, "fabric"],
  ],
  officeChair: [
    [.04, .43, .01, .92, .14, .07, "frame"], [.43, .04, .01, .14, .92, .07, "frame"],
    [.45, .43, .08, .10, .10, .36, "frame"], [.08, .05, .43, .84, .15, .57, "fabric"],
    [.05, .17, .43, .90, .79, .13, "fabric"],
    [.03, .40, .54, .07, .46, .16, "frame"], [.90, .40, .54, .07, .46, .16, "frame"],
  ],
  table: [
    ...shopLegs(.88), [.12, .12, .74, .76, .76, .15, "wood"],
    [0, 0, .86, 1, 1, .14, "body"],
  ],
  counter: [
    [.02, .04, 0, .96, .91, .90, "body"], [0, 0, .90, 1, 1, .10, "detail"],
  ],
  stool: [
    ...shopLegs(.64), [.10, .80, .19, .80, .07, .06, "wood"],
    [.05, .05, .63, .90, .91, .09, "fabric"], [.08, .02, .71, .84, .15, .29, "wood"],
  ],
  bed: [
    ...shopLegs(.12), [.01, .02, .12, .98, .97, .19, "wood"],
    [0, 0, .13, 1, .10, .87, "fabric"],
    [.035, .10, .29, .93, .87, .23, "linen"],
    [.07, .36, .51, .86, .62, .055, "fabric"], [.055, .80, .55, .89, .16, .04, "gold"],
    [.11, .14, .51, .35, .18, .09, "linen"], [.54, .14, .51, .35, .18, .09, "linen"],
  ],
  shelf: [
    [0, 0, .05, 1, .11, .92, "panel"], [0, 0, .05, 1, 1, .055, "wood"],
    [0, 0, .10, .075, 1, .86, "wood"],
    [.075, .08, .32, .85, .89, .035, "wood"], [.075, .08, .62, .85, .89, .035, "wood"],
    [.925, 0, .10, .075, 1, .86, "wood"], [0, 0, .95, 1, 1, .05, "wood"],
  ],
  cabinet: [
    ...shopLegs(.10), [.025, .025, .10, .95, .92, .85, "wood"],
    [.05, .93, .16, .90, .07, .23, "panel"], [.05, .93, .41, .90, .07, .23, "panel"],
    [.05, .93, .66, .90, .07, .23, "panel"],
    ...[.27, .52, .77].map(z => [.40, 1, z, .20, .03, .025, "gold"]),
    [0, 0, .92, 1, 1, .08, "wood"],
  ],
  mirror: [
    [0, .30, 0, 1, .25, 1, "wood"], [.055, .54, .045, .89, .05, .91, "glass"],
  ],
  box: [[0, 0, 0, 1, 1, 1, "panel"]],
};
const SHOP_FORM = {
  sofa: "sofa", armchair: "armchair", bed: "bed", desk: "table", dining_table: "table",
  coffee_table: "table", side_table: "table", dining_chair: "chair", office_chair: "officeChair",
  stool_bench: "stool", floor_lamp: "lamp", table_lamp: "lamp", pendant_lamp: "pendant",
  shelving: "shelf", cabinet: "cabinet", dresser: "cabinet", nightstand: "cabinet",
  tv_stand: "cabinet", wardrobe: "cabinet", mirror: "mirror", rug: "rug",
};

function shopPaintOrder(items) {
  const pending = items.slice().sort((a, b) => a.z - b.z || a.x + a.y - b.x - b.y);
  const behind = (a, b) => {
    if (a.z !== b.z) return a.z < b.z;
    // If their screen widths don't overlap, their relative paint order is immaterial.
    if (Math.abs(a.x - a.y - b.x + b.y) >= (a.rw + a.rd + b.rw + b.rd) / 2) return false;
    const separated = (back, front) => front.x - back.x >= (back.rw + front.rw) / 2
      || front.y - back.y >= (back.rd + front.rd) / 2;
    return separated(a, b) && !separated(b, a);
  };
  const ordered = [];
  while (pending.length) {
    const next = pending.findIndex(piece => !pending.some(other => other !== piece && behind(other, piece)));
    ordered.push(pending.splice(Math.max(0, next), 1)[0]);
  }
  return ordered;
}

function shopDiagram(layout, ref, selected) {
  const { width: wallIn, depth: depthIn, items: shown } = layout;
  // The illustration extends beyond the furniture layout on both open sides.
  const extension = Math.min(32, Math.min(wallIn, depthIn) * .14);
  const scale = 594 / (wallIn + depthIn + 2 * extension);
  const endX = (wallIn + extension) * scale, endY = (depthIn + extension) * scale;
  const wallThickness = 5, back = -wallThickness;
  const floorW = endX - back, floorD = endY - back;
  const cos = Math.sqrt(3) / 2, center = 340 - (floorW - floorD) * cos / 2;
  const project = ([x, y, z = 0]) => [center + (x - y) * cos, 120 + (x + y) / 2 - z];
  const points = pts => pts.map(pt => project(pt).map(n => n.toFixed(1)).join(",")).join(" ");
  const face = (cls, ...pts) => `<polygon class="${cls}" points="${points(pts)}"/>`;
  const line = (cls, ...pts) => `<polyline class="${cls}" points="${points(pts)}"/>`;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(v, hi));

  const measure = (piece, rug) => {
    const { x, y, z, w, d, rw, rd, h, turn } = piece;
    return { x: x * scale, y: y * scale, z: Math.min(z * scale, 100), w: w * scale, d: d * scale,
      rw: rw * scale, rd: rd * scale, h: rug ? 2 : clamp(h * scale, 5, 120), turn };
  };

  const atHeight = (plan, z) => plan.map(([x, y]) => [x, y, z]);
  const rectangle = (x, y, w, d, cut = 0) => cut ? [
    [x + cut, y], [x + w - cut, y], [x + w, y + cut], [x + w, y + d - cut],
    [x + w - cut, y + d], [x + cut, y + d], [x, y + d - cut], [x, y + cut],
  ] : [[x, y], [x + w, y], [x + w, y + d], [x, y + d]];
  const ellipse = (x, y, rx, ry) => Array.from({ length: 24 }, (_, i) => {
    const a = i * Math.PI / 12;
    return [x + rx * Math.cos(a), y + ry * Math.sin(a)];
  });

  function sides(base, top, z, height, surface = "") {
    return base.map(([x, y], i) => {
      const j = (i + 1) % base.length;
      const [nextX, nextY] = base[j];
      const dx = nextX - x, dy = nextY - y;
      // Only the facets facing the isometric camera are visible.
      if (dy - dx < .001) return "";
      const side = dx + dy > 0 ? "right" : "left";
      return face(`shop-solid-${side} ${surface}`, [x, y, z], [nextX, nextY, z],
        [...top[j], z + height], [...top[i], z + height]);
    }).join("");
  }

  function box(x, y, z, w, d, h, shaped = false, orient = pt => pt) {
    const cut = shaped ? Math.min(w, d) * .13 : 0;
    const bevel = shaped ? Math.min(w, d, h) * .14 : 0;
    const plan = rectangle(x, y, w, d, cut).map(orient);
    const top = rectangle(x + bevel, y + bevel, w - 2 * bevel, d - 2 * bevel, cut * .78).map(orient);
    return sides(plan, plan, z, h - bevel)
      + (bevel ? sides(plan, top, z + h - bevel, bevel, "shop-bevel") : "")
      + face("shop-solid-top", ...atHeight(top, z + h));
  }

  function round(x, y, z, w, d, h, taper) {
    const plan = ellipse(x, y, w / 2, d / 2);
    const top = ellipse(x, y, w / 2 * taper, d / 2 * taper);
    return sides(plan, top, z, h, "shop-round-side") + face("shop-solid-top", ...atHeight(top, z + h));
  }

  const layer = (material, shape, part) =>
    `<g class="shop-material-${material}"${part ? ` data-part="${part}"` : ""}>${shape}</g>`;

  function lamp({ x, y, z, w, d, h }, pendant) {
    if (pendant) {
      const cable = line("shop-cable", [x, y, z + h * .58], [x, y, z + h - 2]);
      return cable + layer("body", round(x, y, z, w, d, h * .56, .55)
        + round(x, y, z + h - 2, w * .14, d * .14, 2, 1));
    }
    const stem = Math.min(w, d) * .11;
    return layer("frame", round(x, y, z, w * .76, d * .76, h * .06, .9)
      + round(x, y, z + h * .06, stem, stem, h * .71, 1))
      + layer("body", round(x, y, z + h * .72, w, d, h * .28, .64));
  }

  function rug({ x, y, z, w, d, h }, orient, texture) {
    const [left, back] = [x - w / 2, y - d / 2];
    const surface = pts => atHeight(pts.map(orient), z + h);
    const slab = box(left, back, z, w, d, h, false, orient);
    if (texture) {
      // The catalog photo is portrait. Map its long edge to the width of the rug.
      const [a, b, c] = surface([[left, back + d], [left, back], [left + w, back + d]]).map(project);
      return slab + `<svg width="1" height="1" viewBox="${texture.crop}" preserveAspectRatio="none"
        transform="matrix(${b[0] - a[0]} ${b[1] - a[1]} ${c[0] - a[0]} ${c[1] - a[1]} ${a[0]} ${a[1]})" overflow="hidden">
        <image href="${texture.src}" width="${texture.width}" height="${texture.height}" preserveAspectRatio="none"/>
      </svg>`;
    }
    const border = (ratio, cls) => face(cls, ...surface(
      rectangle(left + w * ratio, back + d * ratio, w * (1 - 2 * ratio), d * (1 - 2 * ratio))));
    const weave = [.24, .50, .76].map(center => face("shop-rug-motif",
      ...surface([[x, back + d * (center - .075)], [x + w * .16, back + d * center],
        [x, back + d * (center + .075)], [x - w * .16, back + d * center]]))).join("");
    return slab + border(.035, "shop-rug-border") + border(.074, "shop-rug-border") + weave;
  }

  function skuShape(model, row, orient, depth) {
    const { x, y, z, w, d, h } = row;
    return model.parts.slice().sort((a, b) => depth(a.bounds) - depth(b.bounds)).map(p => {
      const [px, py, pz, pw, pd, ph] = p.bounds;
      const [bx, by, bz] = [x + (px - .5) * w, y + (py - .5) * d, z + pz * h];
      const [width, length, height] = [pw * w, pd * d, ph * h];
      if (p.profile === "box") return layer(p.material, box(bx, by, bz, width, length, height, true, orient), p.part);
      const circular = p.profile === "round";
      const plan = (left, back, width, depth) => (circular
        ? ellipse(left + width / 2, back + depth / 2, width / 2, depth / 2)
        : rectangle(left, back, width, depth, Math.min(width, depth) * .10)).map(orient);
      const [dx, dy, taper] = p.tip;
      const base = plan(bx, by, width, length);
      const top = plan(bx + dx * w + width * (1 - taper) / 2, by + dy * d + length * (1 - taper) / 2, width * taper, length * taper);
      const shape = sides(base, top, bz, height, circular ? "shop-round-side" : "")
        + face("shop-solid-top", ...atHeight(top, bz + height));
      return layer(p.material, shape, p.part);
    }).join("");
  }

  const solids = shown.flatMap(row => row.pieces.map(piece => ({ ...row, ...measure(piece, row.item.cat === "rug") })));
  const floor = box(back, back, -12, floorW, floorD, 12);
  const palette = ref?.profile || ref;
  const roomPaint = [
    ["--shop-floor-color", palette?.floor], ["--shop-left-wall", palette?.leftWall], ["--shop-right-wall", palette?.rightWall],
  ].filter(([, color]) => SHOP_HEX.test(color)).map(([key, color]) => `${key}:${color}`).join(";");
  const courses = palette?.floor ? 6 : 11;
  const planks = Array.from({ length: courses }, (_, row) => {
    const y = back + floorD * row / courses;
    const joints = palette?.floor ? [0, .25, .50, .75, 1]
      : row % 2 ? [0, .15, .49, .83, 1] : [0, .32, .66, 1];
    return joints.slice(0, -1).map((start, i) =>
      face(`shop-plank shop-plank-${(row + i * 2) % 4}`, ...atHeight(
        rectangle(back + floorW * start, y, floorW * (joints[i + 1] - start), floorD / courses), 0))).join("");
  }).join("");
  const wallHeight = 80;
  const walls = `
    <g class="shop-walls">
      <g class="shop-back-wall shop-wall-clay">${box(0, back, 0, endX, wallThickness, wallHeight)}</g>
      <g class="shop-back-wall shop-wall-sage">${box(back, back, 0, wallThickness, floorD, wallHeight)}</g>
      <g class="shop-wall-trim">${box(0, 0, 0, endX, 2.5, 7)}${box(0, 0, 0, 2.5, endY, 7)}</g>
    </g>`;
  const backgroundShade = face("shop-room-shadow", ...atHeight(rectangle(back, back, floorW + 13, floorD + 13), -16));
  const floorClip = face("", ...atHeight(rectangle(back, back, floorW, floorD), 0));
  const contactShadows = solids.filter(({ item, z }) => item.cat !== "rug" && z === 0)
    .map(({ x, y, rw, rd }) =>
      face("shop-contact-shadow", ...atHeight(ellipse(x + 4, y + 5, rw * .50, rd * .48), 0))).join("");
  const style = row => `${row.item.inPicture ? "scene" : row.item.own ? "owned" : "buy"}${row.id === selected ? " selected" : ""}`;
  const drawItem = row => {
    const { item, x, y, z, w, d, h, id, finish, turn } = row;
    const form = row.form || SHOP_FORM[item.cat] || "box";
    const axes = [[1, 0], [0, 1], [-1, 0], [0, -1]];
    const [c, s] = axes[turn];
    const orient = ([px, py]) => [x + (px - x) * c - (py - y) * s, y + (px - x) * s + (py - y) * c];
    const depth = part => (part[0] + part[3] / 2 - .5) * w * (c + s)
      + (part[1] + part[4] / 2 - .5) * d * (c - s) + (part[2] + part[5] / 2) * h;
    const model = shopSkuModel(item);
    const shape = form === "rug" ? rug(row, orient, item.vid ? null : model?.texture)
      : model ? skuShape(model, row, orient, depth)
      : form === "lamp" || form === "pendant" ? lamp(row, form === "pendant")
      : form === "linearPendant" ? layer("body", box(x - w / 2, y - d / 2, z, w, d, h * .46, true, orient))
      : form === "roundTable" ? layer("detail", round(x, y, z, w * .65, d * .65, h * .10, .84)
        + round(x, y, z + h * .08, w * .10, d * .10, h * .84, 1))
        + layer("body", round(x, y, z + h * .90, w, d, h * .10, 1))
      : SHOP_SHAPES[form].slice().sort((a, b) => depth(a) - depth(b)).map(([px, py, pz, pw, pd, ph, material]) => layer(material,
        box(x - w / 2 + px * w, y - d / 2 + py * d, z + pz * h, pw * w, pd * d, ph * h, true, orient))).join("");
    return `<g class="shop-solid shop-form-${form} ${style(row)}" style="--shop-body:${finish.body};--shop-detail:${finish.detail}"
      data-action="shop-pick" data-id="${id}"${model ? ` data-sku-model="${model.key}"` : ""}>${shape}</g>`;
  };
  const rugs = solids.filter(row => row.item.cat === "rug").map(drawItem).join("");
  const items = shopPaintOrder(solids.filter(row => row.item.cat !== "rug")).map(drawItem).join("");

  const markerPositions = [];
  const markers = shown.map(row => {
    const front = row.pieces.reduce((a, b) => a.x + a.y >= b.x + b.y ? a : b);
    const piece = measure(front, row.item.cat === "rug");
    const [x, y] = project([piece.x, piece.y, piece.z + piece.h]);
    const multiple = row.item.qty > 1;
    const label = multiple ? `${row.number} · ×${row.item.qty}` : row.number;
    const width = multiple ? 49 : 24, anchor = clamp(y - 12, 22, 430);
    let mx = x, my = anchor;
    for (let n = 1; n <= 30; n++) {
      const overlaps = markerPositions.some(p => Math.abs(mx - p.x) < (width + p.width) / 2 + 3 && Math.abs(my - p.y) < 27);
      if (!overlaps) break;
      const candidate = anchor + (n % 2 ? -1 : 1) * Math.ceil(n / 2) * 27;
      if (candidate >= 22 && candidate <= 430) my = candidate;
    }
    markerPositions.push({ x: mx, y: my, width });
    return `<g class="shop-marker ${style(row)}" data-action="shop-pick" data-id="${row.id}">
      <path d="M${x.toFixed(1)},${y.toFixed(1)} V${my.toFixed(1)}"/>
      <rect x="${mx - width / 2}" y="${my - 12}" width="${width}" height="24" rx="12"/>
      <text x="${mx}" y="${my}">${label}</text></g>`;
  }).join("");

  return `<svg class="shop-iso" viewBox="0 0 680 452" aria-hidden="true" style="${roomPaint}">
    <defs>
      <filter id="shop-base-blur" x="-20%" y="-35%" width="140%" height="170%"><feGaussianBlur stdDeviation="8"/></filter>
      <filter id="shop-contact-blur" x="-10%" y="-20%" width="120%" height="140%"><feGaussianBlur stdDeviation="3"/></filter>
      <clipPath id="shop-floor-clip">${floorClip}</clipPath>
    </defs>
    ${backgroundShade}<g class="shop-floor">${floor}</g><g class="shop-planks">${planks}</g>${walls}
    ${rugs}<g clip-path="url(#shop-floor-clip)" filter="url(#shop-contact-blur)">${contactShadows}</g>${items}${markers}
  </svg>`;
}

function shopRoomMarkup() {
  const option = S.options[S.opt];
  if (option) option.shopOriginal ??= structuredClone(option.items);
  const original = (option?.shopOriginal || S.scene).map((item, slotId) => ({ ...item, slotId }));
  const ref = shopReference(original);
  // everything the picture shows: the design, plus the photo's own furniture you didn't keep (still in the
  // picture unless an AI render of this design already removed it)
  const aiRender = ref.image?.startsWith("data:image/") && ref.image !== photoSrc();
  const found = S.existing?.photoKey === photoKey() ? S.existing.items : [];
  const extra = aiRender ? [] : found.filter(e => e.status !== "error" && !original.some(it => it.own === e.id))
    .map((e, k) => ({ ...ownedItem(e), inPicture: true, slotId: original.length + k }));
  const plan = shopSceneLayout([...original, ...extra], S.space, S.needs.room, ref);
  const demo = S.space.photo === "demo";
  let refSrc = ref.image || (demo ? example().render : photoSrc());
  if (!demo && refSrc.startsWith("assets/demo-render-")) refSrc = photoSrc();
  const refLabel = refSrc === photoSrc() ? "Original room photo"
    : refSrc.startsWith("assets/demo-render-") ? "Demo reference render" : "Design reference render";
  const planLabel = ref.demoExact ? "Measured from the demo render" : "Laid out from the design's positions";

  return `<div class="shop-layout">
    <section class="shop-plan" aria-label="Isometric room diagram">
      <h3 class="shop-plan-title">Original design</h3>
      <div class="shop-canvas">
        ${shopDiagram(plan, ref, S.shopSelected)}
        <p class="shop-note" aria-live="polite">${planLabel} · ${inch(plan.width)} × ${inch(plan.depth)}</p>
      </div>
      <div class="shop-legend" aria-label="Diagram legend">
        <span><i class="buy"></i>To buy</span><span><i class="owned"></i>Keeping</span>${extra.length ? '<span><i class="scene"></i>In the picture, not in your list</span>' : ""}
      </div>
    </section>
    <aside class="shop-side" aria-label="Reference and furniture">
      <figure class="shop-reference"><img src="${esc(refSrc)}" alt="Room reference">
        <figcaption>${refLabel}</figcaption>
      </figure>
      <div class="shop-total">
        <h3>Room items <span>· ${plan.items.length}</span></h3>
        <span>${money(sceneTotal(original))} to buy</span>
      </div>
      <div class="shop-items">
        ${plan.items.map(row => shopPieceRow(row, S.shopSelected === row.id)).join("")}
        ${!original.length ? '<p class="shop-empty">No furniture in this design.</p>' : ""}
      </div>
    </aside>
  </div>`;
}

function shopPieceRow({ item, id, number }, selected) {
  const p = view(item), image = imgOf(p);
  const category = CAT_LABEL[item.cat] || CAT_LABEL.other;
  return `<div class="shop-entry ${selected ? "selected" : ""}">
    <button class="shop-item" data-action="shop-pick" data-id="${id}" aria-pressed="${selected}">
      <span class="shop-index">${number}</span>
      <span class="shop-thumb">${image ? `<img src="${esc(image)}" alt="">` : ""}</span>
      <span class="shop-piece-name"><strong>${esc(p.owned ? p.name : p.family || p.name)}</strong>
        <small>${esc(category)}${item.qty > 1 ? ` × ${item.qty}` : ""} · ${item.inPicture ? "In the picture" : p.owned ? "Keeping" : money(p.price.amount * item.qty)}</small>
      </span>
    </button>
    ${selected ? `<div class="shop-piece-detail">
      <p>${esc(p.owned ? "" : p.variant)}${p.variant && !p.owned && dimsText(p) ? " · " : ""}${esc(dimsText(p))}</p>
      ${!p.owned && !shopSkuModel(item) ? "<p>Approximate silhouette</p>" : ""}
      ${p.url ? `<a class="xchip" href="${esc(p.url)}" target="_blank" rel="noopener">View product ↗</a>` : ""}
    </div>` : ""}
  </div>`;
}
