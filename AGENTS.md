# Working on ValiCore

Applies repository-wide; follow narrower instructions when present. Read current
code and Git state before changing anything. This is an operational guide, not a
snapshot of versions, test results or remote CI status.

## Start here

1. Read `git status --short`, recent history, relevant manifests and
   `data/state.json`. Preserve all existing changes/untracked files; do not reset,
   clean or commit them incidentally. `.opencode/` and design tooling are not
   disposable build output.
2. Read `PRD.md` and `docs/MODULES.md` for architecture/scope work. Implemented
   beta domains are Italian fiscal identity and geographic history only.
   Deferred prototypes are not part of the public source/package contract.
   New formats/checksums require authoritative verification before implementation.
3. Select the smallest owning module and its tests. Read only the relevant
   detailed contracts (table below), not every design document for backend work.
4. Verify a baseline, make a scoped change, run local checks, then the cross-layer
   gate when Rust/ABI/integration changes. Report what actually ran and what did
   not. Do not describe a dirty-tree report as a committed/released result.

| Task | Read before changing |
| --- | --- |
| Domain boundaries/new modules | `PRD.md`, `docs/MODULES.md`, owning crate README |
| Fiscal semantics/validation | `docs/ARCHITECTURE.md`, reference vectors and owning tests |
| ABI/loader/ownership | `docs/ABI.md`, `docs/DISTRIBUTION.md`, public header/types |
| Importer or historical intervals | `docs/DATA.md`, `docs/SOURCES.md`, `docs/RECONCILIATION.md` |
| Optimisation | `docs/TESTING.md`, `docs/PERFORMANCE.md`, passing report + actual profile |
| HTML field adapter | `docs/UI.md`, JS types and selector/browser tests |
| Demo UI/design | `apps/demo/PRODUCT.md`, `apps/demo/DESIGN.md`, `apps/demo/.impeccable/surfaces/index-html.md`; use Impeccable |

`docs/README.md` is the documentation index. No demo redesign/preview server is
implied by a backend or documentation task.

## Product and permissions

- Build ValiCore as one expandable modular Rust engine, official dated data and
  thin wrappers. Fiscal identity/geography remain Italian-only; no banking,
  healthcare or classification API ships in this beta. JavaScript/TypeScript
  are implemented; native C ABI exists. Do not claim jurisdictions beyond the
  explicitly verified domain-specific coverage,
  PHP/C#/Go wrappers or future PRD modules already work. Python has an offline
  ctypes wrapper with both runtime-inclusive platform-wheel tooling (fiscal/geo)
  and explicit caller-supplied runtime/dataset inputs, locally verified on Linux
  x64 on Python 3.12/3.14. Leave unavailable target validation to CI/contributors;
  do not block local completion on platforms that cannot be tested here. Mark
  those targets unverified until real results exist. JS online/cache parity is
  not implemented in Python.
- Source, docs, errors, comments and UI text are English; conversation may be
  Italian. ValiCore is the selected product name; current packages use `valicore`
  and native/WASM exports use `valicore_*`. See `docs/NAMING.md`. Remote repository
  and hosting paths remain real existing locations; do not rename them implicitly.
- Keep `arro000/ValiCore` private during evaluation. No public Pages,
  npm publication or visibility change before the owner-delegated meticulous
  release review. The first public delivery is a beta, not product v1; public
  visibility alone does not establish a v1 compatibility commitment. Follow the
  current owner decisions in `docs/RELEASE.md`, including same-repository history
  preparation and preservation before ref changes.
- Pre-v1 has no backward-compatibility commitment. Remove obsolete code instead
  of shims/old-runtime fallbacks. Protocol/schema versions are not product v1.
- Native ABI, custom datasets, cache, offline use and source history are required
  functionality, not legacy paths to remove.
- Do not infer permission to commit/push, tag/release, pull CI commits, sync live
  sources, prune archives or start an unrelated redesign. Inspect local/remote
  work before any authorised fast-forward; never discard user work for CI.

## Ownership and module boundaries

