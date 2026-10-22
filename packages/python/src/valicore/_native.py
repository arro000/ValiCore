"""Native C ABI transport only. Every input/output buffer has exact ownership."""
from __future__ import annotations

import ctypes
import json
from os import PathLike
from pathlib import Path
from typing import Any

from ._errors import ValiCoreError


class NativeLibrary:
    def __init__(self, library_path: str | PathLike[str]):
        try:
            path = Path(library_path).resolve(strict=True)
            if not path.is_file():
                raise OSError("Runtime path is not a file")
            self.library_path = str(path)
            self._library = ctypes.CDLL(self.library_path)
            self._alloc = self._library.valicore_alloc
            self._dealloc = self._library.valicore_dealloc
            self._invoke = self._library.valicore_invoke
        except (OSError, TypeError, ValueError, AttributeError) as error:
            raise ValiCoreError("RUNTIME_LOAD_FAILED", str(error), "library_path") from error
        self._alloc.argtypes = [ctypes.c_uint32]
        self._alloc.restype = ctypes.c_void_p
        self._dealloc.argtypes = [ctypes.c_void_p, ctypes.c_uint32]
        self._dealloc.restype = None
        self._invoke.argtypes = [ctypes.c_void_p, ctypes.c_uint32, ctypes.POINTER(ctypes.c_uint32)]
        self._invoke.restype = ctypes.c_void_p

    def request(self, op: str, **arguments: Any) -> Any:
        try:
            data = json.dumps({**arguments, "protocol": 1, "op": op},
                              ensure_ascii=False, allow_nan=False,
                              separators=(",", ":")).encode("utf-8")
        except (TypeError, ValueError, UnicodeError, RecursionError) as error:
            raise ValiCoreError("INVALID_ARGUMENT", "Arguments must be finite, UTF-8 JSON values") from error
        if len(data) > 0xffffffff:
            raise ValiCoreError("INPUT_TOO_LARGE", "JSON request exceeds the ABI uint32 length")
        input_pointer = self._alloc(len(data))
        if not input_pointer:
            raise ValiCoreError("RUNTIME_ALLOCATION_FAILED", "Native allocator returned no input buffer")
        output_pointer = None
        output_length = ctypes.c_uint32()
        try:
            ctypes.memmove(input_pointer, data, len(data))
            output_pointer = self._invoke(input_pointer, len(data), ctypes.byref(output_length))
            if not output_pointer or output_length.value == 0:
                raise ValiCoreError("INVALID_ABI_RESPONSE", "Native runtime returned an empty response")
            # Copy while output is live. Never retain a view into native memory.
            output = ctypes.string_at(output_pointer, output_length.value)
        finally:
            try:
                if output_pointer:
                    self._dealloc(output_pointer, output_length.value)
            finally:
                self._dealloc(input_pointer, len(data))
        try:
            envelope = json.loads(output)
        except (ValueError, UnicodeError) as error:
            raise ValiCoreError("INVALID_ABI_RESPONSE", "Native response must be UTF-8 JSON") from error
        if not isinstance(envelope, dict):
            raise ValiCoreError("INVALID_ABI_RESPONSE", "Native response must be an object envelope")
        if envelope.get("ok") is True and "value" in envelope:
            return envelope["value"]
        detail = envelope.get("error")
        if (envelope.get("ok") is False and isinstance(detail, dict)
                and isinstance(detail.get("code"), str) and isinstance(detail.get("message"), str)
                and ("field" not in detail or isinstance(detail["field"], str))):
            raise ValiCoreError(detail["code"], detail["message"], detail.get("field"))
        raise ValiCoreError("INVALID_ABI_RESPONSE", "Native error envelope is malformed")
