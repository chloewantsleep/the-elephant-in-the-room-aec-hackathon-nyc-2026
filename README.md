# Elephant: brings a room that fits your life

**The Elephant in the Room** · AEC Hackathon NYC 2026

**[Try the live demo](https://the-elephant-in-the-room.vercel.app)** · **[See the pitch](https://elephant-pitch.vercel.app)** · [Dataset](data/) · [The pipeline](#the-pipeline) · [Team](#team)

![Elephant brings a room that fits your life](docs/readme/hero.jpg)

> **A sofa can look perfect and still be wrong for how you live.**

Elephant starts with what you have, finds what fits, and adapts as your life changes. Show it your room, tell it how you live, and it designs the room with **real furniture you can buy**: real sizes, real prices, real links. Then it shows the result in your own photo and hands you the shopping list.

![Elephant in the app: a real render of the room, every piece labeled with its real product and price](docs/readme/app.jpg)

## What it does

**Photo → brief → design → render → shop**, all on one photo of your room.

1. **Start from one photo.** Upload your room, or try the example lounge from the hackathon venue.
2. **It sees what's already there.** Every piece in the photo is found and cut out. Keep it or ditch it; whatever you keep is designed around.
3. **A short brief.** Room, style, budget and what you need, by tapping or just typing.
4. **Three complete designs.** Real products, real prices, checked against the wall and the budget.
5. **Rendered into your room.** The picked pieces placed in your own photo. Flip **Before** to compare.
6. **Change anything.** Click a piece to see why it's there, switch its color or swap in a similar product that still fits. The picture updates in place. Or **sketch** a piece where you want it.
7. **Shop the list.** Every piece with a link to buy, the budget left, a room plan, and an **FF&E schedule** (PDF or CSV) for a designer.

Press **▶ Walkthrough** (top left of the app) for a one-minute tour of the whole flow.

## More than picking furniture

![Elephant listens for what you really need and turns it into design decisions](docs/readme/talk.jpg)

Elephant picks for how you live. It listens for what you really need, turns it into design decisions, and keeps them in a **living brief**:

> **You:** I curl up with a book. **Elephant:** Legs tucked up, or stretched out? **You:** Tucked up.
> → *Seat depth first, then seat width.*
>
> **You:** Keep the rocking chair. → *Kept, in every option.*
>
> **You:** It's too dark to read at night. → *Adding light where you read.*

Then it goes shopping in real stores (IKEA and Home Depot, 371 products), checked against your words. Next time you choose, Elephant starts from here.

### So how does it understand you?

![A spoken sentence becomes a design decision, then product labels, then a pick](docs/readme/how.jpg)

**01 · You say** "curl up" → **02 · Design decision** usable seat depth first, then seat width (not the sofa's outside depth) → **03 · Product labels** quoted from the retailer → **04 · The pick.** Every piece is described in words, so your words can find it. More in [`docs/sofa-matching.md`](docs/sofa-matching.md) and [`docs/living-brief.md`](docs/living-brief.md).

## Everyone else does half

![Elephant is the only one that both knows how you live and uses real products](docs/readme/vs.jpg)

| | Real products you can buy now | Knows how you live, and remembers |
|---|---|---|
| AI room-image generators | Pretty, but the furniture isn't real | |
| Store AR apps | Real, but one store | No memory of you |
| Interior designers | | Knows you. Slow, costly, not always there |
| **Elephant** | **Yes** | **Yes**: your real room, your habits, real products. It remembers, and adapts |

**The picture never invents furniture. Every object in it is a real product with a size, a price and a link.**

## Your room, through life

Life changes. Rooms too. One room, one view, six moments of a life, each changing real catalog products:

| Moving in | Partner moves in | A cat arrives |
|---|---|---|
| ![Moving in](deck/public/img/life-1.jpg) | ![Partner moves in](deck/public/img/life-2.jpg) | ![A cat arrives](deck/public/img/life-3.jpg) |
| **Friends over** | **New colors** | **Next chapter** |
| ![Friends over](deck/public/img/life-4.jpg) | ![New colors](deck/public/img/life-5.jpg) | ![Next chapter](deck/public/img/life-6.jpg) |

## See it running

| [![Elephant, start to finish](deck/public/video/elephant-start-to-finish.jpg)](deck/public/video/elephant-start-to-finish-15s.mp4) | [![Evaluate your existing space](deck/public/video/1-evaluate-environment.jpg)](deck/public/video/1-evaluate-environment.mp4) | [![Customize with a sketch](deck/public/video/2-sketch.jpg)](deck/public/video/2-sketch.mp4) |
|---|---|---|
| **Elephant, start to finish** | **Evaluate your existing space** | **Customize with a sketch** |
| [![Fast local iteration](deck/public/video/3-switch.jpg)](deck/public/video/3-switch.mp4) | [![Plan, list and export](deck/public/video/4-multiple-export.jpg)](deck/public/video/4-multiple-export.mp4) | |
| **Fast local iteration** | **Plan, list and export** | |

## The pipeline

| Step | What it does | Runs on |
|---|---|---|
| **Understand** | Turns what you say into needs you confirm | Gemini 3.8 Flash · Claude for sketches |
| **See what you own** | Finds your furniture in the photo | Gemini vision |
| **Match** | Ranks real products against the labels | Sofa ontology on Schema.org · rules |
| **Show** | Renders the picture from the product list | Gemini 3.1 Flash Image · about 8 s and $0.07 per render |
| **Shop** | List, budget, FF&E schedule | Python + Vercel functions · plain JS |

### The render is derived from data, not the other way around

The image model never "invents" furniture. Every object in the render comes from a row in the **scene state**, which points to a real SKU. Edits change the scene state first, then the picture updates. That way the shopping list always matches the picture, and every item fits the room's dimensions.

```jsonc
// scene state (simplified)
{
  "room": { "width_in": 144, "depth_in": 120, "height_in": 96, "photo": "room.jpg" },
  "needs": { "style": "warm minimal", "budget_usd": 3000 },
  "items": [
    {
      "slot": "sofa", "sku": "ikea:80519531", "name": "KIVIK sofa",
      "price_usd": 1299, "dims_in": { "w": 89.375, "d": 37.375, "h": 32.625 },
      "placement": { "wall": "north", "offset_in": 20 },
      "url": "https://www.ikea.com/us/en/p/kivik-sofa-grann-bomstad-black-80519531/"
    }
  ]
}
```

After a render, each new product is found in the picture, cropped, and prepared in other colors and similar products, so picking one lays that crop over the render right away instead of rendering again (`app/variants.js`).

## Team

![The team as a paper collage](deck/public/img/team-collage.jpg)

| [Yimeng Ding](https://www.linkedin.com/in/yimeng-ding/) | [Yu Chen](https://www.linkedin.com/in/yu-chen-2a586b249/) | [Chloe](https://www.linkedin.com/in/jiayueni/) | [Jiahao Li](https://www.linkedin.com/in/jiahao-li-no-on/) | [Shicong Cao](https://www.linkedin.com/in/shicong-cao/) | [Han Zhao](https://www.linkedin.com/in/han-zhao-52b78a249/) |
|---|---|---|---|---|---|

---

## For developers

### Run it locally

```bash
cp .env.example .env             # then paste your Gemini API key into .env (never commit it)
python3 server.py                # from the repo root (Windows: python server.py)
# open http://localhost:8000/app/
```

Plain HTML/CSS/JS reading `data/products.json`, plus `server.py` (Python standard library), which serves the app and calls Gemini. Four steps on one photo: **Needs (room photo + chat) → Design → Edit → Shop**. Opening the app shows the upload screen; any deep link (below) skips it.

- **Real:** all 371 products (316 IKEA, 55 Home Depot) with prices, dimensions, photos and colorways; the fit check against the wall width; the shopping list; and **the render**. `server.py` sends the room photo and the white-background product photos to Gemini (`gemini-3.1-flash-image`, about 8 s and $0.07 per image). Selecting an option renders it. After edits, click **Update render**. **Before** toggles back to the original photo.
- **Furniture you already own:** uploading a photo (or clicking *Find furniture in this photo*) calls `/api/detect` (Gemini vision: boxes, category, estimated size). Each piece is cropped in the browser and sent to `/api/isolate`, which returns a **white-background isometric product shot**. **Keep** a piece and the planner designs around it (shown as "Yours · $0"; nothing of that type gets bought). **Ditch** it and the render removes it.
- **Mocked, to replace:** `planOptions()` in `app/app.js` stands in for an AI layout agent. Room size is one wall length the user can type (folded away under *Room size*).
- **Sketch furniture:** the pen on the right rail opens a board. Draw rough shapes where you want pieces: a long box for a sofa, a tall line for a floor lamp, a blob up top for a pendant. **Kitchen cabinets:** a straight line along a wall becomes a run of real Home Depot base cabinet modules, sized to its length. Naming a shape is optional: pick a type on its chip, tap **✦ Guess with AI**, or press **Done** for a free guess from its size and place. Sketched pieces are added to the design as real products placed where you drew them. The AI guess uses Claude if `ANTHROPIC_API_KEY` is set, else Gemini, else free shape rules; force one with `SKETCH_ENGINE=claude|gemini|rules` in `.env`.
- **Shopping list:** the right rail opens the list beside the room (To buy / Keeping, total vs budget). **Expand** shows every piece as a grid, and **Room view** shows the design as an isometric plan numbered against the list. **FF&E schedule:** **PDF** opens the print dialog on a designed sheet (choose "Save as PDF"); **CSV** downloads `ffe-schedule.csv` in the 13 columns of a designer's FF&E schedule (Space, Room #, Item #, Item Description, Category, Qty, Unit, Spec / Notes, Vendor, Unit Cost, Total Cost, Drawing Ref, Status).
- **Instant colors and similar products:** after a render, each new product is tracked in the picture (`/api/track`), cropped, and prepared in up to 4 colors and 4 similar products (`/api/recolor`, `/api/swap`). Sketched pieces are placed into a small crop around the sketch (`/api/place`). `#variantsmock=1` fakes these AI calls.
- **Sample lounge demo:** the example lounge comes entirely from saved results in `demo-cache/`, looked up by content, so it works the same on any machine and costs nothing. Only sketches make new AI calls there. `#newrenders=1` renders everything for real.
- **Cost control:** identical requests are cached in `renders/cache/`, so reloading or re-selecting an option is free. `python3 server.py --test` renders a demo scene into `renders/`; `python3 server.py --models` lists the image models your key can use.
- **Deep links:** `#walkthrough` starts the walkthrough (`#walkthrough&swaps` includes the swap steps). `#step=2&sel=0` opens Edit with the first piece selected. `#step=3&cart=expanded` opens the full list. `#step=0&scan=1` scans the example room. Add `&render=1` to render on load. `#testbase` shows a test-only button to try another base photo.

### Render settings

The root `.env` groups all rendering settings together:

```dotenv
AI_RENDER_ENABLED=true
AI_RENDER_DEMO_CACHE_ONLY=true
GEMINI_IMAGE_MODEL=gemini-3.1-flash-image
GEMINI_RECOLOR_MODEL=gemini-3.1-flash-image
GEMINI_SWAP_MODEL=gemini-3.1-flash-image
GEMINI_PLACE_MODEL=gemini-3.1-flash-image
```

Set `AI_RENDER_DEMO_CACHE_ONLY=false` to allow fresh renders of the sample lounge. The four model settings independently control the full room, color previews, similar-product previews and sketch placement. For example, set only `GEMINI_RECOLOR_MODEL=gemini-3.1-flash-lite-image` to compare cheaper color previews. Changing a model uses a separate cache key; unchanged requests still reuse saved results.

The local server reloads `.env` automatically; refresh the page after editing it. `http://localhost:8000/api/render` shows the active models and defaults without exposing credentials. For Vercel, set the same environment variables in the project and redeploy.

### Live sites (Vercel)

Every push to `main` deploys both sites automatically.

- **App:** https://the-elephant-in-the-room.vercel.app. Static `app/` and `data/` plus Python functions in `api/` that call Gemini. `GEMINI_API_KEY`, `DEMO_PASSCODE` (and optionally `ANTHROPIC_API_KEY`) live in the Vercel project's environment variables, never in git. Saved results need no passcode; new AI work asks for the **team passcode** once per browser.
- **Pitch:** https://elephant-pitch.vercel.app. A scroll-driven site built from `deck/` (Vite + React, its own Vercel project with root directory `deck/`). See [`deck/README.md`](deck/README.md).

### Repo layout

| Path | What |
|---|---|
| `app/` | The app: `index.html`, `style.css`, `app.js`, `variants.js` (instant colors / swaps), `sketch.js` (sketch furniture), `landing.js` (upload screen), `walkthrough.js` (demo tour) |
| `server.py` | Local dev server; serves the app and the `api/` endpoints with keys from `.env` |
| `api/` | Vercel functions (`render`, `detect`, `isolate`, `track`, `recolor`, `swap`, `place`, `chat`, `sketch`, `cached_render`); `_core.py` is the logic shared with `server.py` |
| `sketch_ai.py` | Reads sketched shapes → furniture types + sizes (Claude, Gemini or rules) |
| `data/products.json` | 371 real products (IKEA + Home Depot). See [`data/README.md`](data/README.md) and [`data/SUMMARY.md`](data/SUMMARY.md) |
| `data/images/` | White-background product photos for rendering |
| `schema/` | Shared product format and the sofa ontology |
| `demo-cache/` | Saved AI results for the sample lounge demo |
| `deck/` | The pitch site (elephant-pitch.vercel.app) |
| `docs/` | Design notes: [living brief](docs/living-brief.md), [sofa matching](docs/sofa-matching.md), [conversation workspace](docs/conversation-workspace.md), [hackathon plan](docs/hackathon-plan.md) |
| `scraper/` | Scrapers + merge script |
| `vercel.json` | Vercel config: `/` → `/app/`, function timeouts, bundled product images |

The plan the team worked from during the hackathon (planned pipeline, stage-by-stage table, work split, open questions, data research) is in [`docs/hackathon-plan.md`](docs/hackathon-plan.md).
