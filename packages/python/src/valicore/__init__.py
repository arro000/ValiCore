"""Offline ValiCore: packaged native resources or explicit trusted caller inputs."""
from ._engine import ValiCoreEngine, create_valicore
from ._errors import ValiCoreError

__all__ = ["ValiCoreEngine", "ValiCoreError", "create_valicore"]
__version__ = "0.5.0b1"
# Native/Cargo/npm use SemVer; Python distribution metadata uses PEP 440.
_ENGINE_VERSION = "0.5.0-beta.1"
