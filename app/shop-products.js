/* SKU silhouettes traced from the catalog photos, in normalized width/depth/height units. */
const skuPart = (part, bounds, material = "body", profile = "box", tip = [0, 0, 1]) =>
  ({ part, bounds, material, profile, tip });

const skuLegs = (height, material = "detail", profile = "box") => [
  [.08, .09], [.85, .09], [.08, .84], [.85, .84],
].map(([x, y]) => skuPart("leg", [x, y, 0, .065, .07, height], material, profile));

const SHOP_SKU_MODELS = {
  "ikea:60530643": {
    key: "alvdalen",
    parts: [
      ...skuLegs(.14, "detail", "round"),
      skuPart("frame", [.045, .045, .12, .91, .90, .25]),
      skuPart("back-frame", [.025, 0, .16, .95, .135, .78]),
      skuPart("seat", [0, .13, .36, 1, .87, .153]),
      ...[.025, .345, .665].map((x, i) =>
        skuPart("back-cushion", [x, .135, .49, .309, .19, .50 - i * .008], "body", "sloped", [0, -.095, .94])),
    ],
  },
  "ikea:s29318319": {
    key: "morabo",
    parts: [
      ...skuLegs(.21, "detail", "round"),
      skuPart("frame", [.035, .055, .19, .93, .89, .22]),
      skuPart("back-frame", [.035, .035, .26, .93, .14, .60]),
      ...[.13, .504].flatMap(x => [
        skuPart("seat", [x, .24, .40, .363, .70, .15]),
        skuPart("back-cushion", [x, .13, .52, .361, .19, .48], "body", "sloped", [0, -.09, .96]),
      ]),
      ...[0, .876].map(x => skuPart("arm", [x, .045, .20, .124, .94, .60])),
    ],
  },
  "ikea:00405048": {
    key: "lauters",
    parts: [
      ...[[.13, .065], [.06, .81], [.82, .72]].map(([x, y]) =>
        skuPart("tripod-leg", [x, y, 0, .105, .105, .49], "detail", "sloped", [(.45 - x) * .83, (.45 - y) * .83, .98])),
      skuPart("joint", [.32, .32, .47, .36, .36, .042], "detail", "round"),
      skuPart("stem", [.464, .464, .49, .072, .072, .31], "detail", "round"),
      skuPart("drum-shade", [.025, .025, .755, .95, .95, .245], "body", "round"),
    ],
  },
  "ikea:50513738": {
    key: "nosund",
    parts: [
      skuPart("diffuser", [.23, .23, 0, .54, .54, .20], "linen", "round"),
      skuPart("birch-ring", [.15, .15, .035, .70, .70, .30], "body", "round"),
      skuPart("birch-ring", [.077, .077, .32, .846, .846, .34], "body", "round"),
      skuPart("birch-ring", [0, 0, .64, 1, 1, .36], "body", "round"),
    ],
  },
  "ikea:20631663": {
    key: "kallax",
    parts: [
      skuPart("base", [0, 0, 0, 1, 1, .044]),
      skuPart("side", [0, 0, .044, .065, 1, .912]),
      skuPart("side", [.935, 0, .044, .065, 1, .912]),
      skuPart("divider", [.467, 0, .044, .066, 1, .912]),
      ...[.25, .484, .72].map(z => skuPart("shelf", [.065, 0, z, .87, 1, .033])),
      skuPart("top", [0, 0, .956, 1, 1, .044]),
    ],
  },
  "ikea:90561044": {
    key: "lisabo",
    parts: [
      ...[.105, .822].flatMap((x, i) => [
        skuPart("front-leg", [x, .853, 0, .074, .07, .525], "detail", "sloped", [i ? -.035 : .035, -.105, 1.27]),
        skuPart("back-leg", [x, .015, 0, .075, .075, .526], "detail", "sloped", [i ? -.028 : .028, .16, 1.15]),
        skuPart("back-stile", [x + (i ? -.027 : .027), .17, .50, .082, .073, .42], "detail", "sloped", [0, -.115, .96]),
      ]),
      skuPart("seat", [.025, .19, .50, .95, .80, .075]),
      skuPart("wood-back", [.025, .045, .798, .95, .10, .202], "detail", "sloped", [0, -.04, 1]),
    ],
  },
  "ikea:00529242": {
    key: "havsta",
    parts: [
      skuPart("plinth", [0, .01, 0, 1, .99, .102]),
      skuPart("case", [.022, .024, .097, .956, .915, .87]),
      ...[.046, .505].flatMap(x => [
        skuPart("door", [x, .934, .129, .449, .037, .808]),
        skuPart("raised-panel", [x + .059, .97, .203, .328, .011, .660], "panel"),
      ]),
      ...[.455, .525].map(x => skuPart("knob", [x, .980, .534, .025, .02, .024], "gold")),
      skuPart("top", [0, 0, .955, 1, 1, .045]),
    ],
  },
  "ikea:20595698": {
    key: "jarnvag",
    texture: { src: "../data/images/ikea/20595698.jpg", crop: "233 34 933 1332", width: 1400, height: 1400 },
  },
};

const shopSkuModel = item => item && !item.own ? SHOP_SKU_MODELS[item.pid] : null;
