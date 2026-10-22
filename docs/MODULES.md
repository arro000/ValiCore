# Modules and filesystem

The [PRD](../PRD.md) defines the fiscal/geographic beta. There are five workspace
crates and two domain components; no placeholder domains or hidden banking,
healthcare or classification APIs are part of this distribution.

## Dependency contract

```text
valicore-abi -> valicore -> {valicore-fiscal-identity, valicore-geo-historical}
                               |                             |
                               +----> valicore-foundation <--+
```

Foundation owns shared errors and Gregorian dates, not domain schemas or
transport versions. Geo owns `DATA_SCHEMA`; the facade owns `VERSION` and
`API_MAJOR`; ABI owns the JSON protocol/dispatch and buffers.

- Domain crates never depend on peers, facade or ABI, including build/dev
  dependencies. External dependencies are explicit and module-owned.
- Only `valicore` composes domains and person/territorial inputs.
- No clock, networking, DOM or timezone in foundation, domains or facade.
- `Catalog` validates and owns immutable data/indices. `dataset()` is read-only;
  consume with `into_dataset()`, edit, then construct a new catalog.
- Cargo prevents cycles; `crates/valicore/tests/architecture.rs` additionally
  checks permitted dependency directions. Acyclic is not sufficient isolation.

## Crate ownership

| Crate | Responsibility | Verification |
| --- | --- | --- |
| [foundation](../crates/valicore-foundation/README.md) | Shared errors, strict dates | `cargo test -p valicore-foundation --locked` |
| [fiscal](../crates/modules/valicore-fiscal-identity/README.md) | Names, personal/numeric checksums, generation/decoding, VAT and REA | `cargo test -p valicore-fiscal-identity --locked` |
| [geo](../crates/modules/valicore-geo-historical/README.md) | Schema, normalization, pooled immutable catalog, dated queries | `cargo test -p valicore-geo-historical --locked` |
| [facade](../crates/valicore/README.md) | Composition, integrated validation and cross-domain reference matrices | `cargo test -p valicore --locked` |
| [ABI](../crates/valicore-abi/README.md) | JSON dispatcher, handles and native/WASM buffer ownership | `cargo test -p valicore-abi --locked` |

## Compiled code versus loaded data

The complete default JS initialization includes fiscal/geographic code and a
geographic snapshot. Two named profiles are supplied: `fiscal` and `italian`
(fiscal + geo). Named entrypoints default to no data. Geo-only custom builds
are supported through explicit composition, not an invented profile alias.

`datasets: []` or `catalog: false` avoids geography initialization; it does not
remove compiled code. A fiscal-only binary actually excludes geo operations.
Excluded components fail `COMPONENT_UNAVAILABLE`; a compiled geo component with
no loaded catalog fails `CAPABILITY_UNAVAILABLE`. See
[composition](MODULAR-BUILD.md) and [loading](DISTRIBUTION.md).

## Repository ownership

| Path | Responsibility |
| --- | --- |
| `packages/js/` | Loader, hashes/cache/transport, declarations and optional HTML adapter; no domain algorithms |
| `packages/python/` | Thin ctypes wrapper, inclusive platform-wheel tooling and explicit runtime/data mode |
| `apps/demo/` | Integration app, not a second rules engine |
| `tools/data/`, `data/` | Transactional geographic importer, official originals, provenance and snapshots |
| `tools/` | Build, verification, packaging and local serving |
| `tests/fixtures/`, `tests/browser/` | Independent expectations and browser integration |
| `artifacts/` | Immutable selected runtime/notices/release resources |
| `docs/`, `PRD.md`, `AGENTS.md` | Contracts, scope and working rules |
| `target/`, `distribution/`, `site/`, demo `dist/`, JS `bundled/` | Owned rebuildable outputs, not source evidence |
| `test-results/`, `verification-reports/` | Ignored verification reports; the latter survives browser output clearing |

## Extension rules

Verify authoritative specifications before adding algorithms or countries.
Select the owning module and retain independent expectations. New domains need
working APIs/tests, not empty crates. Keep `lib.rs` small and explicit, update
facade/ABI/wrapper declarations together, then run the
[cross-layer gate](TESTING.md). Performance changes require a profile of the
actual workload and identical snapshot/toolchain comparisons. No live sync,
publication or deletion of source history is implied by a refactor.
