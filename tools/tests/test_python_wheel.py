"""Offline malformed-input checks for platform-wheel staging, before native loading."""
import gzip
import hashlib
import importlib.util
import json
from pathlib import Path
import platform
import struct
import sys
import sysconfig
import tempfile
import tomllib
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("valicore_wheel_builder", ROOT / "tools/build_python_wheel.py")
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)


class WheelPreparationTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="valicore-wheel-input-test-")
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.composition = self.root / "native"
        notices = self.composition / "notices"
        (notices / "rust").mkdir(parents=True)
        (notices / "PROJECT-LICENSE").write_bytes(b"Project license fixture")
        (notices / "rust/COPYRIGHT-library.html").write_bytes(b"Rust notice fixture")
        entries = []
        for path in sorted(notices.rglob("*")):
            if path.is_file():
                entries.append(self.reference(path, path.relative_to(notices).as_posix()))
        (notices / "index.json").write_text(json.dumps({"formatVersion": 1, "files": entries}))
        native = self.composition / "runtime.fixture"
        native.write_bytes(b"Not executable: input staging fixture only")
        target = sysconfig.get_platform().lower().replace("-", "_")
        machine = platform.machine().lower()
        architecture = "ia32" if struct.calcsize("P") == 4 else (
            "x64" if target.endswith(("_amd64", "_x86_64")) else
            "arm64" if target.endswith(("_arm64", "_aarch64")) else
            {"x86_64": "x64", "amd64": "x64", "aarch64": "arm64", "arm64": "arm64"}.get(machine, machine))
        version = tomllib.loads((ROOT / "Cargo.toml").read_text())["workspace"]["package"]["version"]
        self.manifest = {"manifestVersion": 2, "runtimeName": "ValiCore", "engineVersion": version,
                         "runtimeApiMajor": 8, "loaderProtocol": 2, "components": ["fiscal", "geo"],
                         "modules": ["fiscal_identity", "geo_historical"], "operations": ["info", "create", "dispose"], "schemas": {"geo": 1},
                         "runtime": {"native": {**self.reference(native, native.name), "platform": sys.platform, "architecture": architecture}},
                         "notices": self.reference(notices / "index.json", "notices/index.json")}
        self.save()
        self.geographic = self.root / "custom.json.gz"
        data = {"schemaVersion": 1, "version": "custom-fixture", "sources": {}, "coverage": {}, "places": []}
        self.geographic.write_bytes(gzip.compress(json.dumps(data).encode(), mtime=0))

    @staticmethod
    def reference(path, url):
        data = path.read_bytes()
        return {"url": url, "sha256": hashlib.sha256(data).hexdigest(), "bytes": len(data)}

    def save(self):
        (self.composition / "manifest.json").write_text(json.dumps(self.manifest))

    def test_staging_preserves_source_bytes_notices_and_separate_data_identity(self):
        files, manifest = builder.prepare_bundle(self.composition, self.geographic)
        self.assertEqual(files["places.json.gz"], self.geographic.read_bytes())
        self.assertEqual(manifest["datasets"]["geo"]["version"], "custom-fixture")
        self.assertEqual(manifest["datasets"]["geo"]["sha256"], hashlib.sha256(files["places.json.gz"]).hexdigest())
        self.assertIn("notices/rust/COPYRIGHT-library.html", files)
        self.assertIn("DATA-NOTICE.md", files)
        self.assertNotIn("geo", builder.prepare_bundle(self.composition)[1]["datasets"])

    def test_tampered_runtime_wrong_platform_and_traversal_never_reach_native_probe(self):
        native = self.manifest["runtime"]["native"]
        original = dict(native)
        for replacement in [{"sha256": "0" * 64}, {"platform": "another-platform"},
                            {"architecture": "another-architecture"}, {"url": "../escape"}, {"bytes": True}]:
            self.manifest["runtime"]["native"] = {**original, **replacement}
            self.save()
            with self.subTest(replacement=replacement), patch.object(builder.subprocess, "run", side_effect=AssertionError("No native probe allowed")):
                with self.assertRaises(ValueError):
                    builder.build_wheel(self.composition, self.root / "not-promoted", self.geographic)
            self.assertFalse((self.root / "not-promoted").exists())

    def test_missing_notices_and_unavailable_provider_are_not_silently_omitted(self):
        self.manifest["components"] = ["fiscal"]
        self.manifest["schemas"] = {}
        self.save()
        with self.assertRaises(ValueError):
            builder.prepare_bundle(self.composition, self.geographic)
        self.manifest["notices"] = None
        self.save()
        with self.assertRaises(ValueError):
            builder.prepare_bundle(self.composition)

    def test_existing_output_is_never_replaced(self):
        output = self.root / "owned-by-user"
        output.mkdir()
        (output / "keep").write_text("Original user file")
        with patch.object(builder.subprocess, "run", side_effect=AssertionError("No build allowed")):
            with self.assertRaises(FileExistsError):
                builder.build_wheel(self.composition, output)
        self.assertEqual((output / "keep").read_text(), "Original user file")


if __name__ == "__main__":
    unittest.main(verbosity=2)
