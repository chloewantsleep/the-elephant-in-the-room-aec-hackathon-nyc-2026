"""Shared helpers: polite cached HTTP, unit parsing, the product record shape."""
import hashlib
import json
import os
import re
import time
import urllib.error
import urllib.request
from datetime import date

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")
CACHE = os.path.join(DATA, "cache")
UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/130.0 Safari/537.36")

# Canonical categories used across every source.
CATEGORIES = [
    "sofa", "armchair", "bed", "dining_table", "coffee_table", "side_table",
    "desk", "office_chair", "dining_chair", "stool_bench", "dresser",
    "nightstand", "wardrobe", "shelving", "tv_stand", "cabinet", "base_cabinet",
    "floor_lamp", "table_lamp", "pendant_lamp", "rug", "mirror",
]

_last_request = {}


def fetch(url, min_interval=1.0, retries=4, as_json=False, cache=True):
    """GET with optional on-disk cache, per-host rate limit and backoff on 429/5xx."""
    os.makedirs(CACHE, exist_ok=True)
    key = hashlib.sha1(url.encode()).hexdigest()
    path = os.path.join(CACHE, key)
    if cache and os.path.exists(path):
        with open(path, encoding="utf-8") as f:
            body = f.read()
        return json.loads(body) if as_json else body

    host = url.split("/")[2]
    for attempt in range(retries):
        wait = min_interval - (time.time() - _last_request.get(host, 0))
        if wait > 0:
            time.sleep(wait)
        _last_request[host] = time.time()
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Language": "en-US"})
            with urllib.request.urlopen(req, timeout=30) as r:
                body = r.read().decode("utf-8", errors="ignore")
            if cache:
                with open(path, "w", encoding="utf-8") as f:
                    f.write(body)
            return json.loads(body) if as_json else body
        except urllib.error.HTTPError as e:
            if e.code in (429, 500, 502, 503) and attempt < retries - 1:
                time.sleep(10 * (attempt + 1) ** 2)
                continue
            raise
        except (urllib.error.URLError, TimeoutError):
            if attempt < retries - 1:
                time.sleep(5 * (attempt + 1))
                continue
            raise


_UNICODE_FRAC = {"½": 0.5, "¼": 0.25, "¾": 0.75, "⅛": 0.125, "⅜": 0.375,
                 "⅝": 0.625, "⅞": 0.875, "⅓": 1 / 3, "⅔": 2 / 3}


def parse_inches(text):
    """'89 3/8 "' / '22 ½ "' / '36"' / '91 cm' -> float inches, or None."""
    if not text:
        return None
    t = text.strip().replace("″", '"').replace("”", '"').replace("′", "'").replace("’", "'")
    if "'" in t:  # feet + inches, e.g. 4 ' 11 "
        feet, rest = t.split("'", 1)
        try:
            ft = float(feet.strip())
        except ValueError:
            return None
        inch = parse_inches(rest) if rest.strip(' "') else 0
        return round(ft * 12 + (inch or 0), 3)
    is_cm = bool(re.search(r"\bcm\b", t))
    is_mm = bool(re.search(r"\bmm\b", t))
    m = re.match(r"\s*(\d+(?:\.\d+)?)?\s*(?:(\d+)\s*/\s*(\d+))?\s*([½¼¾⅛⅜⅝⅞⅓⅔])?", t)
    if not m or not any(m.groups()):
        return None
    whole, num, den, uf = m.groups()
    val = float(whole or 0)
    if num and den and float(den):
        val += float(num) / float(den)
    if uf:
        val += _UNICODE_FRAC[uf]
    if val == 0:
        return None
    if is_cm:
        val /= 2.54
    elif is_mm:
        val /= 25.4
    return round(val, 3)


def record(**kw):
    """Build a product record in the canonical field order (see schema/product.schema.json)."""
    base = {
        "id": None, "source": None, "brand": None, "name": None, "category": None,
        "type_name": None, "variant": None, "family": None, "description": None,
        "price": None, "dims_in": {"width": None, "depth": None, "height": None},
        "dims_extra_in": {}, "dims_raw": None,
        "materials": [], "colors": [], "style_tags": [], "designer": None,
        "images": {"main": None, "main_local": None, "context": None, "gallery": []},
        "variants": [], "rating": None, "url": None, "in_stock": None,
        "scraped_at": date.today().isoformat(),
    }
    base.update(kw)
    return base


def write_jsonl(path, rows):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        for r in rows:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")


def read_jsonl(path):
    if not os.path.exists(path):
        return []
    with open(path, encoding="utf-8") as f:
        return [json.loads(line) for line in f if line.strip()]
