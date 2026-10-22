import { readFile } from 'node:fs/promises';
import { normalizeComposition, frozen } from './config.js';
export { compose } from './build.js';
export const componentRegistry = frozen(JSON.parse(await readFile(new URL('../bundled/registry.json', import.meta.url), 'utf8')));
export function parseComposition(config) { return normalizeComposition(config, componentRegistry); }
