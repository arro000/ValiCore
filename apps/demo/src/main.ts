import './style.css';
import { createValiCore, type ValiCoreEngine, type Person, type Place } from '@arro000/valicore';
import { attachPlaceSelector, type PlaceSelector } from '@arro000/valicore/ui';
import { integrationExample, type ExampleLanguage, type ExampleOperation } from './examples';

const $ = <T extends HTMLElement = HTMLElement>(selector: string) => document.querySelector<T>(selector)!;
let engine: ValiCoreEngine;
let birthSelector: PlaceSelector;
let standaloneSelector: PlaceSelector;
const escape = (value: unknown) => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));
const json = (value: unknown) => `<pre>${escape(JSON.stringify(value, null, 2))}</pre>`;
const output = (id: string, html: string, error = false) => {
  const element = $(`#${id}-result`);
  element.hidden = false;
  element.classList.toggle('error', error);
  element.innerHTML = html;
  const empty = document.querySelector(`#${id}-empty`);
  if (empty instanceof HTMLElement) empty.hidden = true;
};
const codeOutput = (code: string) => `<div class="code-output" data-testid="fiscal-code">${escape(code)}</div>`;
function placeCards(places: Place[]) {
  return `<div class="places-list">${places.map(place => `<article class="place"><strong>${escape(place.name)}</strong><span>${escape(place.belfioreCode ?? 'No Belfiore')} · ${escape(place.province ?? '')}</span><p>${escape(place.status === 'ceased' ? 'Historical record (ceased version)' : `${place.status} record`)} · ${escape(place.validFrom ?? 'Unknown start')} → ${escape(place.validTo ?? 'Open end')}${place.istatCode ? ` · ISTAT ${escape(place.istatCode)}` : ''}</p><details><summary>Record details</summary>${json(place)}</details></article>`).join('')}</div>`;
}

let language: ExampleLanguage = 'js';
const exampleOperation = $<HTMLSelectElement>('#example-operation');
function renderExample(operation = exampleOperation.value as ExampleOperation) {
  exampleOperation.value = operation;
  const source = integrationExample(operation, language);
  // Tokenize first, then escape each token; user-controlled HTML is never evaluated.
  $('#example-code').innerHTML = source.split(/(\/\/[^\n]*|'(?:\\.|[^'\\])*'|\b(?:import|from|const|await|type|as|true|false)\b|\b\d+\b)/g).map(token => {
    const kind = token.startsWith('//') ? 'comment' : token.startsWith("'") ? 'string'
      : /^(import|from|const|await|type|as|true|false)$/.test(token) ? 'keyword' : /^\d+$/.test(token) ? 'number' : '';
    return kind ? `<span class="token-${kind}">${escape(token)}</span>` : escape(token);
  }).join('');
}
exampleOperation.addEventListener('change', () => renderExample());
for (const button of document.querySelectorAll<HTMLButtonElement>('[data-language]')) {
  button.addEventListener('click', () => {
    language = button.dataset.language as ExampleLanguage;
    for (const item of document.querySelectorAll('[data-language]')) item.setAttribute('aria-pressed', String(item === button));
    renderExample();
  });
}
async function copyText(button: HTMLElement, value: string) {
  const original = button.textContent;
  try {
    await navigator.clipboard.writeText(value);
    button.textContent = 'Copied';
    $('#copy-feedback').textContent = 'Copied to clipboard';
  } catch {
    button.textContent = 'Select text to copy';
    $('#copy-feedback').textContent = 'Clipboard unavailable. Select and copy the text.';
  }
  window.setTimeout(() => { if (button.isConnected) button.textContent = original; }, 2200);
}
$('#copy-example').addEventListener('click', event => void copyText(event.currentTarget as HTMLElement, integrationExample(exampleOperation.value as ExampleOperation, language)));
$('#copy-install').addEventListener('click', event => void copyText(event.currentTarget as HTMLElement, $('#install-command').textContent!));
renderExample();

