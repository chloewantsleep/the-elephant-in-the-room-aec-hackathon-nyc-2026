"""Local dev server: serves the UI and proxies render requests to Gemini.

    python3 server.py              # http://localhost:8000/app/
    python3 server.py --models     # list the image models your key can use
    python3 server.py --test       # render the demo room with a few real products -> renders/

The API key lives in .env (GEMINI_API_KEY=...) and never reaches the browser.
Python standard library only — nothing to install.
"""
import base64
import hashlib
import json
import mimetypes
import os
import sys
import time
import urllib.error
import urllib.request
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.abspath(__file__))
RENDERS = os.path.join(ROOT, "renders")
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
    if req.get("instruction"):
        lines += ["", "Extra instruction from the user: " + req["instruction"]]
    return "\n".join(lines)


def render(req):
    """req = {room_image, room:{width_in,depth_in}, needs:{style}, items:[{name, variant, category, qty,
    dims_in, description, image, pos}], instruction?} -> {image (data URL), model, ms, prompt}"""
    if not KEY:
        raise RuntimeError("No GEMINI_API_KEY. Put it in .env at the repo root.")
    # identical request (same photo, products, positions, model) -> reuse the earlier render instead of paying again
    key = hashlib.sha1((MODEL + json.dumps(req, sort_keys=True)).encode()).hexdigest()[:16]
    cache = os.path.join(RENDERS, "cache", key + ".json")
    if os.path.exists(cache) and not req.get("fresh"):
        with open(cache) as f:
            return {**json.load(f), "cached": True}
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
    out = {"image": f"data:{mime};base64,{img['data']}", "file": "renders/" + name,
           "model": MODEL, "ms": ms, "prompt": prompt}
    os.makedirs(os.path.dirname(cache), exist_ok=True)
    with open(cache, "w") as f:
        json.dump(out, f)
    return out


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    def _json(self, code, obj):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path == "/api/health":
            return self._json(200, {"key": bool(KEY), "model": MODEL})
        rel = os.path.relpath(self.translate_path(self.path), ROOT)
        if rel.startswith("..") or any(part.startswith(".") and part != "." for part in rel.split(os.sep)):
            return self._json(404, {"error": "not found"})  # never serve .env, .git, or anything outside the repo
        return super().do_GET()

    def do_POST(self):
        if self.path != "/api/render":
            return self._json(404, {"error": "not found"})
        try:
            req = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))))
            return self._json(200, render(req))
        except Exception as e:  # surface the reason to the UI
            return self._json(500, {"error": str(e)})

    def log_message(self, fmt, *args):
        if "/api/" in (args[0] if args else ""):
            super().log_message(fmt, *args)


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


if __name__ == "__main__":
    if "--models" in sys.argv:
        res = gemini("models?pageSize=200")
        for m in res.get("models", []):
            if "image" in m["name"] or "imagen" in m["name"]:
                print(m["name"], "|", ", ".join(m.get("supportedGenerationMethods", [])))
    elif "--test" in sys.argv:
        req = demo_request()
        print("products:", ", ".join(f"{i['name']} ({i['variant']})" for i in req["items"]))
        print(f"rendering with {MODEL} ...", flush=True)
        out = render(req)
        print(f"done in {out['ms'] / 1000:.1f}s -> {out['file']}")
    else:
        port = int(os.environ.get("PORT", 8000))
        print(f"Serving http://localhost:{port}/app/   (Gemini key: {'yes' if KEY else 'MISSING'}, model: {MODEL})")
        ThreadingHTTPServer(("127.0.0.1", port), Handler).serve_forever()
