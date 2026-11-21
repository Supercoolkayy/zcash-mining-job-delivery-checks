# Job selection in Zakura’s example mining pool

Zakura v1.8.9’s Docker Compose configuration pins Valargroup’s s-nomp, which pins the job manager exercised here. The replay calls two of its methods directly. [Compose configuration](https://github.com/zakura-core/zakura/blob/v1.8.9/docker/mining/docker-compose.yml#L44) · [Adapter pin](https://github.com/valargroup/s-nomp/blob/749658d21f30a96358f202eba4e01dd752a11f02/package.json#L51) · [Job manager](https://github.com/valargroup/node-stratum-pool/blob/c1ef172f9db594552b0cfb5bbbfeb1cd3e90dfe1/lib/jobManager.js#L122-L185)

| Input | Method | Job-manager event | Selected job | Non-coinbase entries | Selected Merkle root |
|---|---|---|---|---:|---|
| Initial template | `processTemplate` | `newBlock` | `cccd` | 0 | Initial root |
| Revised transaction list and root, same parent | `processTemplate` | None | `cccd` | 0 | Initial root |
| Identical revised input | `updateCurrentJob` | `updatedBlock` | `ccce` | 1 | Revised root |
| New parent and height, same revised list | `processTemplate` | `newBlock` | `cccf` | 1 | Revised root |

The baseline is the JSON body of Zebra v6.2.0’s `mainnet_10` RPC test snapshot. Zebra generated it against a mock chain state. The replay adds a synthetic transaction marker and changes hash fields to distinguish inputs. It verifies the emitted events, the retained transaction list and the parent and Merkle root in the worker parameters. It performs no consensus validation. [Original Zebra snapshot](https://github.com/ZcashFoundation/zebra/blob/v6.2.0/zebra-rpc/src/methods/tests/snapshots/get_block_template_basic%40mainnet_10.snap) · [Fixture provenance](https://github.com/sovright/mining-infra/blob/127a30aa5b4599cf8d40e56feed9143d7bacef87/crates/zcash-template-provider/tests/zebra_getblocktemplate_display_order.rs#L1-L7)

The example configures a 55-second idle rebroadcast timer. Broadcasting a job resets the timer. The replay calls the refresh method directly. The 55-second setting comes from source inspection. [Setting](https://github.com/valargroup/s-nomp/blob/749658d21f30a96358f202eba4e01dd752a11f02/docker-entrypoint.sh#L29-L30) · [Timer reset](https://github.com/valargroup/node-stratum-pool/blob/c1ef172f9db594552b0cfb5bbbfeb1cd3e90dfe1/lib/stratum.js#L433-L444) · [Idle handler](https://github.com/valargroup/node-stratum-pool/blob/c1ef172f9db594552b0cfb5bbbfeb1cd3e90dfe1/lib/pool.js#L482-L489)

The check uses s-nomp’s shipped mainnet ZEC coin profile. It copies the miner subsidy and funding streams from Zebra’s subsidy test snapshot into the template, following the pool’s preparation step. [Coin profile](https://github.com/valargroup/s-nomp/blob/749658d21f30a96358f202eba4e01dd752a11f02/coins/zec.json) · [Pool preparation](https://github.com/valargroup/node-stratum-pool/blob/c1ef172f9db594552b0cfb5bbbfeb1cd3e90dfe1/lib/pool.js#L629-L637) · [Subsidy snapshot](https://github.com/ZcashFoundation/zebra/blob/v6.2.0/zebra-rpc/src/methods/tests/snapshots/get_block_subsidy_tip_height%40mainnet_10.snap)

The replay verifies six upstream JavaScript modules, the coin profile and both test fixtures against their Git blob IDs. JavaScript handles one native number conversion for the template difficulty field. Unused native dependencies are stubbed. To run this check alone from the repository root, use `node --no-deprecation valar-pool-check/replay.cjs`.
