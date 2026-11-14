"""Local dev server: serves the UI and proxies render requests to Gemini.

    python3 server.py              # http://localhost:8000/app/
    python3 server.py --models     # list the image models your key can use
    python3 server.py --test       # render the demo room with a few real products -> renders/

The API key lives in .env (GEMINI_API_KEY=...) and never reaches the browser.
On Vercel the same logic runs as api/render.py. Python standard library only.
"""
import json
import os
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "api"))
import _core as core  # noqa: E402
import _designer as designer

ROOT = core.ROOT


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
            return self._json(200, {"key": bool(core.KEY), "model": core.MODEL})
        rel = os.path.relpath(self.translate_path(self.path), ROOT)
        if rel.startswith("..") or any(part.startswith(".") and part != "." for part in rel.split(os.sep)):
            return self._json(404, {"error": "not found"})  # never serve .env, .git, or anything outside the repo
        return super().do_GET()

    def do_POST(self):
        if self.path not in ("/api/render", "/api/chat"):
            return self._json(404, {"error": "not found"})
        try:
            if not core.passcode_ok(self.headers):
                return self._json(401, {"error": "Passcode required", "passcode": True})
            length = int(self.headers.get("Content-Length", 0))
            if not 0 < length <= 5000000: return self._json(413, {"error": "Request too large"})
            req = json.loads(self.rfile.read(length))
            return self._json(200, (designer.chat(req) if self.path == "/api/chat" else core.render(req)))
        except Exception as e:  # surface the reason to the UI
            return self._json(500, {"error": str(e)})

    def log_message(self, fmt, *args):
        if "/api/" in str(args[0] if args else ""):
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
        print(f"Serving http://localhost:{port}/app/   (Gemini key: {'yes' if core.KEY else 'MISSING'}, model: {core.MODEL})")
        ThreadingHTTPServer(("127.0.0.1", port), Handler).serve_forever()
