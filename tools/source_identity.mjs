// Reproducible Rust/registry identity; not a replacement for verification reports.
import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
export async function runtimeSourceIdentity(root = resolve(import.meta.dirname, '..')) {
  const paths = ['Cargo.toml', 'Cargo.lock', 'config/components.json'];
  async function walk(directory) {
    for (const entry of await readdir(join(root, directory), { withFileTypes: true })) {
      const path = `${directory}/${entry.name}`;
      if (entry.isDirectory()) { if (!['tests', 'examples'].includes(entry.name)) await walk(path); }
      else if (entry.isFile() && (entry.name === 'Cargo.toml' || entry.name.endsWith('.rs'))) paths.push(path);
    }
  }
  await walk('crates');
  const files = {};
  for (const path of paths.sort()) files[path] = createHash('sha256').update(await readFile(join(root, path))).digest('hex');
  return { sha256: createHash('sha256').update(JSON.stringify(files)).digest('hex'), files };
}
