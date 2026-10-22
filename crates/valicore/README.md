# valicore

The composition facade for Italian fiscal identity and geographic history.
Only this crate combines domains; the foundation/domain crates do not depend
on the facade or each other.

Cargo features select `fiscal`, `geo`, or both (the default). Compiled components
and available operations are distinct from whether a geographic dataset is
loaded. `Engine::without_catalog()` needs no synthetic empty dataset;
`Engine::new(dataset)` validates and owns an immutable geographic snapshot.

- Generation with an unconstrained bare Belfiore code remains algorithmic.
- Name-based generation resolves administration at birth date unless explicitly
  constrained otherwise; ambiguous/missing results are not selected silently.
- Decoding preserves all calendar candidates and returns empty places/null data
  version without geography. It never guesses a birth century or full names.
- Requested territorial validation without evidence stays unknown/indeterminate,
  rather than being silently reduced to a checksum check.
- Candidate birthplace-history reports are separate administrative evidence,
  never proof of tax-registry allocation or identity.
- Loaded snapshots are read-only; edit recovered input and rebuild indices.

Runtime API major 8 describes this beta candidate's narrowed public contract;
it is not product v1. Shared dates/errors belong to foundation, data schema to
geography, integrated API identity here and JSON transport to the ABI crate.

```sh
cargo test -p valicore --locked
```

See [module ownership](../../docs/MODULES.md), [semantics](../../docs/ARCHITECTURE.md)
and the owning tests for independent corpus and dependency-direction checks.
