"""IKEA US scraper.

Step 1: IKEA's site search endpoint -> candidate items per category (name, price, images, color variants).
Step 2: each product page -> real measurements, materials, designer.

    python3 scraper/ikea.py --plan     # only show how many items each category would get
    python3 scraper/ikea.py            # full run -> data/ikea.jsonl
"""
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import CACHE, DATA, UA, fetch, parse_inches, record, write_jsonl  # noqa: E402

SEARCH = "https://sik.search.blue.cdtapps.com/us/en/search-result-page?q={q}&size=200&types=PRODUCT"
MAX_PER_FAMILY = 1  # one record per design family; other colorways go in `variants`
OVERSAMPLE = 1.6   # pick extra candidates, then keep only those with complete dims + image

# category, target, search queries, accept regex on typeName, reject regex on typeName
NOISE = r"outdoor|child|toy|conference|and \d chairs|cover|cushion|\bpad\b|pillow|\blegs?\b|bulb|hinge|knob|handle|insert|organizer|bracket"
PLAN = [
    ("sofa", 30, ["sofa", "sectional", "loveseat", "sleeper sofa"],
     r"sofa|sectional|loveseat", r"armrest|backrest|frame|section$|chaise section|corner section"),
    ("armchair", 20, ["armchair", "accent chair", "recliner", "rocking chair"],
     r"armchair|recliner|rocking|lounge chair|easy chair|chair", r"office|desk|dining|footstool|children|gaming|high chair|swivel chair"),
    ("bed", 25, ["bed frame", "daybed", "loft bed", "bunk bed", "storage bed", "upholstered bed"],
     r"bed", r"linen|spread|sheet|mattress|slatted|bedside|tray|canopy|tent|underbed|bed storage|rail|skirt|blanket|throw|crib|headboard|base"),
    ("dining_table", 18, ["dining table", "kitchen table", "extendable table", "bar table"],
     r"table", r"top|underframe|coffee|side|bedside|cloth|runner|lamp|children|tray|desk|wall-mounted|nest"),
    ("coffee_table", 16, ["coffee table"], r"coffee table", r"top"),
    ("side_table", 14, ["side table", "end table", "nesting tables"], r"side table|nest|end table", r"top|bedside"),
    ("desk", 16, ["desk", "standing desk", "computer desk"], r"desk", r"lamp|mat|top|accessor|shelf|chair|frame"),
    ("office_chair", 12, ["office chair", "desk chair", "gaming chair"],
     r"office chair|desk chair|swivel|gaming chair|conference chair", r"mat"),
    ("dining_chair", 18, ["dining chair", "kitchen chair"], r"chair", r"office|armchair|high chair|junior|child|gaming|swivel|lounge"),
    ("stool_bench", 12, ["bar stool", "stool", "bench"], r"stool|bench", r"step|workbench|tool"),
    ("dresser", 15, ["dresser", "chest of drawers"], r"dresser|chest of|drawers", r"mat|liner|lamp"),
    ("nightstand", 12, ["nightstand", "bedside table"], r"nightstand|bedside", r"lamp"),
    ("wardrobe", 12, ["wardrobe", "armoire", "clothes rack"], r"wardrobe|armoire|clothes rack|clothes stand",
     r"hanger|rail|door|frame|shelf$|drawer$|box|basket|light|lamp|mirror|bag|interior|fitting"),
    ("shelving", 18, ["bookcase", "shelving unit", "wall shelf"], r"bookcase|shelving unit|shelf unit|wall shelf|shelf",
     r"insert|clip|door|box|basket|liner|bookend|shoe|lamp|light|kitchen|bath|spice|bracket|support"),
    ("tv_stand", 12, ["tv stand", "tv unit", "media console"], r"tv|media", r"mount|lamp|remote"),
    ("cabinet", 15, ["sideboard", "storage cabinet", "buffet", "display cabinet"],
     r"sideboard|cabinet|buffet|cupboard|storage combination|display", r"bath|sink|wash|kitchen|door|front|lamp|light|frame|medicine|lock"),
    ("floor_lamp", 10, ["floor lamp"], r"floor lamp|floor uplighter|floor reading|floor", r"shade|cord|mat"),
    ("table_lamp", 10, ["table lamp", "desk lamp"], r"table lamp|desk lamp|work lamp|lamp", r"floor|pendant|shade|cord|ceiling|wall|led strip"),
    ("pendant_lamp", 8, ["pendant lamp", "ceiling lamp", "chandelier"], r"pendant|ceiling|chandelier", r"shade$|cord|canopy|hook|cable|track"),
    ("rug", 15, ["rug", "area rug", "runner", "round rug"], r"rug", r"underlay|anti-slip|bath|gripper"),
    ("mirror", 10, ["mirror", "floor mirror", "wall mirror"], r"mirror", r"cabinet|light|lamp|car|makeup|clip|hook|tile"),
]

