"""Thin, synchronous, thread-affine facade over the native JSON dispatcher."""
from __future__ import annotations

from copy import deepcopy
from enum import Enum
import gzip
import json
from os import PathLike
from pathlib import Path
import threading
from typing import Any, Sequence

from ._bundle import load_bundle
from ._errors import ValiCoreError
from ._native import NativeLibrary

DatasetInput = dict[str, Any] | str | PathLike[str] | None


class _DatasetDefault(Enum):
    BUNDLED = "bundled"


_DEFAULT_DATASET = _DatasetDefault.BUNDLED


def _dataset(value: DatasetInput) -> Any:
    if not isinstance(value, (str, PathLike)):
        return value
    try:
        path = Path(value)
        data = path.read_bytes()
        if path.suffix.lower() == ".gz":
            data = gzip.decompress(data)
        return json.loads(data)
    except (OSError, ValueError, UnicodeError, EOFError) as error:
        raise ValiCoreError("DATASET_LOAD_FAILED", str(error), "dataset") from error


class ValiCoreEngine:
    """Own a native handle; use/dispose it on its creating Thread object.

    No runtime search, downloads, cache, hidden clock or GC-based disposal.
    Person/query/options dictionary keys retain the native ABI's camelCase.
    """

    def __init__(self, *, library_path: str | PathLike[str] | None = None,
                 dataset: DatasetInput | _DatasetDefault = _DEFAULT_DATASET,
                 components: Sequence[str] | None = None):
        self._owner = threading.current_thread()
        self._handle: int | None = None
        bundle = None
        if library_path is None:
            from . import _ENGINE_VERSION
            bundle = load_bundle(_ENGINE_VERSION, geographic=dataset is _DEFAULT_DATASET)
            library_path = bundle.library
        if dataset is _DEFAULT_DATASET:
            dataset = bundle.dataset if bundle is not None else None
        self._transport = NativeLibrary(library_path)
        info = self._transport.request("info")
        if (not isinstance(info, dict) or info.get("runtimeName") != "ValiCore"
                or type(info.get("runtimeApiMajor")) is not int or info["runtimeApiMajor"] != 8
                or type(info.get("loaderProtocol")) is not int or info["loaderProtocol"] != 2):
            raise ValiCoreError("INCOMPATIBLE_RUNTIME", "Native runtime identity/API/loader protocol do not match ValiCore")
        for key in ("components", "modules", "operations"):
            value = info.get(key)
            if (not isinstance(value, list) or not value
                    or any(not isinstance(item, str) or not item for item in value)
                    or len(set(value)) != len(value)):
                raise ValiCoreError("INCOMPATIBLE_RUNTIME", f"Native runtime must declare its compiled {key}")
        schemas = info.get("schemas")
        if not isinstance(schemas, dict) or any(type(value) is not int for value in schemas.values()):
            raise ValiCoreError("INCOMPATIBLE_RUNTIME", "Native runtime must declare compiled provider schemas")
        if components is not None:
            if (not isinstance(components, (list, tuple)) or not components
                    or any(not isinstance(item, str) or not item for item in components)
                    or len(set(components)) != len(components)
                    or set(components) != set(info["components"])):
                raise ValiCoreError("INCOMPATIBLE_RUNTIME", "Native runtime components do not match the selected composition", "components")
        if bundle is not None:
            if (info.get("engineVersion") != bundle.manifest["engineVersion"]
                    or info["schemas"] != bundle.manifest["schemas"]
                    or any(set(info[key]) != set(bundle.manifest[key]) for key in ("components", "modules", "operations"))):
                raise ValiCoreError("INCOMPATIBLE_RUNTIME", "Native runtime differs from its packaged manifest")
        arguments = {} if dataset is None else {"dataset": _dataset(dataset)}
        if bundle is not None and bundle.dataset_reference is not None:
            value = arguments.get("dataset")
            if (not isinstance(value, dict) or value.get("version") != bundle.dataset_reference["version"]
                    or value.get("schemaVersion") != bundle.dataset_reference["schemaVersion"]):
                raise ValiCoreError("INCOMPATIBLE_DATASET", "Packaged geographic identity differs from its manifest")
        handle = self._transport.request("create", **arguments)
        if type(handle) is not int or not 1 <= handle <= 0xffffffff:
            raise ValiCoreError("INVALID_ABI_RESPONSE", "Native creation did not return a uint32 handle")
        self._handle = handle
        try:
            data_info = self.dataset_info() if dataset is not None else None
            sources = data_info["sources"] if data_info else {}
            source_dates = {key: source.get("referenceDate") if isinstance(source, dict)
                            and isinstance(source.get("referenceDate"), str) else None
                            for key, source in sources.items()} if isinstance(sources, dict) else {}
            self._versions = {**info, "origin": "bundled" if bundle is not None else "custom",
                              "runtimePath": self._transport.library_path,
                              "components": list(info["components"]), "operations": list(info["operations"]),
                              "schemas": dict(info["schemas"]),
                              "dataVersion": data_info["version"] if data_info else None,
                              "sourceDates": source_dates}
        except BaseException:
            self.dispose()
            raise

    def _thread(self) -> None:
        if threading.current_thread() is not self._owner:
            raise ValiCoreError("WRONG_THREAD", "Native engine must be used and disposed on its creating thread")

    def _live(self) -> None:
        self._thread()
        if self._handle is None:
            raise ValiCoreError("ENGINE_DISPOSED", "This engine has been disposed")

    def _call(self, op: str, **arguments: Any) -> Any:
        self._live()
        return self._transport.request(op, **arguments, handle=self._handle)

    def __enter__(self) -> ValiCoreEngine:
        self._live()
        return self

    def __exit__(self, exc_type: Any, exc: Any, traceback: Any) -> None:
        self.dispose()

    def dispose(self) -> None:
        self._thread()
        if self._handle is not None:
            self._transport.request("dispose", handle=self._handle)
            self._handle = None

    def version_info(self) -> dict[str, Any]:
        self._live()
        return deepcopy(self._versions)

    def capabilities(self) -> dict[str, bool]:
        return self._call("capabilities")

    def dataset_info(self) -> dict[str, Any]:
        return self._call("datasetInfo")

    def encode(self, person: dict[str, Any]) -> str:
        return self._call("encode", person=person)

    def validate(self, code: str, options: dict[str, Any] | None = None) -> dict[str, Any]:
        return self._call("validate", code=code, options=options)

    def is_valid(self, code: str, options: dict[str, Any] | None = None) -> bool:
        return self.validate(code, options).get("valid") is True

    def decode(self, code: str, options: dict[str, Any] | None = None) -> dict[str, Any]:
        return self._call("decode", code=code, options=options)

    def birthplace_history(self, code: str, options: dict[str, Any] | None = None) -> dict[str, Any]:
        return self._call("birthplaceHistory", code=code, options=options)

    def matches_person(self, code: str, person: dict[str, Any]) -> dict[str, Any]:
        return self._call("matchesPerson", code=code, person=person)

    def validate_italian_vat(self, vat: str) -> dict[str, Any]:
        return self._call("validateItalianVat", vat=vat)

    def validate_italian_rea(self, rea: str) -> dict[str, Any]:
        return self._call("validateItalianRea", rea=rea)

    def checksum(self, body: str) -> str:
        return self._call("checksum", body=body)

    def numeric_checksum(self, body: str) -> str:
        return self._call("numericChecksum", body=body)

    def name_code(self, name: str) -> str:
        return self._call("nameCode", name=name)

    def surname_code(self, surname: str) -> str:
        return self._call("surnameCode", surname=surname)

    def to_base(self, code: str) -> str:
        return self._call("toBase", code=code)

    def to_omocode(self, code: str, mask: int) -> str:
        return self._call("toOmocode", code=code, mask=mask)

    def omocodia_mask(self, code: str) -> int:
        return self._call("omocodiaMask", code=code)

    def is_omocode(self, code: str) -> bool:
        return self.omocodia_mask(code) != 0

    def omocodes(self, code: str, *, include_base: bool = True) -> list[str]:
        self._live()
        if type(include_base) is not bool:
            raise ValiCoreError("INVALID_ARGUMENT", "include_base must be a boolean", "includeBase")
        return self._call("omocodes", code=code, includeBase=include_base)

    def same_base(self, left: str, right: str) -> bool:
        return self._call("sameBase", left=left, right=right)

    def search_places(self, query: str, options: dict[str, Any] | None = None) -> list[dict[str, Any]]:
        return self._call("searchPlaces", query=query, options=options)

    def list_provinces(self, options: dict[str, Any] | None = None) -> list[dict[str, Any]]:
        return self._call("listProvinces", options=options)

    def resolve_place(self, query: dict[str, Any]) -> dict[str, Any]:
        return self._call("resolvePlace", query=query)


def create_valicore(*, library_path: str | PathLike[str] | None = None,
                   dataset: DatasetInput | _DatasetDefault = _DEFAULT_DATASET,
                   components: Sequence[str] | None = None) -> ValiCoreEngine:
    """Use packaged defaults, or an explicit trusted native library/geographic snapshot.

    Explicit ``dataset=None`` disables packaged geography. With an explicit
    library path, omitting data creates an algorithm-only handle. No global
    library search, downloads or automatic resource fallback occur.
    """
    return ValiCoreEngine(library_path=library_path, dataset=dataset, components=components)
