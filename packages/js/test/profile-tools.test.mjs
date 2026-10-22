import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarize, summarizeCpu, observeInstantiation } from '../../../tools/profile_cases.mjs';

test('profile statistics retain all finite samples and use the conventional median', () => {
  assert.deepEqual(summarize([4, 1, 3, 2]), { median: 2.5, min: 1, max: 4, samples: [4, 1, 3, 2] });
  assert.equal(summarize([8, 1, 2]).median, 2);
  for (const values of [[], [NaN], [Infinity]]) assert.throws(() => summarize(values));
});

test('CPU profile summaries weight actual samples and distinguish WASM/wrapper/idle', () => {
  const profile = { nodes: [
    { id: 1, callFrame: { functionName: 'wasm-function[1]', url: 'wasm://test', lineNumber: 0 } },
    { id: 2, callFrame: { functionName: 'callBytes', url: 'file:///packages/js/src/index.js', lineNumber: 1 } },
    { id: 3, callFrame: { functionName: '(idle)', url: '', lineNumber: 0 } },
  ], samples: [1, 2, 1, 3], timeDeltas: [10, 30, 40, 20] };
  const result = summarizeCpu(profile);
  assert.equal(result.samples, 4);
  assert.equal(result.sampledDurationUs, 100);
  assert.equal(result.categories.wasm.percent, 50);
  assert.equal(result.categories.wrapperJavaScript.percent, 30);
  assert.equal(result.categories.idle.percent, 20);
  assert.equal(result.topSelfFrames[0].functionName, 'wasm-function[1]');
  assert.throws(() => summarizeCpu({ ...profile, samples: [99], timeDeltas: [10] }));
  assert.throws(() => summarizeCpu({ ...profile, samples: [1], timeDeltas: [-1] }));
});

test('initialization observer restores the actual functions and never changes ownership inputs', async () => {
  const original = WebAssembly.instantiate, calls = [];
  const memory = new WebAssembly.Memory({ initial: 1 });
  const invoke = (...args) => { calls.push(args); return 42n; };
  WebAssembly.instantiate = async () => ({ module: {}, instance: { exports: { memory,
    valicore_invoke: invoke, valicore_create_json_owned: invoke } } });
  const baseline = WebAssembly.instantiate, observation = observeInstantiation();
  try {
    const result = await WebAssembly.instantiate(new Uint8Array(), {});
    assert.equal(result.instance.exports.valicore_create_json_owned(1, 2, 3, 4), 42n);
    assert.deepEqual(calls, [[1, 2, 3, 4]]);
    assert.equal(observation.memory(), memory);
    observation.finishInitialization();
    assert.equal(WebAssembly.instantiate, baseline);
    assert.equal(result.instance.exports.valicore_invoke, invoke);
    assert.equal(result.instance.exports.valicore_create_json_owned, invoke);
    observation.release();
    assert.equal(observation.memory(), undefined);
  } finally { observation.release(); WebAssembly.instantiate = original; }
});
