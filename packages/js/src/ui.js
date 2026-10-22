/** Bind ordinary HTML fields to the shared Rust place catalog. No fiscal rules here. */
export function attachPlaceSelector({ engine, date, province, municipality, onChange }) {
  const list = document.createElement('datalist');
  list.id = `valicore-places-${globalThis.crypto.randomUUID()}`;
  const previousList = municipality.getAttribute('list');
  const previousAutocomplete = municipality.getAttribute('autocomplete');
  municipality.setAttribute('list', list.id);
  municipality.setAttribute('autocomplete', 'off');
  municipality.after(list);
  const suggestions = new Map();
  const provinceIsInput = province.tagName === 'INPUT';
  const provinceList = document.createElement('datalist');
  provinceList.id = `valicore-provinces-${globalThis.crypto.randomUUID()}`;
  const oldProvinceList = province.getAttribute('list');
  const oldProvinceAutocomplete = province.getAttribute('autocomplete');
  if (provinceIsInput) {
    province.setAttribute('list', provinceList.id);
    province.setAttribute('autocomplete', 'off');
    province.after(provinceList);
  }
  let provinceEntries = [];
  const provinceLabel = entry => entry.name ? `${entry.name} (${entry.code})` : entry.code;
  const sameText = (left, right) => left.localeCompare(right, undefined, { sensitivity: 'base', ignorePunctuation: true }) === 0;
  function provinceEntry(text, entries = provinceEntries) {
    return entries.find(entry => [entry.code, provinceLabel(entry), entry.name, ...entry.aliases]
      .some(value => value && sameText(value, text.trim())));
  }
  function provinceCode() {
    if (!provinceIsInput) return province.value;
    if (!province.value.trim()) return '';
    const entry = provinceEntry(province.value);
    if (!entry) throw new Error('Select a province name or abbreviation available for the reference date.');
    return entry.code;
  }
  function setProvince(code) {
    const entry = provinceEntries.find(entry => entry.code === code);
    province.value = provinceIsInput ? (entry ? provinceLabel(entry) : '') : code;
  }
  let selected = null;
  let selectedValue = '';
  const label = place => `${place.name} · ${place.province ?? 'EE'}`;
  const options = () => ({ onDate: date.value || undefined, province: provinceCode() || undefined, limit: 50 });

  function query() {
    const choice = suggestions.get(municipality.value);
    return choice ? { belfioreCode: choice.belfioreCode, province: choice.province ?? undefined, onDate: date.value || undefined }
      : { name: municipality.value.trim(), province: provinceCode() || undefined, onDate: date.value || undefined };
  }
  function resolution() { return engine.resolvePlace(query()); }
  function notify() {
    const result = resolution();
    selected = result.status === 'unique' ? result.candidates[0] : null;
    selectedValue = municipality.value;
    if (selected) setProvince(selected.province ?? '');
    const detail = { onDate: date.value || null, province: provinceCode() || null, place: selected, resolution: result };
    municipality.dispatchEvent(new CustomEvent('placechange', { detail, bubbles: true }));
    onChange?.(detail);
  }
  function provinces() {
    const text = province.value;
    const current = provinceEntry(text)?.code ?? text;
    provinceEntries = engine.listProvinces({ onDate: date.value || undefined });
    if (provinceIsInput) {
      provinceList.replaceChildren(...provinceEntries.map(entry => new Option(entry.aliases.join(' / '), provinceLabel(entry))));
      const entry = provinceEntries.find(entry => entry.code === current) ?? provinceEntry(text);
      setProvince(entry?.code ?? '');
    } else {
      const any = new Option('All provinces / foreign countries', '');
      province.replaceChildren(any, ...provinceEntries.map(entry => new Option(
        `${provinceLabel(entry)} (${entry.placeCount})`, entry.code,
      )));
      setProvince(provinceEntries.some(entry => entry.code === current) ? current : '');
    }
  }
  function autocomplete() {
    const chosen = suggestions.get(municipality.value);
    if (!chosen) {
      const places = engine.searchPlaces(municipality.value, options());
      suggestions.clear();
      const codesByLabel = new Map();
      for (const place of places) {
        const text = label(place);
        if (!codesByLabel.has(text)) codesByLabel.set(text, new Set());
        codesByLabel.get(text).add(place.belfioreCode);
      }
      const seen = new Set();
      list.replaceChildren(...places.flatMap(place => {
        if (!place.belfioreCode || place.birthAllowed === false) return [];
        const text = codesByLabel.get(label(place)).size > 1
          ? `${label(place)} · ${place.validFrom ?? 'Unknown start'} → ${place.validTo ?? 'Open end'} · Record ${place.sourceRecordId}`
          : label(place);
        if (seen.has(text)) return [];
        seen.add(text); suggestions.set(text, place);
        return [new Option('', text)];
      }));
    }
    // Selecting a native datalist option emits input too; preserve its mapping.
    notify();
  }
  function refresh() {
    const previous = selectedValue === municipality.value ? selected : null;
    provinces();
    suggestions.clear();
    if (previous) {
      const result = engine.resolvePlace({ belfioreCode: previous.belfioreCode, onDate: date.value || undefined });
      const updated = result.candidates.find(place => place.name === previous.name) ?? result.candidates[0];
      if (result.status === 'unique' && updated) {
        setProvince(updated.province ?? '');
        municipality.value = label(updated);
        suggestions.set(municipality.value, updated);
      } else {
        // Retain the name for a fresh date-constrained resolution; never reuse a stale code.
        municipality.value = previous.name;
      }
    }
    autocomplete();
  }
  function guard(action) {
    return () => {
      municipality.setCustomValidity('');
      province.setCustomValidity('');
      try { action(); }
      catch (error) {
        selected = null;
        municipality.setCustomValidity(error.message);
        if (provinceIsInput && province.value && !provinceEntry(province.value)) province.setCustomValidity(error.message);
        onChange?.({ onDate: date.value || null, province: provinceEntry(province.value)?.code ?? null, place: null, resolution: null, error });
      }
    };
  }
  const inputHandler = guard(autocomplete);
  const dateHandler = guard(refresh);
  const provinceHandler = guard(() => {
    selected = null;
    suggestions.clear();
    municipality.value = '';
    if (provinceIsInput) {
      const entries = engine.listProvinces({ onDate: date.value || undefined, query: province.value });
      provinceList.replaceChildren(...entries.map(entry => new Option(entry.aliases.join(' / '), provinceLabel(entry))));
    }
    autocomplete();
  });
  municipality.addEventListener('input', inputHandler);
  date.addEventListener('input', dateHandler);
  const provinceEvent = provinceIsInput ? 'input' : 'change';
  province.addEventListener(provinceEvent, provinceHandler);
  dateHandler();
  return {
    query,
    resolve: resolution,
    get value() { return selected ? structuredClone(selected) : null; },
    refresh: dateHandler,
    dispose() {
      municipality.removeEventListener('input', inputHandler);
      date.removeEventListener('input', dateHandler);
      province.removeEventListener(provinceEvent, provinceHandler);
      province.setCustomValidity('');
      municipality.setCustomValidity('');
      list.remove();
      if (previousList === null) municipality.removeAttribute('list');
      else municipality.setAttribute('list', previousList);
      if (previousAutocomplete === null) municipality.removeAttribute('autocomplete');
      else municipality.setAttribute('autocomplete', previousAutocomplete);
      if (provinceIsInput) {
        provinceList.remove();
        if (oldProvinceList === null) province.removeAttribute('list');
        else province.setAttribute('list', oldProvinceList);
        if (oldProvinceAutocomplete === null) province.removeAttribute('autocomplete');
        else province.setAttribute('autocomplete', oldProvinceAutocomplete);
      }
    },
  };
}
