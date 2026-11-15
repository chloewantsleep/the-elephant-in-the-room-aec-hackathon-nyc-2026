"""Local dev server: serves the UI and proxies render requests to Gemini.

    python3 server.py              # http://localhost:8000/app/
    python3 server.py --models     # list the image models your key can use
    python3 server.py --test       # render the demo room with a few real products -> renders/

The API key lives in .env (GEMINI_API_KEY=...) and never reaches the browser.
On Vercel the same logic runs as api/render.py. Python standard library only.
"""
import json
import os
import re
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "api"))
import _core as core  # noqa: E402
import _designer as designer

ROOT = core.ROOT

# Dev convenience: edit api/_core.py or .env, then just refresh the page (no server restart).
import importlib  # noqa: E402
import threading  # noqa: E402

_WATCH = [os.path.join(ROOT, "api", "_core.py"), os.path.join(ROOT, ".env")]
_mtimes = {p: os.path.getmtime(p) if os.path.exists(p) else 0 for p in _WATCH}
_reload_lock = threading.Lock()


def reload_if_changed():
    with _reload_lock:
        now = {p: os.path.getmtime(p) if os.path.exists(p) else 0 for p in _WATCH}
        if now == _mtimes:
            return
        env = os.path.join(ROOT, ".env")
        if now[env] != _mtimes[env] and os.path.exists(env):   # new values in .env win over the old ones
            for line in open(env, encoding="utf-8"):
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, v = line.split("=", 1)
                    os.environ[k.strip()] = v.strip().strip('"').strip("'")
        _mtimes.update(now)
        try:
            importlib.reload(core)
            print("reloaded api/_core.py", flush=True)
        except Exception as e:  # a half-saved file: keep the old code, try again next request
            _mtimes[_WATCH[0]] = 0
            print("reload failed:", e, flush=True)


def sketch(req):
    """POST /api/sketch -> read the user's marks (Claude, Gemini or simple rules; see sketch_ai.py)."""
    import sketch_ai
    return sketch_ai.read_sketch(req)


def sketch_engine():
    import sketch_ai
    return sketch_ai.engine()


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    def end_headers(self):
        # a normal refresh always gets the latest html/js/css; images keep the browser cache (no re-download flicker)
        if re.search(r"(\.(html|js|css|json)|/)$", self.path.split("?")[0]) or self.path.startswith("/api/"):
            self.send_header("Cache-Control", "no-store")
        # let the page open in VS Code Live Preview (another local port) call this server
        origin = self.headers.get("Origin", "")
        if re.fullmatch(r"https?://(localhost|127\.0\.0\.1)(:\d+)?", origin):
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Access-Control-Allow-Headers", "Content-Type, X-Passcode")
            self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        super().end_headers()

    def do_OPTIONS(self):   # CORS preflight from Live Preview
        self.send_response(204)
        self.end_headers()

    def _json(self, code, obj):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path.startswith("/api/"):
            reload_if_changed()
        if self.path == "/api/health":
            return self._json(200, {"key": bool(core.KEY), "model": core.MODEL,
                                    "sketch_engine": sketch_engine()})
        rel = os.path.relpath(self.translate_path(self.path), ROOT)
        if rel.startswith("..") or any(part.startswith(".") and part != "." for part in rel.split(os.sep)):
            return self._json(404, {"error": "not found"})  # never serve .env, .git, or anything outside the repo
        return super().do_GET()

    def do_POST(self):
        reload_if_changed()
        fn = {"/api/chat": designer.chat, "/api/render": core.render, "/api/detect": core.detect, "/api/isolate": core.isolate,
              "/api/sketch": sketch}.get(self.path)
        if not fn and self.path[5:] in getattr(core, "ENDPOINTS", ()):   # endpoints listed in _core.ENDPOINTS: reloaded with _core,
            fn = getattr(core, self.path[5:])                       # so a new one needs no server restart
        if not fn:
            return self._json(404, {"error": "not found"})
        try:
            if not core.passcode_ok(self.headers):
                return self._json(401, {"error": "Passcode required", "passcode": True})
            length = int(self.headers.get("Content-Length", 0))
            if not 0 < length <= 5000000: return self._json(413, {"error": "Request too large"})
            req = json.loads(self.rfile.read(length))
            return self._json(200, fn(req))
        except Exception as e:  # surface the reason to the UI
            return self._json(503, designer.client_error(e)) if self.path == "/api/chat" else self._json(500, {"error": str(e)})

    def log_message(self, fmt, *args):
        if "/api/" in (str(args[0]) if args else ""):   # args[0] is an HTTPStatus on errors (e.g. a 404 for favicon.ico)
            super().log_message(fmt, *args)


if __name__ == "__main__":
    if "--models" in sys.argv:
        res = core.gemini("models?pageSize=200")
        for m in res.get("models", []):
            if "image" in m["name"] or "imagen" in m["name"]:
                print(m["name"], "|", ", ".join(m.get("supportedGenerationMethods", [])))
    elif "--test" in sys.argv:
        req = core.demo_request()
        print("products:", ", ".join(f"{i['name']} ({i['variant']})" for i in req["items"]))
        print(f"rendering with {core.MODEL} ...", flush=True)
        out = core.render(req)
        print(f"done in {out['ms'] / 1000:.1f}s -> {out['file']}")
    else:
        port = int(os.environ.get("PORT", 8000))
        print(f"Serving http://localhost:{port}/app/   (Gemini key: {'yes' if core.KEY else 'MISSING'}, model: {core.MODEL},"
              f" sketches read by: {sketch_engine()})")
        ThreadingHTTPServer(("127.0.0.1", port), Handler).serve_forever()
