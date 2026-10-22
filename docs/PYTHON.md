# Python: packaged native runtime and explicit offline inputs

`valicore` is a thin ctypes wrapper over the fiscal/geographic Rust engine.
Python 3.12+ is declared; inclusive-wheel consumers have passed locally on
Python 3.12.14 and 3.14.7/Linux x64. Unavailable targets are delegated to Actions
or contributors and remain unverified until their actual results exist. No PyPI publication or live download URL is claimed yet.

## Normal installation

```sh
python -m pip install --no-index --no-deps \
  /path/to/valicore-0.5.0b1-py3-none-linux_x86_64.whl
```

```python
from valicore import create_valicore

with create_valicore() as cf:
    print(cf.resolve_place({"name": "Cattolica", "onDate": "1985-03-15"}))
    print(cf.decode("RSSMRA85C15H501R", {"yearRange": [1900, 2099]}))

# Do not read the included geographic payload.
with create_valicore(dataset=None) as cf:
    print(cf.validate("RSSMRA85C15H501R", {"level": "calendar"}))
```

A platform wheel includes native fiscal/geographic code, a dated geographic
snapshot and notices. Consumers need no Rust, Node or manual library path.
Local resource hashes, platform/architecture, actual runtime API8/loader2,
components/operations/schemas and snapshot identity are checked. Missing/corrupt
resources fail, with no system-library search, download, compiler or fallback.
Native code is trusted executable code, not a sandbox.

Python distribution version is `0.5.0b1` (PEP440); the native engine reports
`0.5.0-beta.1` (SemVer). They are coordinated representations, not equal text.
`valicore.__version__` describes the Python distribution; `version_info()`
describes the actual engine. Neither selects a language/jurisdiction.

## Custom geographic data

```python
with create_valicore(dataset="/path/to/custom-places.json.gz") as cf:
    print(cf.dataset_info())
```

Accept schema-compatible dictionaries, JSON paths or gzip JSON paths. A new
snapshot constructs new Rust indices; later input/result dictionary edits do
not mutate loaded data. Missing/opaque provenance remains intact, without
invented reference dates. See [schema](DATA.md) and [source terms](DATA-LICENSES.md).

With packaged runtime, omitted dataset loads included geography; explicit None
skips it. With explicit `library_path`, omitted dataset creates an algorithm-only
handle. These are deliberate distinct defaults, not synthetic empty catalogs.

## Explicit native runtime (advanced)

```python
with create_valicore(library_path="/trusted/libvalicore_abi.so",
                     components=["fiscal", "geo"],
                     dataset="/path/to/places.json.gz") as cf:
    print(cf.encode({"name": "Mario", "surname": "Rossi", "sex": "M",
                     "birthDate": "1985-03-15",
                     "birthplace": {"belfioreCode": "H501"}}))
```

The optional components list must exactly match compiled components (order is
not semantic). Preserve the supplied library's own code notices. A transport-
only `py3-none-any` wheel can be built from `packages/python`; it contains no
native binary/data. Its tag does not imply native portability. Omitting a
runtime in that variant fails `BUNDLED_RUNTIME_UNAVAILABLE`.

Maintainer assembly uses trusted local native compositions:

```sh
python3 tools/build_python_wheel.py --composition /path/to/native-composition \
  --geo /path/to/places.json.gz --output /path/to/new-wheel-directory
```

Needs installed pip/setuptools >=77, no implicit index download. It probes the
actual native ABI, verifies bytes/notices and emits a platform-specific wheel.
It does not label Linux builds manylinux or single-architecture macOS builds
universal2. Target compatibility must be verified on the advertised target.

## API and semantics

Methods use snake_case; dictionary fields retain ABI camelCase (`birthDate`,
`belfioreCode`, `yearRange`, `onDate`). All operations are synchronous/local.

- Fiscal: `encode`, `validate`, `is_valid`, `decode`, `birthplace_history`,
  `matches_person`, `checksum`, `numeric_checksum`, `name_code`, `surname_code`.
- Omocodia: `to_base`, `to_omocode`, `omocodia_mask`, `is_omocode`, `omocodes`,
  `same_base`. `include_base` must be boolean.
- Formal identifiers: `validate_italian_vat`, `validate_italian_rea`.
- Geography: `search_places`, `list_provinces`, `resolve_place`, `dataset_info`.
- Identity/lifecycle: `version_info`, `capabilities`, `dispose`, context manager.

Capabilities are `fiscalIdentity`/`geoHistorical`. Compiled exclusion differs
from unloaded geography. Without data, territorial validation is indeterminate,
not false or silently downgraded; bare Belfiore generation and explicit calendar
validation remain available. `is_valid` is only a definite-success predicate.
Inspect `validate` to distinguish invalid from unknown. Matching is not identity
proof; decoding never guesses names/century. [Semantics](ARCHITECTURE.md).

No banking/healthcare/classification methods, network registry checks, JS
online/cache parity or HTML adapter are provided by this Python beta.

## Ownership, errors and threads

Pointers use c_void_p; native output length is writable uint32, not WASM packed
u64. Allocate/copy/free exact ABI buffers on success and errors. No pointer/view
escapes into public values. Native create input remains borrowed; it is not the
WASM owned-dataset export. [ABI contract](ABI.md).

JSON inputs must be finite, serializable and valid UTF-8. `ValiCoreError` exposes
code/message/optional field and `as_dict()`. Native errors are preserved, never
converted to false/empty success.

Use/dispose engines on their creating **Thread object**, not a recycled numeric
thread ID. Cross-thread calls, cached metadata access and disposal fail
`WRONG_THREAD` before dispatch. Each worker owns its engine. Context exit
cleans up after user exceptions; failed post-create initialization disposes its
handle. Disposal is idempotent on the owner thread, then operations fail
`ENGINE_DISPOSED`. Do not rely on GC/finalizers for thread-affine cleanup.

## Verification

`tools/test_python.py` builds locally/offline, installs transport-only and
inclusive wheels into separate fresh venv consumers, executes under Python -I,
checks independent fiscal/VAT/REA/history corpora, a fiscal-only native runtime,
wrong composition, custom data, notices, exact buffer frees, threads and bounded
RSS/disposal. Inclusive consumers receive no separately supplied runtime/data.
The native verifier invokes it; the extensive gate checks report revision and
resource/corpus hashes. Local dirty-tree reports are not release certification.
