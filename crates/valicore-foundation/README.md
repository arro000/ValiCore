# valicore-foundation

Shared `ValiCoreError` / `Result` and strict Gregorian `CivilDate` (years 1–9999).
No domain schemas, protocol versions, IO, clock or timezone. Uses `serde`.

```sh
cargo test -p valicore-foundation --locked
```

[Module contract](../../docs/MODULES.md). Domain-independent primitives belong
here; domain rules and dataset storage do not.
