# Runtime and geographic data distribution

## Local default and explicit online use

```ts
const local = await createValiCore(); // Included complete runtime + geography.
const algorithms = await createValiCore({ catalog: false }); // Same code, no data.
const fiscal = await createValiCore({ profile: 'fiscal' }); // Smaller compiled set.
```

Default initialization never attempts the shared channel. Named `/fiscal` and
`/italian` factories bind a real profile and default to no dataset. Explicit
`datasets: ['geo']` requests remain authoritative and fail if the selected
manifest does not carry it. Contradictory `catalog`/`datasets` options fail,
rather than silently discarding constraints. See [composition](MODULAR-BUILD.md).

```ts
// Explicit online mirror; only complete compatible fallback is allowed.
const online = await createValiCore({ distribution: {
  mode: 'online', channelUrl, cache: true, timeoutMs: 20000,
}});
// Strict fixed-manifest initialization, never fallback to another release.
const pinned = await createValiCore({ distribution: {
  mode: 'pinned', manifestUrl,
}});
```

The intended shared target is
<https://arro000.github.io/ValiCore/dist/channels/v1/latest.json>.
It is not claimed live while this candidate remains unpublished. Use packaged
files, application-local resources or your own verified mirror.

## Manifest and resources

Manifest version2 declares runtime name/version, API8, loader2, actual
components/modules/operations/schemas and hashed resource references.
Geographic data is exclusively `datasets.geo`, with version/schema/hash.
Legacy dataset descriptor fields and deferred-provider options are not aliases.

```text
dist/channels/v1/latest.json          complete fiscal/geographic resources
dist/channels/v1/fiscal.json          fiscal runtime, no dataset
dist/channels/v1/italian.json         fiscal/geographic runtime, no dataset
dist/runtime/<build-id>/engine.wasm
dist/data/<snapshot-id>/places.json
dist/releases/<content-identity>.json
dist/notices/<notice-hash>/index.json
```

Runtime/data/notices URLs are immutable; channel manifests are revalidated.
Resource/manifest/runtime identities must agree exactly. No nearest-superset
fallback, JavaScript glue download or executable remote JS. Data-only updates
do not change loaded instances or require recompiling fiscal algorithms.
Construct a new instance to load another snapshot. Offline package snapshots do
not silently update themselves.

## Custom datasets

```ts
const cf = await createValiCore({ datasets: ['geo'], distribution: {
  mode: 'custom', manifest, wasm, datasets: { geo: dataset },
}});
```

`wasm` and manifest are caller supplied; WASM SHA-256 and reported runtime
identity remain checked. A geographic payload may be a schema-v1 object,
`Uint8Array`, or `ArrayBuffer`. Byte payloads must match the manifest SHA-256;
object inputs are runtime schema/version validated, not authenticated by an
unrelated serialized-byte hash. Supply verified bytes when byte identity is
required. [Schema and provenance](DATA.md) stay public and snapshot-independent.

With no requested datasets, the loader does not access geographic descriptors
or supplied payload getters. Runtime-only manifests can omit datasets. Schema,
unknown fields, invalid types and malformed dates do not become an empty catalog.
Loaded snapshots/indices are immutable; create a new engine for edited inputs.

## Compression and integrity

References may advertise `gzip: {url, sha256}`. Verify compressed bytes,
decompress, then verify the decoded resource hash before caching/using it.
Node uses zlib; browsers use `DecompressionStream` when available, otherwise the
raw representation. Corrupt/missing advertised gzip is an error, not permission
to downgrade integrity. Explicit `.gz` URLs must return gzip bytes, not already
HTTP-decoded JSON. HTTP-negotiated gzip/Brotli on raw URLs is separate.

## Cache and fallback

Node uses `~/.cache/valicore/v2`, configurable with `cacheDirectory`; browsers
use `valicore-v2` Cache Storage when available. `cache: false` disables
persistent caching. Storage failures do not block otherwise valid online use.
Cached resources are content-addressed and hash-checked before reuse.

Only after all requested resources and engine construction succeed is a
complete manifest promoted. Runtime-only and full-data manifest keys are
separate. A partial download cannot become a complete release, and bytes from
different releases are never combined to satisfy missing requested resources.

Explicit online failures try the complete compatible cached release, then the
selected packaged release, unless `fallback: false`. Profile selection is
preserved. Pinned mode never switches releases. `versionInfo()` reports actual
origin, versions, source reference dates and fallback reason. Absence of a
compatible complete local release fails explicitly.

## Runtime license notices

Code notices are shipped legal resources, not optional datasets. Each manifest
has a hashed notice index; each license/notice entry carries bytes/SHA-256.
The inventory includes project license, dependency notices and active Rust
standard-library copyright/licenses. Conservative build-only dependencies may
appear; this does not mean every alternative license applies simultaneously.

npm, precompiled CLI, Vite and native outputs preserve these resources. Inclusive
Python wheels include their native notice bundle; advanced transport-only
wheels contain no native library. The loader does not fetch notices during
engine initialization. Archives retain content-addressed notice resources.
Code notices do not clear [dataset reuse terms](DATA-LICENSES.md) or font licenses.

## Hosting and publication boundaries

Serve proper WASM/JSON types and CORS when needed. The assembled local server
supports `/demo/` and `/ValiCore/demo/`, gzip/Brotli, HEAD/304 and cache headers.
Successful versioned resources use immutable caching; channel/error responses
are not immutable. Do not assume GitHub Pages supports custom compression
headers; explicit gzip assets work independently of that capability.

GitHub is the initial intended repository/release/demo/data-channel host, not a
hosted validation API. Monthly source refresh, changed-only verified promotion
and bounded retry/issue handling are release requirements; see current
[readiness](RELEASE.md). No live deployment, CDN SLA or successful remote
workflow run is claimed by local tests. Package publication and making the
repository public require controlled owner-authorized release operations.
