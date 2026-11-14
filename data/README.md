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
- **Shopify brands (Burrow, Floyd, Maiden Home, …):** not included yet. Their `/products.json` gives prices but no dimensions, and their product pages are behind bot protection, so dimensions can't be scraped reliably. If we want a few premium pieces, add them by hand in a `data/manual.jsonl` using the same schema. `build.py` merges every `*.jsonl` automatically.
