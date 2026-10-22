# Changelog

Changes for installable public releases will be recorded here. The project is
preparing its first public beta; earlier private evaluation tags are not a public
support or compatibility promise. Only the latest beta is maintained.

## Unreleased — public beta preparation

### Scope

- Prioritize Italian fiscal-code generation, staged validation, decoding,
  omocodia, and source-dated municipality/province history.
- Keep explicit ambiguity, unavailable data and source-limited historical
  coverage visible; local checks do not prove official registry allocation.
- Treat additional domain work as separate from the first beta's supported scope.

### Integration and distribution

- Shared Rust engine with raw WASM/native JSON transport and thin wrappers.
- Selectable runtime components, separate datasets and documented custom data.
- Bundled initialization by default; remote access is explicit. Named profiles
  enforce their exact composition for online, pinned and packaged fallback use.
- Removed the nonexistent `geo` profile export and the declared-but-unexported
  public factory; supported granular entrypoints match the actual profile registry.
- Hash-verified code-license inventories retained with composed runtimes and
  CLI/Vite deployments, including algorithm-only output.
- Strict Python component expectations reject malformed or duplicate selections
  before creating a native handle.
- Runtime-inclusive Python platform-wheel tooling packages fiscal/geographic native
  code, dated geography and notices. Zero-configuration use, explicit no-data mode
  and caller-supplied runtimes/snapshots are verified from separate installed
  consumers on Linux x64; other platform artifacts still need verification.
- Vite development dependency updated to 7.3.7 following advisory review.

### Release preparation

- Contributor/security/conduct policies and structured issue/PR templates.
- Explicit release gates for installed consumers, platform claims, dataset terms,
  final artifact review and operational update/fallback behavior.

No public release, registry availability, final platform matrix or completed Git
history rewrite is asserted by this entry. Runtime/loader/data schema numbers are
not product release numbers; data edition changes are recorded by provider
provenance rather than being silently presented as algorithm changes.
