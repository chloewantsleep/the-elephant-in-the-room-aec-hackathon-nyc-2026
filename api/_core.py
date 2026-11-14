"""Render core shared by the local dev server (server.py) and the Vercel function (api/render.py).

Sends the room photo + each product's white-background photo to Gemini and returns the render.
Python standard library only.
"""
import base64
import hashlib
import json
import mimetypes
import os
import time
import urllib.error
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # repo root
# Vercel functions can only write to /tmp; locally keep renders in the repo (gitignored)
RENDERS = "/tmp/renders" if os.environ.get("VERCEL") else os.path.join(ROOT, "renders")
API = "https://generativelanguage.googleapis.com/v1beta"


def load_env():
    path = os.path.join(ROOT, ".env")
    if os.path.exists(path):
        for line in open(path, encoding="utf-8"):
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


load_env()
KEY = os.environ.get("GEMINI_API_KEY", "")
MODEL = os.environ.get("GEMINI_IMAGE_MODEL", "gemini-3.1-flash-image")


def gemini(path, body=None, timeout=180):
    req = urllib.request.Request(
        f"{API}/{path}", data=json.dumps(body).encode() if body is not None else None,
        headers={"x-goog-api-key": KEY, "Content-Type": "application/json"},
        method="POST" if body is not None else "GET")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        detail = e.read().decode(errors="ignore")
        try:
            detail = json.loads(detail)["error"]["message"]
        except Exception:
            pass
        raise RuntimeError(f"Gemini HTTP {e.code}: {detail}") from None


def image_part(src):
    """src: data URL, repo-relative path, or http(s) URL -> Gemini inline_data part."""
    if src.startswith("data:"):
        head, b64 = src.split(",", 1)
        return {"inline_data": {"mime_type": head[5:].split(";")[0], "data": b64}}
    if src.startswith("http"):
        req = urllib.request.Request(src, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=30) as r:
            data, mime = r.read(), r.headers.get_content_type()
    else:
        path = os.path.normpath(os.path.join(ROOT, src.lstrip("/")))
        if not path.startswith(ROOT):
            raise ValueError("bad image path")
        data, mime = open(path, "rb").read(), mimetypes.guess_type(path)[0] or "image/jpeg"
    return {"inline_data": {"mime_type": mime, "data": base64.b64encode(data).decode()}}


def fmt_in(v):
    return "?" if v is None else f"{v:g}"


def where(pos):
    x, y = pos
    h = "left side" if x < 33 else "right side" if x > 66 else "center"
    v = "back / upper part" if y < 40 else "foreground" if y > 70 else "middle"
    return f"{h}, {v} of the frame (about {x:.0f}% from left, {y:.0f}% from top)"


def build_prompt(req):
    room = req.get("room", {})
    needs = req.get("needs", {})
    lines = [
        "You are a photorealistic interior visualization renderer.",
        "IMAGE 1 is a photo of the user's real room.",
        f"The following {len(req['items'])} images are REAL products shown on white backgrounds.",
        "",
        "Task: re-furnish the room in IMAGE 1 with exactly these products.",
        "- Keep the room's architecture, walls, windows, floor, ceiling, lighting direction and camera angle the same as IMAGE 1.",
        "- Remove or replace existing furniture of the same type so each listed product appears exactly once"
        " (unless a quantity is given).",
        "- Reproduce each product faithfully: same shape, proportions, color, material and details as its reference image."
        " Do not invent different furniture.",
        f"- True scale: the back wall is about {fmt_in(room.get('width_in'))} inches wide and the room is about"
        f" {fmt_in(room.get('depth_in'))} inches deep. Size every product from its real dimensions.",
        f"- Style of the scene: {needs.get('style', 'natural, warm')}. Small decor (plants, books, cushions) is fine,"
        " but no extra furniture.",
        "- Output one photorealistic, full-bleed image (no border or frame), natural light, same aspect ratio as IMAGE 1.",
        "",
        "Products:",
    ]
    for i, it in enumerate(req["items"], start=2):
        d = it.get("dims_in") or {}
        qty = f" x{it['qty']}" if it.get("qty", 1) > 1 else ""
        lines.append(
            f"IMAGE {i}: {it.get('category', 'item')}{qty} — {it.get('name')} ({it.get('variant') or ''}),"
            f" W {fmt_in(d.get('width'))} x D {fmt_in(d.get('depth'))} x H {fmt_in(d.get('height'))} in."
            + (f" {it['description']}" if it.get("description") else "")
            + (f" Place it: {where(it['pos'])}." if it.get("pos") else ""))
    if req.get("keep"):
        lines += ["", "Existing pieces in IMAGE 1 to KEEP exactly as they are (same look, same position; do not replace them):"]
        lines += [f"- {k.get('label')} ({k.get('category')}), {where(k['pos']) if k.get('pos') else ''}" for k in req["keep"]]
    if req.get("remove_existing"):
        lines += ["", "Existing pieces in IMAGE 1 to REMOVE (fill the area naturally with floor/wall behind them):"]
        lines += [f"- {k.get('label')} ({k.get('category')}), {where(k['pos']) if k.get('pos') else ''}"
                  for k in req["remove_existing"]]
    if req.get("instruction"):
        lines += ["", "Extra instruction from the user: " + req["instruction"]]
    return "\n".join(lines)


