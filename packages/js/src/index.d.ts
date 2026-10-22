export type ValidationLevel = 'structural' | 'checksum' | 'calendar' | 'territorial';
export type CheckStatus = 'pass' | 'fail' | 'unknown' | 'not_run';
export type PlaceKind = 'municipality' | 'foreign_country' | 'foreign_territory';
export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
export interface Place {
  id: string;
  sourceId: string;
  sourceRecordId: string;
  name: string;
  aliases: string[];
  kind: PlaceKind;
  status: 'active' | 'ceased' | 'planned' | 'unknown';
  belfioreCode: string | null;
  istatCode: string | null;
  province: string | null;
  validFrom: string | null;
  /** Inclusive administrative end date; null is an open end. */
  validTo: string | null;
  birthAllowed: boolean | null;
  sourceUpdatedAt: string | null;
}
export interface SourceInfo {
  url: string;
  referenceDate: string | null;
  sha256: string;
  recordCount: number;
  [key: string]: unknown;
}
export interface Dataset {
  schemaVersion: 1;
  version: string;
  /** Opaque source metadata is retained; official snapshots use source objects. */
  sources: JsonValue;
  coverage: JsonValue;
  places: Place[];
  provinces?: { code: string; name: string; aliases: string[]; validFrom?: string | null; validTo?: string | null; sourceId?: string; sourceSha256?: string; dateBasis?: string }[];
  administrativeReconciliation?: {
    referenceDate: string; anprActiveCount: number; istatCurrentCount: number;
    summary: { differences: number; conflicts: number; overlays: number };
    differences: Record<string, unknown>[]; conflicts: Record<string, unknown>[]; overlays: Record<string, unknown>[];
  };
}
type PlaceSelector = { name: string; belfioreCode?: never; istatCode?: never }
  | { belfioreCode: string; name?: never; istatCode?: never }
  | { istatCode: string; name?: never; belfioreCode?: never };
export type PlaceQuery = PlaceSelector & { province?: string; onDate?: string };
export interface Person {
  name: string;
  surname: string;
  sex: 'M' | 'F';
  /** Gregorian YYYY-MM-DD, without timezone. */
  birthDate: string;
  birthplace: PlaceQuery;
  /** Integer 0..127. Bit zero is the rightmost replaceable digit. */
  omocodiaMask?: number;
}
export interface DecodeOptions { yearRange?: [number, number] }
export interface Decoded {
  code: string;
  baseCode: string;
  surnameCode: string;
  nameCode: string;
  yearTwoDigits: number;
  month: number;
  day: number;
  sex: 'M' | 'F';
  belfioreCode: string;
  omocodiaMask: number;
  candidateDates: string[];
  centuryAmbiguous: boolean;
}
export interface DecodedResult extends Decoded { places: Place[]; dataVersion: string | null }
export interface ErrorDetail { code: string; message: string; field?: string }
export interface CandidateBirthplaceHistory {
  birthDate: string;
  /** Administrative compatibility only, never fiscal-code validity. */
  compatible: boolean | null;
  status: 'pass' | 'fail' | 'unknown';
  matchingRecordIds: string[];
  uncertainRecordIds: string[];
  excludedRecordIds: string[];
  error?: ErrorDetail;
}
export interface BirthplaceHistoryReport {
  scope: 'administrative_birthplace_history';
  decoded: Decoded;
  dataVersion: string | null;
  records: Place[];
  candidates: CandidateBirthplaceHistory[];
  allocationCheck: { name: 'fiscal_allocation'; status: 'not_run' };
}
export interface ValidationOptions extends DecodeOptions {
  level?: ValidationLevel;
  /** Opt-in administrative constraint, not a tax-registry allocation date. */
  onDate?: string;
}
export interface ValidationReport {
  code: string;
  kind: 'personal' | 'numeric';
  /** null means a requested check could not be determined. */
  valid: boolean | null;
  level: ValidationLevel;
  checks: { name: 'structure' | 'checksum' | 'calendar' | 'territory'; status: CheckStatus; error?: ErrorDetail }[];
  decoded: Decoded | null;
  places: Place[];
  dataVersion: string | null;
}
export interface MatchReport { matches: boolean; expectedBase: string; mismatches: string[]; validation: ValidationReport }
export interface SearchOptions {
  province?: string;
  kind?: PlaceKind;
  activeOnly?: boolean;
  onDate?: string;
  /** Defaults to 20; maximum 200. */
  limit?: number;
}
export interface Resolution {
  status: 'unique' | 'ambiguous' | 'missing' | 'missing_code';
  belfioreCode: string | null;
  candidates: Place[];
}
export interface ProvinceOptions { query?: string; onDate?: string; activeOnly?: boolean; kind?: PlaceKind }
export interface ProvinceOption {
  code: string;
  name: string | null;
  aliases: string[];
  /** Distinct usable Belfiore codes, not record versions. */
  placeCount: number;
}
export interface ItalianReaReport {
  rea: string | null;
  provinceCode: string | null;
  serialNumber: string | null;
  countryCode: 'IT';
  /** Presentation only, not registry allocation. */
  valid: boolean;
  scope: 'presentation_format';
  ruleEdition: string;
  checks: { name: 'structure' | 'registry'; status: CheckStatus; error?: ErrorDetail }[];
}
export interface ItalianVatReport {
  vat: string | null;
  countryCode: 'IT';
  /** Format/checksum only, not allocation or registration. */
  valid: boolean;
  scope: 'format_checksum';
  ruleEdition: string;
  checks: { name: 'structure' | 'checksum' | 'registry'; status: CheckStatus; error?: ErrorDetail }[];
}
export type RuntimeModule = 'fiscal_identity' | 'geo_historical';
export interface Capabilities { fiscalIdentity: boolean; geoHistorical: boolean }
export type ComponentId = 'fiscal' | 'geo';
export type DatasetId = 'geo';
export type Profile = 'fiscal' | 'italian';
export interface ResourceRef {
  url: string;
  sha256: string;
  gzip?: { url: string; sha256: string };
}
export interface DatasetRef extends ResourceRef {
  bytes?: number;
  version: string;
  schemaVersion: number;
  provenance?: Record<string, unknown>;
}
export interface RuntimeManifest {
  runtimeName: 'ValiCore';
  manifestVersion: 2;
  loaderProtocol: 2;
  runtimeApiMajor: 8;
  engineVersion: string;
  buildId: string;
  publishedAt?: string;
  components: ComponentId[];
  modules: RuntimeModule[];
  operations: string[];
  schemas: Partial<Record<DatasetId, number>>;
  selection?: { configVersion: 1; components: ComponentId[]; datasets: DatasetId[] };
  runtime: { wasm: ResourceRef; native?: ResourceRef & { platform: string; architecture: string } };
  /** Required on published assets; custom initialization need not read notices. */
  notices?: { url: string; sha256: string };
  datasets?: Partial<Record<DatasetId, DatasetRef>>;
}
export interface OnlineDistribution {
  mode: 'online';
  channelUrl?: string;
  timeoutMs?: number;
  cache?: boolean;
  cacheDirectory?: string;
  /** false makes remote initialization mandatory. */
  fallback?: boolean;
}
export type CustomDataset = Dataset | Uint8Array | ArrayBuffer;
export type Distribution = OnlineDistribution | { mode: 'bundled' }
  | { mode: 'pinned'; manifestUrl: string; timeoutMs?: number; cache?: boolean; cacheDirectory?: string }
  | { mode: 'custom'; wasm: Uint8Array | ArrayBuffer; manifest: RuntimeManifest; datasets?: Partial<Record<DatasetId, CustomDataset>> };
