# Cross-layer verification

Independent fixtures and generators:

- `fixtures/fiscal-vectors.json`: fiscal generation/decoding/names/checksums;
  `tools/tests/generate_vectors.py` does not import production Rust.
- `fixtures/italian-vat-vectors.json`: decimal-table format/checksum oracle.
- `fixtures/italian-rea-vectors.json`: presentation expectations, not allocation.
- `fixtures/birthplace-history-vectors.json`: explicit administrative interval
  expectations for every candidate date.
- `browser/`: real demo/selector/distribution/Vite tests, root/subpath and mobile
  behavior, not claims of arbitrary browser or operating-system support.

Domain tests live with their crates, cross-domain matrices in the facade,
ABI/wrapper/importer tests with their owners. Python suites run from installed
wheels outside the checkout. `npm run test:extensive` rebuilds actual runtimes
and requires no live-source download. [Coverage and limits](../docs/TESTING.md).
