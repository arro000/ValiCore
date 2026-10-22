# Tools

Run from the repository root. Domain algorithms belong in Rust, not these scripts.

| Task | Command |
| --- | --- |
| Build WASM, resources and demo | `npm run build` |
| Assemble archived preview without Rust | `npm run build:preview` |
| Full local correctness gate | `npm run test:extensive` |
| HTTP/compression/cache checks | `npm run test:distribution` |
| Markdown links | `npm run test:docs` |
| Installed npm consumer | `node tools/test_installed_js.mjs` |
| Installed Python consumers | `npm run test:python` |
| Native ZIP/wheel build and actual-host checks | `python3 tools/build_native_release.py --output /new/artifacts` |
| Inclusive wheel from verified local native composition | `python3 tools/build_python_wheel.py --composition /trusted/native --geo /trusted/places.json.gz --output /new/wheels` |
| Trusted build's code notices | `node tools/build_notices.mjs . /new/notices` |
| Intentional live geographic import | `npm run sync:data` |

`data/` owns the geographic importer and operational retry/issue adapters.
`tests/` owns independent fiscal/VAT/REA/history generators, not production rules.
Do not regenerate expected outputs merely to hide a failure. Ordinary builds
use committed data, never live imports.

Python consumers are installed outside the checkout with no index/dependency
download during the gate. Native target builds must run on their advertised
platform; configuring another runner is not evidence that its artifacts work.
Do not attempt unavailable platform checks locally: leave them to CI/contributors.

Notice bundles preserve project, dependency and supplied Rust standard-library
licenses with hashes. Missing/corrupt notices stop promotion. Code notices do
not clear dataset rights or font obligations. Build outputs are staged and new
immutable archives are appended; source history is not disposable output.

[Testing](../docs/TESTING.md) · [Composition](../docs/MODULAR-BUILD.md) ·
[Operations](../docs/OPERATIONS.md) · [Rights](../docs/DATA-LICENSES.md)
