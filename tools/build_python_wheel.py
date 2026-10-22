#!/usr/bin/env python3
"""Build an offline platform wheel from an explicit trusted native composition.

No Rust compilation, downloads, source synchronization or registry publication.
"""
from __future__ import annotations

import argparse
import gzip
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import platform
import re
import shutil
import struct
import subprocess
import sys
import sysconfig
import tempfile
import tomllib
import zipfile

ROOT = Path(__file__).resolve().parents[1]


def digest(data):
    return hashlib.sha256(data).hexdigest()


def resource(directory, reference):
    if (not isinstance(reference, dict) or not isinstance(reference.get("url"), str)
            or "\\" in reference["url"] or ":" in reference["url"]):
        raise ValueError("Resource must have a relative local URL")
    name = reference["url"]
    parts = name.split("/")
    if not name or any(part in ("", ".", "..") for part in parts) or PurePosixPath(name).is_absolute():
        raise ValueError("Resource path escapes its directory")
    path = directory / name
    if path.is_symlink() or not path.is_file() or not path.resolve().is_relative_to(directory.resolve()):
        raise ValueError("Resource must be a regular file inside its directory")
    data = path.read_bytes()
    if (not isinstance(reference.get("sha256"), str)
            or not re.fullmatch(r"[a-f0-9]{64}", reference["sha256"])
            or digest(data) != reference["sha256"]
            or ("bytes" in reference and (type(reference["bytes"]) is not int or len(data) != reference["bytes"]))):
        raise ValueError("Resource hash/length differs from its manifest")
    return data


def prepare_bundle(composition, geographic=None):
    manifest = json.loads((composition / "manifest.json").read_bytes())
    version = tomllib.loads((ROOT / "Cargo.toml").read_text())["workspace"]["package"]["version"]
    if (not isinstance(manifest, dict) or type(manifest.get("manifestVersion")) is not int or manifest["manifestVersion"] != 2
            or manifest.get("runtimeName") != "ValiCore" or manifest.get("engineVersion") != version
            or type(manifest.get("runtimeApiMajor")) is not int or manifest["runtimeApiMajor"] != 8
            or type(manifest.get("loaderProtocol")) is not int or manifest["loaderProtocol"] != 2):
        raise ValueError("Native composition identity/version is incompatible")
    runtimes = manifest.get("runtime")
    runtime = runtimes.get("native") if isinstance(runtimes, dict) else None
    machine = platform.machine().lower()
    target = sysconfig.get_platform().lower().replace("-", "_")
    architecture = "ia32" if struct.calcsize("P") == 4 else (
        "x64" if target.endswith(("_amd64", "_x86_64")) else
        "arm64" if target.endswith(("_arm64", "_aarch64")) else
        {"x86_64": "x64", "amd64": "x64", "aarch64": "arm64", "arm64": "arm64"}.get(machine, machine))
    if (not isinstance(runtime, dict) or runtime.get("platform") != sys.platform
            or runtime.get("architecture") != architecture):
        raise ValueError("Build on the target platform/architecture; cross-labelled wheels are not allowed")
    native = resource(composition, runtime)
    if len(runtime["url"].split("/")) != 1:
        raise ValueError("Native runtime must be a local filename")
    notices_ref = manifest.get("notices")
    if not isinstance(notices_ref, dict) or notices_ref.get("url") != "notices/index.json":
        raise ValueError("Native composition must include a hashed notice inventory")
    index_bytes = resource(composition, notices_ref)
    index = json.loads(index_bytes)
    if (not isinstance(index, dict) or type(index.get("formatVersion")) is not int
            or index["formatVersion"] != 1 or not isinstance(index.get("files"), list)):
        raise ValueError("Invalid notice inventory")
    files = {runtime["url"]: native, "notices/index.json": index_bytes}
    names = set()
    for entry in index["files"]:
        if (not isinstance(entry, dict) or not isinstance(entry.get("url"), str)
                or entry["url"] == "index.json" or entry["url"] in names):
            raise ValueError("Invalid/duplicate notice resource")
        data = resource(composition / "notices", entry)
        names.add(entry["url"])
        files["notices/" + entry["url"]] = data
    if not {"PROJECT-LICENSE", "rust/COPYRIGHT-library.html"}.issubset(names):
        raise ValueError("Required code notices are missing")
    fields = ("runtimeName", "engineVersion", "runtimeApiMajor", "loaderProtocol", "components", "modules", "operations", "schemas")
    bundled = {"formatVersion": 1, **{key: manifest[key] for key in fields},
               "runtime": {**runtime, "bytes": len(native)}, "datasets": {}, "notices": notices_ref}
    if geographic is not None:
        raw = geographic.read_bytes()
        compressed = raw.startswith(b"\x1f\x8b")
        decoded = gzip.decompress(raw) if compressed else raw
        data = json.loads(decoded)
        if ("geo" not in manifest["components"] or not isinstance(data, dict)
                or type(data.get("schemaVersion")) is not int
                or data["schemaVersion"] != manifest["schemas"].get("geo")
                or not isinstance(data.get("version"), str) or not data["version"]):
            raise ValueError("Geographic snapshot does not match the compiled provider")
        name = "places.json.gz" if compressed else "places.json"
        files[name] = raw
        files["DATA-NOTICE.md"] = (ROOT / "docs/DATA-LICENSES.md").read_bytes()
        bundled["datasets"]["geo"] = {"url": name, "sha256": digest(raw), "bytes": len(raw),
                                       "contentSha256": digest(decoded), "version": data["version"],
                                       "schemaVersion": data["schemaVersion"], "sources": data.get("sources", {})}
    files["manifest.json"] = (json.dumps(bundled, indent=2) + "\n").encode()
    return files, bundled


