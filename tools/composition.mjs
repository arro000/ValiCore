// Repository adapter to the same validator used by the installable CLI/Vite tools.
import { readFile } from 'node:fs/promises';
import { normalizeComposition, frozen } from '../packages/js/tooling/config.js';
export const componentRegistry = frozen(JSON.parse(await readFile(new URL('../config/components.json', import.meta.url), 'utf8')));
export function parseComposition(config) { return normalizeComposition(config, componentRegistry); }
export async function readComposition(path) { return parseComposition(JSON.parse(await readFile(path, 'utf8'))); }
