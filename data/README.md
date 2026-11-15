# Product data

Real furniture with real dimensions, prices and product photos — the "things" input (③) of the pipeline.

| File | What |
|---|---|
| `products.json` | **Use this.** All products, merged and validated, sorted by category then price. |
| `SUMMARY.md` | Counts and price ranges per category. |
| `ikea.jsonl` | Raw output of the IKEA scraper (one JSON per line). |
| `images/<source>/<id>.jpg` | Downloaded white-background product photo (1400 px) for each product. |

Field definitions: [`../schema/product.schema.json`](../schema/product.schema.json).

## For the render / AI tracks

- **Fit check:** `dims_in.width / depth / height` are in **inches**, overall footprint. `null` means unknown, never 0.
- **Rendering a product:** use `images.main_local` (offline copy) or `images.main` (URL). Both are clean white-background shots. `description` is a one-line visual description of that photo — paste it into image-model prompts.
- **Style reference:** `images.context` is the retailer's in-room photo. `images.gallery[]` has close-ups (`quality`), function shots (`functional`), and more, each labeled with `type`.
- **Swap color in the edit loop:** `variants[]` lists other colorways of the same design with their own price, image and URL.
- **Shopping list:** `name`, `variant`, `price.amount`, `url`.

```python
import json
products = json.load(open("data/products.json"))
sofas_that_fit = [p for p in products
                  if p["category"] == "sofa" and p["dims_in"]["width"] <= 84 and p["price"]["amount"] <= 1500]
```

## Re-scraping

```bash
python3 scraper/ikea.py --plan   # preview what would be picked per category
python3 scraper/ikea.py          # ~10 min, rate-limited to 1 request/sec, cached in data/cache/
python3 scraper/build.py         # merge -> products.json + SUMMARY.md
```

Category targets live in `PLAN` in `scraper/ikea.py`. Each design family contributes one record; its other colors go into `variants`. Only items with complete dimensions and a main image are kept.

**Don't scrape during the demo.** The committed snapshot is the demo data.

## Sources and notes

- **IKEA US:** site search endpoint plus measurements embedded in product pages. Unofficial and may change.
- **Home Depot (29 products, hand-picked):** homedepot.com blocks scripts (HTTP 403) and its terms forbid automated scraping, so there is no crawler. Products were picked by hand in a normal browser session for the demo's living-room and office categories. What was read off each product page (name, brand, price, rating, specifications, photo URLs) is in `homedepot_picks.json`. `python3 scraper/homedepot.py` turns that into `homedepot.jsonl` and downloads each main photo from Home Depot's image CDN into `images/homedepot/`; then run `build.py`. Every main photo was checked by eye: it must be a white-background product shot (no room scene, no dimension diagram), and products without one were left out. To add one, append it to `homedepot_picks.json` (set `main_image` to pin a specific photo) and rerun both scripts.
- **Home Depot base kitchen cabinets (26 modules, category `base_cabinet`):** three Hampton Bay lines, each in its standard widths: **Hampton** (satin white, raised panel, 12–36″ without 21″), **Shaker** (satin white, 12–36″) and **Designer Series Melvern** (white shaker, 12–36″). All are 24″ deep and 34.5″ tall. `family` is the line, which is how the app groups modules into runs: a line drawn with the sketch pen is filled with the fewest modules of one line that reach its length (`fillRun` in `app/app.js`), and the price is the sum of those real products.
- **Shopify brands (Burrow, Floyd, Maiden Home, …):** not included yet. Their `/products.json` gives prices but no dimensions, and their product pages are behind bot protection, so dimensions can't be scraped reliably. If we want a few premium pieces, add them by hand in a `data/manual.jsonl` using the same schema. `build.py` merges every `*.jsonl` automatically.
