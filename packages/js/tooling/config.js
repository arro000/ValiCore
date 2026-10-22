// Shared build-time configuration validation; no domain algorithms/acquisition.
import { createHash } from 'node:crypto';
const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
function fail(message) { throw Object.assign(new Error(message), { code: 'INVALID_COMPOSITION' }); }
function object(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail(`${label} must be a plain object`);
  for (const descriptor of Object.values(Object.getOwnPropertyDescriptors(value))) {
    if (!own(descriptor, 'value')) fail(`${label} must not contain accessor properties`);
  }
}
function selection(value, known, label) {
  if (!Array.isArray(value) || value.some(id => typeof id !== 'string' || !known.includes(id))) fail(`${label} must contain known string identifiers`);
  if (new Set(value).size !== value.length) fail(`${label} must not contain duplicates`);
  return known.filter(id => value.includes(id));
}
export function frozen(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(frozen); Object.freeze(value); }
  return value;
}
export function normalizeComposition(config, registry) {
  object(config, 'Composition');
  const ids = registry.components.map(component => component.id);
  const keys = ['configVersion', 'profile', 'components', 'datasets'];
  if (Reflect.ownKeys(config).some(key => !keys.includes(key))) fail('Unknown composition configuration field');
  if (config.configVersion !== 1) fail('configVersion must be integer 1');
  let selected;
  if (own(config, 'profile')) {
    if (typeof config.profile !== 'string' || !own(registry.profiles, config.profile)) fail('Unknown precompiled profile');
    if (own(config, 'components')) fail('Choose profile or components, not both');
    selected = registry.profiles[config.profile];
  } else {
    if (!own(config, 'components')) fail('Select components or a precompiled profile explicitly');
    selected = selection(config.components, ids, 'components');
  }
  if (!selected.length) fail('At least one component is required');
  for (const component of registry.components.filter(c => selected.includes(c.id))) {
    for (const required of component.requires) if (!selected.includes(required)) fail(`${component.id} requires explicit component ${required}`);
  }
  const components = ids.filter(id => selected.includes(id));
  const datasets = own(config, 'datasets') ? selection(config.datasets, Object.keys(registry.datasets), 'datasets') : [];
  for (const dataset of datasets) {
    const owner = registry.datasets[dataset].component;
    if (!components.includes(owner)) fail(`Dataset ${dataset} requires component ${owner}`);
  }
  const profile = Object.entries(registry.profiles).find(([, list]) => list.length === components.length && components.every(id => list.includes(id)))?.[0] ?? null;
  const operations = [...registry.commonOperations];
  for (const component of registry.components.filter(c => components.includes(c.id))) {
    for (const operation of component.operations) {
      if ((component.operationRequires?.[operation] ?? []).every(id => components.includes(id))) operations.push(operation);
    }
  }
  operations.sort();
  const schemas = Object.fromEntries(Object.entries(registry.datasets).filter(([, value]) => components.includes(value.component)).map(([id, value]) => [id, value.schemaVersion]));
  const normalized = { configVersion: 1, components, datasets };
  const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
  return { ...normalized, profile, operations, schemas,
    modules: [...new Set(registry.components.filter(c => components.includes(c.id)).map(c => c.module))],
    runtimeApiMajor: registry.runtimeApiMajor, loaderProtocol: registry.loaderProtocol,
    runtimeCompositionHash: hash({ configVersion: 1, components }), compositionHash: hash(normalized) };
}
