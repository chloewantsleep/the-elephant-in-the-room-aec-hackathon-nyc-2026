// Precompute everything the example rooms need, so the app never calls the API for them:
//   1. furniture found in the photo + a white-background isometric shot per kind  -> app/assets/examples/<key>.json (+ /<key>/*.jpg)
//   2. the default design (keep everything found, no chat input) rendered once   -> app/assets/demo-render-<key>.jpg
//
// Needs the local server with a Gemini key (PORT=8765 python3 server.py) and puppeteer-core:
//   NODE_PATH=/path/to/node_modules node scripts/bake_examples.js
const puppeteer = require("puppeteer-core");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const APP = "http://127.0.0.1:8765/app/";
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const EXAMPLES = [{ i: 0, key: "lounge" }, { i: 1, key: "bar" }];
const RENDERS = path.join(ROOT, "renders");

const sleep = ms => new Promise(r => setTimeout(r, ms));
const newestRender = () => fs.existsSync(RENDERS) ? fs.readdirSync(RENDERS).filter(f => /\.(jpg|png)$/.test(f))
  .map(f => [f, fs.statSync(path.join(RENDERS, f)).mtimeMs]).sort((a, b) => b[1] - a[1])[0]?.[0] : null;

(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new" });
  for (const { i, key } of EXAMPLES) {
    // 1) live scan, ignoring any baked file
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.goto(`${APP}?v=${Date.now()}#ex=${i}&step=0&scan=1&nobake=1`);
    let ex = null;
    for (let t = 0; t < 240 && !ex; t++) {
      await sleep(1000);
      ex = await page.evaluate(() => {
        const e = window.elephantState?.existing;
        return e && e.status === "done" ? e : null;
      });
    }
    if (!ex) throw new Error(`${key}: scan did not finish`);
    const dir = path.join(ROOT, "app/assets/examples", key);
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
    const items = ex.items.map(e => {
      let iso = null;
      if (e.iso && e.iso.startsWith("data:")) {
        const [head, b64] = e.iso.split(",");
        const ext = head.includes("png") ? "png" : "jpg";
        const raw = path.join(dir, `${e.id}.${ext}`);
        fs.writeFileSync(raw, Buffer.from(b64, "base64"));
        const out = path.join(dir, `${e.id}.jpg`);   // shrink to a light 640px jpeg
        execFileSync("sips", ["-s", "format", "jpeg", "-s", "formatOptions", "82", "-Z", "640", raw, "--out", out], { stdio: "ignore" });
        if (raw !== out) fs.rmSync(raw);
        iso = `assets/examples/${key}/${e.id}.jpg`;
      }
      return { id: e.id, label: e.label, category: e.category, count: e.count || 1, box: e.box, boxes: e.boxes || [e.box],
               description: e.description, dims_in: e.dims_in, iso };
    });
    fs.writeFileSync(path.join(ROOT, "app/assets/examples", `${key}.json`),
      JSON.stringify({ photo: `assets/example-${key}.jpg`, baked: new Date().toISOString().slice(0, 10), items }, null, 1));
    console.log(`${key}: ${items.length} kinds, ${items.reduce((n, e) => n + e.count, 0)} pieces, ${items.filter(e => e.iso).length} shots`);
    await page.close();

    // 2) the default design, rendered once with live AI, now that the baked furniture loads
    const before = newestRender();
    const p2 = await browser.newPage();
    await p2.setViewport({ width: 1440, height: 900 });
    await p2.goto(`${APP}?v=${Date.now()}#ex=${i}&step=1&render=1&live=1`);
    let got = null;
    for (let t = 0; t < 120 && !got; t++) { await sleep(1000); const n = newestRender(); if (n && n !== before) got = n; }
    if (!got) throw new Error(`${key}: render did not arrive`);
    execFileSync("sips", ["-s", "format", "jpeg", "-s", "formatOptions", "82", "-Z", "1400", path.join(RENDERS, got),
      "--out", path.join(ROOT, `app/assets/demo-render-${key}.jpg`)], { stdio: "ignore" });
    console.log(`${key}: default render ${got} -> app/assets/demo-render-${key}.jpg`);
    await p2.close();
  }
  await browser.close();
})().catch(e => { console.error(e.message); process.exit(1); });