def build_wheel(composition, output, geographic=None):
    if output.exists():
        raise FileExistsError("Output already exists; choose a new output directory")
    files, manifest = prepare_bundle(composition, geographic)
    # Probe the actual trusted library with the owning wrapper; do not duplicate
    # ABI transport or infer capabilities from a filename/manifest alone.
    package_version = tomllib.loads((ROOT / "packages/python/pyproject.toml").read_text())["project"]["version"]
    probe = (
        "import json,sys;sys.path.insert(0,sys.argv[1]);import valicore;from valicore import create_valicore;"
        "m=json.load(open(sys.argv[3]));assert valicore._ENGINE_VERSION==m['engineVersion'];assert valicore.__version__==sys.argv[4];"
        "e=create_valicore(library_path=sys.argv[2],components=m['components']);"
        "i=e.version_info();e.dispose();"
        "assert all(i[k]==m[k] for k in ['runtimeName','engineVersion','runtimeApiMajor','loaderProtocol','components','modules','operations','schemas'])"
    )
    subprocess.run([sys.executable, "-I", "-c", probe, str(ROOT / "packages/python/src"),
                    str(composition / manifest["runtime"]["url"]), str(composition / "manifest.json"), package_version], check=True)
    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix=".valicore-wheel-", dir=output.parent) as temporary:
        stage = Path(temporary)
        source = stage / "source"
        shutil.copytree(ROOT / "packages/python", source,
                        ignore=shutil.ignore_patterns("__pycache__", "*.egg-info", "build", "dist", "bundled"))
        bundle = source / "src/valicore/bundled"
        for name, data in files.items():
            target = bundle / name
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(data)
        wheels = stage / "wheels"
        wheels.mkdir()
        env = dict(os.environ)
        env.setdefault("SOURCE_DATE_EPOCH", subprocess.check_output(
            ["git", "show", "-s", "--format=%ct", "HEAD"], cwd=ROOT, text=True).strip())
        subprocess.run([sys.executable, "-m", "pip", "--disable-pip-version-check", "wheel", "--no-index", "--no-deps",
                        "--no-build-isolation", str(source), "--wheel-dir", str(wheels)], env=env, check=True)
        matches = list(wheels.glob("valicore-*.whl"))
        if len(matches) != 1 or matches[0].name.endswith("-any.whl") or "-py3-none-" not in matches[0].name:
            raise RuntimeError("Expected one truthful py3-none platform wheel, not an any/CPython-ABI wheel")
        wheel = matches[0]
        with zipfile.ZipFile(wheel) as archive:
            metadata = [name for name in archive.namelist() if name.endswith(".dist-info/WHEEL")]
            if len(metadata) != 1 or b"Root-Is-Purelib: false" not in archive.read(metadata[0]):
                raise RuntimeError("Native wheel must be marked platform-specific")
            for name, data in files.items():
                if archive.read("valicore/bundled/" + name) != data:
                    raise RuntimeError("Packed resource differs from validated input")
        report = {"wheel": wheel.name, "sha256": digest(wheel.read_bytes()), "bytes": wheel.stat().st_size,
                  "platform": manifest["runtime"]["platform"], "architecture": manifest["runtime"]["architecture"],
                  "components": manifest["components"], "datasets": list(manifest["datasets"]),
                  "nativeSha256": manifest["runtime"]["sha256"]}
        if output.exists():
            raise FileExistsError("Output appeared during build; refusing to overwrite it")
        wheels.rename(output)
        return report


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--composition", type=Path, required=True, help="Trusted native composer output with notices")
    parser.add_argument("--geo", type=Path, help="Explicit local geographic JSON/gzip snapshot")
    parser.add_argument("--output", type=Path, required=True, help="New wheel output directory")
    args = parser.parse_args()
    print(json.dumps(build_wheel(args.composition.resolve(), args.output.resolve(), args.geo), indent=2))
