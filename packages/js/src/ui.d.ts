import type { ValiCoreEngine, Place, PlaceQuery, Resolution } from './index.js';

export interface PlaceSelection {
  onDate: string | null;
  province: string | null;
  place: Place | null;
  resolution: Resolution | null;
  error?: Error;
}
export interface PlaceSelector {
  query(): PlaceQuery;
  resolve(): Resolution;
  readonly value: Place | null;
  /** Refresh after programmatic field changes; native user events refresh automatically. */
  refresh(): void;
  /** Removes listeners and restores the input's previous datalist/autocomplete attributes. */
  dispose(): void;
}
/** Uses native accessible HTML controls and your application's styles. Browser-only entry point. */
export function attachPlaceSelector(options: {
  engine: ValiCoreEngine;
  date: HTMLInputElement;
  /** An input provides name/code autocomplete; a select remains supported. */
  province: HTMLInputElement | HTMLSelectElement;
  municipality: HTMLInputElement;
  onChange?: (selection: PlaceSelection) => void;
}): PlaceSelector;
