import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync,mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const projectDir = fileURLToPath(new URL('../', import.meta.url));

test('the Linux TAR contains the application without local accounts or secrets', async () => {
  // A missing application asset or packaging local .env/data would break this contract.
  assert.ok(existsSync(join(projectDir, 'scripts/build-linux-installer.mjs')), 'The single-file installer builder is missing.');
  const { buildLinuxPackages } = await import('../scripts/build-linux-installer.mjs');
  const fixtureDir = mkdtempSync(join(tmpdir(), 'retourenboard-package-'));
  try {
    const sourceScript=readFileSync(join(projectDir,'scripts/install-linux.sh'));
    const {version}=buildLinuxPackages({sourceDir:projectDir,outputDir:fixtureDir});
    const outputPath=join(fixtureDir,version,`retourenboard-install-${version}.sh`);
    const installer = readFileSync(outputPath, 'utf8');
    assert.equal(installer.includes('\r'), false, 'The shell script needs Linux line endings.');
    assert.ok(Buffer.byteLength(installer)<20000,'The installer must remain a small download script.');
    const archivePath=join(fixtureDir,version,`retourenboard-linux-${version}.tar.gz`),archive=readFileSync(archivePath);
    assert.equal(readFileSync(archivePath+'.sha256','utf8').split(' ')[0],createHash('sha256').update(archive).digest('hex'));
    const files = execFileSync('tar', ['-tzf', archivePath], { encoding: 'utf8' }).split(/\r?\n/);
    const shellFiles=files.filter(file=>file.endsWith('.sh')),extracted=join(fixtureDir,'shell');mkdirSync(extracted);
    execFileSync('tar',['-xzf',archivePath,'-C',extracted,'--',...shellFiles]);
    for(const file of shellFiles){
      const script=readFileSync(join(extracted,file));
      assert.equal(script.includes(Buffer.from('\r\n')),false,`Packaged Linux shell script cannot run with CRLF: ${file}`);
    }
    assert.deepEqual(readFileSync(join(projectDir,'scripts/install-linux.sh')),sourceScript,'Packaging must not edit the working tree');
    for (const required of ['package.json', 'README.md', '.env.example', 'server/index.js', 'server/users.js', 'public/accounts.js', 'public/theme.js', 'public/theme.css', 'scripts/install-linux.sh', 'scripts/install-network.sh', 'deploy/retourenboard.service', 'public/vendor/pdfjs/pdf.min.mjs', 'public/vendor/pdfjs/pdf.worker.min.mjs', 'scripts/design-preview.mjs', 'previews/design/public/preview-info.js', 'frontend/src/app.ts', 'dist/public/design.js', 'dist/public/design.css', 'dist/public/motion.css']) {
      assert.ok(files.includes(required), `Required application file missing: ${required}`);
    }
    assert.equal(files.some(file => /(^|\/)(\.env|data|\.qa|node_modules)(\/|$)|\.(sqlite|sqlite-shm|sqlite-wal)$/.test(file)), false, 'Local secrets and accounts must not be shipped.');
    for(const file of ['website/dist/index.html','website/dist/site.css','website/dist/site.js','website/dist/favicon.svg','scripts/website-preview.mjs'])assert.ok(files.includes(file),`Product page file missing: ${file}`);
    for(const file of ['deploy/docker/compose.yml','dist/server/legacy-sqlite/schema-expressions.js'])assert.ok(files.includes(file),`Deployment or security runtime missing: ${file}`);
    for(const file of ['docs/SSO.md','dist/server/sso.js','dist/server/sso-store.js','dist/server/sso-routes.js','dist/server/sso-network.js','dist/server/database/sso-schema.js','dist/vendor/oidc.js','dist/public/sso-login.js','dist/public/admin-sso.js'])assert.ok(files.includes(file),`SSO runtime or setup guide missing: ${file}`);
    for(const file of ['docs/BETRIEB.md','docs/DOCKER.md','docs/readme/README.md','docs/readme/README_EN.md','docs/readme/screenshots/README.md','docs/readme/screenshots/manifest.json','docs/readme/screenshots/overview-dark-de.jpg'])assert.ok(files.includes(file),`README documentation or screenshot missing: ${file}`);
  } finally {
    rmSync(fixtureDir, { recursive: true, force: true });
  }
});
