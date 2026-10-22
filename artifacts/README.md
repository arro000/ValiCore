# Immutable runtime artifacts

`runtime/<build-id>.wasm.gz` and its metadata identify a compiled runtime by hash.
`releases/` pairs a runtime with a verified dataset snapshot. New builds may
append artifacts; never overwrite an existing hash-addressed runtime/release.

`notices/<build-id>-<notice-index-sha256>.json.gz` preserves the supplied runtime
hash and original code-license resources (base64 bytes plus a hashed inventory).
Fresh release identities include the notice-index hash; existing release archives
are not rewritten when notice delivery is introduced. These are conservative
build-environment notices, not dataset license grants or proof of which optional
code was linked. Archived previews with these resources can restore them without
Rust; older previews without notices are not certified for public redistribution.

Archives preserve provenance and offline previews. The first public beta tree
contains only selected current beta runtime/release/notices resources. Earlier
private prototype artifacts were excluded only after verified private
preservation; they are not compatibility paths to publish accidentally.
Never overwrite current hash-addressed evidence or confuse it with ignored output.

[Distribution contract](../docs/DISTRIBUTION.md) ·
[Module/filesystem ownership](../docs/MODULES.md).
