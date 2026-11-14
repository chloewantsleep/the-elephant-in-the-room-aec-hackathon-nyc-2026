"""Merge every data/<source>.jsonl into data/products.json and write data/SUMMARY.md.

    python3 scraper/build.py
"""
import glob
import json
import os
import statistics
import sys
from collections import defaultdict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import CATEGORIES, DATA, ROOT, read_jsonl  # noqa: E402

REQUIRED = ["id", "source", "brand", "name", "category", "price", "dims_in", "images", "url"]


def problems(r):
    out = [k for k in REQUIRED if not r.get(k)]
    if r.get("category") not in CATEGORIES:
        out.append("category=" + str(r.get("category")))
    d = r.get("dims_in") or {}
    odd = [k for k, v in d.items() if v is not None and (v > 200 or v < 1)
           and not (r.get("category") == "rug" and k == "height")]
    if odd:
        out.append("implausible dims " + ",".join(odd))
    local = (r.get("images") or {}).get("main_local")
    if local and not os.path.exists(os.path.join(ROOT, local)):
        out.append("missing image file")
    return out


def main():
    rows, seen, bad = [], set(), []
    for path in sorted(glob.glob(os.path.join(DATA, "*.jsonl"))):
        for r in read_jsonl(path):
            p = problems(r)
            if p or r["id"] in seen:
                bad.append((r.get("id"), p or ["duplicate"]))
                continue
            seen.add(r["id"])
            rows.append(r)
    rows.sort(key=lambda r: (CATEGORIES.index(r["category"]), r["price"]["amount"]))
    with open(os.path.join(DATA, "products.json"), "w", encoding="utf-8") as f:
        json.dump(rows, f, ensure_ascii=False, indent=1)

    by_cat = defaultdict(list)
    for r in rows:
        by_cat[r["category"]].append(r)
    lines = ["# Product data summary", "",
             f"**{len(rows)} products** · {len({r['source'] for r in rows})} source(s) · "
             f"{sum(len(r['variants']) for r in rows)} extra colorways in `variants` · "
             f"scraped {max((r['scraped_at'] for r in rows), default='-')}", "",
             "| category | items | price min | median | max | colorways |",
             "|---|---|---|---|---|---|"]
    for c in CATEGORIES:
        items = by_cat.get(c, [])
        if not items:
            continue
        prices = [r["price"]["amount"] for r in items]
        lines.append(f"| {c} | {len(items)} | ${min(prices):,.0f} | ${statistics.median(prices):,.0f} | "
                     f"${max(prices):,.0f} | {sum(len(r['variants']) for r in items)} |")
    with open(os.path.join(DATA, "SUMMARY.md"), "w") as f:
        f.write("\n".join(lines) + "\n")
    print("\n".join(lines))
    if bad:
        print(f"\nskipped {len(bad)}:", bad[:10])

    # remove downloaded images that no longer belong to any product
    used = {os.path.normpath(os.path.join(ROOT, r["images"]["main_local"])) for r in rows if r["images"].get("main_local")}
    removed = 0
    for path in glob.glob(os.path.join(DATA, "images", "*", "*.jpg")):
        if os.path.normpath(path) not in used:
            os.remove(path)
            removed += 1
    if removed:
        print(f"removed {removed} unused images")


if __name__ == "__main__":
    main()
