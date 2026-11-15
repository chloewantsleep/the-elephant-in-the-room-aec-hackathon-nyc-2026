"""Read my sketch: shapes drawn on the room photo -> the kind of furniture each one stands for.

    POST /api/sketch  (server.py locally, api/sketch.py on Vercel)

In the Space step, after uploading a photo, the user draws rough shapes where they want furniture
(a long box against the wall, a tall line in the corner, a circle under the ceiling...) and can add a word.
Each shape is read as one product type from the catalog (sofa, armchair, office chair, bench, floor lamp, ...)
plus a rough real-world width. The planner then designs around these sketched pieces.

Three readers, picked automatically (or force one with SKETCH_ENGINE=claude|gemini|rules in .env):
    claude  if ANTHROPIC_API_KEY is set   (vision: reads the shape in the context of the photo)
    gemini  if GEMINI_API_KEY is set      (vision, same key as the renders, about a cent per reading)
    rules   always available              (no AI, free: shape, position and size heuristics + the note)
If an AI reader fails (no credit, rate limit, network), the rules reader answers instead.
"""
import json
import os
import re
import statistics
import sys
import time

ROOT = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(ROOT, "api"))
import _core as core  # noqa: E402  (loads .env, Gemini helper, shared cache)

CLAUDE_MODEL = os.environ.get("SKETCH_MODEL", "claude-opus-5-5")
GEMINI_MODEL = os.environ.get("SKETCH_GEMINI_MODEL", core.TEXT_MODEL)

_sizes = None


def category_sizes():
    """{category: (min, median, max) width in inches} from the real catalog, so guesses stay buyable."""
    global _sizes
    if _sizes is None:
        products = json.load(open(os.path.join(ROOT, "data", "products.json"), encoding="utf-8"))
        widths = {}
        for p in products:
            w = (p.get("dims_in") or {}).get("width")
            if w:
                widths.setdefault(p["category"], []).append(w)
        _sizes = {c: (min(v), statistics.median(v), max(v)) for c, v in sorted(widths.items())}
    return _sizes


RUNS = {"base_cabinet": (12, 360)}   # sold in modules: the "width" is the whole run's length, not one module's


def clamp_width(cat, w):
    if cat in RUNS:
        lo, hi = RUNS[cat]
        return round(min(max(w or 96, lo), hi))
    lo, mid, hi = category_sizes().get(cat, (None, None, None))
    if not w or w <= 0:
        return round(mid) if mid else None
    return round(min(max(w, lo), hi)) if lo else round(w)


# ---------------------------------------------------------------- shared prompt (Claude + Gemini)

def instructions():
    sizes = "\n".join(f"- {c}: {lo:.0f}-{hi:.0f} in wide (typical {mid:.0f})"
                      for c, (lo, mid, hi) in category_sizes().items() if c not in RUNS)
    sizes += "\n- base_cabinet: a RUN of kitchen base cabinets, 12-360 in long (width_in = the whole run's length)"
    return f"""You read rough sketches on room photos for a furniture design app.

The image is a photo of the user's room. They drew numbered shapes on it (#1, #2, ...), each one where they
want a piece of furniture or lighting. Each shape also comes with its bounding box (percent of image width and
height) and sometimes a short typed note. Handwriting drawn on the image counts as a note too.

For every shape, decide which ONE product type it stands for. Use:
- the note first, if there is one ("bench", "something to read under", "desk")
- the shape: a long low rectangle against a wall reads as a sofa, bench or console; a tall thin vertical line
  as a floor lamp; a circle or blob hanging from the ceiling as a pendant lamp; a flat outline on the floor
  as a rug; a small square next to a seat as a side table; an L shape as a sofa; a box with a back as a chair;
  a straight line along the bottom of a wall (or a long thin strip) as a run of base kitchen cabinets
- where it sits in the room (floor, wall, ceiling, corner, next to what), and the kind of room
- its size relative to the room and to the furniture visible in the photo
Then estimate its real width in inches. The back wall is about the given width; use perspective and the
furniture in the photo for scale.

Product types you may use (with the real width range in our catalog):
{sizes}

If a shape could be two things, pick the more likely one and say so in the reason. Only put a shape in
"unclear" if you truly can't tell (for example a stray dot), with one short question.
reason: one short friendly sentence the user will read, e.g. "Tall thin line by the window, so a floor lamp."
summary: one sentence listing what you read."""


