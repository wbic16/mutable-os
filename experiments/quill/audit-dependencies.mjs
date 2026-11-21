// Registry/artifact inspection only. Installs no runtime packages and executes no package scripts.
import { mkdtemp, writeFile, readFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { gunzipSync, gzipSync } from 'node:zlib';
import { build } from 'esbuild';
const exec = promisify(execFile);
const roots = { '@chenglou/pretext': '1.0.0', '@react-pdf/textkit': '7.0.1', '@svgdotjs/svg.js': '3.2.8', charmingjs: '0.1.0' };
const output = 'experiments/quill/evidence';
const temporary = await mkdtemp(path.join(tmpdir(), 'quill-license-audit-'));
function files(archive) {
  const tar = gunzipSync(archive), entries = [];
  for (let offset = 0; offset + 512 <= tar.length;) {
    const header = tar.subarray(offset, offset + 512);
    const name = header.subarray(0, 100).toString().replace(/\0.*$/s, ''); if (!name) break;
    const size = parseInt(header.subarray(124, 136).toString().replace(/\0.*$/s, '').trim(), 8) || 0;
    if (header[156] === 0 || header[156] === 48) entries.push({ name, data: tar.subarray(offset + 512, offset + 512 + size) });
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  return entries;
}
try {
  await writeFile(path.join(temporary, 'package.json'), JSON.stringify({ name: 'quill-inspection', private: true, dependencies: roots }));
  await exec('npm', ['install', '--package-lock-only', '--ignore-scripts', '--legacy-peer-deps', '--no-audit', '--no-fund'], { cwd: temporary, maxBuffer: 2 * 1024 * 1024 });
  const lock = JSON.parse(await readFile(path.join(temporary, 'package-lock.json'), 'utf8'));
  const records = [];
  for (const [key, entry] of Object.entries(lock.packages)) {
    if (!key) continue;
    const name = key.split('node_modules/').at(-1), version = entry.version;
    const response = await fetch(entry.resolved); if (!response.ok) throw Error(`${entry.resolved}: ${response.status}`);
    const archive = Buffer.from(await response.arrayBuffer());
    const [algorithm, digest] = entry.integrity.split('-');
    if (createHash(algorithm).update(archive).digest('base64') !== digest) throw Error('Artifact integrity mismatch: ' + key);
    const contents = files(archive), manifest = JSON.parse(contents.find(f => f.name === 'package/package.json').data);
    const licenseFiles = contents.filter(f => /(?:licen[cs]e|notice|copying)/i.test(f.name));
    const main = manifest.module ?? manifest.main;
    const entryFile = contents.find(f => f.name === 'package/' + main?.replace(/^\.\//, ''));
    records.push({ key, name, version, license: manifest.license ?? entry.license ?? null, repository: manifest.repository, gitHead: manifest.gitHead,
      dependencies: manifest.dependencies ?? {}, peerDependencies: manifest.peerDependencies ?? {}, tarball: entry.resolved, integrity: entry.integrity,
      tarballBytes: archive.length, unpackedBytes: contents.reduce((n, f) => n + f.data.length, 0),
      entry: main, entryBytes: entryFile?.data.length, entryGzipBytes: entryFile && gzipSync(entryFile.data).length,
      // Entry bytes are NOT a tree-shaken bundle measurement.
      licenseFiles: licenseFiles.map(f => ({ path: f.name, sha256: createHash('sha256').update(f.data).digest('hex'), heading: f.data.toString().split('\n').filter(s => /copyright|license|permission/i.test(s)).slice(0, 4) })),
      assets: contents.filter(f => /\.(ttf|woff2?|otf|flf|tlf|png|jpe?g)$/i.test(f.name)).map(f => f.name),
    });
  }
  await mkdir(output, { recursive: true });
  await writeFile(path.join(output, 'dependency-lock.json'), JSON.stringify(lock, null, 2) + '\n');
  // Isolated install is only for static bundling; never run downloaded scripts.
  await exec('npm', ['ci', '--ignore-scripts', '--legacy-peer-deps', '--no-audit', '--no-fund'], { cwd: temporary, maxBuffer: 2 * 1024 * 1024 });
  const bundles = [];
  for (const name of Object.keys(roots)) {
    try {
      const result = await build({ stdin: { contents: `export * from ${JSON.stringify(name)}`, resolveDir: temporary }, bundle: true, write: false, minify: true, format: 'esm', platform: 'browser', target: 'es2022', logLevel: 'silent' });
      const bytes = result.outputFiles[0].contents;
      bundles.push({ name, bytes: bytes.length, gzipBytes: gzipSync(bytes).length });
    } catch (error) { bundles.push({ name, error: String(error) }); }
  }
  await writeFile(path.join(output, 'dependency-audit.json'), JSON.stringify({ inspectedOn: '2026-11-21', roots, records, bundles,
    limitation: 'Published artifacts, distinct from pinned repository HEADs. License declarations and file digests are evidence, not full legal clearance. No library was adopted. Entry sizes are not browser bundles.' }, null, 2) + '\n');
  console.log(JSON.stringify(records.map(r => ({ name: r.name, version: r.version, license: r.license, licenses: r.licenseFiles.length, bytes: r.tarballBytes })), null, 2));
} finally { await rm(temporary, { recursive: true, force: true }); }
