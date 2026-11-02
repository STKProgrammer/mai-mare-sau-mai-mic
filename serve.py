"""
Server local pentru dezvoltare (in locul lui `python -m http.server`):
  - `Cache-Control: no-cache` pe toate raspunsurile
  - link-urile catre module JS / CSS / JSON primesc ?v=<pornirea serverului>, deci un browser
    care are in cache fisiere vechi (de la un server fara no-cache) le cere oricum din nou

    python serve.py            # http://localhost:8000
    python serve.py 9000
"""

import functools
import http.server
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent
WEB = ROOT / "web"
sys.path.insert(0, str(ROOT / "tools"))
from cache_bust import applies_to, bust  # noqa: E402

VERSION = f"dev{int(time.time())}"
TYPES = {".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8"}


class DevHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def do_GET(self):
        path = Path(self.translate_path(self.path))
        if path.is_dir():
            path = path / "index.html"
        if path.is_file() and applies_to(path.relative_to(WEB)):
            body, _ = bust(path.read_text(encoding="utf-8"), path.suffix, VERSION)
            data = body.encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", TYPES[path.suffix])
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
            return
        super().do_GET()


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    handler = functools.partial(DevHandler, directory=str(WEB))
    with http.server.ThreadingHTTPServer(("127.0.0.1", port), handler) as httpd:
        print(f"Servesc {WEB} pe http://localhost:{port}  (versiune {VERSION}, Ctrl+C pentru oprire)")
        httpd.serve_forever()


if __name__ == "__main__":
    main()