const tabs = [...document.querySelectorAll<HTMLButtonElement>('[data-tab]')];
function activate(tab: HTMLButtonElement) {
  const siblings = [...tab.closest('[role="tablist"]')!.querySelectorAll<HTMLButtonElement>('[data-tab]')];
  for (const button of siblings) {
    const selected = button === tab;
    button.setAttribute('aria-selected', String(selected));
    button.tabIndex = selected ? 0 : -1;
    $(`#${button.dataset.tab}-panel`).hidden = !selected;
  }
  renderExample(tab.dataset.tab as ExampleOperation);
}
for (const tab of tabs) {
  tab.addEventListener('click', () => activate(tab));
  tab.addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const siblings = [...tab.closest('[role="tablist"]')!.querySelectorAll<HTMLButtonElement>('[data-tab]')];
    const index = siblings.indexOf(tab);
    const target = event.key === 'Home' ? 0 : event.key === 'End' ? siblings.length - 1
      : (index + (event.key === 'ArrowRight' ? 1 : -1) + siblings.length) % siblings.length;
    activate(siblings[target]); siblings[target].focus();
  });
}
for (const feature of document.querySelectorAll<HTMLButtonElement>('[data-feature]')) {
  feature.addEventListener('click', () => {
    const tab = $<HTMLButtonElement>(`#${feature.dataset.feature}-tab`);
    activate(tab);
    tab.closest('.workspace')!.scrollIntoView({ block: 'start' });
    tab.focus({ preventScroll: true });
  });
}
document.querySelector<HTMLAnchorElement>('[href="#distribution-doc"]')!.addEventListener('click', () => {
  $<HTMLDetailsElement>('#distribution-doc').open = true;
});
document.querySelector('[data-show-example]')!.addEventListener('click', () => {
  renderExample('distribution');
  $('#developers').scrollIntoView({ block: 'start' });
  exampleOperation.focus({ preventScroll: true });
});

function invalidate(id: string) {
  $(`#${id}-result`).hidden = true;
  const empty = document.querySelector(`#${id}-empty`);
  if (empty instanceof HTMLElement) empty.hidden = false;
}
function updateCard(code?: string, description?: string) {
  const form = $<HTMLFormElement>('#calculate-form');
  const data = new FormData(form);
  $('#card-name').textContent = str(data, 'name').toUpperCase() || '—';
  $('#card-surname').textContent = str(data, 'surname').toUpperCase() || '—';
  $('#card-date').textContent = str(data, 'birthDate') || '—';
  $('#card-sex').textContent = str(data, 'sex');
  $('#card-place').textContent = description || str(data, 'birthplace').toUpperCase() || '—';
  $('#card-code').textContent = code || '••••••••••••••••';
  $('#health-card').dataset.stale = String(!code);
  $('#card-state').textContent = code ? 'Calculated' : 'Calculate to update';
}
for (const form of document.querySelectorAll<HTMLFormElement>('form')) {
  form.addEventListener('input', () => {
    const id = form.id.replace('-form', '');
    invalidate(id);
    if (id === 'calculate') updateCard();
  });
}

function formHandler(id: string, fn: (data: FormData) => void) {
  $<HTMLFormElement>(`#${id}-form`).addEventListener('submit', event => {
    event.preventDefault();
    if (!engine) return;
    try { fn(new FormData(event.currentTarget as HTMLFormElement)); }
    catch (error) {
      const detail = error as Error & { code?: string };
      output(id, `<h3>${escape(detail.code ?? 'Error')}</h3><p>${escape(detail.message)}</p>`, true);
    }
  });
}
const str = (data: FormData, key: string) => String(data.get(key) ?? '').trim();

