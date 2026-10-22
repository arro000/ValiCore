# Names and distribution identity

ValiCore is the product name. Its neutral spelling does not establish additional
jurisdictions, validators, wrapper languages or translated messages. The public
beta surface is Italian fiscal identity and geographic history.

| Surface | Identifier |
| --- | --- |
| Repository | [arro000/ValiCore](https://github.com/arro000/ValiCore) |
| Rust facade | valicore / `valicore` |
| Shared primitives | valicore-foundation / `valicore_foundation` |
| Fiscal domain | valicore-fiscal-identity / `valicore_fiscal_identity` |
| Geographic domain | valicore-geo-historical / `valicore_geo_historical` |
| Transport | valicore-abi / `valicore_abi` |
| JS/TS package | `@arro000/valicore`; `/fiscal`, `/italian`, `/ui`, build/Vite tooling |
| JS factory/classes | createValiCore, ValiCoreEngine, ValiCoreError |
| Python package/factory | valicore / create_valicore |
| Native header | [include/valicore.h](../include/valicore.h) |
| Linux native library | libvalicore_abi.so; other targets use their actual platform extension |
| Rust WASM build | valicore_abi.wasm; served as engine.wasm |
| Native/raw WASM functions | valicore_alloc, valicore_dealloc, valicore_invoke |
| Additional WASM creation | valicore_create_json_owned |
| Required runtime name | ValiCore |
| Node/browser cache | ~/.cache/valicore/v2 / valicore-v2 |

Draft Rust/JS/engine version `0.5.0-beta.1` corresponds to Python distribution
`0.5.0b1` (PEP440). Runtime API8, loader2, JSON protocol1 and geographic schema1
are distinct. Protocol numbers do not mean product v1. No obsolete package,
export, identity or cache migration aliases are provided.

The existing repository is used, not replaced with another public repository.
Its current private preparation status does not establish public package/Pages
availability. Local serving supports `/demo/` and `/ValiCore/demo/`. Publication
and history presentation follow [release readiness](RELEASE.md); no old tag is
repurposed to masquerade as an earlier version of the beta.

Keep real source/provenance URLs unchanged, including historical original URLs.
A source URL spelling is evidence, not an obsolete compatibility API to rename.
