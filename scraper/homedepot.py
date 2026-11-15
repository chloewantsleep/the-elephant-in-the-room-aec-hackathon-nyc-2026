"""Home Depot products, hand-picked.

homedepot.com blocks scripts (HTTP 403) and its terms forbid automated scraping, so this is not a crawler.
A small set of products was picked by hand in a normal browser session, and the facts read off each product
page (name, brand, price, rating, specifications, image URLs) were saved to data/homedepot_picks.json.

This script turns those picks into records in the same shape as the IKEA ones and downloads each product's
main photo from Home Depot's image CDN:

    python3 scraper/homedepot.py      # data/homedepot_picks.json -> data/homedepot.jsonl + data/images/homedepot/
    python3 scraper/build.py          # merge every source -> data/products.json

The main photo must be a white-background product shot (that is what the renders paste in), so for each
product the first white-background image in its gallery becomes `main`; products with none are skipped.
"""
import io
import json
import os
import re
import sys
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import DATA, ROOT, UA, record, write_jsonl  # noqa: E402

PICKS = os.path.join(DATA, "homedepot_picks.json")
IMG_DIR = os.path.join(DATA, "images", "homedepot")
TYPE = {"sofa": "Sofa", "armchair": "Accent chair", "coffee_table": "Coffee table", "side_table": "Side table",
        "floor_lamp": "Floor lamp", "pendant_lamp": "Pendant light", "shelving": "Bookcase", "rug": "Area rug",
        "desk": "Desk", "office_chair": "Office chair",
        "base_cabinet": "Base kitchen cabinet"}
HEX = {"white": "#ffffff", "black": "#000000", "gray": "#808080", "grey": "#808080", "brown": "#7b5a3c",
       "beige": "#d9c8a9", "blue": "#3b5b92", "green": "#4f7a4f", "gold": "#c9a227", "silver": "#c0c0c0",
       "natural": "#c8a97e", "red": "#a33a32", "pink": "#e6a9b8", "yellow": "#e0c040", "orange": "#d9822b",
       "ivory": "#f3eedd", "cream": "#f3e9d2", "multi-colored": "#999999", "bronze": "#8c6a3f", "brass": "#b5a642"}


def size(value):
    """'35.4 in' / '8 ft' / '7 ft. 10 in.' -> inches (float) or None."""
    if not value:
        return None
    v = value.lower().replace(",", "")
    ft = re.search(r"(\d+(?:\.\d+)?)\s*(?:ft|feet|')", v)
    inch = re.search(r"(\d+(?:\.\d+)?)\s*(?:in|\"|$)", re.sub(r"\d+(?:\.\d+)?\s*(?:ft\.?|feet|')", "", v))
    total = (float(ft.group(1)) * 12 if ft else 0) + (float(inch.group(1)) if inch else 0)
    return round(total, 2) or None


def spec(specs, *names):
    """The first spec whose name matches, trying the names in order (so the first name wins)."""
    for n in names:
        for k, v in specs.items():
            if re.fullmatch(n, k, re.I):
                return v
    return None


def dims(p):
    s = p["specs"]
    w = size(spec(s, r"(Product|Assembled) Width.*"))
    l = size(spec(s, r"(Product|Assembled) Length.*"))
    d = size(spec(s, r"(Product|Assembled) Depth.*"))
    h = size(spec(s, r"(Product|Assembled) Height.*")) or size(spec(s, r"Fixture Height.*"))
    dia = size(spec(s, r"(Product |Fixture |Shade )?Diameter.*"))
    if p["cat"] == "rug":   # rugs list width x length; height is the pile
        return {"width": max(filter(None, [w, l, d])), "depth": min(filter(None, [w, l, d])),
                "height": size(spec(s, r"Pile Height.*"))}
    if w and d and not l:   # chairs, sofas, lamps: the page's width and depth are already front-on
        return {"width": w, "depth": d, "height": h}
    horiz = [x for x in (w, l, d) if x] or ([dia, dia] if dia else [])
    if not horiz:
        return {"width": None, "depth": None, "height": h}
    # tables list a length: the long side faces you, so it's the width; the short side is the depth
    return {"width": max(horiz), "depth": min(horiz) if len(horiz) > 1 else (dia or None), "height": h}


def big(url):
    return re.sub(r"_\d+\.jpg$", "_1000.jpg", url)


def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read()


def white_bg(data):
    """True if the image border is (near) white: a cut-out product shot, not a room scene."""
    from PIL import Image
    im = Image.open(io.BytesIO(data)).convert("L")
    w, h = im.size
    px = im.load()
    edge = [px[x, y] for x in range(0, w, 8) for y in (1, h - 2)] + [px[x, y] for y in range(0, h, 8) for x in (1, w - 2)]
    return sum(v >= 238 for v in edge) / len(edge) > 0.92


BRANDS = {"Signature DESIGN BY ASHLEY": "Ashley", "TRIBESIGNS WAY TO ORIGIN": "Tribesigns",
          "Home Decorators Collection": "Home Decorators", "BOSS Office Products": "BOSS"}


def brand_of(p):
    b = p.get("brand") or "Home Depot"
    return BRANDS.get(b, b.title() if b.isupper() and len(b) > 5 else b)


