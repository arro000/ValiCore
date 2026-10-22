"""Local packaged native resources; no discovery, networking or domain rules."""
from __future__ import annotations

from dataclasses import dataclass
import hashlib
import json
from pathlib import Path
import platform
import re
import struct
import sys
import sysconfig
from typing import Any

from ._errors import ValiCoreError

BUNDLE_DIRECTORY = Path(__file__).parent / "bundled"


@dataclass(frozen=True)
class BundledInputs:
    library: Path
    dataset: Path | None
    manifest: dict[str, Any]
    dataset_reference: dict[str, Any] | None


def _architecture() -> str:
    if struct.calcsize("P") == 4:
        return "ia32"
    target = sysconfig.get_platform().lower().replace("-", "_")
    if target.endswith(("_amd64", "_x86_64")):
        return "x64"
    if target.endswith(("_arm64", "_aarch64")):
        return "arm64"
    # A universal macOS interpreter reports its actual process architecture here.
    machine = platform.machine().lower()
    return {"x86_64": "x64", "amd64": "x64", "aarch64": "arm64", "arm64": "arm64"}.get(machine, machine)


def _resource(directory: Path, reference: Any) -> Path:
    if (not isinstance(reference, dict) or not isinstance(reference.get("url"), str)
            or not re.fullmatch(r"[A-Za-z0-9_-][A-Za-z0-9_.-]*", reference["url"])
            or not isinstance(reference.get("sha256"), str)
            or not re.fullmatch(r"[a-f0-9]{64}", reference["sha256"])
            or type(reference.get("bytes")) is not int or reference["bytes"] < 0):
        raise ValiCoreError("INVALID_BUNDLE", "Packaged resource reference is malformed")
    path = directory / reference["url"]
    if path.is_symlink() or not path.is_file():
        raise ValiCoreError("INVALID_BUNDLE", "Packaged resource must be a local regular file")
    if path.stat().st_size != reference["bytes"]:
        raise ValiCoreError("HASH_MISMATCH", "Packaged resource length does not match its manifest")
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    if digest.hexdigest() != reference["sha256"]:
        raise ValiCoreError("HASH_MISMATCH", "Packaged resource hash does not match its manifest")
    return path


def load_bundle(expected_version: str, *, geographic: bool) -> BundledInputs:
    directory = BUNDLE_DIRECTORY
    try:
        manifest_path = directory / "manifest.json"
        if not manifest_path.is_file():
            raise ValiCoreError("BUNDLED_RUNTIME_UNAVAILABLE", "This installation has no bundled native runtime; install a platform wheel or supply library_path explicitly")
        if manifest_path.is_symlink():
            raise ValiCoreError("INVALID_BUNDLE", "Packaged manifest must not be a symlink")
        manifest = json.loads(manifest_path.read_bytes())
        if (not isinstance(manifest, dict) or type(manifest.get("formatVersion")) is not int
                or manifest["formatVersion"] != 1
                or manifest.get("runtimeName") != "ValiCore"
                or manifest.get("engineVersion") != expected_version
                or type(manifest.get("runtimeApiMajor")) is not int or manifest["runtimeApiMajor"] != 8
                or type(manifest.get("loaderProtocol")) is not int or manifest["loaderProtocol"] != 2):
            raise ValiCoreError("INCOMPATIBLE_RUNTIME", "Packaged runtime identity/version is incompatible")
        for key in ("components", "modules", "operations"):
            value = manifest.get(key)
            if (not isinstance(value, list) or not value
                    or any(not isinstance(item, str) or not item for item in value)
                    or len(set(value)) != len(value)):
                raise ValiCoreError("INVALID_BUNDLE", "Packaged runtime composition is malformed")
        schemas = manifest.get("schemas")
        if not isinstance(schemas, dict) or any(type(value) is not int for value in schemas.values()):
            raise ValiCoreError("INVALID_BUNDLE", "Packaged runtime schemas are malformed")
        runtime = manifest.get("runtime")
        if (not isinstance(runtime, dict) or runtime.get("platform") != sys.platform
                or runtime.get("architecture") != _architecture()):
            raise ValiCoreError("INCOMPATIBLE_RUNTIME", "Packaged native runtime belongs to another platform/architecture")
        library = _resource(directory, runtime)
        dataset = None
        reference = None
        if geographic:
            datasets = manifest.get("datasets")
            if not isinstance(datasets, dict):
                raise ValiCoreError("INVALID_BUNDLE", "Packaged dataset inventory must be an object")
            if "geo" in datasets:
                reference = datasets["geo"]
                if (not isinstance(reference, dict) or "geo" not in manifest["components"]
                        or type(reference.get("schemaVersion")) is not int
                        or reference["schemaVersion"] != schemas.get("geo")
                        or not isinstance(reference.get("version"), str) or not reference["version"]):
                    raise ValiCoreError("INVALID_BUNDLE", "Packaged geographic identity is malformed")
                dataset = _resource(directory, reference)
        return BundledInputs(library, dataset, manifest, reference)
    except ValiCoreError:
        raise
    except (OSError, ValueError, UnicodeError, RecursionError) as error:
        raise ValiCoreError("INVALID_BUNDLE", "Unable to read packaged native resources") from error
