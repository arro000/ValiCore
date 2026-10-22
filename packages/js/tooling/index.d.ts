import type { ComponentId, DatasetId, Profile } from '../src/index.js';
export type { ComponentId, DatasetId, Profile } from '../src/index.js';
export type CompositionConfig = { configVersion: 1; datasets?: readonly DatasetId[] } & (
  { profile: Profile; components?: never } | { components: readonly ComponentId[]; profile?: never }
);
export interface Composition {
  configVersion: 1; components: ComponentId[]; datasets: DatasetId[]; profile: Profile | null;
  modules: string[]; operations: string[]; schemas: Partial<Record<DatasetId, number>>;
  runtimeApiMajor: 8; loaderProtocol: 2; runtimeCompositionHash: string; compositionHash: string;
}
export interface ResourceReference { url: string; sha256: string; bytes: number; gzip?: ResourceReference }
export interface CompositionManifest {
  manifestVersion: 2; runtimeName: 'ValiCore'; engineVersion: string; runtimeApiMajor: 8; loaderProtocol: 2;
  components: ComponentId[]; modules: string[]; operations: string[]; schemas: Partial<Record<DatasetId, number>>;
  buildId: string; runtimeCompositionHash: string; compositionHash: string;
  selection: { configVersion: 1; components: ComponentId[]; datasets: DatasetId[] };
  runtime: { wasm?: ResourceReference; native?: ResourceReference & { platform: string; architecture: string } };
  datasets: Partial<Record<DatasetId, ResourceReference & { version: string; schemaVersion: number; provenance: Record<string, unknown> }>>;
  /** License inventory distributed with this runtime, independent of datasets. */
  notices: { url: string; sha256: string };
}
export interface BuildOptions {
  output: string; target?: 'wasm' | 'native'; mode?: 'precompiled' | 'compile';
  /** Explicit trusted checkout; required only in compile mode. No downloads. */
  sourceRoot?: string; cargoTargetDirectory?: string; precompiledDirectory?: string;
  /** Only explicitly selected datasets are read; paths may be JSON or gzip. */
  resources?: Partial<Record<DatasetId, string>>;
}
export function parseComposition(config: CompositionConfig): Composition;
export function compose(config: CompositionConfig, options: BuildOptions): Promise<{
  output: string; manifest: CompositionManifest;
  build: { mode: 'precompiled' | 'compile'; target: 'wasm' | 'native'; validation: 'rust-create' | 'manifest-hash-schema'; compiler?: string };
}>;
export const componentRegistry: Readonly<{
  registryVersion: 1; runtimeApiMajor: 8; loaderProtocol: 2;
  profiles: Readonly<Record<Profile, readonly ComponentId[]>>;
  components: readonly Readonly<{ id: ComponentId; module: string; requires: readonly ComponentId[]; operations: readonly string[]; operationRequires?: Readonly<Record<string, readonly ComponentId[]>> }>[];
  datasets: Readonly<Record<DatasetId, Readonly<{ component: ComponentId; requestField: string; schemaVersion: number }>>>;
  commonOperations: readonly string[];
}>;