SCHEMA = {
    "type": "object",
    "properties": {
        "summary": {"type": "string"},
        "items": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "mark": {"type": "integer"},
                    "category": {"type": "string"},
                    "width_in": {"type": "number"},
                    "reason": {"type": "string"},
                },
                "required": ["mark", "category", "width_in", "reason"],
                "additionalProperties": False,
            },
        },
        "unclear": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {"mark": {"type": "integer"}, "question": {"type": "string"}},
                "required": ["mark", "question"],
                "additionalProperties": False,
            },
        },
    },
    "required": ["summary", "items", "unclear"],
    "additionalProperties": False,
}


def describe(req):
    room = req.get("room") or {}
    lines = [f"Room: {room.get('type', 'room')}, back wall about {core.fmt_in(room.get('width_in'))} in wide,"
             f" about {core.fmt_in(room.get('depth_in'))} in deep.", "", "Shapes:"]
    for m in req.get("marks") or []:
        x0, y0, x1, y1 = m["box"]
        note = f' note: "{m["note"]}"' if m.get("note") else " (no note)"
        lines.append(f"#{m['n']} box {x0:.0f}-{x1:.0f}% from left, {y0:.0f}-{y1:.0f}% from top;{note}")
    return "\n".join(lines)


# ---------------------------------------------------------------- reader 1: Claude

def ask_claude(req):
    import anthropic  # only this reader needs the package: python -m pip install anthropic

    head, b64 = req["image"].split(",", 1)
    client = anthropic.Anthropic()
    try:
        msg = client.beta.messages.create(
            model=CLAUDE_MODEL,
            max_tokens=16000,
            system=[{"type": "text", "text": instructions(), "cache_control": {"type": "ephemeral"}}],
            messages=[{"role": "user", "content": [
                {"type": "image", "source": {"type": "base64", "media_type": head[5:].split(";")[0], "data": b64}},
                {"type": "text", "text": describe(req)},
            ]}],
            output_config={"effort": "medium", "format": {"type": "json_schema", "schema": SCHEMA}},
            # if a safety classifier declines, the API retries on a fallback model inside the same call
            betas=["server-side-fallback-2026-07-01"],
            fallbacks="default",
        )
    except anthropic.AuthenticationError:
        raise RuntimeError("Claude rejected the ANTHROPIC_API_KEY in .env") from None
    except anthropic.RateLimitError:
        raise RuntimeError("Claude is rate limited right now") from None
    except anthropic.APIStatusError as e:
        raise RuntimeError(f"Claude HTTP {e.status_code}: {e.message}") from None
    except anthropic.APIConnectionError:
        raise RuntimeError("Can't reach the Claude API") from None
    if msg.stop_reason in ("refusal", "max_tokens"):
        raise RuntimeError(f"Claude stopped early ({msg.stop_reason})")
    return json.loads(next(b.text for b in msg.content if b.type == "text")), msg.model


# ---------------------------------------------------------------- reader 2: Gemini (same key as the renders)

def ask_gemini(req):
    prompt = (instructions() + "\n\n" + describe(req) + "\n\nAnswer with JSON only, exactly this shape:\n"
              '{"summary": str, "items": [{"mark": int, "category": str, "width_in": number, "reason": str}],'
              ' "unclear": [{"mark": int, "question": str}]}')
    body = {"contents": [{"role": "user", "parts": [core.image_part(req["image"]), {"text": prompt}]}],
            "generationConfig": {"responseMimeType": "application/json", "temperature": 0.2}}
    res = core.gemini(f"models/{GEMINI_MODEL}:generateContent", body, timeout=50)
    out = json.loads("".join(p.get("text", "") for p in res["candidates"][0]["content"]["parts"]))
    return (out if isinstance(out, dict) else {"items": out}), GEMINI_MODEL


# ---------------------------------------------------------------- reader 3: rules (no AI, no key, free)

