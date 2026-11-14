"""Same team access gate as image rendering; no persistence of conversations on server."""
import json
from http.server import BaseHTTPRequestHandler
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _core as core
import _designer as designer
class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        status = 200
        try:
            if not core.passcode_ok(self.headers):
                status, result = 401, {'error':'Team passcode required'}
            else:
                length = int(self.headers.get('Content-Length',0))
                if not 0 < length <= 5000000: raise ValueError('Request too large')
                result = designer.chat(json.loads(self.rfile.read(length)))
        except Exception as e:
            status, result = 503, designer.client_error(e)
        body = json.dumps(result).encode()
        self.send_response(status)
        self.send_header('Content-Type','application/json')
        self.send_header('Cache-Control','no-store')
        self.end_headers()
        self.wfile.write(body)
