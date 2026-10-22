export type ExampleLanguage = 'js' | 'ts';
export type ExampleOperation = 'calculate' | 'inspect' | 'omocodia' | 'places' | 'selector' | 'match' | 'utilities' | 'distribution';

const person = (typed: boolean) => `const person${typed ? ': Person' : ''} = {
  name: 'Mario',
  surname: 'Rossi',
  sex: 'M',
  birthDate: '1985-03-15',
  birthplace: { name: 'Roma', province: 'RM' },
};`;

export function integrationExample(operation: ExampleOperation, language: ExampleLanguage): string {
  const typed = language === 'ts';
  const types: Partial<Record<ExampleOperation, string>> = {
    calculate: 'Person', inspect: 'ValidationReport', omocodia: '', places: 'Place', match: 'Person, type MatchReport',
  };
  const typeImport = typed && types[operation] ? `, type ${types[operation]}` : '';
  const header = `import { createValiCore${typeImport} } from
  '@arro000/valicore';`;
  const init = `// Included runtime + data by default; no remote channel needed.
const cf = await createValiCore();`;
  const bodies: Record<ExampleOperation, string> = {
    calculate: `${person(typed)}

const code${typed ? ': string' : ''} = cf.encode(person);
console.log(code); // RSSMRA85C15H501R`,
    inspect: `const code = 'RSSMRA85C15H501R';
const options = { yearRange: [1900, 2099]${typed ? ' as [number, number]' : ''} };
const report${typed ? ': ValidationReport' : ''} = cf.validate(code, options);
const decoded = cf.decode(code, options);

console.log(report.valid, report.checks);
console.log(decoded.candidateDates);
// ['1985-03-15', '2085-03-15']
console.log(decoded.nameCode, decoded.places);`,
    omocodia: `const code = 'RSSMRA85C15H501R';
const variants${typed ? ': string[]' : ''} = cf.omocodes(code);
const variant = cf.toOmocode(code, 1);

console.log(variants.length); // 128
console.log(variant, cf.omocodiaMask(variant));
console.log(cf.toBase(variant));
console.log(cf.sameBase(code, variant)); // true`,
    places: `const places${typed ? ': Place[]' : ''} = cf.searchPlaces('Cattolica', {
  province: 'FO',
  onDate: '1985-03-15',
  limit: 20,
});
const provinces = cf.listProvinces({
  query: 'forli', onDate: '1985-03-15',
});

console.log(places, provinces);
console.log(cf.resolvePlace({
  name: 'Cattolica', province: 'FO',
  onDate: '1985-03-15',
}));`,
    selector: `import { attachPlaceSelector } from
  '@arro000/valicore/ui';

// Connect existing fields in your form.
const date = document.querySelector${typed ? '<HTMLInputElement>' : ''}('#date')${typed ? '!' : ''};
const province = document.querySelector${typed ? '<HTMLInputElement>' : ''}('#province')${typed ? '!' : ''};
const municipality = document.querySelector${typed ? '<HTMLInputElement>' : ''}('#municipality')${typed ? '!' : ''};

const selector = attachPlaceSelector({
  engine: cf, date, province, municipality,
  onChange: ({ place }) => console.log(place),
});
// selector.query() → birthplace for cf.encode()
// selector.refresh() after programmatic edits

// When unmounting, before disposing the engine:
selector.dispose();`,
    match: `${person(typed)}

const result${typed ? ': MatchReport' : ''} = cf.matchesPerson(
  'RSSMRA85C15H501R', person,
);
console.log(result.matches); // true
console.log(result.mismatches); // []
// Encoded-component match, not proof of identity.`,
    utilities: `console.log(cf.nameCode('Gianfranco')); // GFR
console.log(cf.surnameCode('Rossi')); // RSS

// Bodies without their final check character.
console.log(cf.checksum('RSSMRA85C15H501')); // R
console.log(cf.numericChecksum('0636339100')); // 1`,
    distribution: `// All modes share the same calculation API.
const offline = await createValiCore({
  distribution: { mode: 'bundled' },
});
console.log(offline.versionInfo());
console.log(offline.datasetInfo().placeCount);
offline.dispose();

// Skip geographic data when only algorithms are needed.
const algorithms = await createValiCore({
  catalog: false, distribution: { mode: 'bundled' },
});
console.log(algorithms.capabilities());
console.log(algorithms.validate('RSSMRA85C15H501R', {
  level: 'calendar',
}).valid); // true; does not establish allocation

// Italian VAT format/checksum only, never registry allocation or activity.
const vat = algorithms.validateItalianVat('IT06363391001');
console.log(vat.valid); // true for these bounded formal checks
console.log(vat.scope); // format_checksum
console.log(vat.checks[2].status); // not_run (registry)

// REA presentation only; no chamber-register allocation check.
console.log(algorithms.validateItalianRea('RM-000123456').scope);
algorithms.dispose();

// Select an actual fiscal-only binary, without geography or dataset loading.
const fiscal = await createValiCore({ profile: 'fiscal' });
console.log(fiscal.versionInfo().components); // ['fiscal']
fiscal.dispose();

// Online: use your published compatible channel.
// const online = await createValiCore({
//   distribution: {
//     mode: 'online', channelUrl,
//     cache: true, fallback: false,
//   },
// });
// Pinned: { mode: 'pinned', manifestUrl }
// Custom: { mode: 'custom', manifest, wasm, datasets: { geo: dataset } }`,
  };
  return operation === 'distribution' ? `${header}\n\n${bodies[operation]}`
    : `${header}\n\n${init}\n\n${bodies[operation]}\n\n// Release when you no longer need the engine.\ncf.dispose();`;
}
