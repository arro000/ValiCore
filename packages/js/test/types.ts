import { createValiCore, ValiCoreEngine, ValiCoreError, type Person, type RuntimeManifest, type JsonValue } from '../src/index.js';
import { attachPlaceSelector } from '../src/ui.js';
import { compose, type CompositionConfig } from '../tooling/index.js';

const engine: ValiCoreEngine = await createValiCore();
const person: Person = { name: 'Mario', surname: 'Rossi', sex: 'M', birthDate: '1985-03-15', birthplace: { belfioreCode: 'H501' } };
const code: string = engine.encode(person);
engine.validate(code).valid satisfies boolean | null;
engine.decode(code, { yearRange: [1900, 2099] }).candidateDates satisfies string[];
engine.birthplaceHistory(code).allocationCheck.status satisfies 'not_run';
engine.birthplaceHistory(code).candidates[0].compatible satisfies boolean | null;
engine.matchesPerson(code, person).matches satisfies boolean;
engine.capabilities().fiscalIdentity satisfies boolean;
engine.capabilities().geoHistorical satisfies boolean;
engine.versionInfo().dataVersion satisfies string | null;
engine.datasetInfo().sources satisfies JsonValue;
engine.listProvinces({ onDate: '1985-03-15' })[0].placeCount satisfies number;
engine.resolvePlace({ name: 'Roma', province: 'RM' });
engine.validateItalianVat('IT06363391001').scope satisfies 'format_checksum';
engine.validateItalianRea('RM-000123456').scope satisfies 'presentation_format';
engine.omocodes(code, { includeBase: false });
new ValiCoreError('TEST', 'Structured error').code satisfies string;

const selector = attachPlaceSelector({ engine, date: document.createElement('input'), province: document.createElement('select'), municipality: document.createElement('input'), onChange: selection => { selection.place?.belfioreCode satisfies string | null | undefined; } });
selector.query(); selector.dispose();

const config: CompositionConfig = { configVersion: 1, profile: 'italian', datasets: ['geo'] };
compose(config, { output: '/new-output', resources: { geo: '/explicit/data.json' } });
declare const manifest: RuntimeManifest;
declare const wasm: Uint8Array;
createValiCore({ datasets: ['geo'], distribution: { mode: 'custom', wasm, manifest, datasets: { geo: { schemaVersion: 1, version: 'custom', sources: null, coverage: {}, places: [] } } } });

// @ts-expect-error No unreleased banking API in this beta.
engine.validateIban('CH9300762011623852957');
// @ts-expect-error No unreleased classification provider in this beta.
createValiCore({ ateco: true });
// @ts-expect-error Dataset selection names only compiled providers.
createValiCore({ datasets: ['aifa'] });
// @ts-expect-error No nonexistent profile aliases.
createValiCore({ profile: 'geo' });
// @ts-expect-error Mask selectors remain numeric.
engine.toOmocode(code, '1');
// @ts-expect-error Optional boolean constraints are not strings.
engine.omocodes(code, { includeBase: 'false' });
// @ts-expect-error Preserve leading zeros in identifiers.
engine.validateItalianVat(6363391001);
// @ts-expect-error Exactly one place selector is accepted.
engine.resolvePlace({ name: 'Roma', belfioreCode: 'H501' });
// @ts-expect-error History preserves calendar candidates; no onDate filter.
engine.birthplaceHistory(code, { onDate: '1985-03-15' });
// @ts-expect-error Removed initialization aliases must not be advertised.
createValiCore({ distribution: { mode: 'custom', wasm, manifest, dataset: {} } });
engine.dispose();