def build_edit_prompt(req):
    lines = [
        "You are editing an interior design render.",
        "IMAGE 1 is the current design. Make ONLY the changes listed below.",
        "Keep everything else exactly as in IMAGE 1: same room, camera angle, framing, lighting, and every other"
        " piece of furniture and decor in the same place and unchanged.",
        "",
        "Changes:",
    ]
    for i, it in enumerate(req.get("items", []), start=2):
        d = it.get("dims_in") or {}
        size = f"W {fmt_in(d.get('width'))} x D {fmt_in(d.get('depth'))} x H {fmt_in(d.get('height'))} in"
        target = f"the {it.get('category', 'item')} ({it['replaces']})" if it.get("replaces") else None
        what = f"IMAGE {i}: {it.get('name')} ({it.get('variant') or ''}), {size}."
        if target:
            lines.append(f"- Replace {target} with {what} Put it in the same spot, sized from its real dimensions.")
        else:
            lines.append(f"- Add {what} Place it: {where(it['pos']) if it.get('pos') else 'where it fits naturally'}.")
        if it.get("description"):
            lines.append(f"  ({it['description']})")
    for r in req.get("removed", []):
        lines.append(f"- Remove the {r.get('category')} ({r.get('name')}) and fill that area naturally with what is behind it.")
    lines += ["",
              "Reproduce each new product faithfully from its reference image: same shape, proportions, color and material.",
              "Output one photorealistic, full-bleed image (no border) with the same framing and aspect ratio as IMAGE 1."]
    return "\n".join(lines)


def render(req):
    """req = {room_image, room:{width_in,depth_in}, needs:{style}, items:[{name, variant, category, qty,
    dims_in, description, image, pos}], instruction?} -> {image (data URL), model, ms, prompt}"""
    if not KEY:
        raise RuntimeError("No GEMINI_API_KEY. Put it in .env (local) or the Vercel project env vars.")
    # identical request (same photo, products, positions, model) -> reuse the earlier render instead of paying again
    key = hashlib.sha1((MODEL + json.dumps(req, sort_keys=True)).encode()).hexdigest()[:16]
    cache = os.path.join(RENDERS, "cache", key + ".json")
    if os.path.exists(cache) and not req.get("fresh"):
        with open(cache) as f:
            return {**json.load(f), "cached": True}
    if req.get("mode") == "edit":
        prompt = build_edit_prompt(req)
        parts = [{"text": prompt}, {"text": "IMAGE 1 (current design):"}, image_part(req["base_image"])]
    else:
        prompt = build_prompt(req)
        parts = [{"text": prompt}, {"text": "IMAGE 1 (the room):"}, image_part(req["room_image"])]
    for i, it in enumerate(req["items"], start=2):
        parts += [{"text": f"IMAGE {i} ({it.get('name')}):"}, image_part(it["image"])]
    body = {"contents": [{"role": "user", "parts": parts}],
            "generationConfig": {"responseModalities": ["TEXT", "IMAGE"]}}
    t0 = time.time()
    res = gemini(f"models/{MODEL}:generateContent", body)
    ms = int((time.time() - t0) * 1000)
    out_parts = (res.get("candidates") or [{}])[0].get("content", {}).get("parts", [])
    img = next((p.get("inline_data") or p.get("inlineData") for p in out_parts
                if p.get("inline_data") or p.get("inlineData")), None)
    if not img:
        text = " ".join(p.get("text", "") for p in out_parts).strip()
        reason = (res.get("candidates") or [{}])[0].get("finishReason") or res.get("promptFeedback")
        raise RuntimeError(f"No image returned ({reason}). {text[:300]}")
    mime = img.get("mime_type") or img.get("mimeType") or "image/png"
    os.makedirs(RENDERS, exist_ok=True)
    name = time.strftime("%Y%m%d-%H%M%S") + (".png" if "png" in mime else ".jpg")
    with open(os.path.join(RENDERS, name), "wb") as f:
        f.write(base64.b64decode(img["data"]))
    out = {"image": f"data:{mime};base64,{img['data']}", "file": os.path.join(RENDERS, name),
           "model": MODEL, "ms": ms, "prompt": prompt}
    os.makedirs(os.path.dirname(cache), exist_ok=True)
    with open(cache, "w") as f:
        json.dump(out, f)
    return out