| Path | Responsibility |
| --- | --- |
| `crates/valicore-foundation/src/` | shared errors and strict Gregorian dates; no domain schema/transport versions |
| `crates/modules/valicore-fiscal-identity/src/` | `names.rs`, `checksum.rs`, `personal.rs`, `vat.rs`: pure fiscal algorithms; VAT is format/checksum only |
| `crates/modules/valicore-geo-historical/src/` | `model.rs`, `normalize.rs`, `storage.rs`, `catalog.rs`: schema, pooled immutable catalog and queries |
| `crates/valicore/src/` | `engine.rs`, `validation.rs`: cross-module composition, person input, integrated API/version |
| `crates/valicore-abi/src/lib.rs`, `include/valicore.h` | JSON dispatcher, raw WASM/native buffers and handles |
| `packages/js/src/` | loader/hashes/cache/transport/types; `ui.js`/`ui.d.ts` for reusable HTML selectors |
| `packages/python/src/valicore/` | thin ctypes/native JSON wrapper; packaged or explicit native/data inputs, hashes/ownership/thread/disposal, no algorithms |
| `apps/demo/` | TypeScript/Vite integration, not a duplicate rules engine |
| `tools/data/`, `data/` | importer/reconciliation and preserved official evidence/state |
| `tools/`, `artifacts/` | build/test/benchmark orchestration and immutable runtime/release archives |

- Domain crates may depend on foundation and explicit external dependencies,
  never peers/facade/ABI, including build/dev dependencies. Foundation never
  depends on a domain. Only `valicore` composes domains; ABI is transport only.
- `crates/valicore/tests/architecture.rs` enforces dependency directions. Keep
  local domain tests in their crates; cross-domain matrices belong in `valicore`.
- Keep `lib.rs` small with explicit exports. No placeholder crates, compatibility
  aliases or duplicated JS/demo domain logic. Add public declarations/tests
  together with wrapper API changes.
- Catalog input may be edited before construction; loaded snapshots are read-only
  via `dataset()`. Consume with `into_dataset()`, edit, then rebuild indices.
  No mutable accessor that can desynchronise rows/keys. No snapshot-specific
  dictionaries, record limits, source IDs or place lists. Pools are instance-scoped.
- Raw WASM JSON ABI only, not generated wasm-bindgen glue. Keep runtime API,
  loader protocol, data schema and manifests consistent. Build-time composition
  selects actual compiled components; data initialization does not strip code.
  JS defaults to the included release; online loading is explicit. Named profiles
  enforce exact components and same-profile fallback. Python platform wheels must
  carry the selected native runtime, optional declared data and code/data notices;
  explicit native/custom datasets remain supported.

## Correctness invariants

- No implicit system clock, timezone, networking or DOM in Rust domains/facade.
  Dates are Gregorian `YYYY-MM-DD`, years 1–9999; interval ends are inclusive.
- Preserve deliberate supported Latin expansions/combining-mark handling.
  Unsupported registered spellings fail; no silent transliteration.
- All 128 omocodia masks preserve components and recompute checksum. Mask order
  is an API convention, not fiscal allocation order. Numeric CF encodes no person
  and its checksum alone is not a full VAT validator. `validateItalianVat` explicitly
  checks format/checksum only and always reports registry checks as `not_run`;
  never invent a serial/office allowlist.
- Preserve validation levels and `pass/fail/unknown/not_run`. `valid: null` is
  indeterminate, not false. Reject malformed object/array types and nonfinite or
  fractional numbers where inappropriate; never silently remove constraints.
- Local checks do not establish tax-registry allocation. A ceased municipality
  is not automatically an invalid birthplace. Same-base/person matching does not
  prove identity; decoding yields fragments and candidate dates, not full names
  or an arbitrarily chosen century.
- Generation never picks fuzzy suggestions or different Belfiore candidates.
  Preserve unique/ambiguous/missing/missing-code results. Name-based generation
  defaults administrative resolution to birth date; explicit Belfiore does not
  acquire an implicit administrative-date restriction.
- Native handles are thread-affine. Free buffers with the ABI allocator/exact
  lengths; refresh WASM views after calls/allocations. Invalid pointers violate
  the contract, not normal negative-test inputs. `valicore_create_json_owned` consumes
  dataset input on success/error; context/output and ordinary invoke inputs have
  separate ownership. Preserve bounded create/dispose memory tests.
- Place selectors work independently of personal details and honour dated
  province membership, names/codes/aliases/accents. Programmatic edits need
  `refresh()`; `dispose()` restores attributes/listeners.

## Data and provenance

Authoritative archive:
`https://www.anagrafenazionale.interno.it/wp-content/uploads/ANPR_archivio_comuni.csv`.

- ANPR supplies history/original fiscal codes; ISTAT supplies independent
  administrative comparisons and evidenced overlays; ADE T2/reviewed supplements
  supply historical province labels. Never replace ANPR Belfiore with ISTAT guesses.