MATERIAL_WORDS = [
    ("solid wood", r"solid (?:wood|pine|oak|birch|beech|acacia|ash|spruce|eucalyptus)"),
    ("wood veneer", r"veneer"), ("particleboard", r"particleboard"), ("fiberboard", r"fiberboard|mdf"),
    ("plywood", r"plywood"), ("bamboo", r"bamboo"), ("rattan", r"rattan"),
    ("steel", r"steel"), ("aluminum", r"alumin"), ("metal", r"\bmetal|iron"),
    ("glass", r"glass"), ("leather", r"leather"), ("cotton", r"cotton"), ("linen", r"linen"),
    ("wool", r"wool"), ("polyester", r"polyester"), ("velvet", r"velvet"), ("jute", r"jute"),
    ("plastic", r"polypropylene|plastic|abs\b|polycarbonate"), ("marble", r"marble"), ("stone", r"stone"),
]


def search(q):
    data = fetch(SEARCH.format(q=urllib.parse.quote(q)), min_interval=1.0, as_json=True)
    return [it["product"] for it in data["searchResultPage"]["products"]["main"]["items"] if "product" in it]


def select_candidates():
    """Round-robin across each category's queries, filter accessories, cap per family."""
    taken, out, report = set(), [], []
    for cat, target, queries, accept, reject in PLAN:
        lists = [search(q) for q in queries]
        fam_count, chosen = {}, []
        i = 0
        want = int(target * OVERSAMPLE) + 2
        while len(chosen) < want and any(i < len(l) for l in lists):
            for l in lists:
                if i >= len(l) or len(chosen) >= want:
                    continue
                p = l[i]
                tn = (p.get("typeName") or "").lower()
                if (p["id"] in taken or not p.get("onlineSellable")
                        or not re.search(accept, tn) or re.search(reject, tn) or re.search(NOISE, tn)
                        or not p.get("salesPrice", {}).get("numeral")):
                    continue
                fam = p["name"]
                if fam_count.get(fam, 0) >= MAX_PER_FAMILY:
                    continue
                fam_count[fam] = fam_count.get(fam, 0) + 1
                taken.add(p["id"])
                chosen.append((cat, p))
            i += 1
        report.append((cat, target, len(chosen), len(fam_count)))
        out += chosen
    return out, report


def _snake(s):
    return re.sub(r"[^a-z0-9]+", "_", s.lower()).strip("_")


def product_page(url, pid):
    """Extract measurements / materials / designer from a product page, cached as small JSON."""
    cdir = os.path.join(CACHE, "ikea_pip")
    os.makedirs(cdir, exist_ok=True)
    cpath = os.path.join(cdir, pid + ".json")
    if os.path.exists(cpath):
        with open(cpath) as f:
            return json.load(f)
    html = fetch(url, min_interval=1.0, cache=False)
    meas = []
    # A page has several measurement blocks (related products etc.). The product's own block is the
    # one right before the packaging section.
    m = (re.search(r'"measurements":\[(\{"measure":[^\]]*)\],"packaging":\{"id":"measurements-packaging"', html)
         or re.search(r'"measurements":\[(\{"measure":.*?)\]', html))
    if m:
        try:
            meas = json.loads("[" + m.group(1) + "]")
        except json.JSONDecodeError:
            meas = re.findall(r'\{"measure":"(.*?)","name":"(.*?)"', m.group(1))
            meas = [{"measure": a, "name": b} for a, b in meas]
    mats = re.findall(r'"material":"(.*?)","part"', html)
    des = re.search(r'"designerName":"(.*?)"', html)
    out = {"measurements": meas, "materials": mats[:12], "designer": des.group(1) if des else None}
    with open(cpath, "w") as f:
        json.dump(out, f)
    return out


def dims_from(measurements, category=None):
    named = {}
    for mm in measurements:
        v = parse_inches(mm.get("measure", "").replace('\\"', '"'))
        if v is not None:
            named[mm.get("name", "").strip()] = v

    def first(*keys):
        for k in keys:
            if named.get(k) is not None:
                return named[k]
        return None

    diameter = first("Diameter", "Shade diameter", "Base diameter", "Tabletop diameter")
    width = first("Width", "Max. width", "Min. width", "Ancho", "Bed width") or diameter
    depth = first("Depth", "Max. depth", "Min. depth", "Fondo", "Length", "Bed length") or diameter
    if (category != "bed" and named.get("Length") and named.get("Width") and not named.get("Depth")
            and named["Length"] > named["Width"]):
        # tables / desks / rugs: IKEA "Length" is the long side -> that is our width
        width, depth = named["Length"], named["Width"]
    height = first("Height", "Height including back cushions", "Max. height", "Min. height", "Total height",
                   "Altura", "Backrest height", "Thickness")
    if width is None and named.get("Width left") and named.get("Width right"):
        # L-shaped sectional: footprint is the longer side x the shorter side
        width = max(named["Width left"], named["Width right"])
        depth = depth or min(named["Width left"], named["Width right"])
    used = {"Width", "Depth", "Height", "Ancho", "Fondo", "Altura"}
    extra = {_snake(k): v for k, v in named.items() if k not in used}
    raw = "; ".join(f'{mm.get("name")}: {mm.get("measure")}' for mm in measurements) or None
    return {"width": width, "depth": depth, "height": height}, extra, raw


