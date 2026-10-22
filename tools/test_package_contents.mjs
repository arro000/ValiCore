// Verify the actual npm packing inventory, not only manifest declarations.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFile,readdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadNotices} from '../packages/js/tooling/notices.js';

const root=resolve(import.meta.dirname,'..');
const npm=process.platform==='win32'?'npm.cmd':'npm';
const manifest=JSON.parse(await readFile(join(root,'packages/js/bundled/manifest.json'),'utf8'));
const bundled=new URL('../packages/js/bundled/',import.meta.url);
const profiles=Object.keys(JSON.parse(await readFile(join(root,'packages/js/bundled/registry.json'),'utf8')).profiles);
const expected=new Set(['manifest.json','registry.json']);
function resource(description,base=bundled){
 if(!description)return;
 assert.equal(typeof description.url,'string');
 const url=new URL(description.url,base);
 assert.equal(url.protocol,'file:','Bundled resources must be local');
 const path=fileURLToPath(url),prefix=fileURLToPath(base);
 assert.ok(path.startsWith(prefix),'Bundled resource escapes its owning directory');
 expected.add(path.slice(fileURLToPath(bundled).length));
 if(description.gzip)resource(description.gzip,base);
}
async function noticeResources(manifest, base) {
 assert.equal(manifest.notices?.url,'notices/index.json','Runtime must ship its license inventory');
 resource(manifest.notices,base);
 const directory=new URL('notices/',base);
 const notices=await loadNotices(fileURLToPath(directory),manifest.notices.sha256);
 for(const [name] of notices.files) expected.add(fileURLToPath(new URL(name,directory)).slice(fileURLToPath(bundled).length));
}
resource(manifest.runtime.wasm);
await noticeResources(manifest,bundled);
assert.deepEqual(Object.keys(manifest.datasets),['geo']);
for(const description of Object.values(manifest.datasets))resource(description);
for(const profile of profiles){
 const base=new URL(`${profile}/wasm/`,bundled);
 const profileManifest=JSON.parse(await readFile(new URL('manifest.json',base),'utf8'));
 expected.add(`${profile}/wasm/manifest.json`);
 resource(profileManifest.runtime.wasm,base);
 await noticeResources(profileManifest,base);
}
const actual=new Set();
async function inventory(directory,prefix=''){
 for(const entry of await readdir(directory,{withFileTypes:true})){
  const relative=prefix+entry.name;
  assert.ok(!entry.isSymbolicLink(),'Bundled package must not link external resources');
  if(entry.isDirectory())await inventory(join(directory,entry.name),relative+'/');
  else {assert.ok(entry.isFile());actual.add(relative);}
 }
}
await inventory(fileURLToPath(bundled));
assert.deepEqual([...actual].sort(),[...expected].sort(),'Unmanifested/stale bundle contents must not be distributed');
const packed=JSON.parse(execFileSync(npm,['pack','--dry-run','--json','--workspace','packages/js'],
 {cwd:root,encoding:'utf8',maxBuffer:8*1024*1024}));
const package_=Array.isArray(packed)?packed[0]:packed['@arro000/valicore'];
assert.ok(package_?.files,'Missing actual package inventory');
const files=package_.files.map(entry=>entry.path);
assert.ok(files.includes('DATA-NOTICE.md'),'Complete package must ship geographic attribution and pending terms');
assert.ok((await readFile(join(root,'packages/js/DATA-NOTICE.md'),'utf8')).includes('ADE T2/publication reuse terms remain under review'));
assert.deepEqual(files.filter(path=>path.startsWith('bundled/')).map(path=>path.slice(8)).sort(),[...expected].sort());
assert.ok(files.every(path=>!path.startsWith('experiments/')),'Experimental source must not enter the standard package');
for(const name of ['iban','healthcare','integrated']) assert.ok(!files.includes(`src/${name}.js`),'Deferred profile source must not enter the beta package');
const metadata=JSON.parse(await readFile(join(root,'packages/js/package.json'),'utf8'));
assert.equal(metadata.version,manifest.engineVersion,'Package and bundled runtime versions must agree');
for(const name of ['./iban','./healthcare','./integrated','./geo']) assert.ok(!Object.hasOwn(metadata.exports,name),'Unavailable entrypoints must not be advertised');
console.log(JSON.stringify({verified:true,package:package_.name,files:files.length,bundledResources:[...expected].sort()}));
