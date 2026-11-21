'use strict';

const assert = require('node:assert/strict');
const { once } = require('node:events');
const { readFileSync } = require('node:fs');
const net = require('node:net');
const { createInterface } = require('node:readline');
const vm = require('node:vm');

const historical = require('./flypool-notifications.json');
const source = readFileSync(require.resolve('./lib/stratum.js'), 'utf8');

// The writer is an internal constructor. Unused native and utility imports must
// stay unused on this path.
function unused(name) {
  const fail = () => { throw new Error('Unexpected dependency access: ' + name); };
  return new Proxy(fail, { get: fail, apply: fail, construct: fail });
}

const context = {
  exports: {},
  Buffer,
  require(name) {
    if (name === 'bignum' || name === './util.js') return unused(name);
    return require(name);
  },
};
vm.runInNewContext(source, context, { filename: 'lib/stratum.js' });

async function replay() {
  const first = historical[0].wire;
  const refresh = structuredClone(first);
  refresh.params[0] = 'synthetic-update';
  refresh.params[3] = '33'.repeat(32);
  refresh.params[7] = false;
  const frames = [first, refresh, historical[1].wire];

  const server = net.createServer(socket => {
    const sender = new context.StratumClient({ socket, connectionTimeout: 5 });
    for (const frame of frames) sender.sendMiningJob(frame.params);
    socket.end();
  });

  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const receiver = net.createConnection(server.address().port, '127.0.0.1');
  try {
    await once(receiver, 'connect');
    const received = [];
    for await (const line of createInterface({ input: receiver })) {
      received.push(JSON.parse(line));
    }
    assert.deepEqual(received, frames);

    // ZIP 301 puts the parent hash at index 2. The clean flag is a separate field.
    const parents = received.map(frame => frame.params[2]);
    const states = parents.map((parent, index) => {
      if (index === 0) return 'initial';
      return parent === parents[index - 1] ? 'same-parent' : 'new-parent';
    });
    assert.deepEqual(states, ['initial', 'same-parent', 'new-parent']);
    assert.notEqual(received[1].params[3], received[0].params[3]);
    const cleanJobs = received.map(frame => frame.params[7]);
    assert.deepEqual(cleanJobs, [true, false, true]);
    console.log(JSON.stringify({ check: 'Stratum loopback replay', received: received.length, parents: states, cleanJobs }));
  } finally {
    receiver.destroy();
    await new Promise(resolve => server.close(resolve));
  }
}

replay().catch(error => { console.error(error); process.exitCode = 1; });
