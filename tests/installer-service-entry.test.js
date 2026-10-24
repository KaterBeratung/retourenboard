import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

const project = fileURLToPath(new URL('../', import.meta.url));
const installer = readFileSync(join(project, 'scripts/install-linux.sh'), 'utf8');
const renderStage = installer.match(/^sed .* > "\$temp_dir\/new\.service"$/m)?.[0];
assert.ok(renderStage, 'Missing installer service rendering stage');
const originalTemplate = readFileSync(join(project, 'deploy/retourenboard.service'), 'utf8').replace(/\r\n/g, '\n');

for (const lineEnding of ['LF', 'CRLF']) {
  for (const entry of ['dist/server/index.js', 'server/index.js']) {
    test(`installed service uses ${entry} with ${lineEnding} template`, () => {
      const fixture = mkdtempSync(join(tmpdir(), 'retouren-service-entry-'));
      try {
        mkdirSync(join(fixture, 'deploy'));
        writeFileSync(join(fixture, 'deploy/retourenboard.service'), lineEnding === 'CRLF' ? originalTemplate.replace(/\n/g, '\r\n') : originalTemplate);
        // Run the installer's actual rendering command; no systemd or /opt writes.
        // MSYS sed otherwise hides CRLF automatically; Debian preserves the CR.
        const binaryRead = process.platform === 'win32' ? 'sed() { command sed --binary "$@"; }\n' : '';
        execFileSync('bash', ['-c', `set -euo pipefail\n${binaryRead}source_dir="$1"; temp_dir="$1"; app_entry="$2"\n${renderStage}`, 'unit-test', fixture, entry], {encoding: 'utf8', stdio: 'pipe'});
        const unit = readFileSync(join(fixture, 'new.service'), 'utf8');
        const starts = unit.split('\n').filter(line => line.startsWith('ExecStart='));
        assert.deepEqual(starts, [`ExecStart=/opt/retourenboard/node/bin/node ${entry}`]);
        assert.equal(unit.includes('\r'), false, 'Generated Linux unit must use LF');
      } finally {
        rmSync(fixture, {recursive: true, force: true});
      }
    });
  }
}
