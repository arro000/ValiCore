# valicore-fiscal-identity

Pure Italian fiscal identifiers, independent of geographic datasets and transport.
Among workspace crates this domain depends only on foundation.

- Registered-name normalization and fiscal name/surname fragments.
- Personal CF structure, checksum, generation, decoding and all 128 omocodia masks.
- Strict Gregorian date inputs and explicit candidate-century ranges.
- Numeric fiscal checksum, Italian VAT format/checksum and REA presentation.

VAT/REA checks do not prove registry allocation or business registration. Numeric
CF does not encode a person. Same-base or person-component matching is not proof
of identity. Unsupported spellings fail rather than being silently transliterated.

Geographic resolution and dated territorial composition belong to the facade,
not this crate. No networking, hidden clock, domain peers or catalog dependencies.

```sh
cargo test -p valicore-fiscal-identity --locked
```

The independent expectations are in `tests/fixtures/` at workspace level; local
domain tests live here. See [fiscal semantics](../../../docs/ARCHITECTURE.md),
[VAT scope](../../../docs/VAT.md) and [REA scope](../../../docs/REA.md).
