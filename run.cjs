'use strict';

const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { readFileSync } = require('node:fs');
const { spawnSync } = require('node:child_process');
const { join } = require('node:path');

const manifest = require('./sources.json');
for (const entry of manifest.files) {
  const bytes = readFileSync(join(__dirname, entry.localPath));
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const blob = createHash('sha1')
    .update('blob ' + bytes.length + '\0')
    .update(bytes)
    .digest('hex');
  assert.equal(sha256, entry.sha256, entry.localPath + ' SHA-256 mismatch');
  assert.equal(blob, entry.gitBlob, entry.localPath + ' upstream blob mismatch');
}
const transcript = manifest.transcription;
const frames = readFileSync(join(__dirname, transcript.localPath));
assert.equal(createHash('sha256').update(frames).digest('hex'), transcript.sha256,
  transcript.localPath + ' differs from the verified transcription');
console.log('Verified three upstream adapter files, the bundled async file and the Flypool fixture.');
for (const script of ['replay.cjs', 'test/run-daemon.cjs', 'valar-pool-check/replay.cjs']) {
  const result = spawnSync(process.execPath, ['--no-deprecation', script], {
    cwd: __dirname, stdio: 'inherit', timeout: 15000
  });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, script + ' failed');
}
console.log('All three local checks passed.');
