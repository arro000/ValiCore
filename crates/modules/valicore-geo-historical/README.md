# valicore-geo-historical

[PRD Module 9](../../../PRD.md): dated municipality/province/country data,
without fiscal algorithms or personal data.

- `model.rs`: canonical records, query/result types and provenance.
- `storage.rs`: instance-scoped text pooling, row hints and contiguous indices.
- `normalize.rs`: search normalization (not registered-name fiscal encoding).
- `catalog.rs`: validation, ranked search and exact historical resolution.

`Catalog::dataset()` is read-only. To edit data, consume with `into_dataset()`
and rebuild. `places_by_code()` returns all source-ordered versions;
`resolve_place()` applies explicit dates and distinguishes unique/ambiguous/
missing/missing-code results. `list_provinces()` follows dated membership.

Uses foundation, `serde`, `serde_json`, `unicode-normalization`.

```sh
cargo test -p valicore-geo-historical --locked
```

[Coverage and schema](../../../docs/DATA.md) ·
[Module contract](../../../docs/MODULES.md). Administrative dates are not
fiscal-allocation dates; foreign and 1861–present coverage is not exhaustive.
