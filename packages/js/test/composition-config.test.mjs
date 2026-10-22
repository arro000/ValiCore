import test from 'node:test';
import assert from 'node:assert/strict';
import { parseComposition, componentRegistry } from '../../../tools/composition.mjs';

test('composition canonicalizes explicit components/resources and never picks a superset', () => {
  const fiscal = parseComposition({ configVersion: 1, components: ['fiscal'] });
  assert.equal(fiscal.profile, 'fiscal'); assert.deepEqual(fiscal.datasets, []);
  assert.deepEqual(fiscal.modules, ['fiscal_identity']); assert.deepEqual(fiscal.schemas, {});
  assert.ok(!fiscal.operations.includes('validateIban')); assert.ok(!fiscal.operations.includes('resolvePlace'));
  const geo = parseComposition({ configVersion: 1, components: ['geo'] });
  assert.equal(geo.profile, null); assert.ok(!geo.operations.includes('birthplaceHistory'));
  const reordered = parseComposition({ configVersion: 1, components: ['geo', 'fiscal'] });
  const italian = parseComposition({ configVersion: 1, profile: 'italian' });
  assert.equal(reordered.runtimeCompositionHash, italian.runtimeCompositionHash);
  const loaded = parseComposition({ configVersion: 1, profile: 'italian', datasets: ['geo'] });
  assert.equal(loaded.runtimeCompositionHash, italian.runtimeCompositionHash);
  assert.notEqual(loaded.compositionHash, italian.compositionHash);
  assert.deepEqual(loaded.datasets, ['geo']);
});

test('invalid configuration, implicit requirements and disabled resource ownership are rejected', () => {
  for (const value of [null, [], 1, 'fiscal', {}, { configVersion: 1 }, { configVersion: 1.5, profile: 'fiscal' },
    { configVersion: NaN, profile: 'fiscal' }, { configVersion: 1, components: [] },
    { configVersion: 1, components: ['unknown'] }, { configVersion: 1, components: ['fiscal', 'fiscal'] },
    { configVersion: 1, profile: 'unknown' }, { configVersion: 1, profile: 'fiscal', components: ['fiscal'] },
    { configVersion: 1, components: ['aifa'] }, { configVersion: 1, profile: 'fiscal', datasets: ['geo'] },
    { configVersion: 1, profile: 'italian', datasets: ['geo', 'geo'] },
    { configVersion: 1, profile: 'fiscal', datasets: null }, { configVersion: 1, profile: 'fiscal', extra: false }]) {
    assert.throws(() => parseComposition(value), { code: 'INVALID_COMPOSITION' });
  }
  const accessor = { configVersion: 1, get profile() { throw new Error('should not run'); } };
  assert.throws(() => parseComposition(accessor), { code: 'INVALID_COMPOSITION' });
  const hidden = { configVersion: 1, profile: 'fiscal' };
  Object.defineProperty(hidden, 'constraint', { value: true });
  assert.throws(() => parseComposition(hidden), { code: 'INVALID_COMPOSITION' });
  assert.throws(() => componentRegistry.profiles.fiscal.push('geo'), TypeError);
});

test('two beta profiles preserve truthful operations and separate dataset selection', () => {
  assert.deepEqual(Object.keys(componentRegistry.profiles), ['fiscal', 'italian']);
  for (const profile of Object.keys(componentRegistry.profiles)) {
    const value = parseComposition({ configVersion: 1, profile });
    assert.equal(value.profile, profile); assert.deepEqual(value.datasets, []);
    assert.equal(value.runtimeApiMajor, 8); assert.equal(value.loaderProtocol, 2);
    assert.equal(new Set(value.operations).size, value.operations.length);
  }
  const geo = parseComposition({ configVersion: 1, components: ['geo'], datasets: ['geo'] });
  assert.deepEqual(geo.components, ['geo']);
  assert.ok(geo.operations.includes('resolvePlace')); assert.ok(!geo.operations.includes('decode'));
});
