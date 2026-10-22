import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const wasm = await readFile(new URL('../bundled/engine.wasm', import.meta.url));
const encoder = new TextEncoder();
const decoder = new TextDecoder();
const dataset = { schemaVersion: 1, version: 'memory-fixture', sources: {}, coverage: {},
  places: [{ id: 'rome', sourceId: 'fresh-source', sourceRecordId: '1', name: 'ROMA', aliases: [], kind: 'municipality',
    status: 'active', belfioreCode: 'H501', istatCode: '058091', province: 'RM', validFrom: '1900-01-01', validTo: null }],
  ignoredExtension: 'x'.repeat(600000) };

test('owned WASM creation frees inputs on success and error without host imports or memory growth across disposal', async () => {
  const module = await WebAssembly.compile(wasm);
  assert.deepEqual(WebAssembly.Module.imports(module), []);
  const instance = await WebAssembly.instantiate(module, {});
  const abi = instance.exports;
  assert.equal(typeof abi.valicore_create_json_owned, 'function');
  assert.equal(abi.valicore_create_json, undefined, 'No obsolete borrowed-creation path is exported');

  const allocate = bytes => {
    const pointer = abi.valicore_alloc(bytes.length);
    new Uint8Array(abi.memory.buffer, pointer, bytes.length).set(bytes);
    return pointer;
  };
  const result = packed => {
    packed = BigInt.asUintN(64, packed);
    const pointer = Number(packed >> 32n), length = Number(packed & 0xffffffffn);
    try { return JSON.parse(decoder.decode(new Uint8Array(abi.memory.buffer, pointer, length))); }
    finally { abi.valicore_dealloc(pointer, length); }
  };
  const create = bytes => {
    const input = allocate(bytes);
    const context = encoder.encode(JSON.stringify({ dataVersion: dataset.version }));
    const contextPointer = allocate(context);
    try { return result(abi.valicore_create_json_owned(input, bytes.length, contextPointer, context.length)); }
    finally { abi.valicore_dealloc(contextPointer, context.length); }
    // Ownership transferred: the dataset pointer must never be freed here.
  };
  const invoke = request => {
    const bytes = encoder.encode(JSON.stringify({ protocol: 1, ...request }));
    const pointer = allocate(bytes);
    try { return result(abi.valicore_invoke(pointer, bytes.length)); }
    finally { abi.valicore_dealloc(pointer, bytes.length); }
  };
  const valid = encoder.encode(JSON.stringify(dataset));
  const invalidJson = valid.subarray(0, valid.length - 1);
  const invalidDataset = encoder.encode(JSON.stringify({ ...dataset, places: [{ ...dataset.places[0], id: '' }] }));
  const incompatible = encoder.encode(JSON.stringify({ ...dataset, schemaVersion: 2 }));
  for (const places of [null, false, 42, 'invalid', { not: 'an array' }]) {
    const wrongType = encoder.encode(JSON.stringify({ ...dataset, places }));
    assert.equal(create(wrongType).error.code, 'INVALID_ARGUMENT');
    const wrongSchema = encoder.encode(JSON.stringify({ ...dataset, schemaVersion: 2, places }));
    assert.equal(create(wrongSchema).error.code, 'INCOMPATIBLE_DATASET');
  }
  const exercise = () => {
    for (const [bytes, code] of [[invalidJson, 'INVALID_JSON'], [invalidDataset, 'INVALID_DATASET'], [incompatible, 'INCOMPATIBLE_DATASET']]) {
      const response = create(bytes);
      assert.equal(response.ok, false);
      assert.equal(response.error.code, code);
    }
    const response = create(valid);
    assert.equal(response.ok, true);
    const handle = response.value.handle;
    assert.equal(invoke({ op: 'encode', handle, person: { name: 'Mario', surname: 'Rossi', sex: 'M', birthDate: '1985-03-15', birthplace: { name: 'Roma' } } }).value, 'RSSMRA85C15H501R');
    assert.equal(invoke({ op: 'dispose', handle }).ok, true);
    assert.equal(invoke({ op: 'datasetInfo', handle }).error.code, 'INVALID_HANDLE');
  };
  exercise();
  const warmCapacity = abi.memory.buffer.byteLength;
  for (let i = 0; i < 20; i++) exercise();
  assert.ok(abi.memory.buffer.byteLength <= warmCapacity + 2 * 65536,
    'Repeated identical creation/disposal must reuse allocations, not retain input buffers or text pools');
});
