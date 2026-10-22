# Runtime composition

A composition produces one WASM or native library. Granular JS imports do not
magically remove Rust code; selecting a different compiled artifact does.
Shared registry: [config/components.json](../config/components.json).

## Selection

Configuration version 1 requires exactly one named profile or explicit
component list; dataset selection is independent and defaults empty.

| Profile | Components | Default data |
| --- | --- | --- |
| fiscal | fiscal: CF, names, omocodia, VAT, REA | none |
| italian | fiscal + geo | none |

Only geographic dataset ID `geo` exists. Geo-only custom builds use explicit
`components: ['geo']`, not a nonexistent named profile. No nearest-superset
fallback. Unknown/duplicate IDs, disabled resource ownership and contradictory
profile/component selections fail explicitly.

```json
{"configVersion":1,"profile":"italian","datasets":["geo"]}
```

Runtime API8 / loader2 metadata declares actual components, operations and
schemas. JSON ABI remains protocol1 and geographic schema1. Compiled exclusion
is enforced through Cargo dependencies, facade and dispatcher. Geo-free fiscal
operations preserve fragments/dates and explicit unavailable territorial checks.

## Precompiled consumers

The npm package includes both profiles and the complete default runtime/data.
Use CLI or Vite without a Rust installation:

```sh
npx valicore-build --profile fiscal --output ./valicore-assets
```

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import valicore from '@arro000/valicore/vite';
export default defineConfig({ plugins: [valicore()] });
```

```ts
// Application code: default plugin deploys included fiscal/geographic assets.
import { createValiCore } from 'virtual:valicore';
const cf = await createValiCore();
// Dispose when the application no longer needs the engine.
```

`valicore({ profile: 'fiscal' })` emits the fiscal runtime with no data.
The complete plugin default includes geography; explicit resource overrides
remain authoritative. Its virtual factory preserves catalog disabling and
rejects attempts to substitute another profile. It uses a pinned application-
local manifest, never an implicit shared public channel.

Composer outputs are staged, identity/hash/schema checked through actual runtime
creation, and promoted only after success. Existing output is not overwritten.
The generic CLI requires explicit selected dataset paths; Vite can use the
included geographic snapshot. Disabled payload getters are not accessed.

## Source compilation and native output

Custom component combinations require Rust and, for WASM, its target:

```sh
node tools/compose.mjs --config ./composition.json --target wasm --compile \
  --source . --output /tmp/valicore-wasm
node tools/compose.mjs --profile italian --target native --compile \
  --source . --output /tmp/valicore-native
```

Native output targets the selected build environment; these commands do not
establish a verified cross-platform binary matrix. Python accepts packaged or
explicit trusted native artifacts and can assert the exact component set.
Inclusive wheel assembly is documented in [Python](PYTHON.md).

## Resources and licenses

Selection, manifest and runtime must agree on components/operations/schemas,
compatibility numbers and optional dataset identity. Excluded operations fail
`COMPONENT_UNAVAILABLE`; unloaded geography fails `CAPABILITY_UNAVAILABLE`.
Changing data selection does not change compiled code.

Every output includes hashed code-license notices even without datasets.
Precompiled CLI/Vite deployment verifies/copies them without Rust; source builds
gather active-toolchain and locked dependency evidence offline. Missing or
corrupt notices prevent promotion. [Notice delivery](DISTRIBUTION.md#runtime-license-notices)
does not settle third-party dataset permissions.

The beta ships no experimental/prototype domains or old-runtime compatibility
paths. Verify each delivered composition through actual invocations, independent
expectations, ownership, installed consumers and browser/HTTP tests. A passing
dirty-tree report is not a committed release or a performance measurement.