# ---------------------------------------------------------------------------------------------
# Existing furniture: detect it in the user's photo, then turn each piece into a clean product shot
# ---------------------------------------------------------------------------------------------
TEXT_MODEL = os.environ.get("GEMINI_TEXT_MODEL", "gemini-3.8-flash")
ISOLATE_MODEL = os.environ.get("GEMINI_ISOLATE_MODEL", MODEL)
CATEGORY_LIST = ("sofa, armchair, bed, dining_table, coffee_table, side_table, desk, office_chair, dining_chair, "
                 "stool_bench, dresser, nightstand, wardrobe, shelving, tv_stand, cabinet, floor_lamp, table_lamp, "
                 "pendant_lamp, rug, mirror, other")


def cached(kind, payload, fn):
    """Same input -> same answer, without paying again."""
    key = hashlib.sha1((kind + json.dumps(payload, sort_keys=True)).encode()).hexdigest()[:16]
    path = os.path.join(RENDERS, "cache", f"{kind}-{key}.json")
    if os.path.exists(path) and not payload.get("fresh"):
        with open(path) as f:
            return {**json.load(f), "cached": True}
    out = fn()
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as f:
        json.dump(out, f)
    return out


def detect(req):
    """req = {photo} -> {items:[{label, category, box (0-1000: ymin,xmin,ymax,xmax), description, dims_in}]}"""
    if not KEY:
        raise RuntimeError("No GEMINI_API_KEY.")

    def run():
        prompt = (
            "Find every piece of furniture and large decor in this room photo that someone could keep or replace: "
            "sofas, chairs, tables, beds, storage, shelves, lamps (floor, table, pendant), rugs, mirrors. "
            "Ignore walls, windows, curtains, small objects and plants. Only include items that are clearly visible.\n"
            "Return a JSON array (max 10), each element:\n"
            '{"label": short name like "grey 3-seat sofa", "category": one of [' + CATEGORY_LIST + '], '
            '"box_2d": [ymin, xmin, ymax, xmax] normalized to 0-1000, '
            '"description": one sentence on color, material, style, '
            '"dims_in": {"width": number, "depth": number, "height": number} estimated real size in inches}')
        body = {"contents": [{"role": "user", "parts": [image_part(req["photo"]), {"text": prompt}]}],
                "generationConfig": {"responseMimeType": "application/json", "temperature": 0.2}}
        t0 = time.time()
        res = gemini(f"models/{TEXT_MODEL}:generateContent", body)
        text = "".join(p.get("text", "") for p in res["candidates"][0]["content"]["parts"])
        raw = json.loads(text)
        items = []
        for it in raw if isinstance(raw, list) else raw.get("items", []):
            box = it.get("box_2d") or it.get("box")
            if not box or len(box) != 4:
                continue
            items.append({"label": it.get("label", "item"), "category": it.get("category", "other"),
                          "box": [max(0, min(1000, int(v))) for v in box],
                          "description": it.get("description", ""), "dims_in": it.get("dims_in") or {}})
        return {"items": items, "model": TEXT_MODEL, "ms": int((time.time() - t0) * 1000)}

    return cached("detect", {"photo": req["photo"], "m": TEXT_MODEL}, run)


