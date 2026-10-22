# valicore-abi

Transport layer for WASM and native clients. Contains no domain rules.

- Versioned JSON dispatcher (`dispatch`) for `info`, `create`, fiscal and catalog
  operations.
- Raw WASM ABI: `valicore_alloc`, `valicore_dealloc`, `valicore_invoke`, `valicore_create_json_owned`.
- Native C ABI: `valicore_alloc`, `valicore_dealloc`, `valicore_invoke` with an out-length.
- Thread-local engine handles; handles are thread-affine.

See the [ABI contract](../../docs/ABI.md) for ownership and buffer semantics.
Build the WASM module with:

```sh
cargo build --locked --release -p valicore-abi --target wasm32-unknown-unknown
```
