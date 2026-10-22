"""Tag wheels containing a native runtime truthfully; no native compilation here."""
import json
from pathlib import Path
import platform
import sys

from setuptools import Distribution, setup
from setuptools.command.bdist_wheel import bdist_wheel

BUNDLED = (Path(__file__).parent / "src/valicore/bundled/manifest.json").is_file()


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
            architecture = {"x64": "x86_64", "arm64": "arm64"}[manifest["runtime"]["architecture"]]
            major, minor, *_ = platform.mac_ver()[0].split(".")
            # A single-architecture library must not inherit a universal2 Python
            # tag. Conservatively target the actual build host's macOS version.
            platform_tag = f"macosx_{major}_{minor}_{architecture}"
        # ctypes binds the C ABI, not CPython's extension ABI. The payload is
        # platform-specific, but the wrapper is Python-version independent.
        return "py3", "none", platform_tag


setup(distclass=RuntimeDistribution, cmdclass={"bdist_wheel": RuntimeWheel})