export interface VersionInfo {
  runtimeName: 'ValiCore';
  components: ComponentId[];
  modules: RuntimeModule[];
  operations: string[];
  schemas: Partial<Record<DatasetId, number>>;
  engineVersion: string;
  runtimeApiMajor: number;
  loaderProtocol: number;
  buildId: string;
  dataVersion: string | null;
  origin: 'remote' | 'cache' | 'bundled' | 'custom';
  sourceDates: Record<string, string | null>;
  fallbackReason?: string;
}
export interface DatasetInfo {
  version: string;
  schemaVersion: number;
  placeCount: number;
  sources: JsonValue;
  coverage: JsonValue;
}
export class ValiCoreError extends Error {
  readonly code: string;
  readonly field?: string;
  constructor(code: string, message: string, field?: string, options?: ErrorOptions);
}
export class ValiCoreEngine {
  private constructor();
  encode(person: Person): string;
  validate(code: string, options?: ValidationOptions): ValidationReport;
  isValid(code: string, options?: ValidationOptions): boolean;
  decode(code: string, options?: DecodeOptions): DecodedResult;
  birthplaceHistory(code: string, options?: DecodeOptions): BirthplaceHistoryReport;
  matchesPerson(code: string, person: Person): MatchReport;
  validateItalianVat(vat: string): ItalianVatReport;
  validateItalianRea(rea: string): ItalianReaReport;
  checksum(body: string): string;
  numericChecksum(body: string): string;
  nameCode(name: string): string;
  surnameCode(surname: string): string;
  toBase(code: string): string;
  toOmocode(code: string, mask: number): string;
  omocodiaMask(code: string): number;
  isOmocode(code: string): boolean;
  omocodes(code: string, options?: { includeBase?: boolean }): string[];
  sameBase(left: string, right: string): boolean;
  searchPlaces(query: string, options?: SearchOptions): Place[];
  listProvinces(options?: ProvinceOptions): ProvinceOption[];
  resolvePlace(query: PlaceQuery): Resolution;
  datasetInfo(): DatasetInfo;
  capabilities(): Capabilities;
  versionInfo(): VersionInfo;
  dispose(): void;
}
export const DEFAULT_CHANNEL_URL: string;
export interface CreateOptions {
  /** Defaults to bundled resources; remote access must be explicit. */
  distribution?: Distribution;
  profile?: Profile;
  components?: ComponentId[];
  /** Only selected payloads are read. */
  datasets?: DatasetId[];
  /** Complete package defaults to geography; named profiles default to no data. Contradictory selections fail. */
  catalog?: boolean;
}
export function createValiCore(options?: CreateOptions): Promise<ValiCoreEngine>;