formHandler('calculate', data => {
  const birthDate = str(data, 'birthDate');
  const birthplace = birthSelector.query();
  const person: Person = { name: str(data, 'name'), surname: str(data, 'surname'), sex: str(data, 'sex') as 'M' | 'F', birthDate, birthplace };
  const code = engine.encode(person);
  const report = engine.validate(code);
  const records = engine.resolvePlace({ belfioreCode: report.decoded!.belfioreCode, onDate: birthDate }).candidates;
  const placeDescription = records.map(place => `${place.name} · ${place.province ?? 'EE'}`).join(', ');
  updateCard(code, placeDescription);
  output('calculate', `<h3>Your calculated fiscal code</h3>${codeOutput(code)}${placeDescription ? `<p>Catalog birthplace record for the birth date: ${escape(placeDescription)}</p>` : ''}<button class="text-button" id="copy-code">Copy code</button><button class="text-button" id="decode-calculated">Decode this code</button><details><summary>Calculation details</summary>${json({ code, person, belfioreCode: report.decoded?.belfioreCode, dataVersion: report.dataVersion })}</details>`);
  $('#copy-code').addEventListener('click', async event => {
    await copyText(event.currentTarget as HTMLElement, code);
  });
  $('#decode-calculated').addEventListener('click', () => {
    $<HTMLInputElement>('#inspect-form [name="code"]').value = code;
    const year = Number(birthDate.slice(0, 4));
    $<HTMLInputElement>('#inspect-form [name="fromYear"]').value = String(year);
    $<HTMLInputElement>('#inspect-form [name="toYear"]').value = String(year);
    activate($<HTMLButtonElement>('#inspect-tab'));
    $<HTMLFormElement>('#inspect-form').requestSubmit();
    $<HTMLButtonElement>('#inspect-tab').focus();
  });
});
formHandler('inspect', data => {
  const code = str(data, 'code');
  const report = engine.validate(code, { yearRange: [Number(data.get('fromYear')), Number(data.get('toYear'))] });
  const title = report.valid === true ? 'All applicable checks passed' : report.valid === false ? 'A check failed' : 'Verification is indeterminate';
  const checks = report.checks.map(check => `<span class="check ${check.status}">${escape(check.name)}: ${escape(check.status)}</span>`).join('');
  const errors = report.checks.filter(check => check.error).map(check => `<p>${escape(check.error!.message)}</p>`).join('');
  const decoded = report.decoded;
  const relevant = new Set<string>();
  const datedPlaces = decoded?.candidateDates.map(date => {
    const places = report.places.filter(place => (place.validFrom !== null || place.validTo !== null)
      && (!place.validFrom || place.validFrom <= date) && (!place.validTo || place.validTo >= date));
    for (const place of places) relevant.add(place.id);
    return `<div class="date-candidate"><h4>Birthplace records for ${escape(date)}</h4>${places.length ? placeCards(places) : '<p>No dated catalog record covers this candidate date. Fiscal allocation cannot be inferred from this absence.</p>'}</div>`;
  }).join('') ?? '';
  const otherPlaces = report.places.filter(place => !relevant.has(place.id));
  output('inspect', `<h3>${title}</h3><div class="check-list">${checks}</div>${errors}${decoded ? `<dl class="decoded-fields"><div><dt>Surname fragment</dt><dd class="mono">${escape(decoded.surnameCode)}</dd></div><div><dt>Given-name fragment</dt><dd class="mono">${escape(decoded.nameCode)}</dd></div><div><dt>Encoded sex</dt><dd>Sex: ${escape(decoded.sex)}</dd></div><div><dt>Birthplace code</dt><dd class="mono">${escape(decoded.belfioreCode)}</dd></div></dl><p>Candidate dates: <strong>${escape(decoded.candidateDates.join(', '))}</strong>${decoded.centuryAmbiguous ? ' (century is ambiguous)' : ''}</p>${datedPlaces}${otherPlaces.length ? `<details><summary>Other historical versions (${otherPlaces.length})</summary>${placeCards(otherPlaces)}</details>` : ''}` : ''}<details><summary>Full structured report</summary>${json(report)}</details>`);
});
formHandler('omocodia', data => {
  const code = str(data, 'code'), mask = Number(data.get('mask'));
  const variant = engine.toOmocode(code, mask);
  output('omocodia', `<h3>Variant ${mask} · base ${escape(engine.toBase(code))}</h3>${codeOutput(variant)}<p>Bit mask: <span class="mono">${mask.toString(2).padStart(7, '0')}</span>. This API ordering is not an allocation order.</p><details><summary>All 128 combinations</summary>${json(engine.omocodes(code))}</details>`);
});
formHandler('places', data => {
  const places = engine.searchPlaces(str(data, 'query'), { province: str(data, 'province') || undefined, onDate: str(data, 'onDate') || undefined, activeOnly: data.has('activeOnly'), limit: 50 });
  output('places', `<h3>${places.length} matching records${places.length === 50 ? ' (first 50)' : ''}</h3>${places.length ? placeCards(places) : '<p>No records match these filters.</p>'}`);
});

formHandler('match', data => {
  const person: Person = { name: str(data, 'name'), surname: str(data, 'surname'), sex: str(data, 'sex') as 'M' | 'F', birthDate: str(data, 'birthDate'), birthplace: { name: str(data, 'birthplace') } };
  const report = engine.matchesPerson(str(data, 'code'), person);
  output('match', `<h3>${report.matches ? 'Encoded components match' : 'Encoded components do not match'}</h3><p>${report.mismatches.length ? `Mismatches: ${escape(report.mismatches.join(', '))}` : 'No component mismatches.'}</p><details><summary>Full match report</summary>${json(report)}</details>`, !report.matches);
});
formHandler('utilities', data => {
  const operation = str(data, 'operation') as 'nameCode' | 'surnameCode' | 'checksum' | 'numericChecksum';
  output('utilities', `<h3>${escape(operation)} result</h3><div class="code-output">${escape(engine[operation](str(data, 'value')))}</div>`);
});
$<HTMLSelectElement>('#utilities-form [name="operation"]').addEventListener('change', event => {
  const operation = (event.currentTarget as HTMLSelectElement).value;
  $<HTMLInputElement>('#utilities-form [name="value"]').value = ({ nameCode: 'Gianfranco', surnameCode: 'Rossi', checksum: 'RSSMRA85C15H501', numericChecksum: '0636339100' })[operation as 'nameCode'];
  invalidate('utilities');
});