# note keyword -> category (first match wins, so longer phrases come first)
CATEGORY_WORDS = [
    ("kitchen cabinet", "base_cabinet"), ("base cabinet", "base_cabinet"), ("cabinet run", "base_cabinet"),
    ("countertop", "base_cabinet"), ("counter", "base_cabinet"), ("kitchen", "base_cabinet"),
    ("coffee table", "coffee_table"), ("side table", "side_table"), ("end table", "side_table"),
    ("dining table", "dining_table"), ("dining chair", "dining_chair"), ("office chair", "office_chair"),
    ("desk chair", "office_chair"), ("table lamp", "table_lamp"), ("desk lamp", "table_lamp"),
    ("floor lamp", "floor_lamp"), ("reading lamp", "floor_lamp"), ("ceiling", "pendant_lamp"),
    ("pendant", "pendant_lamp"), ("chandelier", "pendant_lamp"), ("tv", "tv_stand"), ("media", "tv_stand"),
    ("nightstand", "nightstand"), ("bedside", "nightstand"), ("sideboard", "cabinet"), ("cabinet", "cabinet"),
    ("console", "cabinet"), ("bookcase", "shelving"), ("bookshelf", "shelving"), ("shelf", "shelving"),
    ("shelves", "shelving"), ("storage", "shelving"), ("wardrobe", "wardrobe"), ("closet", "wardrobe"),
    ("dresser", "dresser"), ("drawers", "dresser"), ("armchair", "armchair"), ("accent chair", "armchair"),
    ("lounge chair", "armchair"), ("sofa", "sofa"), ("couch", "sofa"), ("loveseat", "sofa"),
    ("bench", "stool_bench"), ("stool", "stool_bench"), ("ottoman", "stool_bench"), ("pouf", "stool_bench"),
    ("mirror", "mirror"), ("rug", "rug"), ("carpet", "rug"), ("bed", "bed"), ("desk", "desk"),
    ("lamp", "floor_lamp"), ("light", "floor_lamp"), ("chair", "armchair"), ("seat", "armchair"),
    ("table", "side_table"),
]
# room-specific readings of the same shape: (living, bedroom, dining, office)
BY_ROOM = {
    "wide": ("sofa", "bed", "dining_table", "desk"),
    "low": ("coffee_table", "stool_bench", "stool_bench", "stool_bench"),
    "seat": ("armchair", "armchair", "dining_chair", "office_chair"),
    "small": ("side_table", "nightstand", "side_table", "side_table"),
    "wall_box": ("cabinet", "dresser", "cabinet", "shelving"),
}
ROOM_COL = {"living": 0, "bedroom": 1, "dining": 2, "office": 3}
LABEL = {"sofa": "sofa", "bed": "bed", "dining_table": "dining table", "desk": "desk", "coffee_table": "coffee table",
         "stool_bench": "bench", "armchair": "armchair", "dining_chair": "dining chair", "office_chair": "office chair",
         "side_table": "side table", "nightstand": "nightstand", "cabinet": "sideboard", "dresser": "dresser",
         "shelving": "shelf", "floor_lamp": "floor lamp", "pendant_lamp": "pendant lamp", "rug": "rug",
         "mirror": "mirror", "table_lamp": "table lamp", "wardrobe": "wardrobe", "tv_stand": "TV stand",
         "base_cabinet": "run of base cabinets"}


def note_category(note):
    t = " " + " ".join(re.findall(r"[a-z]+", (note or "").lower())) + " "
    return next((cat for kw, cat in CATEGORY_WORDS if f" {kw} " in t or f" {kw}s " in t), None)


def shape_category(m, room):
    """Guess a type from the shape alone: proportions, where it sits, how big it is."""
    x0, y0, x1, y1 = m["box"]
    w, h, cy = max(x1 - x0, 0.5), max(y1 - y0, 0.5), (y0 + y1) / 2
    col = ROOM_COL.get(room, 0)
    if y1 < 30:
        return "pendant_lamp", "Up by the ceiling"
    if h > 2.2 * w and h > 14:
        return ("floor_lamp", "Tall and thin") if y1 > 55 else ("mirror", "Tall shape on the wall")
    if cy > 72 and h < 0.4 * w and w > 25:
        return "rug", "Flat outline on the floor"
    if y1 < 55:
        return ("shelving", "Big shape on the wall") if h > 18 else (BY_ROOM["wall_box"][col], "Box on the wall")
    if w > 30:
        return BY_ROOM["wide"][col], "Long shape along the wall"
    if h < 0.6 * w and w > 12:
        return BY_ROOM["low"][col], "Low and wide"
    if w > 9:
        return BY_ROOM["seat"][col], "Seat-sized shape"
    return BY_ROOM["small"][col], "Small shape"


