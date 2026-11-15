// Bake the one AI edit the demo walkthrough shows (app/walkthrough.js): on the lounge example's default design,
// swap the sofa, armchair and rug, then render the edit with Gemini -> app/assets/walkthrough-swap.jpg
// Needs the local server with a Gemini key (PORT=8765 python3 server.py) and puppeteer-core:
//   NODE_PATH=/path/to/node_modules node scripts/bake_walkthrough.js
const puppeteer = require("puppeteer-core");
const fs = require("fs");
const path = require("path");
const SWAPS = require("../app/walkthrough-swaps.json");

(async () => {
  const browser = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new" });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto(`http://127.0.0.1:8765/app/?v=${Date.now()}`, { waitUntil: "networkidle0" });
  const out = await page.evaluate(async swaps => {
    const until = async c => { while (!c()) await new Promise(r => setTimeout(r, 200)); };
    goto(DESIGN); renderScene(true); await until(() => !S.rendering && S.last);
    for (const [cat, pid] of Object.entries(swaps)) changeSceneProduct(S.scene.findIndex(it => it.cat === cat), pid, null);
    S.last.real = true; S.live = true;   // edit the demo render instead of rendering the room from scratch
    if (!editsSinceLast()) return { error: "not an edit" };
    renderScene(true); await until(() => !S.rendering);
    return { image: S.renders[sceneSig()], err: S.renderError };
  }, SWAPS);
  if (!out.image) throw new Error(JSON.stringify(out));
  fs.writeFileSync(path.join(__dirname, "../app/assets/walkthrough-swap.jpg"), Buffer.from(out.image.split(",")[1], "base64"));
  console.log("saved app/assets/walkthrough-swap.jpg");
  await browser.close();
})();
