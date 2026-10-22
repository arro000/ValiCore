# @arro000/valicore

Thin JS/TS wrapper for the Rust/WASM Italian fiscal/geographic engine.
Node 22+, ESM and TypeScript declarations; Chromium is the initially verified
browser. Public beta candidate, not an advertised npm publication yet.

```ts
import { createValiCore } from '@arro000/valicore';

const cf = await createValiCore(); // Included runtime/data; no shared channel.
try {
  const code = cf.encode({
    name: 'Mario', surname: 'Rossi', sex: 'M', birthDate: '1985-03-15',
    birthplace: { belfioreCode: 'H501' },
  });
  cf.validate(code);
  cf.decode(code, { yearRange: [1900, 2099] });
  cf.omocodes(code);
} finally { cf.dispose(); }
```

Install the locally built/verified release tarball when available. Do not infer
registry availability from the package name. The same package serves JS/TS.

## Components, data and web builds

The complete default includes fiscal/geographic code and geographic data.
Profiles are `fiscal` and `italian` (fiscal + geo); only dataset ID `geo` exists.
Named entrypoints default to no dataset and bind exact compiled selection:

```ts
import { createValiCore as createFiscal } from '@arro000/valicore/fiscal';
const fiscal = await createFiscal();
// Release after use.
fiscal.dispose();
```

`catalog: false` or `datasets: []` skips data initialization without stripping
compiled code. `profile: 'fiscal'` selects the fiscal-only binary. Contradictory
options and unavailable requested resources fail explicitly. Excluded operations
fail `COMPONENT_UNAVAILABLE`; compiled but unloaded geography fails
`CAPABILITY_UNAVAILABLE`. No nearest-superset fallback.

Normal Vite builds need no Rust installation:

```ts
import valicore from '@arro000/valicore/vite';
export default { plugins: [valicore()] };
// In application code: import { createValiCore } from 'virtual:valicore';
```

The default plugin deploys included fiscal/geographic assets; explicit
`profile: 'fiscal'` deploys fiscal code without data. Custom source compositions
need Rust and the WASM target. The generic composer can use explicit dataset
paths. Keep hashed notices with every distributed runtime, including data-free
ones; CLI/Vite verify/copy them automatically.

## Loading and custom snapshots

Initialization is asynchronous; operations thereafter are local/synchronous.
A loaded instance never updates in place. Online loading is opt-in:

```ts
const online = await createValiCore({ distribution: {
  mode: 'online', channelUrl: 'https://your-host/dist/channels/v1/latest.json',
  fallback: false,
}});
```

The official target is not claimed live before publication. Online fallback,
when enabled, uses only complete compatible cached/packaged releases. Pinned
mode accepts a manifest URL without version fallback. Custom mode accepts:
`{mode: 'custom', manifest, wasm, datasets: {geo: dataset}}`.
Dataset objects are schema/version validated; Uint8Array/ArrayBuffer inputs are
also byte-hash checked. No legacy descriptor/provider aliases.

`versionInfo()` reports actual identity, components/operations, origin, data
version and source dates. `datasetInfo()` preserves source provenance. Source
metadata can be opaque JSON; unknown dates are not inferred.

## Limits and HTML fields

`validate` returns true/false/null validity; null is indeterminate, not false.
No result proves identity or tax-registry allocation. Decoding returns fragments
and candidate dates, not full names or a guessed century. Foreign history is
source-limited. VAT is format/checksum only; REA is presentation only, with
registry checks `not_run`. Birthplace history is a separate administrative
report for every candidate, not a fiscal allocation verdict.

The optional `@arro000/valicore/ui` adapter binds your HTML date, province input
or select, and municipality input to the same Rust catalog. It needs no fiscal
person details or CSS framework. Use `selector.query()` for encoding,
`refresh()` after programmatic edits, and `dispose()` before disposing its
engine. Ambiguous/missing selections never become fuzzy generation choices.

[Loading/custom data](https://github.com/arro000/ValiCore/blob/main/docs/DISTRIBUTION.md) ·
[Composition](https://github.com/arro000/ValiCore/blob/main/docs/MODULAR-BUILD.md) ·
[HTML adapter](https://github.com/arro000/ValiCore/blob/main/docs/UI.md) ·
[Dataset rights](https://github.com/arro000/ValiCore/blob/main/docs/DATA-LICENSES.md)

Code is MIT. Preserve dependency/runtime notices and third-party dataset terms;
code notices do not clear pending geographic redistribution questions.
