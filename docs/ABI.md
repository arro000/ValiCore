# Native and raw WASM JSON ABI

The same crate builds a native library and `wasm32-unknown-unknown` module.
[Public C header](../include/valicore.h). Beta identity is runtime API **8**,
loader protocol **2**, JSON request protocol **1**, geographic schema **1**.
Protocol/schema numbers do not denote product v1 or promise compatibility with
obsolete development runtimes.

## Native ownership

```c
uint8_t *valicore_alloc(uint32_t length);
void valicore_dealloc(uint8_t *pointer, uint32_t length);
uint8_t *valicore_invoke(const uint8_t *input, uint32_t length, uint32_t *output_length);
```

Allocate/fill UTF-8 JSON, invoke, copy the separately allocated output, then free
both buffers with the ABI allocator and **exact lengths**. Do not use the host
allocator. A zero-length buffer uses null; pointers must be valid throughout
the call. Invalid pointers are contract violations, not normal negative inputs.

Create/use/dispose native handles on the same thread. Multiple independent
handles are supported. Dispose through JSON before releasing the runtime.

## WASM ownership

WASM exports `memory`, alloc/dealloc and invoke. Invoke returns a packed u64:
high 32 bits are output pointer, low 32 bits output length. Interpret the
JavaScript BigInt as unsigned (`BigInt.asUintN(64, value)`). Refresh memory
views after allocations/calls because memory can grow. Free output separately.
No host imports, clock/network/DOM callbacks or generated wasm-bindgen glue.

Large geographic initialization uses:

```text
valicore_create_json_owned(dataset_pointer, dataset_length,
                          context_pointer, context_length)
```

Both inputs use ABI allocations. Context accepts only `dataVersion`, e.g.
`{"dataVersion":"custom-edition"}`. The dataset buffer **transfers ownership
on success and error**: never free it afterwards. Context remains caller-owned
and must be a separate allocation. Output remains separately caller-owned and
must be freed even for an error envelope. Ordinary invoke inputs remain
caller-owned.

Owned creation checks schema/version, derives row allocation hints, parses
pooled text and drops input before building indices. No snapshot-specific
limits/dictionaries. Success value contains `handle`, `dataVersion`, `sources`.
The wrapper requires this export; no borrowed/old-runtime fallback exists.

## JSON requests and errors

```json
{"protocol":1,"op":"info"}
```

`info` reports `runtimeName: "ValiCore"`, `engineVersion`, API/loader numbers,
actual `components`, `modules`, `operations`, and compiled `schemas`. The
complete artifact has components `fiscal`/`geo`, modules `fiscal_identity`/
`geo_historical`, and schema `geo: 1`. Fiscal-only artifacts do not declare geo.
Require exact composition agreement; module names alone do not prove availability.

Success envelope: `{"ok":true,"value":...}`. Error envelope:
`{"ok":false,"error":{"code":"...","message":"...","field":"..."}}`.
Field is optional, codes are machine-readable, messages English.

Create with `{"protocol":1,"op":"create","dataset":{...}}` or omit dataset
for algorithm-only use. Explicit null/invalid data is rejected. Create accepts
only protocol/op/optional dataset; unknown fields fail explicitly. Owned context
likewise rejects unknown fields. Schema versions and inappropriate numeric
arguments must be integers; no fractional/nonfinite constraint coercion.

Unknown operations fail `UNKNOWN_OPERATION` before handle lookup. Known but
excluded operations/data fail `COMPONENT_UNAVAILABLE`; compiled but unloaded
geography fails `CAPABILITY_UNAVAILABLE`. Neither becomes an empty success,
false negative or a larger fallback runtime. No synthetic catalog is created.

## Operations and payloads

| Operation | Additional keys |
| --- | --- |
| `info` | none |
| `create` | optional dataset; returns uint32 handle |
| `dispose`, `datasetInfo`, `capabilities` | handle |
| `encode` | handle, person |
| `validate`, `decode` | handle, code, optional options |
| `birthplaceHistory` | handle, code, optional yearRange-only options |
| `matchesPerson` | handle, code, person |
| `searchPlaces` | handle, query string, optional options |
| `listProvinces` | handle, optional onDate/query/activeOnly/kind options |
| `resolvePlace` | handle, query object |
| `validateItalianVat`, `validateItalianRea` | vat / rea string, no handle required |
| `checksum`, `numericChecksum` | body |
| `nameCode`, `surnameCode` | name / surname |
| `toBase`, `omocodiaMask` | code |
| `toOmocode` | code, mask 0–127 |
| `omocodes` | code, optional boolean includeBase |
| `sameBase` | left, right |

Example:

```json
{"protocol":1,"op":"encode","handle":1,"person":{"name":"Mario","surname":"Rossi","sex":"M","birthDate":"1985-03-15","birthplace":{"belfioreCode":"H501"}}}
```

No healthcare, classification or banking operations are part of API8 beta.
See [semantics](ARCHITECTURE.md) and [public declarations](../packages/js/src/index.d.ts).

## Wrapper conformance

A wrapper must check runtime/API/loader and compiled identity, preserve exact
buffer lengths, thread affinity and explicit disposal, retain null/unknown
results, and verify supplied resource hashes. No hidden clock, source queries,
algorithms, compatibility aliases or nearest-superset fallback. Reuse independent
[fixtures](../tests/fixtures/) and ABI availability/ownership tests, not module
names as an availability oracle.

[Python](PYTHON.md) provides a thin ctypes implementation. `tools/test_native.py`
compiles the C header, exercises real native fiscal/geographic requests, then
verifies transport-only and inclusive installed wheels in separate consumers.