def read_rules(req):
    room, wall = req.get("room") or {}, (req.get("room") or {}).get("width_in") or 144
    items, unclear = [], []
    for m in req.get("marks") or []:
        x0, y0, x1, y1 = m["box"]
        if (x1 - x0) < 1.5 and (y1 - y0) < 1.5 and not m.get("note"):
            unclear.append({"mark": m["n"], "question": "That's a tiny mark. Draw the piece's outline, or add a word."})
            continue
        cat = note_category(m.get("note"))
        why = f'You wrote "{m["note"]}"' if cat else None
        if not cat:
            cat, why = shape_category(m, room.get("key"))
        name = LABEL.get(cat, cat.replace("_", " "))
        items.append({"mark": m["n"], "category": cat, "width_in": (x1 - x0) / 100 * wall,
                      "reason": f"{why}, so {'an' if name[0] in 'aeiou' else 'a'} {name}."})
    names = [LABEL.get(i["category"], i["category"]) for i in items]
    return {"summary": ("I read: " + ", ".join(names) + ".") if names else "", "items": items, "unclear": unclear}


# ---------------------------------------------------------------- entry point

def validate(out, req):
    """Keep readings the planner can use (a known product type); everything else becomes a question."""
    marks = {m["n"] for m in req.get("marks") or []}
    sizes = category_sizes()
    items, unclear, seen = [], list(out.get("unclear") or []), set()
    for it in out.get("items") or []:
        n, cat = it.get("mark"), (it.get("category") or "").strip().lower().replace(" ", "_")
        if n not in marks or n in seen:
            continue
        if cat not in sizes:
            cat = note_category(cat.replace("_", " ")) or ""
        if cat not in sizes:
            unclear.append({"mark": n, "question": "What kind of piece is this? Pick a type below."})
            continue
        seen.add(n)
        items.append({"mark": n, "category": cat, "width_in": clamp_width(cat, it.get("width_in")),
                      "reason": it.get("reason", "")})
    return sorted(items, key=lambda i: i["mark"]), unclear


def engine():
    forced = os.environ.get("SKETCH_ENGINE", "").lower()
    if forced in ("claude", "gemini", "rules"):
        return forced
    if os.environ.get("ANTHROPIC_API_KEY"):
        return "claude"
    return "gemini" if core.KEY else "rules"


def read_sketch(req):
    """req = {image (photo with the shapes drawn on, data URL), marks:[{n, box:[x0,y0,x1,y1] %, note}],
    room:{key, type, width_in, depth_in}}
    -> {summary, items:[{mark, category, width_in, reason}], unclear, engine, model, ms, note?}"""
    if not req.get("marks"):
        raise ValueError("Draw at least one shape first")
    eng = "rules" if req.get("quick") else engine()   # quick: free instant guesses, no AI (the Done button)

    def answer(reader, used):
        t0 = time.time()
        out, model = reader(req)
        items, unclear = validate(out, req)
        return {"summary": out.get("summary", ""), "items": items, "unclear": unclear, "engine": used,
                "model": model, "ms": int((time.time() - t0) * 1000)}

    rules = lambda r: (read_rules(r), "rules")  # noqa: E731
    if eng == "rules":
        return answer(rules, "rules")  # free and instant, nothing to cache
    ai = ask_claude if eng == "claude" else ask_gemini
    try:
        # the same sketch gives the same answer, so don't pay twice (only AI answers are cached)
        return core.cached("sketch", {**req, "engine": eng, "m": CLAUDE_MODEL if eng == "claude" else GEMINI_MODEL},
                           lambda: answer(ai, eng))
    except Exception as e:  # no credit, rate limit, network... the demo still works with the rules reader
        return {**answer(rules, "rules"),
                "note": f"{eng.capitalize()} unavailable ({str(e)[:90]}), so I read the shapes with simple rules."}