def isolate(req):
    """req = {crop (data URL of the item cut from the photo), label, description} -> {image: white-bg isometric shot}"""
    if not KEY:
        raise RuntimeError("No GEMINI_API_KEY.")

    def run():
        prompt = (
            f"IMAGE 1 is a crop from a photo of someone's room. It shows their {req.get('label', 'furniture')}"
            + (f" ({req['description']})" if req.get("description") else "") + ".\n"
            "Create a clean e-commerce product photo of THIS EXACT piece:\n"
            "- isolated on a pure white background (#FFFFFF), no room, no floor, no other objects\n"
            "- isometric three-quarter view from slightly above, the whole object visible and centered\n"
            "- keep its exact shape, proportions, color, fabric/material and details; complete any part that is hidden\n"
            "- soft studio lighting, subtle contact shadow, square image")
        body = {"contents": [{"role": "user", "parts": [{"text": prompt}, image_part(req["crop"])]}],
                "generationConfig": {"responseModalities": ["TEXT", "IMAGE"]}}
        t0 = time.time()
        res = gemini(f"models/{ISOLATE_MODEL}:generateContent", body)
        parts = (res.get("candidates") or [{}])[0].get("content", {}).get("parts", [])
        img = next((p.get("inline_data") or p.get("inlineData") for p in parts
                    if p.get("inline_data") or p.get("inlineData")), None)
        if not img:
            raise RuntimeError("No image returned for " + req.get("label", "item"))
        mime = img.get("mime_type") or img.get("mimeType") or "image/png"
        return {"image": f"data:{mime};base64,{img['data']}", "model": ISOLATE_MODEL,
                "ms": int((time.time() - t0) * 1000)}

    return cached("isolate", {"crop": req["crop"], "label": req.get("label"), "m": ISOLATE_MODEL}, run)


def make_handler(fn):
    """Vercel Python function class for POST {json} -> fn(json)."""
    from http.server import BaseHTTPRequestHandler

    class Handler(BaseHTTPRequestHandler):
        def _json(self, code, obj):
            body = json.dumps(obj).encode()
            self.send_response(code)
            self.send_header("Content-Type", "application/json")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def do_GET(self):
            self._json(200, {"key": bool(KEY), "model": MODEL, "passcode": bool(os.environ.get("DEMO_PASSCODE"))})

        def do_POST(self):
            if not passcode_ok(self.headers):
                return self._json(401, {"error": "Passcode required", "passcode": True})
            try:
                self._json(200, fn(json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))))))
            except Exception as e:  # surface the reason to the UI
                self._json(500, {"error": str(e)})

    return Handler


def passcode_ok(headers):
    """If DEMO_PASSCODE is set (on Vercel), renders require the X-Passcode header. Keeps strangers from
    spending the team's Gemini credits. Locally, leave it unset."""
    want = os.environ.get("DEMO_PASSCODE", "")
    return not want or headers.get("X-Passcode", "") == want


def demo_request():
    """Demo room + a sofa, coffee table, armchair and floor lamp from the real dataset."""
    products = json.load(open(os.path.join(ROOT, "data", "products.json")))
    pick = {}
    for want, cat, pos in [("KIVIK", "sofa", [47, 55]), (None, "coffee_table", [53, 74]),
                           (None, "armchair", [13, 74]), (None, "floor_lamp", [77, 35])]:
        cands = [p for p in products if p["category"] == cat and (not want or p["family"] == want)]
        cands.sort(key=lambda p: -((p.get("rating") or {}).get("count") or 0))  # popular = recognizable
        pick[cat] = (cands[0], pos)
    items = [{"name": p["name"], "variant": p["variant"], "category": cat, "qty": 1, "dims_in": p["dims_in"],
              "description": p.get("description"), "image": p["images"]["main_local"] or p["images"]["main"], "pos": pos}
             for cat, (p, pos) in pick.items()]
    return {"room_image": "app/assets/demo-room.jpg", "room": {"width_in": 144, "depth_in": 132},
            "needs": {"style": "warm minimal"}, "items": items}
