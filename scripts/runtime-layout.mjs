import {existsSync, readFileSync, statSync} from 'node:fs';
import {join, resolve} from 'node:path';

export function selectRuntime(sourceDir) {
  sourceDir = resolve(sourceDir);
  const {version} = JSON.parse(readFileSync(join(sourceDir, 'package.json'), 'utf8'));
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('Ungültige Paketversion.');
  const compiled = existsSync(join(sourceDir, 'dist'));
  const [major,minor]=version.split('.').map(Number);
  if (!compiled && (major>1 || (major===1 && minor>=4))) throw new Error('Kompilierter Build fehlt: dist. Bitte vollständiges Paket verwenden oder npm run build ausführen.');
  const prefix = compiled ? 'dist/' : '';
  if (compiled) {
    const metadata = join(sourceDir, 'dist/package.json');
    if (!existsSync(metadata)) throw new Error('Build-Metadaten fehlen: dist/package.json');
    if (JSON.parse(readFileSync(metadata, 'utf8')).version !== version) {
      throw new Error('Build-Version und package.json stimmen nicht überein. Build aktualisieren.');
    }
  }
  const manifests = ['runtime-files.txt', ...(compiled ? ['compiled-runtime-files.txt'] : [])];
  for (const manifest of manifests) {
    for (const name of readFileSync(join(sourceDir, 'deploy', manifest), 'utf8').split(/\r?\n/).filter(Boolean)) {
      const relative = prefix + name, path = join(sourceDir, relative);
      if (!existsSync(path) || !(name.endsWith('/') ? statSync(path).isDirectory() : statSync(path).isFile())) {
        throw new Error(`Projektdatei fehlt: ${relative}`);
      }
    }
  }
  return {version, compiled, entry: prefix + 'server/index.js', app: prefix + 'server/app.js'};
}
