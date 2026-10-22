"""Tag wheels containing a native runtime truthfully; no native compilation here."""
import json
import os
from pathlib import Path
import platform
import sys

from setuptools import Distribution, setup
from setuptools.command.bdist_wheel import bdist_wheel

BUNDLED = (Path(__file__).parent / "src/valicore/bundled/manifest.json").is_file()


def macos_platform_tag(version, architecture):
    major, minor, *_ = map(int, version.split('.'))
    arch = {"x64": "x86_64", "arm64": "arm64"}[architecture]
    # macOS 11+ compatibility tags use the major release with minor zero.
    # Single-architecture native payloads never inherit universal2 from Python.
    if major >= 11:
        minor = 0
    return f"macosx_{major}_{minor}_{arch}"


class RuntimeDistribution(Distribution):
    def has_ext_modules(self):
        return BUNDLED or super().has_ext_modules()


class RuntimeWheel(bdist_wheel):
    def get_tag(self):
        python, abi, platform_tag = super().get_tag()
        if not BUNDLED:
            return python, abi, platform_tag
        if sys.platform == "darwin":
            manifest = json.loads((Path(__file__).parent / "src/valicore/bundled/manifest.json").read_bytes())
            version = os.environ.get("MACOSX_DEPLOYMENT_TARGET") or platform.mac_ver()[0]
            platform_tag = macos_platform_tag(version, manifest["runtime"]["architecture"])
        # ctypes binds the C ABI, not CPython's extension ABI. The payload is
        # platform-specific, but the wrapper is Python-version independent.
        return "py3", "none", platform_tag


setup(distclass=RuntimeDistribution, cmdclass={"bdist_wheel": RuntimeWheel})