def materials_from(raw_list):
    text = " ".join(raw_list).lower()
    return [name for name, pat in MATERIAL_WORDS if re.search(pat, text)]


def to_record(cat, p, page):
    dims, extra, raw = dims_from(page["measurements"], cat)
    imgs = p.get("allProductImage") or []
    variants = []
    for v in (p.get("gprDescription") or {}).get("variants", [])[:12]:
        variants.append({
            "id": "ikea:" + v["id"],
            "variant": v.get("validDesignText"),
            "price": v.get("salesPrice", {}).get("numeral"),
            "image": v.get("mainImageUrl") or v.get("imageUrl"),
            "url": v.get("pipUrl"),
        })
    return record(
        id="ikea:" + p["id"], source="ikea", brand="IKEA",
        name=f'{p["name"]} {p.get("typeName", "")}'.strip(), category=cat,
        type_name=p.get("typeName"), variant=p.get("validDesignText"), family=p["name"],
        price={"amount": p["salesPrice"]["numeral"], "currency": p["salesPrice"].get("currencyCode", "USD")},
        dims_in=dims, dims_extra_in=extra, dims_raw=raw,
        materials=materials_from(page["materials"]),
        colors=[{"name": c.get("name"), "hex": "#" + c["hex"]} for c in p.get("colors", []) if c.get("hex")],
        designer=page.get("designer"),
        description=p.get("mainImageAlt"),
        images={"main": p.get("mainImageUrl"), "main_local": None, "context": p.get("contextualImageUrl"),
                "gallery": [{"type": i.get("type", "").replace("_PRODUCT_IMAGE", "").lower(),
                             "url": i["url"], "alt": i.get("altText")} for i in imgs if i.get("url")][:8]},
        variants=variants,
        rating={"value": p.get("ratingValue"), "count": p.get("ratingCount")} if p.get("ratingCount") else None,
        url=p.get("pipUrl"), in_stock=bool(p.get("onlineSellable")),
    )


def is_complete(r):
    """Render needs a clean image and real size. Mirrors may lack depth; rugs may lack height."""
    d = r["dims_in"]
    if not r["images"]["main"] or not d["width"]:
        return False
    if r["category"] == "mirror":
        return bool(d["height"])
    if r["category"] == "rug":
        return bool(d["depth"])
    return bool(d["depth"] and d["height"])


def download_image(r):
    """Save the white-background main image (1400px) so the demo never depends on ikea.com."""
    rel = os.path.join("images", "ikea", r["id"].split(":", 1)[1] + ".jpg")
    path = os.path.join(DATA, rel)
    if not os.path.exists(path):
        os.makedirs(os.path.dirname(path), exist_ok=True)
        req = urllib.request.Request(r["images"]["main"], headers={"User-Agent": UA})
        with urllib.request.urlopen(req, timeout=30) as resp, open(path, "wb") as f:
            f.write(resp.read())
        time.sleep(0.3)
    r["images"]["main_local"] = "data/" + rel


def main():
    cands, report = select_candidates()
    targets = {cat: t for cat, t, *_ in PLAN}
    print(f"{'category':14} target  candidates  families")
    for cat, target, got, fams in report:
        print(f"{cat:14} {target:6} {got:11}  {fams:8}")
    print("total candidates:", len(cands))
    if "--plan" in sys.argv:
        return
    rows, kept, failed, incomplete = [], {}, 0, 0
    for n, (cat, p) in enumerate(cands, 1):
        if kept.get(cat, 0) >= targets[cat]:
            continue
        try:
            r = to_record(cat, p, product_page(p["pipUrl"], p["id"]))
            if not is_complete(r):
                incomplete += 1
                continue
            download_image(r)
            rows.append(r)
            kept[cat] = kept.get(cat, 0) + 1
        except Exception as e:  # keep going; report at the end
            failed += 1
            print("  fail", p.get("pipUrl"), e, flush=True)
        if n % 25 == 0:
            print(f"  {n}/{len(cands)} candidates checked, {len(rows)} kept", flush=True)
            write_jsonl(os.path.join(DATA, "ikea.jsonl"), rows)
    write_jsonl(os.path.join(DATA, "ikea.jsonl"), rows)
    print("kept per category:", {c: f"{kept.get(c, 0)}/{t}" for c, t in targets.items()})
    print(f"done: {len(rows)} records kept, {incomplete} skipped (missing dims/image), {failed} failed")


if __name__ == "__main__":
    main()
