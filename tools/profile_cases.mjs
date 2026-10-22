// Browser-safe, fixed diagnostic workloads. All algorithms still execute in Rust.
export function summarize(values) {
  if (!values.length || values.some(value => !Number.isFinite(value))) throw new Error('Samples must be nonempty finite numbers');
  const sorted = [...values].sort((a, b) => a - b), middle = Math.floor(sorted.length / 2);
  return { median: sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2,
    min: sorted[0], max: sorted.at(-1), samples: values };
}

export function scenarios(engine, corpus) {
  const operations = new Set(engine.versionInfo().operations);
  const fiscal = corpus.fiscal.vectors.slice(0, 32), checks = corpus.fiscal.checksums.slice(0, 32);
  const vats = corpus.vat.valid.slice(0, 32);
  const person = { name: 'Mario', surname: 'Rossi', sex: 'M', birthDate: '1985-03-15', birthplace: { belfioreCode: 'H501' } };
  const cases = [
    ['checksum', 2000, 16000, i => engine.checksum(checks[i % checks.length].body)],
    ['numericChecksum', 2000, 16000, i => engine.numericChecksum(corpus.fiscal.numericChecksums[i % 32].body)],
    ['validateCalendar', 500, 4000, i => engine.validate(fiscal[i % fiscal.length].code, { level: 'calendar', yearRange: [1900, 2099] })],
    ['encodeBelfiore', 500, 4000, () => engine.encode(person)],
    ['decodeTwoCenturies', 300, 4000, i => engine.decode(fiscal[i % fiscal.length].code, { yearRange: [1900, 2099] })],
    ['decodeAllCenturies', 100, 1000, () => engine.decode('RSSMRA85C15H501R')],
  ];
  // Only compile-time available operations are measured; excluded ones fail explicitly.
  if (operations.has('validateItalianVat')) cases.push(['validateItalianVat', 1000, 12000, i => engine.validateItalianVat(vats[i % vats.length].input)]);
  if (engine.capabilities().geoHistorical) cases.push(
    ['resolvePlace', 300, 2000, () => engine.resolvePlace({ belfioreCode: 'H501', onDate: '1985-03-15' })],
    ['searchBroad', 100, 200, i => engine.searchPlaces(['a', 'san', 'roma', 'cattolica'][i % 4], { limit: 20 })],
    ['searchProvince', 100, 500, i => engine.searchPlaces(['a', 'san', 'roma', 'ca'][i % 4], { province: 'RM', onDate: '1985-03-15', limit: 20 })],
    ['listProvinces', 20, 60, i => engine.listProvinces({ onDate: ['1985-03-15', '2025-12-31', '2026-01-01', '1993-01-01'][i % 4] })],
  );
  return cases.map(([name, calls, profileCalls, run]) => ({ name, calls, profileCalls, run }));
}

export function assertUsable(engine, catalog) {
  const operations = new Set(engine.versionInfo().operations);
  const checks = [
    engine.capabilities().geoHistorical === catalog,
    engine.encode({ name: 'Mario', surname: 'Rossi', sex: 'M', birthDate: '1985-03-15', birthplace: { belfioreCode: 'H501' } }) === 'RSSMRA85C15H501R',
  ];
  if (operations.has('validateItalianVat')) checks.push(engine.validateItalianVat('IT06363391001').valid === true);
  if (!checks.every(Boolean)) {
    throw new Error('Profile worker did not initialize the expected functional composition');
  }
}

export function measureOperations(cases, batches = 3) {
  const operations = {};
  for (const scenario of cases) {
    for (let i = 0; i < 20; i++) scenario.run(i);
    const elapsed = [];
    for (let batch = 0; batch < batches; batch++) {
      const start = performance.now();
      for (let i = 0; i < scenario.calls; i++) scenario.run(i);
      elapsed.push((performance.now() - start) / scenario.calls);
    }
    operations[scenario.name] = { callsPerBatch: scenario.calls, batches, millisecondsPerCall: summarize(elapsed) };
  }
  return operations;
}

export function summarizeCpu(profile) {
  const nodes = new Map(profile.nodes.map(node => [node.id, node]));
  const totals = new Map(), categories = {};
  let durationUs = 0;
  for (let i = 0; i < (profile.samples?.length ?? 0); i++) {
    const delta = profile.timeDeltas[i], node = nodes.get(profile.samples[i]);
    if (!node || !Number.isFinite(delta) || delta < 0) throw new Error('Invalid CPU sample/node/time delta');
    totals.set(node.id, (totals.get(node.id) ?? 0) + delta);
    durationUs += delta;
    const { functionName: name, url } = node.callFrame;
    const category = name === '(idle)' ? 'idle' : name === '(garbage collector)' ? 'gc'
      : (url.startsWith('wasm:') || name.startsWith('wasm-function')) ? 'wasm'
      : (url.includes('packages/js/src/index.js') || url.includes('profile-wrapper.js')) ? 'wrapperJavaScript'
      : 'otherHarnessOrPlatform';
    categories[category] = (categories[category] ?? 0) + delta;
  }
  return { samples: profile.samples?.length ?? 0, sampledDurationUs: durationUs,
    categories: Object.fromEntries(Object.entries(categories).map(([name, selfTimeUs]) => [name,
      { selfTimeUs, percent: durationUs ? 100 * selfTimeUs / durationUs : null }])),
    topSelfFrames: [...totals].sort((a, b) => b[1] - a[1]).slice(0, 15).map(([id, selfTimeUs]) => ({
      ...nodes.get(id).callFrame, selfTimeUs, percent: durationUs ? 100 * selfTimeUs / durationUs : null,
    })) };
}

// Export wrapping is confined to initialization. Operations then use the original
// functions; the real memory/buffers/ownership and return values are untouched.
export function observeInstantiation() {
  const original = WebAssembly.instantiate;
  const phases = { instantiateMs: 0, ownedCatalogCreateMs: 0, initializationInvokeMs: 0 };
  let memory, exported, actual;
  WebAssembly.instantiate = async (...arguments_) => {
    const start = performance.now();
    const result = await Reflect.apply(original, WebAssembly, arguments_);
    phases.instantiateMs += performance.now() - start;
    actual = (result.instance ?? result).exports;
    exported = { ...actual };
    memory = actual.memory;
    for (const [name, metric] of [['valicore_create_json_owned', 'ownedCatalogCreateMs'], ['valicore_invoke', 'initializationInvokeMs']]) {
      exported[name] = (...args) => {
        const before = performance.now();
        try { return actual[name](...args); }
        finally { phases[metric] += performance.now() - before; }
      };
    }
    return { module: result.module, instance: { exports: exported } };
  };
  return { phases, memory: () => memory,
    finishInitialization() { if (exported) Object.assign(exported, actual); WebAssembly.instantiate = original; },
    release() { WebAssembly.instantiate = original; memory = exported = actual = undefined; } };
}
