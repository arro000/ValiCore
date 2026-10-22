// Repository CLI uses the canonical source registry before package assembly.
import { componentRegistry } from './composition.mjs';
import { main } from '../packages/js/tooling/cli.js';
await main(process.argv.slice(2), { registry: componentRegistry });
