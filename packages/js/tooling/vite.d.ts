import type { Profile, DatasetId } from '../src/index.js';

export interface ValiCoreViteOptions {
  /** Precompiled profile to distribute. Defaults to 'integrated'. */
  profile?: Profile;
  /** Datasets to include in the emitted bundle and load on request. */
  datasets?: DatasetId[];
  /** Local JSON/gzip path per dataset; only selected datasets are read. */
  resources?: Partial<Record<DatasetId, string>>;
  /** Output sub-directory for the runtime assets. Defaults to 'valicore'. */
  base?: string;
  /** Supplied profile repository; defaults to the packaged precompiled profiles. */
  precompiledDirectory?: string;
}

/** Structural Vite plugin type, so the package needs no Vite dependency. */
export interface ValiCoreVitePlugin {
  name: string;
  enforce?: 'pre' | 'post';
  resolveId(id: string): string | undefined;
  load(id: string): Promise<string | undefined> | string | undefined;
  closeBundle?(): Promise<void> | void;
}

export default function valicore(options?: ValiCoreViteOptions): ValiCoreVitePlugin;
