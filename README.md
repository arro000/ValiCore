# ValiCore

Italian fiscal codes and source-dated municipality/province history. One
modular, deterministic Rust engine, shared by JavaScript/TypeScript through raw
WASM, Python through a native runtime, and the public C ABI.

**Public beta candidate — not published yet.** The release scope is fiscal
identity and geographic history. Only the latest beta will be maintained;
beta ends when the owner decides. Package availability, verified platforms and
remaining publication gates are recorded in [release readiness](docs/RELEASE.md).

[Use it](#use-it) · [Run locally](#run-locally) · [Docs](docs/README.md) ·
[Contribute](CONTRIBUTING.md) · [Security](SECURITY.md) · [Changes](CHANGELOG.md)

## Use it

Install the tarball built from this checkout, or a verified release tarball
when available. Registry publication is not implied:

```sh
npm install /path/to/arro000-valicore-0.5.0-beta.1.tgz
```

```ts
import { createValiCore } from '@arro000/valicore';

const cf = await createValiCore(); // Included runtime/data; no remote channel.
try {
  const code = cf.encode({
    name: 'Mario', surname: 'Rossi', sex: 'M', birthDate: '1985-03-15',
    birthplace: { belfioreCode: 'H501' },
  }); // RSSMRA85C15H501R
  cf.validate(code);                           // structured checks
  cf.decode(code, { yearRange: [1900, 2099] }); // explicit candidate dates
} finally {
  cf.dispose();
}
```

Includes all 128 omocodia masks, personal/numeric fiscal checksums, supported
Latin name normalization, dated place searches and optional HTML field
selectors. VAT checks are [format/checksum only](docs/VAT.md); REA checks are
[presentation only](docs/REA.md). Neither proves registration or allocation.

The complete package includes fiscal/geographic code and the geographic
snapshot. `profile: 'fiscal'` selects a real algorithm-only binary; named
`/fiscal` and `/italian` entrypoints default to no dataset. `catalog: false`
disables data initialization without changing the compiled binary. See
[composition](docs/MODULAR-BUILD.md) and [loading/custom datasets](docs/DISTRIBUTION.md).

Online loading is explicit. Hashes are checked and fallback uses only complete,
compatible releases. Loaded instances do not update in place: construct a new
instance for a new dataset.

Local validation does **not** prove tax-registry allocation or identity.
`valid: null` is indeterminate, not false. Decoding returns fragments and
candidate dates, not full names or a guessed century. Geographic coverage is
source-limited; administrative dates are not fiscal allocation dates.

Python installs from a runtime-inclusive platform wheel, without Rust or manual
library paths:

```sh
python -m pip install /path/to/valicore-0.5.0b1-py3-none-linux_x86_64.whl
```

```python
from valicore import create_valicore

with create_valicore() as cf:
    print(cf.decode("RSSMRA85C15H501R", {"yearRange": [1900, 2099]}))
```

The inclusive wheel is currently verified locally on Linux x64. Do not treat
that as Windows/macOS/ARM verification. See [Python](docs/PYTHON.md).

## Run locally

Development prerequisites: Node 22+, npm, Python 3.12+, Rust supporting edition
2024, the WASM target, and Playwright Chromium. Full Python verification also
needs pip, venv/ensurepip and setuptools >=77.

```sh
npm ci
rustup target add wasm32-unknown-unknown
npx playwright install chromium
npm run build
npm pack --workspace packages/js --pack-destination /tmp
npm run test:extensive
```

`npm run preview` serves archived assembled resources; `npm run build` rebuilds
current source. Root `/demo/` and `/ValiCore/demo/` are supported. Do not serve
uncompiled `apps/demo/`. `npm run sync:data` is an intentional live-source
update, never a build/test prerequisite.

## Project

- [PRD](PRD.md): implemented beta scope, limits and release criteria.
- [Modules](docs/MODULES.md): five-crate ownership/dependency contract.
- [JavaScript/TypeScript](packages/js/README.md), [Python](packages/python/README.md),
  [native/WASM ABI](docs/ABI.md), [HTML selectors](docs/UI.md).
- [Sources](docs/SOURCES.md), [historical coverage](docs/DATA.md),
  [redistribution and pending ADE terms](docs/DATA-LICENSES.md).
- [Testing](docs/TESTING.md), [security](SECURITY.md), [contributing](CONTRIBUTING.md).

Code is [MIT](LICENSE). Third-party data and assets retain their own terms;
provenance is not a blanket redistribution grant. No public hosting, registry
availability or final release certification is claimed by this candidate.
