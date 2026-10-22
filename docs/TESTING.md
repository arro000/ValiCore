# Extensive correctness suite

This suite is the behavioural baseline for future optimization. It exercises
real Rust, WASM, native C ABI and browser code with deterministic fixtures. It
uses bounded exhaustive domains, independent expected values, full catalog
sweeps and fault injection. Test-group counts are not case counts: many groups
run tens or hundreds of thousands of parameter combinations.

## Run everything

Prerequisites: Node 22+, Python 3.12+ with pip, venv/ensurepip and setuptools >=77,
a Rust toolchain supporting edition 2024, `wasm32-unknown-unknown`, and Playwright Chromium. The native verification script
currently targets Linux (`libvalicore_abi.so`).

```sh
npm ci
rustup target add wasm32-unknown-unknown
npx playwright install chromium
npm run test:extensive
```

The command checks fixture reproducibility, formatting/linting, core/ABI and
importer tests, checks local documentation links, builds both real runtimes,
runs native and WASM/reference tests, builds Python wheels without network access
and installs/tests them in separate virtualenvs: the transport-only variant with
explicit native/data inputs, and a fiscal/geographic platform wheel containing
its own runtime, default snapshot and notices. The latter consumer receives only
test code/reference fixtures, not a separate library/dataset. It also checks
wheel-builder rejection cases, true platform tags, no-network defaults, optional
and custom data, packaged examples and lifecycle. The gate then checks TypeScript,
builds the demo, verifies HTTP distribution/compression and
runs browser integration tests. It also compiles fiscal-only and geo-only ABI
matrices, provisions the two beta profiles, verifies actual npm packing and an
independently installed offline tarball consumer, exercises the composition-aware
JS loader/CLI/Vite suites and builds a fiscal-only native composition through
the installed transport wheel. Geographic permission-evidence hashes and pending
terms are checked without contacting source publishers.
The runtime-inclusive wheel's native and geographic identities, installed test
result and zero-configuration examples are checked in the extensive report.
All test
inputs are local; transport failures use a local HTTP server. Assembly appends
immutable runtime/release artifacts and refreshes ignored bundled/site outputs;
it does not sync live data. Inspect generated additions before committing. No source download
or tax-registry access is needed. It stops at the first failed phase and returns
a nonzero exit code.

`test-results/extensive-report.json` records the data version, Git revision,
working-tree state, reference-corpus hash, case inventory, phase outcomes and
elapsed times, plus the Python consumer's package/native/dataset/corpus hashes,
Python/platform versions, test outcomes and ownership/disposal observations.
Times are diagnostic build/test timings, not performance
benchmarks or machine-independent thresholds. The standard verification workflow
already discovers the new Rust, Python, Node and browser tests and runs the
expanded native script. That native entry point also runs `tools/test_python.py`,
so the installed Python suite is covered without new workflow discovery rules.
The workflow installs the declared setuptools >=77 build prerequisite before
running the offline wheel gate; Python 3.12's environment does not include it
implicitly. Local callers must likewise provision that prerequisite first.
`npm run test:python` runs the same consumer verification independently after
building the native library; see [Python prerequisites and contract](PYTHON.md).

The demo build additionally runs `npm run test:demo-examples`: all eight copied
TypeScript examples are checked against the public types, and fourteen JS/TS
examples execute against the actual bundled WASM runtime. The browser-only
place-selector example is typechecked and its adapter is exercised by browser
tests. Demo integration tests also cover card freshness, result-to-inverse
handoff, feature navigation, clipboard content, independent keyboard tablists,
candidate-date place presentation, mobile overflow and initialization failure.

Each report is also timestamp-archived under `verification-reports/`, outside
Playwright's cleared output directory. Subsequent test runs preserve these
comparison baselines; both output directories are excluded from Git.

## Atomic module checks

```sh
cargo test -p valicore-foundation --locked
cargo test -p valicore-fiscal-identity --locked
cargo test -p valicore-geo-historical --locked
cargo test -p valicore --test architecture --locked
npm run test:docs
```

The domain crates build/test without the facade, ABI or dataset distribution.
Geographic tests include pooled parsing, immutable snapshots, inclusive boundaries,
source order, and index reconstruction after consuming/editing a dataset. A
compile-fail doctest rejects mutation through `Catalog::dataset()`.

The architecture test inspects Cargo metadata, including build/dev dependencies,
so peer/facade imports cannot quietly destroy isolation. It runs with ordinary
workspace tests and existing CI discovery. The extensive gate additionally checks
repository-owned Markdown links offline; it does not verify external websites or
Markdown heading anchors.

## Generation and inverse calculation

| Domain | Coverage |
| --- | --- |
| Independent ordinary-person corpus | 514 fictitious people, both sexes, all months, short/compound names, foreign/domestic Belfiore codes, boundary years and omocodia masks; identical expectations in Rust, WASM and native ABI |
| Gregorian generation/inversion | Every day in 2000–2399, both sexes: **292,194 generated codes and inverse decodes**, exact encoded body, date, sex, name/surname fragments and place code |
| Independent inverse-only vectors | 37 explicitly expected cases: all month ends/both sexes, century ambiguity, leap centuries, year 0001/9999, invalid days/months and ranges without a matching date |
| Unrestricted inverse | All 514 reference codes checked against the host Gregorian calendar across every matching century in 1–9999 |
| Omocodia | All 128 masks for 128 people; all **16,384 mask-to-mask transitions** for an anchor; WASM decoded-field checks for another 32 × 128 matrix |
| Historic inverse places | All records associated with Cattolica/Olbia are retained; no current province is guessed from an encoded Belfiore |
| Person matching | Independently changed surname, name, month/year, day/sex and place; invalid checksums; omocodia; century/name-code collisions remain encoded-component comparisons |

