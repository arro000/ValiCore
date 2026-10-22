# PRD — ValiCore public beta

This document defines the limited first beta, not the earlier experimental
multi-domain roadmap. Implemented/local verification is not a claim that the
candidate has been committed, released, or verified on every platform.

## Purpose

Provide a free, open-source engine for Italian fiscal-code generation,
validation and decoding, with source-dated municipality/province history.
Expose the same Rust rules through thin JS/TS, Python and C ABI interfaces.
Make ordinary developer installation self-contained; a Rust compiler or manual
native-library path is not a Python consumer requirement.

Beta has no fixed end date. Maintain the latest beta only. Additional domains,
jurisdictions or wrappers require explicit product decisions and authoritative
specification review; they are not first-release obligations.

## Implemented scope

| Capability | Contract and limits |
| --- | --- |
| Personal fiscal-code generation | Supported Latin name rules, strict Gregorian birth date, encoded sex and exact Belfiore/name/ISTAT resolution; no fuzzy selection or tax-registry allocation |
| Validation | Structural, checksum, calendar and territorial levels; `pass/fail/unknown/not_run` and `valid: null` preserved |
| Decoding and matching | Fragments, all candidate dates within the caller's range, sex and source records; no recovered full names, implicit century or proof of identity |
| Omocodia | All 128 masks, recomputed control character, base comparison; API mask order is not allocation order |
| Numeric fiscal identifiers | Numeric checksum, bounded Italian VAT format/checksum and REA presentation; registration checks remain `not_run` |
| Geographic history | ANPR municipality/foreign tables, evidence-linked ISTAT overlays, dated province names, aliases and accents; missing codes/dates/conflicts retained |
| Birthplace-history report | Every calendar candidate compared with source-limited administrative intervals; does not redefine fiscal validity or bare-code generation |
| HTML adapter | Independent date/province/place controls, ambiguity and programmatic refresh, disposal/restoration |
| Composition | Fiscal and geographic domain crates, complete default runtime, real fiscal-only and fiscal/geographic precompiled profiles; dataset selection is separate |
| Custom data | Public geographic JSON schema, caller-supplied snapshots and immutable loaded indices; no snapshot-specific allowlists |
| Packaging | Included JS runtime/data; optional online/pinned/custom modes; runtime-inclusive Python wheel tooling and explicit native/custom-data mode |

Contracts: [architecture](docs/ARCHITECTURE.md), [modules](docs/MODULES.md),
[composition](docs/MODULAR-BUILD.md), [ABI](docs/ABI.md),
[distribution](docs/DISTRIBUTION.md), [Python](docs/PYTHON.md).

## Non-goals

No healthcare, ATECO, medical-device or banking API is shipped in this beta.
No Italian/global IBAN coverage, official registry lookups, hosted validation
API, clinical decision, identity proof, or universal foreign-history coverage
is claimed. PHP/C#/Go/Ruby wrappers and unimplemented domain crates are not
provided. Do not retain placeholder APIs or obsolete-runtime fallback shims.

## Correctness and architecture

- One Rust rules engine; no duplicated JS/Python/demo algorithms.
- No implicit clock, timezone, network or DOM in domains/facade.
- Gregorian `YYYY-MM-DD`, years 1–9999, inclusive interval ends.
- Unknown information remains unknown. Never infer successor states, legal
  founding dates, source completeness or allocation from administrative data.
- Domain crates depend on foundation, not peers/facade/ABI. Only the facade
  composes domains. Raw WASM JSON ABI, not generated wasm-bindgen glue.
- Loaded catalogs are immutable; consuming/editing/rebuilding recreates indices.
- Preserve native thread affinity and exact allocator/buffer ownership.

## Beta acceptance checklist

### Implemented and locally checked

- [x] Fiscal/geographic Rust modules and independent reference corpora.
- [x] API8 thin JS/TS/Python and native/WASM transport alignment.
- [x] Local default initialization; no implicit shared-channel access.
- [x] Selected runtimes, optional/custom geographic snapshots and complete fallback.
- [x] Actual installed npm and Python wheel consumers on Linux x64.
- [x] Fiscal/geographic demo, copied JS/TS examples, keyboard/mobile/selectors.
- [x] Offline transactional importer and preserved geographic permission evidence.

### Still required for publication

- [ ] Final coordinated version/artifact freeze and clean candidate identity.
- [ ] Complete cross-layer gate on that exact candidate, not only focused runs.
- [ ] Platform/interpreter artifact matrix tested or explicitly limited.
- [x] Monthly changed-data promotion, bounded exponential retry for up to three
  days and failure-issue reconciliation implemented and locally tested without
  live-source promotion; remote activation/permissions remain release gates.
- [ ] Final dependency, package-content, secret/ref/history and asset review.
- [ ] Explicit resolution/go-no-go handling of pending ADE redistribution terms.
- [ ] Controlled same-repository publication after private preservation and review.

See [release readiness](docs/RELEASE.md). Checklist changes must follow actual
evidence, not a version bump or an old report from a different scope.

## Performance

No universal startup/throughput/size/memory target is claimed. Retain exact
runtime/dataset/toolchain identities and a passing baseline before profiling.
Artifact bytes are not live RAM, Node file initialization is not browser cold
startup, and test/build durations are not benchmarks. See
[measurement requirements](docs/PERFORMANCE.md).