- Preserve raw bytes/hashes/source IDs, immutable snapshots, unknown dates and
  unresolved disagreements. Statistical effective dates, current observations,
  administrative history and fiscal allocation are different concepts.
- Documented Sardinian statistical transition: **2026-01-01**. Olbia keeps G015
  while SS/090047 becomes OT/113017; old OT is Olbia-Tempio, new OT Gallura Nord-Est
  Sardegna. Retain derived history when sources catch up or later editions arrive.
- Foreign history is source-limited; missing former states remain unknown. Do
  not invent successors, legal dates or uniform 1861–present completeness.
- Imports must be idempotent/transactional; failures cannot promote state/output.
  Edit importer/reference evidence, never generated archives by hand. Normal
  testing/building does not need `npm run sync:data` (live network/state changes).

## Build and verify

Prerequisites: Node 22+, npm, Python 3.12+, Rust supporting edition 2024, WASM
`wasm32-unknown-unknown`, Playwright Chromium. Full verification also requires
pip, venv/ensurepip and setuptools >=77 for offline Python wheel construction.

```sh
npm ci
rustup target add wasm32-unknown-unknown
npx playwright install chromium
cargo test -p valicore-fiscal-identity --locked
cargo test -p valicore-geo-historical --locked
cargo fmt --all --check
cargo clippy --workspace --all-targets --locked -- -D warnings
npm run test:docs
npm run test:extensive
npm run test:distribution
```

The extensive gate checks reference reproducibility, docs, Rust/importer tests,
rebuilds real WASM/native outputs, assembles verified resources, and runs native,
installed Python (separate virtualenv and supplied native/data assets),
JS/types/examples/demo/browser and actual HTTP distribution/compression checks. It writes `test-results/extensive-report.json`
and a timestamped `verification-reports/` copy. New runtime/release files can be
appended under `artifacts/`; inspect these additions, never overwrite older hashes.
Use exit codes (or shell `pipefail`); piping a failed build through `tail` alone
must not be reported as success.

After Rust edits, `npm test` against an old bundled WASM does not verify them:
build WASM then `node tools/build.mjs`, or use the full gate. Native verification
needs `cargo build --locked --release -p valicore-abi` followed by
`python3 tools/test_native.py` (Linux runner).

If system Rust lacks the WASM target and the isolated toolchain still exists:

```sh
env RUSTUP_HOME=/tmp/opencode/rustup CARGO_HOME=/tmp/opencode/cargo \
  PATH=/tmp/opencode/cargo/bin:$PATH npm run test:extensive
```

Check availability first. Use `/tmp/opencode` for temporary diagnostics. For
optimisation retain a passing report/corpus hash, profile the actual bottleneck,
then compare `npm run benchmark` / `npm run benchmark:memory` with the same
snapshot/toolchain. Test/build durations are not benchmarks; do not equate
Node initialization to browser cold-start or artifact bytes to live memory.

Preview is `npm run preview` (committed artifacts) or `npm run build` (current
source). Never serve uncompiled `apps/demo/`; `tools/serve.py` only serves assembled
`site/`. Root `/demo/` and `/ValiCore/demo/` must work. Browser tests own
port 4173. No long-lived preview process unless requested.

Ignored outputs: `target/`, `site/`, `distribution/`, demo `dist/`, JS `bundled/`,
tarballs/reports. Tracked `data/` and `artifacts/` are immutable evidence, not trash.

## Documentation, demo and releases

- README is an entry point, not a duplicate specification. Detailed contracts
  live in `docs/`; PRD checkboxes describe actual implementation. Maintain valid
  relative links, distinguish goals from measurements, and avoid stale version
  narratives. Preserve independent fixtures/expectations and deterministic seeds;
  bounded exhaustive coverage is not universal correctness proof.
- Preserve demo freshness/copyable tested JS+TS examples, keyboard tablists,
  candidate-date-first inverse output and disclosure of other historical records.
  Health-card preview is not an official document; do not advertise unpublished
  npm installation as available. No design iteration without user request.
- Existing CI discovers workspace/Python/JS/browser tests. Avoid unnecessary
  workflow edits; credentials may lack workflow scope. `pages.yml` manages
  monthly/manual/main data sync, verification and private previews; public Pages
  requires visibility/owner override. `package.yml` builds tagged releases.
- Publication requires owner consent, coordinated Cargo/package/demo versions
  and lockfiles, verified artifacts/full tests. Data may update independently;
  all modes verify compatibility/hashes and fall back only to complete releases.
