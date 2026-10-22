// Build-time WASM inspection through the same raw JSON ABI as clients.
const encoder = new TextEncoder(), decoder = new TextDecoder();
export async function wasmTransport(bytes) {
  const { module, instance } = await WebAssembly.instantiate(bytes, {});
  if (WebAssembly.Module.imports(module).length) throw new Error('Selected runtimes must not require host imports');
  const ex = instance.exports;
  if (!(ex.memory instanceof WebAssembly.Memory) || ['valicore_alloc', 'valicore_dealloc', 'valicore_invoke', 'valicore_create_json_owned'].some(key => typeof ex[key] !== 'function')) {
    throw new Error('Selected runtime is missing required ABI exports');
  }
  function call(input, context) {
    if (input.length > 0xffffffff || context?.length > 0xffffffff) throw new Error('ABI input exceeds u32 length');
    const pointer = ex.valicore_alloc(input.length);
    let contextPointer = 0, outPointer = 0, outLength = 0, transferred = false;
    try {
      new Uint8Array(ex.memory.buffer, pointer, input.length).set(input);
      let packed;
      if (context) {
        contextPointer = ex.valicore_alloc(context.length);
        new Uint8Array(ex.memory.buffer, contextPointer, context.length).set(context);
        transferred = true;
        packed = ex.valicore_create_json_owned(pointer, input.length, contextPointer, context.length);
      } else packed = ex.valicore_invoke(pointer, input.length);
      packed = BigInt.asUintN(64, packed);
      outPointer = Number(packed >> 32n); outLength = Number(packed & 0xffffffffn);
      const result = JSON.parse(decoder.decode(new Uint8Array(ex.memory.buffer, outPointer, outLength)));
      if (!result.ok) throw Object.assign(new Error(result.error.message), result.error);
      return result.value;
    } finally {
      if (outLength) ex.valicore_dealloc(outPointer, outLength);
      if (context) ex.valicore_dealloc(contextPointer, context.length);
      if (!transferred) ex.valicore_dealloc(pointer, input.length);
    }
  }
  const invoke = request => call(encoder.encode(JSON.stringify({ ...request, protocol: 1 })));
  const create = (geoBytes, geoVersion, additional = {}) => geoBytes
    ? call(geoBytes, encoder.encode(JSON.stringify({ dataVersion: geoVersion, ...additional }))).handle
    : invoke({ op: 'create', ...additional });
  return { invoke, create, info: invoke({ op: 'info' }) };
}
