# Contributing to ValiCore

ValiCore is preparing an open-source beta. The first release prioritizes Italian
fiscal identity and historical municipality/province data, not the entire domain
roadmap. Only the latest beta is maintained. See [release preparation](docs/RELEASE.md)
for what is implemented, proposed and still awaiting verification.

## Before opening an issue

- Check existing issues and the [documentation](docs/README.md).
- For a bug, include the package/runtime versions, selected components, dataset
  edition, environment and a minimal reproduction with synthetic data.
- Never post real fiscal identities, health identifiers, credentials or customer
  datasets. A checksum-valid identifier need not be allocated to a real person.
- Report suspected vulnerabilities privately as described in [SECURITY.md](SECURITY.md).
- Discuss new domains, datasets and breaking API changes before implementing them.
  A plausible regular expression or an example in the PRD is not a specification.

## Development

Follow the [local setup](README.md#run-locally) and the
[verification guide](docs/TESTING.md). Tests/builds use preserved source editions;
normal development does not require live synchronization.

1. Make a focused change in the smallest owning module and preserve unrelated work.
2. Add independent regression tests. Do not regenerate expectations merely to
   agree with a changed implementation.
3. Run the relevant crate/wrapper/importer tests and Markdown link checks.
4. Run the full gate for cross-layer, ABI, runtime or distribution changes:

   ```sh
   npm run test:extensive
   ```

5. Update public types, examples and owning documentation with API changes.
   State exactly what you tested and what could not run on your platform.

Build prerequisites and supported delivery platforms are different: an installable
artifact is not verified on every platform simply because its source is portable.

## Architecture and data

- Keep algorithms in isolated Rust domain crates. Domains may depend on foundation,
  never peers, the facade or ABI. Only the facade composes domains.
- Keep JS/TS/Python wrappers thin: transport, lifecycle and integration, not a
  second implementation of domain rules.
- Preserve explicit unavailable/unknown/ambiguous results. Never turn missing
  historical evidence into a negative answer or choose a birth century silently.
- Cite authoritative rules and editions. Retain original source hashes, provenance,
  unknown dates and disagreements. Do not hand-edit generated datasets or overwrite
  immutable archives.
- Runtime composition and dataset loading are separate choices. Do not reintroduce
  excluded components through fallbacks or unnecessary dependencies.

See [module ownership](docs/MODULES.md), [ABI](docs/ABI.md),
[data contracts](docs/DATA.md) and [redistribution evidence](docs/DATA-LICENSES.md).

## Pull requests and commits

Use small, reviewable pull requests with an explanation of the problem, scope,
behavioral change, test evidence and compatibility/data implications. Link related
issues when applicable. Draft PRs are welcome; do not include generated build
caches, local reports, credentials or private tooling/session files.

Use [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/), for example:

```text
fix(fiscal): preserve uncertainty without geographic data
feat(geo): add a sourced dated alias
test(abi): cover disposal after failed initialization
```

Common types are `feat`, `fix`, `docs`, `test`, `build`, `ci`, `refactor` and
`chore`. Use `!` and explain the migration for an intentional breaking change.
Do not split a regression test from the fix solely to produce more commits.

## License and conduct

Contributions are accepted under the project's [MIT license](LICENSE), with no
separate contributor license agreement. Only submit material you have permission
to contribute. Third-party data/assets retain their own terms and attribution;
the code license does not override them. Preserve original copyright notices.

Follow the [Code of Conduct](CODE_OF_CONDUCT.md). Maintainers may request changes
or decline work outside the current release scope.