$('#fill-example').addEventListener('click', () => {
  const form = $<HTMLFormElement>('#calculate-form');
  for (const [name, value] of Object.entries({ name: 'Mario', surname: 'Rossi', sex: 'M', birthDate: '1985-03-15', province: 'RM', birthplace: 'Roma' }))
    (form.elements.namedItem(name) as HTMLInputElement).value = value;
  birthSelector.refresh();
  invalidate('calculate');
  updateCard();
});
for (const button of document.querySelectorAll<HTMLButtonElement>('[data-selector-example]')) {
  button.addEventListener('click', () => {
    const olbia = button.dataset.selectorExample === 'olbia';
    $<HTMLInputElement>('#selector-date').value = olbia ? '2026-01-01' : '1993-03-15';
    $<HTMLInputElement>('#selector-province').value = olbia ? 'OT' : 'RN';
    $<HTMLInputElement>('#selector-municipality').value = olbia ? 'Olbia' : 'Cattolica';
    standaloneSelector.refresh();
  });
}

try {
  const manifestUrl = new URL('../dist/channels/v1/latest.json', new URL(import.meta.env.BASE_URL, location.href)).href;
  engine = await createValiCore({ distribution: { mode: 'pinned', manifestUrl } });
  const version = engine.versionInfo(), info = engine.datasetInfo();
  $('#runtime-status').textContent = `Ready · Rust/WASM ${version.engineVersion} · ${info.placeCount.toLocaleString('en')} place records · ANPR ${version.sourceDates['anpr-comuni']} · ISTAT ${version.sourceDates['istat-current'] ?? 'Not included'} · ${version.origin}`;
  $('#footer-version').textContent = `Engine ${version.engineVersion} · Dataset ${version.dataVersion}`;
  const coverage = info.coverage;
  const comparison = coverage && typeof coverage === 'object' && !Array.isArray(coverage)
    ? coverage.administrativeReconciliation : undefined;
  const reconciliation = comparison && typeof comparison === 'object' && !Array.isArray(comparison)
    && ['differences', 'conflicts', 'overlays'].every(key => typeof comparison[key] === 'number' && Number.isSafeInteger(comparison[key]))
    ? comparison : undefined;
  $('#source-summary').textContent = reconciliation
    ? `${reconciliation.differences} administrative differences · ${reconciliation.overlays} dated ISTAT versions · ${reconciliation.conflicts} unresolved source disagreements. Original ANPR downloads and comparison evidence are archived.`
    : 'This dataset does not include an ISTAT reconciliation report.';
  $<HTMLAnchorElement>('#dataset-source').href = new URL(`../dist/data/${version.dataVersion}/places.json`, new URL(import.meta.env.BASE_URL, location.href)).href;
  birthSelector = attachPlaceSelector({
    engine,
    date: $<HTMLInputElement>('#calculate-form [name="birthDate"]'),
    province: $<HTMLInputElement>('#birth-province'),
    municipality: $<HTMLInputElement>('#birthplace'),
  });
  standaloneSelector = attachPlaceSelector({
    engine,
    date: $<HTMLInputElement>('#selector-date'),
    province: $<HTMLInputElement>('#selector-province'),
    municipality: $<HTMLInputElement>('#selector-municipality'),
    onChange(selection) {
      if (selection.error) {
        output('selector', `<p>${escape(selection.error.message)}</p>`, true);
      } else if (selection.place) {
        output('selector', `<h3>Selected historical place record</h3>${placeCards([selection.place])}<p>Dataset ${escape(engine.versionInfo().dataVersion)} · No fiscal-code calculation required.</p><details><summary>Selection payload</summary>${json(selection)}</details>`);
      } else {
        output('selector', `<p>${selection.resolution?.status === 'ambiguous' ? 'Several places match. Select a province and a suggestion.' : 'Choose a province, then type and select a municipality or foreign country.'}</p>`);
      }
    },
  });
  for (const select of document.querySelectorAll<HTMLSelectElement>('select:disabled')) select.disabled = false;
  for (const input of document.querySelectorAll<HTMLInputElement>('input:disabled')) input.disabled = false;
  for (const button of document.querySelectorAll<HTMLButtonElement>('button[type="submit"]')) button.disabled = false;
  $('#fill-example').removeAttribute('disabled');
  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-selector-example]')) button.disabled = false;
} catch (error) {
  $('#runtime-status').classList.add('error');
  $('#runtime-status').textContent = `Unable to initialize: ${(error as Error).message}. Reload to retry.`;
  $('#footer-version').textContent = 'Runtime unavailable';
}
