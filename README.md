# Zcash mining job delivery checks

This prototype reproduces a job-selection difference in the pool adapter used by Zakura v1.8.9’s mining example. When the transaction list changed but the parent block stayed the same, the ordinary handler kept the old job. Passing the **same revised template** to the explicit refresh method produced an updated job.

## Run

From the extracted folder or repository root, using Node.js 24:

```sh
node run.cjs
```

All inputs and dependencies are included. The network checks use TCP and HTTP on `127.0.0.1`. A successful run exits with code 0 and ends with **All three local checks passed.** The recorded run used Node.js 24.22.3 on Linux. [Expected output](RESULT.txt)

## What each check verifies

| Check | Input and observed result |
|---|---|
| Pool job selection | A Zebra v6.2.0 test snapshot generated from a mock chain state, followed by synthetic revisions. The Valar adapter kept the original job on an ordinary same-parent update, emitted an updated job on explicit refresh, and emitted a new job when the parent changed. [Cases and source pins](valar-pool-check/README.md) |
| Stratum notification delivery | The pinned job writer sent two notifications transcribed from a 2017 Flypool miner log and one synthetic same-parent update to a local TCP receiver. All three messages arrived with the expected fields. The receiver distinguished the initial job, a same-parent update and a new parent by comparing parent hashes. [Miner log](https://forum.zcashcommunity.com/t/miner-claymores-zcash-miner/7114/1483) · [ZIP 301](https://zips.z.cash/zip-0301) |
| RPC long polling | The adapter’s upstream test held a template request open on a local HTTP server while a second request completed on a different connection. Its cancellation and error-handling assertions also passed. [Upstream test](https://github.com/upbqdn/node-stratum-pool/blob/1f0726f5c3e3b0652a6e0ca0f9abb127c4828dcd/test/daemon.js) |

The three checks run independently. The writer and RPC checks use the adapter pinned in the Zebra Book. The job-selection check uses Valargroup’s fork of the same pool library. Live node-to-worker delay, physical miner behavior and lost fees remain unmeasured. [Zebra Book](https://zebra.zfnd.org/next/user/mining-pools.html) · [Source hashes](sources.json) · [Licenses](LICENSE.md)
