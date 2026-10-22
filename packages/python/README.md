# ValiCore for Python

Offline Python integration for the shared Rust engine. Python 3.12+, no
third-party runtime dependencies; all domain rules remain in Rust.

**Public beta preparation: not published on PyPI.** The runtime-inclusive
packaging path is verified locally on Linux x64. Other operating systems,
architectures and interpreter versions need their own verification before being
advertised. Only the latest beta will be maintained.

## Install and use

Install a verified wheel for your platform, locally or from the eventual GitHub
release. No compiler, Node installation or manual native-library path is required:

```sh
python3 -m pip install --no-index --no-deps /path/to/valicore-0.5.0b1-py3-none-linux_x86_64.whl
```

```python
from valicore import create_valicore

with create_valicore() as engine:
    code = engine.encode({
        "name": "Mario", "surname": "Rossi", "sex": "M",
        "birthDate": "1985-03-15", "birthplace": {"belfioreCode": "H501"},
    })
    print(code)  # RSSMRA85C15H501R
    print(engine.decode(code, {"yearRange": [1900, 2099]}))
    print(engine.resolve_place({"name": "Cattolica", "onDate": "1985-03-15"}))
    print(engine.version_info()["dataVersion"])
```

The platform wheel includes a fiscal/geographic native runtime, a dated
geographic snapshot and code/data notices. It is not a universal `any` wheel.
Resource hashes, native identity and composition are checked before use; missing
or corrupt resources fail explicitly. There is no system-library search,
network download, cache fallback or hidden clock.

Local validation does not prove identity or tax-registry allocation. Decoding
preserves candidate centuries; `valid: None` means indeterminate, not false.
Geographic/foreign history is limited by the supplied sources and edition.

## Optional and custom data

```python
# Explicit None skips the included geographic payload.
with create_valicore(dataset=None) as engine:
    print(engine.validate("RSSMRA85C15H501R", {"level": "calendar"}))

# Use your schema-compatible dict, JSON or gzip JSON snapshot instead.
with create_valicore(dataset="/path/to/custom-places.json.gz") as engine:
    print(engine.dataset_info())
```

Loaded snapshots never update in place. Create another engine to use a new
edition. Preserve source metadata, uncertainty and rights for custom datasets.

## Explicit native runtimes (advanced)

`library_path="/path/to/libvalicore_abi.so"` selects a trusted caller-supplied
runtime; its datasets remain explicit and optional. Without `dataset`, that mode
creates an algorithm-only handle. An optional `components` list must match the
actual compiled set. Native code is not a sandbox; loading a library executes it.

A transport-only wheel can also be built from `packages/python` using installed
pip/setuptools >=77. It intentionally contains no runtime/data; omitting
`library_path` in that variant fails `BUNDLED_RUNTIME_UNAVAILABLE`, not an implicit
compile/download. Maintainers produce inclusive wheels from explicit local inputs:

```sh
python3 tools/build_python_wheel.py --composition /path/to/native-composition \
  --geo /path/to/dated-places.json.gz --output /path/to/new-wheel-directory
```

Methods use snake_case; input/output fields retain ABI camelCase. Handles are
creating-thread-affine. Use a context manager or explicit `dispose()`; garbage
collection is not a cross-thread disposer. Errors expose `code`, `message`,
optional `field` and `as_dict()`. Returned dictionaries are independent snapshots.
Operations excluded from a supplied composition fail `COMPONENT_UNAVAILABLE`;
missing optional data remains unavailable/unknown rather than silently false.

[API, packaging and ownership](https://github.com/arro000/ValiCore/blob/main/docs/PYTHON.md) ·
[Historical coverage](https://github.com/arro000/ValiCore/blob/main/docs/DATA.md) ·
[Dataset redistribution](https://github.com/arro000/ValiCore/blob/main/docs/DATA-LICENSES.md)

Project code is MIT; bundled third-party code and data retain their own notices
and terms. Preserve the packaged notice resources when redistributing a runtime.
JS online/cache parity and HTML adapters are not implemented in Python.
