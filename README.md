<div align="center">
  <h1>ValiCore</h1>
  <p><strong>One Rust engine for Italian fiscal codes and source-dated geographic history.</strong></p>

  [![Beta](https://img.shields.io/badge/status-beta-146957?style=flat-square)](CHANGELOG.md)
  [![Rust](https://img.shields.io/badge/core-Rust-19334b?style=flat-square&logo=rust)](Cargo.toml)
  [![Node 22+](https://img.shields.io/badge/Node-22%2B-19334b?style=flat-square&logo=nodedotjs)](packages/js/README.md)
  [![Python 3.12+](https://img.shields.io/badge/Python-3.12%2B-19334b?style=flat-square&logo=python)](packages/python/README.md)
  [![Verification](https://github.com/arro000/ValiCore/actions/workflows/pages.yml/badge.svg)](https://github.com/arro000/ValiCore/actions/workflows/pages.yml)
  [![MIT License](https://img.shields.io/badge/code-MIT-146957?style=flat-square)](LICENSE)
</div>

## Why ValiCore?

A fiscal code contains fragments, not a complete identity. A municipality can
change its name or province while keeping its fiscal code. Missing historical
evidence does not automatically mean an invalid birthplace.

ValiCore makes these distinctions explicit: deterministic fiscal algorithms,
source-dated geographic records and structured results shared across JavaScript,
TypeScript, Python and the native C ABI. No hosted validation API is required.

## Highlights

- **Generate and inspect fiscal codes**: names, dates, encoded sex and exact
  birthplace resolution, with all candidate centuries preserved when decoding.
- **All 128 omocodia masks**: convert variants, recover the base and compare
  encoded components without claiming proof of identity.
- **Historical places**: dated municipalities/provinces, aliases, accents and
  source-limited foreign birthplaces, with ANPR/ISTAT reconciliation evidence.
- **Explicit uncertainty**: validation levels and pass/fail/unknown/not-run
  results; `valid: null` is not silently converted into an invalid identifier.
- **Formal VAT and REA checks**: bounded format/checksum or presentation checks,
  never registry allocation or business-status verification.
- **Local by default**: included WASM/data for JS and runtime-inclusive Python
  wheel tooling; online loading is opt-in and custom datasets remain supported.
- **Selectable runtimes**: fiscal-only and fiscal/geographic profiles, with
  compiled components separate from optional data loading.
- **Thin integrations**: TypeScript declarations, optional HTML place selectors,
  a native C ABI and one Rust implementation of the rules.

## How It Works

1. Initialize an engine with included resources or explicit compatible inputs.
2. Run synchronous local operations against an immutable snapshot.
3. Inspect checks, candidate dates, source records and version metadata.
4. Dispose the engine when finished; native handles stay on their creating thread.

```ts
import { createValiCore } from '@arro000/valicore';

const cf = await createValiCore(); // Included runtime/data; no shared channel.
try {
  const code = cf.encode({
    name: 'Mario', surname: 'Rossi', sex: 'M', birthDate: '1985-03-15',
    birthplace: { belfioreCode: 'H501' },
  }); // RSSMRA85C15H501R
  console.log(cf.decode(code, { yearRange: [1900, 2099] }).candidateDates);
  // ['1985-03-15', '2085-03-15']
} finally { cf.dispose(); }
```

`profile: 'fiscal'` selects a real fiscal-only binary. `catalog: false` skips
geographic loading without stripping compiled code. Named `/fiscal` and
`/italian` entrypoints default to no dataset. See [composition](docs/MODULAR-BUILD.md).

## Requirements

**Consumers:** Node 22+ or a compatible modern browser for JS/WASM; Python 3.12+
with a wheel built and verified for the actual OS/architecture. Chromium and
Linux x64 native/Python are locally verified. Other native targets are configured
in Actions and must not be treated as verified until their jobs pass.

**Source builds:** npm, Rust supporting edition 2024, the WASM target and Python
3.12+. Full verification also requires Playwright Chromium, pip, venv/ensurepip
and setuptools >=77. No compiler is required when consuming an inclusive wheel.

## Installation

Use verified assets from [GitHub Releases](https://github.com/arro000/ValiCore/releases) when available, or
build from source below. Registry availability is not implied by package names;
there is no advertised npm/PyPI publication yet.

```sh
npm install /path/to/arro000-valicore-0.5.0-beta.1.tgz
python -m pip install /path/to/valicore-0.5.0b1-py3-none-linux_x86_64.whl
```

```python
from valicore import create_valicore

with create_valicore() as cf:
    print(cf.resolve_place({"name": "Cattolica", "onDate": "1985-03-15"}))
```

Python wheels include the selected native runtime, dated geography and notices.
No manual library path or Rust compilation is needed. Explicit native libraries
and custom snapshots remain available for advanced use. [Python guide](docs/PYTHON.md).

## Build From Source

Clone using GitHub's **Code** button, then run from the checkout:

```sh
npm ci
rustup target add wasm32-unknown-unknown
npx playwright install chromium
npm run build
npm pack --workspace packages/js --pack-destination /tmp
npm run preview
```

Preview serves the assembled demo at `http://localhost:8080/demo/`; repository-
prefixed `/ValiCore/demo/` works too. Do not serve uncompiled `apps/demo/`.

```sh
npm run test:extensive
npm run test:distribution
```

The gate rebuilds real runtimes, installs packages in separate consumers and
checks Rust/ABI, independent corpora, importers, types, examples, browser behavior
and HTTP integrity/cache policy. Normal builds/tests do not synchronize live
sources. [Testing and limits](docs/TESTING.md).

## Create A Release

A version tag must match coordinated source/package versions. The
[release workflow](.github/workflows/package.yml) verifies source and target-native
artifacts, checks hashes and creates **a draft prerelease**, not an automatic
public or registry publication. Manual dispatch tests builds without creating a
release. Final publication remains an owner-reviewed action.

Only the latest beta is maintained. Beta has no fixed end date and does not
imply a product-v1 compatibility commitment. [Release readiness](docs/RELEASE.md).

## Privacy And Safety

- Fiscal calculations and catalog queries run locally after initialization.
- No tax-registry lookup, personal-data upload or identity proof is provided.
- Online initialization is explicit; hashes and complete-release fallback are
  verified. Loaded instances never silently update in place.
- Decoding cannot recover full names or arbitrarily choose a birth century.
- Administrative/statistical dates are not fiscal allocation dates. Geographic
  and foreign history remain limited by source evidence.
- Third-party data retains its own terms. **ADE T2 reuse terms remain under
  review**; public consultability is not a redistribution grant. Attribution,
  permission evidence and limitations are [documented](docs/DATA-LICENSES.md).

## Project Structure

```text
ValiCore/
├── crates/valicore-foundation/      # Shared errors and Gregorian dates
├── crates/modules/                 # Fiscal identity and geographic history
├── crates/valicore/                 # Composition and validation facade
├── crates/valicore-abi/             # Native/raw WASM JSON transport
├── packages/                       # JS/TS and Python integrations
├── apps/demo/                      # Real-runtime browser integration
├── data/                           # Dated snapshots and source evidence
├── artifacts/                      # Immutable runtime/release resources
├── tools/                          # Build, verification and import orchestration
└── docs/                           # Detailed contracts and coverage
```

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request. Use
synthetic examples in reports and follow [SECURITY.md](SECURITY.md) for private
vulnerability disclosure. [Documentation](docs/README.md) covers the APIs,
source policy, custom data and operational lifecycle.

## Roadmap

- Publish reviewed beta assets and record actual target-native CI results.
- Operate monthly, changed-only geographic refresh with bounded retries.
- Improve evidence-backed historical coverage without guessing missing facts.
- Add domains or wrappers only after explicit scope/specification review.

The beta does not ship healthcare, classification, banking or medical-device
APIs. See the [PRD](PRD.md) for scope and acceptance criteria.

## License

Project code is available under [MIT](LICENSE). Bundled dependencies, fonts and
third-party datasets retain their own notices/terms; MIT is not a blanket data
license. Preserve packaged code and [data attribution](packages/js/DATA-NOTICE.md).

<div align="center">
  <sub>One engine. Explicit evidence. No guessed identity.</sub>
</div>