Inverse output is intentionally lossy: three-letter name/surname fragments
cannot reconstruct full registered names, and two year digits cannot establish
a century. Tests require explicit date candidates and place-history candidates;
they reject impossible encodings rather than inventing personal information.
The corpus includes synthetic place codes to test arithmetic separately from
catalog coverage; these do not claim real tax-registry allocations.

## Other boundary domains

| Domain | Coverage |
| --- | --- |
| Calendar | 146,097 days/97 leap days in a 400-year cycle; **458,752** year/month/day byte-boundary combinations; centuries, zeroes, upper limits and malformed date strings |
| Checksums | 540 independently expected positional character cases; 516 numeric bodies and all ten final-digit mutations for each |
| Names | 20 explicit normalization fixtures, combining/precomposed accents, ligatures, registered Latin expansions, punctuation, no consonants, four-consonant given names, 512-letter limit and expansion across that limit |
| Code structure | Every ASCII character in all 16 positions, all final check-letter mutations, deterministic Unicode/ASCII noise through public core operations |
| Validation | Structural/checksum/calendar/territorial levels, short-circuit statuses, false versus indeterminate, absent places, unknown intervals and administrative-date mismatch |
| Catalog | Every runtime record at interval boundaries and adjacent days (**94,749 queries for the checked 19,951-record snapshot**); every current ISTAT municipality; province sets/counts against a linear oracle under 88 dated filter combinations |
| Lookup/search | Name/alias normalization, empty queries, homonyms, multiple versions of one Belfiore, missing codes, foreign birth eligibility, province/kind/date/active filters, limits and repeatable ordering |
| Dataset validation | Unsupported schemas, duplicate/empty IDs, empty names, invalid code/kind/status, reversed/invalid date intervals, invalid and overlapping province-name versions |
| ABI | Protocol/operation/argument/option type matrices, handle lifecycle and thread affinity, multiple engines, malformed UTF-8/JSON, zero-length and repeated real buffer allocation/free |
| Importer | Gregorian/Excel date boundaries including serial 60 with fractions, source schema/ID errors, foreign flags, missing codes, aliases, complete state preservation after failed imports, reordering/idempotence, successive editions and ANPR catching up with ISTAT |
| Distribution | HTTP errors/timeouts, pinned mode, manifest type/compatibility, hashes, runtime/data identity, corrupted/incomplete/unwritable caches, fallback and rejected-release promotion |
| Browser adapter | Input and native select, dated province transitions, same-name/same-province disambiguation, recovery from invalid input, attribute restoration/listener disposal, female leap-day foreign generation and inverse display, existing mobile/root/prefix tests |

There are also 10,000 deterministic Unicode/ASCII noise inputs. This is bounded
robustness testing, not an unbounded fuzzing campaign. Invalid native pointers
are not passed: they violate the documented C ownership contract and cause
undefined behaviour rather than structured validation errors.

## Regressions discovered while building this suite

The suite exposed and now guards six corrected defects:

1. JavaScript nonfinite numbers were silently converted to JSON null, removing
   optional constraints; the transport now rejects them explicitly.
2. Excel serial 60 with a fractional time bypassed the fictional leap-day guard.
3. Unknown foreign-country birth flags were accepted as negative eligibility.
4. A source set producing no usable places wrote published state before failing
   on CSV generation; it is now rejected before state promotion.
5. Serde sequence deserialization allowed array-shaped options to become default
   settings; ABI struct arguments now require JSON objects.
6. A null/nonobject manifest produced a generic TypeError instead of the
   structured `INVALID_MANIFEST` error.

## Reference provenance and maintenance

`tests/fixtures/fiscal-vectors.json` is generated by
`tools/tests/generate_vectors.py`, a small independent Python reference using
the ministerial encoding tables, Python's Gregorian calendar and explicit
normalization fixtures. It does not import production code. Two previously
independently verified anchors constrain the reference; generated fictitious
people are additional differential fixtures, not externally certified records.

```sh
python3 tools/tests/generate_vectors.py --check
# Only after reviewing an intended reference change:
python3 tools/tests/generate_vectors.py
```

Fixed seeds, persisted fixtures and failure messages make cases reproducible.
When a defect is found, add the smallest regression alongside the broader
matrix, verify that it fails before the correction, and keep it after the fix.

## Optimization gate

Before changing algorithms or data structures, run the complete suite and retain
the report/corpus hash. After each optimization run it against the same corpus
and snapshot. Preserve error codes, validation levels/tristate, candidate sets,
sorting, temporal boundaries, ABI ownership and transport fallback semantics.
Retain repeatable Node/browser measurements with/without catalog and separate
raw CPU profiles only after verifying the tools against the current candidate.
Do not reuse experimental multi-domain measurements as beta evidence. These
are diagnostics, not CI speed thresholds; see [measurement requirements](PERFORMANCE.md).

Bounded exhaustive checks cover the specified finite domains. They do not prove
every possible combination of arbitrary Unicode, network states, future source
schemas or every historical tax-registry allocation. Additional discoveries
extend the regression corpus rather than being hidden by a claim of universal
coverage.
