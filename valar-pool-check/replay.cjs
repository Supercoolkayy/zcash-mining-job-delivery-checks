'use strict';

// Exercise the Valar job manager using a Zebra RPC test snapshot.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const blobs = {
  'lib/algoProperties.js': '1bd3e1c0dfea84cc6239a35b2053a0b7a82ecbd2',
  'lib/blockTemplate.js': '5e42980043431e9ecd313650ee0a8b50772f4a0a',
  'lib/blockTemplateRoots.js': '34f4e13512ee5aab0efa91d9f4ea58cd2ddf2edf',
  'lib/jobManager.js': '4034f1a0358f49b60678122406ad490884074581',
  'lib/transactions.js': 'f48521aa6604c19d57373bd42de7fe0b96498835',
  'lib/util.js': '564b5ad90b962e30d8712e6ef9fc9a94ec3c3c8f',
  'fixtures/s-nomp-zec.json': '77981244c451a6b3af0b92a4163b77291bd439b2',
  'fixtures/zebra-6.2.0-subsidy-mainnet_10.snap': '73ba8847d258c8d218d8eee34daefcf29fc65e07',
  'fixtures/zebra-6.2.0-getblocktemplate-mainnet_10.json': 'a2c02eff56b378142214daf3ddbbe6a3354b2deb',
};

function readPinned(file) {
  const data = fs.readFileSync(path.join(__dirname, file));
  const digest = crypto.createHash('sha1')
    .update('blob ' + data.length + '\0').update(data).digest('hex');
  assert.equal(digest, blobs[file], file + ' differs from the pinned Git blob');
  return data.toString('utf8');
}

// Keep unused native dependencies out of the replay. Any attempt to use their
// APIs fails immediately. The one native call used to display difficulty is
// hexadecimal target -> JavaScript Number and does not choose or emit jobs.
function unavailable(name) {
  return new Proxy({}, {
    get(_, key) { throw new Error('Unexpected dependency call: ' + name + '.' + String(key)); },
  });
}
const context = vm.createContext({ Buffer, console });
context.global = context;
const modules = new Map();
function loadModule(name) {
  if (name === 'events' || name === 'crypto') return require('node:' + name);
  if (name === 'bignum') return (target, base) => {
    assert.equal(base, 16);
    return { toNumber() { return Number(BigInt('0x' + target)); } };
  };
  if (['equihashverify', 'base58-native', 'bitgo-utxo-lib', './merkleTree.js'].includes(name)) {
    return unavailable(name);
  }
  assert.match(name, /^\.\/[a-zA-Z]+\.js$/);
  if (modules.has(name)) return modules.get(name);
  const file = 'lib/' + name.slice(2);
  const run = vm.compileFunction(readPinned(file), ['require', 'module', 'exports'], {
    parsingContext: context, filename: file,
  });
  const mod = { exports: {} };
  run(loadModule, mod, mod.exports);
  modules.set(name, mod.exports);
  return mod.exports;
}

async function main() {
  loadModule('./algoProperties.js');
  const JobManager = loadModule('./jobManager.js');
  const manager = new JobManager({
    coin: JSON.parse(readPinned('fixtures/s-nomp-zec.json')),
    instanceId: 1, recipients: [],
  });
  const events = [];
  for (const name of ['newBlock', 'updatedBlock']) {
    manager.on(name, job => events.push({ name, job }));
  }

  const initial = JSON.parse(readPinned('fixtures/zebra-6.2.0-getblocktemplate-mainnet_10.json'));
  // The pool copies these two subsidy RPC fields onto each template before job selection.
  const subsidySnapshot = readPinned('fixtures/zebra-6.2.0-subsidy-mainnet_10.snap');
  const subsidy = JSON.parse(subsidySnapshot.split('\n---\n')[1]);
  initial.miner = subsidy.miner;
  initial.fundingstreams = subsidy.fundingstreams;
  const revised = structuredClone(initial);
  // These markers distinguish job contents. They are not a consensus-valid transaction and root.
  revised.transactions = [{ data: '00', hash: '22'.repeat(32), fee: 10000 }];
  revised.defaultroots.merkleroot = '00112233445566778899aabbccddeeff'.repeat(2);
  const next = structuredClone(revised);
  next.height += 1;
  next.previousblockhash = '0123456789abcdef'.repeat(4);

  function wireHash(displayHash) {
    return Buffer.from(displayHash, 'hex').reverse().toString('hex');
  }

  async function step(label, method, input, expected) {
    const previous = manager.currentJob;
    events.length = 0;
    const result = await manager[method](structuredClone(input));
    const job = manager.currentJob;
    const params = job.getJobParams();

    assert.equal(result, expected.result, label);
    assert.deepEqual(events.map(item => item.name), expected.event ? [expected.event] : [], label);
    if (expected.event) {
      assert.notEqual(job, previous, label);
      assert.equal(events[0].job, job, label);
    } else {
      assert.equal(job, previous, label);
    }
    assert.equal(params[0], job.jobId, label);
    assert.equal(job.rpcData.height, expected.selected.height, label);
    assert.equal(params[2], wireHash(expected.selected.previousblockhash), label);
    assert.equal(params[3], wireHash(expected.selected.defaultroots.merkleroot), label);
    assert.deepEqual(job.rpcData.transactions, expected.selected.transactions, label);

    console.log(JSON.stringify({
      case: label, jobId: job.jobId, events: events.map(item => item.name),
      selectedNonCoinbaseTxs: job.rpcData.transactions.length,
      selectedRootMatchesInput: params[3] === wireHash(input.defaultroots.merkleroot),
    }));
  }

  await step('initial template', 'processTemplate', initial, {
    result: true, event: 'newBlock', selected: initial,
  });
  await step('ordinary path, revised same-parent template', 'processTemplate', revised, {
    result: false, event: null, selected: initial,
  });
  await step('explicit refresh, identical revised input', 'updateCurrentJob', revised, {
    result: undefined, event: 'updatedBlock', selected: revised,
  });
  await step('ordinary path, next parent', 'processTemplate', next, {
    result: true, event: 'newBlock', selected: next,
  });
}

main().catch(err => { console.error(err); process.exitCode = 1; });
