'use strict';

const { readFileSync } = require('node:fs');
const { createRequire } = require('node:module');
const { compileFunction } = require('node:vm');

// Keep both upstream files intact and bind their test dependencies explicitly.
function loadWithDependency(file, dependency, value) {
  const filename = require.resolve(file);
  const localRequire = createRequire(filename);
  const module = { exports: {} };
  const load = name => name === dependency ? value : localRequire(name);
  const run = compileFunction(readFileSync(filename, 'utf8'), ['require', 'module', 'exports'], { filename });
  run(load, module, module.exports);
  return module.exports;
}

const daemon = loadWithDependency('../lib/daemon.js', 'async', require('../vendor/async.min.js'));
loadWithDependency('./daemon.js', '../lib/daemon', daemon);