def short_name(p):
    """'SAFAVIEH Alley 36 in. Brown Wood Coffee Table WIK6504B' -> 'Alley Brown Wood Coffee Table'"""
    n = p["name"]
    brand = p.get("brand") or ""
    if brand and n.lower().startswith(brand.lower()):
        n = n[len(brand):].strip()
    n = re.sub(r"\s+[A-Z0-9][A-Z0-9/-]*\d[A-Z0-9/-]*(\s+[A-Z]{2,3})?$", "", n)   # trailing model number
    n = re.split(r"\s+(?:with|for|in)\s+|,|\(", n)[0]                        # drop the sales tail
    n = re.sub(r"\b\d+(\.\d+)?\s*(in|ft)\.?(\s*(x|W|H|Tall|Wide)\b\.?)*(\s*\d+(\.\d+)?\s*(in|ft)\.?)?", "", n)   # sizes
    n = re.sub(r"\b\d+-(Watt|Light)\b", "", n)
    return re.sub(r"\s{2,}", " ", n).strip(" ,-")


def describe(p, color):
    s = p["specs"]
    # the material you see, not the cushion foam inside
    mat = spec(s, r"Upholstery Material", r"Top Material", r"Tabletop Material", r"Seat Material", r"Rug Material",
               r"Shade Material", r"Frame Material", r"Fixture Material", r"Lamp Base Material", r"Material")
    mats = [re.sub(r"\s*\(.*?\)", "", mat)] if mat else []
    shape = spec(s, r"Shape")
    shape = (shape or "").split(",")[0].lower()
    if shape in ("other", "rectangle", "rectangular") or p["cat"] in ("sofa", "armchair", "office_chair", "shelving"):
        shape = ""   # only worth saying for tables and lights ("round", "square", "bowl")
    mat = mats[0].lower() if mats else ""
    bits = [color, shape, "" if mat in color else mat, TYPE[p["cat"]].lower()]
    return re.sub(r"\s+", " ", " ".join(b for b in bits if b)).strip().capitalize() + "."


def main():
    picks = json.load(open(PICKS, encoding="utf-8"))
    os.makedirs(IMG_DIR, exist_ok=True)
    rows, skipped = [], []
    for p in picks:
        dm = dims(p)
        if not (dm["width"] and dm["height"] or p["cat"] == "rug" and dm["width"]):
            skipped.append((p["id"], "no dimensions"))
            continue
        main_url, local, context = None, None, None
        if p.get("main_image"):   # chosen by eye: the gallery's first white shot was a dimension diagram
            main_url, local = big(p["main_image"]), f"data/images/homedepot/{p['id']}.jpg"
            with open(os.path.join(ROOT, local), "wb") as f:
                f.write(get(main_url))
        for u in p["images"]:
            u = big(u)
            try:
                data = get(u)
            except Exception as e:   # noqa: BLE001
                skipped.append((p["id"], f"image {e}"))
                continue
            # a rug shot from above fills the frame, so its edges aren't white: its first photo is the product shot
            if (white_bg(data) or p["cat"] == "rug" and u == big(p["images"][0])) and not main_url:
                main_url, local = u, f"data/images/homedepot/{p['id']}.jpg"
                with open(os.path.join(ROOT, local), "wb") as f:
                    f.write(data)
            elif not white_bg(data) and not context:
                context = u
            if main_url and context:
                break
        if not main_url:
            skipped.append((p["id"], "no white-background photo"))
            continue
        s = p["specs"]
        color = (spec(s, r"Color/Finish", r"Color", r"Color Family") or "").strip()
        fam = (spec(s, r"Color Family") or color or "").lower()
        mats = sorted({m.strip().lower() for k, v in s.items() if "Material" in k for m in v.split(",") if m.strip()})
        rows.append(record(
            id=f"homedepot:{p['id']}", source="homedepot", brand=brand_of(p),
            # a pick may set its own display name, line (family) and description; cabinet modules do, so that
            # the modules of one line group into runs (app.js runLines)
            name=p.get("short") or short_name(p), category=p["cat"], type_name=TYPE[p["cat"]], variant=color or None,
            family=p.get("family") or (short_name(p).split(" ")[0] if short_name(p) else None),
            description=p.get("description") or describe(p, color.lower()),
            price={"amount": float(p["price"]), "currency": "USD"},
            dims_in=dm, dims_raw="; ".join(f"{k}: {v}" for k, v in s.items() if re.search(r"Width|Length|Depth|Height|Diameter", k)),
            materials=mats, colors=[{"name": fam, "hex": HEX.get(fam, "#999999")}] if fam else [],
            style_tags=[t.strip().lower() for t in (spec(s, r"Style") or "").split(",") if t.strip()],
            images={"main": main_url, "main_local": local, "context": context,
                    "gallery": [{"type": "main", "url": main_url, "alt": p["name"]}]
                               + ([{"type": "context", "url": context, "alt": p["name"]}] if context else [])},
            rating=p.get("rating"), url=p["url"]))
    write_jsonl(os.path.join(DATA, "homedepot.jsonl"), rows)
    print(f"{len(rows)} Home Depot products -> data/homedepot.jsonl")
    for pid, why in skipped:
        print("  skipped", pid, "-", why)


if __name__ == "__main__":
    main()
