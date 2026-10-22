#!/usr/bin/env python3
"""Serve the assembled site under its GitHub Pages repository prefix."""
import argparse
import re
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit

ROOT = Path(__file__).resolve().parents[1] / "site"


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def translate_path(self, path):
        prefix = "/ValiCore"
        if path.startswith(prefix + "/"):
            path = path[len(prefix):]
        return super().translate_path(path)

    def send_response(self, code, message=None):
        self._status = code
        super().send_response(code, message)

    def send_head(self):
        self._encoding = None
        self._content_type = None
        original = self.path
        parts = urlsplit(original)
        path = Path(self.translate_path(original))
        if path.is_file() and path.suffix in {".json", ".wasm"}:
            qualities = {}
            for item in self.headers.get("Accept-Encoding", "").split(","):
                name, *parameters = item.strip().lower().split(";")
                quality = 1.0
                for parameter in parameters:
                    if parameter.strip().startswith("q="):
                        try:
                            quality = float(parameter.strip()[2:])
                        except ValueError:
                            quality = 0.0
                qualities[name] = quality if 0 <= quality <= 1 else 0.0
            variants = [(qualities.get(name, qualities.get("*", 0)), name, suffix)
                        for name, suffix in [("gzip", ".gz"), ("br", ".br")]
                        if Path(str(path) + suffix).is_file()]
            if variants:
                quality, name, suffix = max(variants, key=lambda item: (item[0], item[1] == "br"))
                if quality > 0 and qualities.get("identity", 0) <= quality:
                    self._encoding = name
                    self._content_type = "application/wasm" if path.suffix == ".wasm" else "application/json"
                    self.path = urlunsplit(parts._replace(path=parts.path + suffix))
        try:
            return super().send_head()
        finally:
            self.path = original

    def guess_type(self, path):
        return self._content_type or super().guess_type(path)

    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        path = urlsplit(self.path).path.removeprefix("/ValiCore")
        immutable = re.match(r"^/dist/(?:(?:runtime|data|notices)/[^/]+/|releases/[^/]+\.json$)", path)
        cacheable = immutable and getattr(self, "_status", None) in {200, 304}
        self.send_header("Cache-Control", "public, max-age=31536000, immutable" if cacheable else "no-cache")
        self.send_header("Vary", "Accept-Encoding")
        if getattr(self, "_encoding", None):
            self.send_header("Content-Encoding", self._encoding)
        super().end_headers()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8080)
    args = parser.parse_args()
    if not (ROOT / "demo/index.html").exists():
        parser.error("Preview site is missing. Run npm run build:preview first.")
    print(f"Serving http://127.0.0.1:{args.port}/demo/", flush=True)
    ThreadingHTTPServer(("0.0.0.0", args.port), Handler).serve_forever()
