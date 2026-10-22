# Architecture and public API

Official geographic inputs → transactional Python importer → canonical CSV,
immutable JSON snapshots and evidence → immutable Rust geographic catalog.
Fiscal algorithms and geographic history are isolated domain crates depending
on foundation; only the `valicore` facade composes them. `valicore-abi` transports
JSON to native/WASM clients; JS/TS, Python and the demo do not duplicate rules.
See [ownership/dependencies](MODULES.md).

## Compiled code and operational data

The complete default runtime compiles `fiscal` and `geo`. Named profiles are
`fiscal` and `italian` (fiscal + geo). `versionInfo()` reports actual components,
modules, operations, schemas, engine version and loaded data version.

`capabilities()` has two fields: `fiscalIdentity` and `geoHistorical`. The latter
requires a loaded catalog, not just compiled geographic code. `catalog: false`
or `datasets: []` avoids data reads/downloads/decompression/index construction
without changing the binary. A selected fiscal-only runtime actually excludes
geographic operations. No synthetic empty snapshot is substituted.

Excluded components fail `COMPONENT_UNAVAILABLE`; compiled but unloaded
geography fails `CAPABILITY_UNAVAILABLE`. No fallback selects a larger binary
or silently drops a requested dataset/constraint.

Without data, generation accepts a bare explicit Belfiore code. Name/ISTAT
resolution, province or administrative-date constraints fail explicitly.
Decoding still returns fragments/dates, with `places: []` and null data version.
Requested territorial checks remain unknown/indeterminate; callers can instead
request calendar-level validation. Matching without geography reports calendar
validation and needs bare Belfiore input.

## Public operations

| Method | Result / boundary |
| --- | --- |
| `encode(person)` | Base or selected omocodic code |
| `validate(code, options)` | Structured checks, decoded data, records and version |
| `isValid(code, options)` | True only for definite validity; inspect `validate` to distinguish false from indeterminate |
| `decode(code, {yearRange})` | Name fragments, candidate dates, sex, Belfiore and mask |
| `birthplaceHistory(code, {yearRange})` | Separate administrative evidence for every unfiltered calendar candidate; allocation `not_run` |
| `matchesPerson(code, person)` | Component mismatches, not identity proof |
| `nameCode`, `surnameCode` | Encoded name segments |
| `checksum`, `numericChecksum` | Control character/digit for the body without its check character |
| `validateItalianVat` | Format/checksum, registry `not_run` ([scope](VAT.md)) |
| `validateItalianRea` | Presentation, registry `not_run` ([scope](REA.md)) |
| `toBase`, `toOmocode`, `omocodiaMask`, `isOmocode` | Validated mask/base transformations |
| `omocodes(code, {includeBase})` | 128 variants, or 127 without base; includeBase must be boolean |
| `sameBase(left, right)` | Fiscal-base equivalence, not identity |
| `searchPlaces(query, options)` | Ranked suggestions; never generation selection |
| `listProvinces({onDate, query, activeOnly, kind})` | Dated names, aliases and distinct usable-place counts |
| `resolvePlace(query)` | unique / ambiguous / missing / missing_code |
| `datasetInfo`, `versionInfo`, `capabilities` | Actual data/runtime information |
| `dispose` | Release engine handle; subsequent calls fail |

## Input and ambiguity policies

- Dates are Gregorian `YYYY-MM-DD`, years 1–9999, with inclusive interval ends.
- Encoded sex is M/F; fiscal-code inputs allow surrounding whitespace and ASCII
  lowercase. Identifiers remain strings to preserve leading zeros.
- Name normalization applies Unicode NFKD/combining-mark handling and deliberate
  expansions for ß, Æ, Œ, Ø, Ł, Đ, Ð, Þ and dotless ı. Unsupported registered
  spellings fail; no arbitrary transliteration is inferred.
- Exactly one place selector: `name`, `belfioreCode` or `istatCode`. Optional
  province/administrative-date constraints are retained.
- Name-based generation defaults administrative resolution to birth date.
  Explicit Belfiore does not gain an implicit administrative-date restriction.
- Fuzzy suggestions and distinct Belfiore candidates are never silently chosen.

Validation levels are `structural`, `checksum`, `calendar`, `territorial`
(default). Checks use `pass/fail/unknown/not_run`; `valid: null` is indeterminate.
Numeric eleven-digit codes encode no person and have no applicable calendar or
territory checks. Numeric fiscal checksum alone is not a full VAT validator.

Without a caller year range, decoding considers years 1–9999 and never consults
the current clock. Leap-year rules exclude 1900-02-29 but include 2000-02-29.
All matching dates are returned; no century is arbitrarily selected.

Missing place records cannot establish invalid allocation. A ceased municipality
is not automatically an invalid birthplace. [Birthplace-history reports](BIRTHPLACE-HISTORY.md)
compare source intervals without redefining fiscal validity or filtering
centuries. Foreign history and unknown dates remain source-limited.

Mask bits run from the rightmost replaceable position: human positions 15, 14,
13, 11, 10, 8, 7, using `LMNPQRSTUV`. This is an API convention, not allocation
order. Every transformation recomputes the check character.

## Custom snapshots and lifetime

Custom geographic schema is documented in [data](DATA.md) and
[distribution](DISTRIBUTION.md). `Engine::new(dataset)` constructs a catalog;
`Engine::without_catalog()` does not invent one. `Engine::dataset()` is optional
and read-only. Standalone `Catalog::dataset()` returns a read-only dataset;
consume with `into_dataset()`, edit and rebuild indices. Loaded instances never
update in place. Native handles are thread-affine; each worker owns its engine.
