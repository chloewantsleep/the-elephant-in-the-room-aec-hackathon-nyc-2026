"""Vercel serverless function: POST /api/render -> Gemini render. GET /api/render -> health check."""
import json
import os
import sys
from http.server import BaseHTTPRequestHandler

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _core as core  # noqa: E402


class handler(BaseHTTPRequestHandler):
    def _json(self, code, obj):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        self._json(200, {"key": bool(core.KEY), "model": core.MODEL,
                         "passcode": bool(os.environ.get("DEMO_PASSCODE"))})

    def do_POST(self):
        if not core.passcode_ok(self.headers):
            return self._json(401, {"error": "Passcode required", "passcode": True})
        try:
            req = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))))
            self._json(200, core.render(req))
        except Exception as e:  # surface the reason to the UI
            self._json(500, {"error": str(e)})
