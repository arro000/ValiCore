#!/usr/bin/env python3
"""Verify the assembled site's real HTTP representations and cache headers."""
import gzip
import hashlib
import importlib.util
import json
import threading
import urllib.error
import urllib.request
from http.server import ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("valicore_preview", ROOT / "tools/serve.py")
preview = importlib.util.module_from_spec(spec)
spec.loader.exec_module(preview)


class QuietHandler(preview.Handler):
    def log_message(self, *args):
        pass


def main():
    manifest = json.loads((ROOT / "site/dist/channels/v1/latest.json").read_text())
    server = ThreadingHTTPServer(("127.0.0.1", 0), QuietHandler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    base = f"http://127.0.0.1:{server.server_port}"

    def request(path, encoding="identity", method="GET", headers=None):
        return urllib.request.urlopen(urllib.request.Request(
            base + path, method=method, headers={"Accept-Encoding": encoding, **(headers or {})}
        ))

    try:
        for prefix in ["", "/ValiCore"]:
            assert list(manifest["datasets"]) == ["geo"]
            for resource in [*manifest["datasets"].values(), manifest["runtime"]["wasm"]]:
                path = prefix + "/dist/" + resource["url"].removeprefix("../../")
                with request(path) as response:
                    raw = response.read()
                    assert response.headers.get("Content-Encoding") is None
                    assert "immutable" in response.headers["Cache-Control"]
                    assert hashlib.sha256(raw).hexdigest() == resource["sha256"]
                with request(path, "gzip") as response:
                    compressed = response.read()
                    assert response.headers["Content-Encoding"] == "gzip"
                    assert response.headers["Vary"] == "Accept-Encoding"
                    assert gzip.decompress(compressed) == raw
                    assert int(response.headers["Content-Length"]) == len(compressed)
                    modified = response.headers["Last-Modified"]
                with request(path, "gzip, br") as response:
                    brotli = response.read()
                    assert response.headers["Content-Encoding"] == "br"
                    logical = Path(preview.ROOT / path.removeprefix(prefix).lstrip("/"))
                    assert brotli == Path(str(logical) + ".br").read_bytes()
                with request(path, "gzip;q=0,br;q=0") as response:
                    assert response.headers.get("Content-Encoding") is None
                    assert response.read() == raw
                with request(path, "gzip", method="HEAD") as response:
                    assert response.headers["Content-Encoding"] == "gzip"
                    assert response.read() == b""
                    assert int(response.headers["Content-Length"]) == len(compressed)
                try:
                    request(path, "gzip", headers={"If-Modified-Since": modified})
                    raise AssertionError("Expected conditional 304")
                except urllib.error.HTTPError as response:
                    assert response.code == 304
                # Explicit gzip assets are bytes, not HTTP-encoded JSON: the
                # wrapper verifies/decompresses this representation itself.
                with request(path + ".gz", "gzip, br") as response:
                    assert response.headers.get("Content-Encoding") is None
                    assert hashlib.sha256(response.read()).hexdigest() == resource["gzip"]["sha256"]
                print(f"{path}: raw={len(raw)} gzip={len(compressed)} brotli={len(brotli)} bytes")
            # Notices are shipped resources, even when no catalog is selected.
            channels = list((ROOT / "site/dist/channels/v1").glob("*.json"))
            for channel in channels:
                selected = json.loads(channel.read_text())
                ref = selected["notices"]
                path = prefix + "/dist/" + ref["url"].removeprefix("../../")
                with request(path) as response:
                    raw = response.read()
                    assert hashlib.sha256(raw).hexdigest() == ref["sha256"]
                    assert "immutable" in response.headers["Cache-Control"]
                index = json.loads(raw)
                assert index["formatVersion"] == 1
                for entry in index["files"]:
                    with request(path.removesuffix("index.json") + entry["url"]) as response:
                        content = response.read()
                        assert len(content) == entry["bytes"]
                        assert hashlib.sha256(content).hexdigest() == entry["sha256"]
                        assert "immutable" in response.headers["Cache-Control"]
            with request(prefix + "/dist/channels/v1/latest.json") as response:
                assert response.headers["Cache-Control"] == "no-cache"
        try:
            request("/dist/data/missing/places.json")
            raise AssertionError("Expected 404")
        except urllib.error.HTTPError as response:
            assert response.code == 404
            assert response.headers["Cache-Control"] == "no-cache"
        print("Distribution verification passed: hashes, gzip/Brotli, prefixes, HEAD, 304 and cache policy.")
    finally:
        server.shutdown()
        server.server_close()
        thread.join()


if __name__ == "__main__":
    main()
