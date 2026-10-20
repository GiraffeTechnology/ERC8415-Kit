# ERC-8415 implementation and wallet test results

Updated: 2026-10-20 UTC. Reported evidence cutoff: **2026-10-19 19:37:56 UTC**. Public evidence summary for ERC-8415 ecosystem integration. This is an update of recorded results, not a new test execution.

**Overall status: INCOMPLETE.**

## Results at a glance

- Public Hoodi same-block A/B tests established both execution orders: release before later admission preserves the entry actually used; admission before the release attempt is observed by the release and its conditions are enforced.
- The completed semantic test scope passed, including historical entry boundaries, same-holder confirmation, provisional/final separation and preservation of the original release commitment.
- The wallet's 60-case application/integration ledger records **56 PASS / 4 INCOMPLETE**. These are the test operator's recorded results within the scopes below, not independent full-product acceptance. The same-block A/B work is additional and is not added to the 60-case denominator.
- The updated same-block wallet-reader regression suite passed **56 tests**, including 9 new ordering tests. This is candidate-reader validation, not an assertion that every installed wallet interface has been upgraded.
- Earlier Sepolia release/refund work and the Kit's own version-pinned local/CI results are retained below as separate campaigns.

8415Wallet is a general-purpose wallet with native ERC-8415 support, being developed as infrastructure for ERC-8415-based RWA products with compliance requirements.

## 1. Public Hoodi same-block results

Network: Hoodi, chain ID **560048**. Synthetic assets and test-network value were used. Registrar inputs are simulated; transaction execution and receipts are public-chain facts.

### A: release first, later admission at exactly the same effective time — PASS

[Block 3847831](https://hoodi.etherscan.io/block/3847831), timestamp `1792433052`, block hash `0x4078da4b90cbb2cfd04e079e2105e3413dc1edbe52e94e0706c404b26deb07a5`.

| Action | Transaction index | Receipt | Evidence |
| --- | ---: | --- | --- |
| Release using entry 2 | 20 | Success | [Release](https://hoodi.etherscan.io/tx/0xffec2724f53872708605ea62d9e623b7cb1a6f487b7d4f209f1f747829e6219c) |
| Admit entry 3 | 21 | Success | [Admission](https://hoodi.etherscan.io/tx/0x8121149ae78291d4408b792dd5ecb1b31d52e910ddea5e63c0c330cb4b306ba5) |

Entry 3's effective time is exactly `1792433052`. The release execution reads entry 2 and records its commitment `0x6b81981ddc06bacb59c301f7afb8bec9579a1079c91ec9a6408462ff17a9c81d`. The end-of-block historical query sees entry 3. These are consistent observations at different execution positions: later admission does not rewrite the earlier release event.

### B: admission first, release attempt second — PASS for reverse ordering

[Block 3847880](https://hoodi.etherscan.io/block/3847880), timestamp `1792433664`, block hash `0x7ac87f8fea49539e5777fddb2347c2edc6313cb40dbdb80cdb3aa849a28d2539`.

| Action | Transaction index | Receipt | Evidence |
| --- | ---: | --- | --- |
| Admit entry 3 | 15 | Success | [Admission](https://hoodi.etherscan.io/tx/0x0c352d7b42dbcef9cc747d01a07485e017e3472a2d53fb0d86861ddcc84e8ee9) |
| Attempt release | 16 | Expected revert | [Release attempt](https://hoodi.etherscan.io/tx/0x1a723d70edd8f9b440c9f724bc9296ca141e43dbc57311468bdf3ad756a96b82) |

The release reads entry 3 and reverts with `NotConfirmed()` because the holder no longer matches the buyer. There is no successful release event. Entry 3's effective time is `1792433652`, 12 seconds before the block timestamp: this run demonstrates reverse transaction ordering, not the stricter equal-time B variant. The controlled local-EVM A/B tests also covered the equal-time variants.

The updated reader distinguishes supersession after release from supersession before a release attempt while retaining the original release commitment. Block-end state alone is insufficient; the audit uses transaction positions and execution traces. Event positions help locate emissions but do not independently prove when a state read occurred.

The [machine-readable receipt index](hoodi-receipts.json) contains all 18 distinct receipts in this same-block campaign: 17 successful transactions and one expected reverted release. Setup transactions are included; 18 receipts do not mean 18 test cases. Each record includes block number/hash, transaction index and explorer links.

## 2. Earlier Hoodi historical-release and application results

The earlier release/history test used separate blocks:

- [Admission of entry 2](https://hoodi.etherscan.io/tx/0xef0d70d9a574aee5225762c3c799e1318ea0f4b3f63ce5840fb059b25e563ab2).
- [Release using entry 2](https://hoodi.etherscan.io/tx/0x0ab7ecf5f235134e9e1d026bb8594fe38f9c1fcae4bd36e3ccec285a56053fa2).
- [Later admission of entry 3](https://hoodi.etherscan.io/tx/0x1a9e3333b8b28992fda81cc596d1726a7a6e5fed6cbfc073ced7d6d5d3636b46), eight blocks / 96 seconds after release.

The original entry-2 release commitment remained intact after entry 3 changed the historical answer. This cross-block result is complemented by the same-block evidence above.

Additional successful wallet application paths include:

- Three-wallet forward transfers while registration lags; independent completion of AB before BC.
- Registration catch-up after missing an intermediate refresh: [completion](https://hoodi.etherscan.io/tx/0xdb5ec8cbdf944fb221e5e121ec7ffe1d91242c0a59ee14e7fa55c165a66aec2d).
- Separate reverse hops [C to B](https://hoodi.etherscan.io/tx/0x19d1d2153626c8603f8e265710c9efa6d0259a3147f8d4857436b53b6543bc20) and [B to A](https://hoodi.etherscan.io/tx/0x9e92214f60a07c73715ad5b5125f5fab5dd103750294d4786c9cff3b6ef084d0).
- Recovery of a completed hop from its original receipt without replaying it.
- [Late registration after a closed return](https://hoodi.etherscan.io/tx/0xa32dcd149a5f8eba5667ae8b4867bda2105a796c82419e54e68aa873f5dcead7), preserving the earlier returned sequence.
- Independent settlement/refund of 1-wei and 2-wei test principals, completed-prefix protection and new sequences retaining old history.

Returns, payments, occurrences and completed prefixes are application composition. They do not add rollback or rejection of admitted history to ERC-8415 itself.

## 3. Wallet ledger: 56 recorded passes and 4 incomplete

PASS below means the test operator recorded a pass in the documented execution scope. The 56 cases are not 56 real transactions: they include artifacts, actual chain reads, native contract/CLI consumers, deployed-contract negative calls and controlled fault injection. Contract negative checks performed with `eth_call` are not described as mined transactions. Deliberate client disconnects and synthetic reorg/receipt overlays are fault-injection tests, not claims of an observed public-network outage or reorg. A native-contract result is not automatically an installed UI/API result.

| ID | Test | Current result |
| --- | --- | --- |
| S01 | Three distinct wallet roles and network selection | PASS |
| S02 | Synthetic warehouse receipt and content digest | PASS |
| S03 | NFT mint and owner readback | PASS |
| S04 | Initial admitted registration | PASS |
| S05 | Independent fixtures and accepted terms | PASS |
| S06 | Separate principal and gas accounting | PASS |
| F01 | Funding before admission of entry 2 | PASS |
| F02 | Release against admitted entry 2 | PASS |
| F03 | Release receipt commitment matches entry 2 | PASS |
| F04 | Later admission with retrospective effective time | PASS |
| F05 | Historical answer after later admission | PASS |
| F06 | Original release evidence remains unchanged | PASS |
| F07 | Reconstruct release fields and linked context | PASS |
| F08 | Reject mismatched audit inputs | PASS |
| A01 | A to B while confirmed holder remains A | PASS |
| A02 | B to C before registration catches up | PASS |
| A03 | Bind admission of B to its occurrence | PASS |
| A04 | Complete and detach AB while BC remains active | PASS |
| A05 | Admit C and complete BC | PASS |
| A06 | Catch up after missing the B refresh | PASS |
| A07 | Same-holder confirming admission | PASS |
| A08 | Distinguish delay, stale registration, RPC failure and revert | PASS |
| P01 | Forward chain without payment adapter | PASS |
| P02 | Independent principal reservations per leg | PASS |
| P03 | Settle completed AB while BC remains pending | PASS |
| P04 | Reconcile unknown payment outcome without resubmission | PASS |
| P05 | Reject repeated settlement | PASS |
| P06 | Reconcile principal and gas movements | PASS |
| R01 | Invoke the agreed application return condition | PASS |
| R02 | Return C to B to A in separate hops | PASS |
| R03 | Refund both unfinished legs to their original payers | PASS |
| R04 | Stop a return at the completed AB boundary | PASS |
| R05 | Reject unauthorized or incorrectly bound return requests | PASS |
| R06 | Check before, at and after the deadline | PASS |
| R07 | Reject forward/completion during active callback | PASS |
| R08 | Late admission preserves a closed return sequence | PASS |
| D01 | Preserve detached AB while BC stays active | PASS |
| D02 | Reject reuse of detached legs | PASS |
| D03 | Resume after a completed hop without replay | PASS |
| D04 | Open a new sequence while retaining old history | PASS |
| D05 | Repeated A in A to B to C to A: occurrence isolation | PASS |
| D06 | Reject stale revision operations | PASS |
| H01 | Read the complete admitted entry chain | PASS |
| H02 | Effective-time boundaries and before-first-entry behavior | PASS |
| H03 | Separate historical ownership and registration | PASS |
| H04 | Retrieve original credentials by trade, sequence and leg | PASS |
| H05 | Query detached, returned and closed history | PASS |
| H06 | Keep historical holder and temporal finality separate | PASS |
| H07 | Repeat pinned historical reads after client restart | PASS |
| H08 | Pagination and invalid or missing history sources | PASS |
| N01 | Disconnect before submission | PASS |
| N02 | Recover after a lost submission response | PASS |
| N03 | Recover after execution but before receipt persistence | PASS |
| N04 | RPC timeout, wrong chain, source switch and late responses | PASS |
| N05 | Receipt availability, confirmation depth and reorg handling | PASS |
| X01 | Default network and explicit test-network selection | PASS |

**Remaining cases: 4 INCOMPLETE. Overall acceptance: INCOMPLETE.**

### Scope of the recorded passes

- S01 records role/address and chain-read anchors, not proof that every address could sign at that earlier checkpoint. S02 is a synthetic receipt artifact, not chain execution. S03-S06 combine actual mint/readback and fixture/accounting evidence with simulated registrar facts.
- F01-F08 concern the native reference-escrow path and its receipt/history audit. F02 used zero principal. F07 reconstructs direct release fields from the event and obtains token, terms and canonical time from linked records. F08 uses deliberately mismatched audit inputs against real records.
- A01-A07, P01-P06, R01-R08 and D01-D06 concern native application-contract paths. Registrar facts are simulated; the documented admissions, transfers, completions, returns and small test-principal movements are actual Hoodi execution. Negative contract checks use deployed-contract `eth_call`, not mined negative transactions. R06 checks real historical blocks around the agreed deadline. Client-persistence interruptions in P04 and D03 are controlled fault injection.
- A08 combines actual native asset reads with controlled elapsed-time and transport-fault simulations. The expected mined release revert is separate evidence, not a network outage or an actual elapsed-deadline observation.
- D05 records the actual A-to-B-to-C-to-A sequence with distinct occurrences and legs. The initial A occurrence cannot stand in for the later A occurrence; a later admitted entry bound to the correct occurrence completes the three legs.
- H01-H06 use actual native history reads and receipt-linked reconstruction. H04 distinguishes the corrected release-reader candidate from the separate completion/refund readers. H07 repeats pinned reads in a fresh client process, not a service-restart test. H08 covers native history and contiguous public-log pages; an unsupported opaque cursor is explicitly rejected, not evidence of implemented cursor-expiry semantics.
- N01-N04 combine actual chain observations with deliberately interrupted clients or injected transport faults. N05 combines a real canonical receipt and confirmation-depth checks with synthetic missing-receipt, reorg and error overlays. These do not claim a public-network outage or an observed real reorg.
- X01 covers bounded native CLI chain-selection preflight, a separate actual asset read and preserved network bindings. It does not establish successful execution of an entire all-views CLI run.

These pass scopes do not establish installed browser UI, hosted authenticated API or full-product acceptance. This update does not extend historical results to later code revisions. Incomplete cases are reported only in aggregate.

## 4. Historical Sepolia release/refund campaign

Network: Sepolia, chain ID **11155111**. Campaign date: **2026-09-19**.

- Projection: [0xaeeb157f40ffdad51693275258a465763be66cd8](https://sepolia.etherscan.io/address/0xaeeb157f40ffdad51693275258a465763be66cd8).
- Escrow: [0x50299e4d454fc9ec788f735e004d1ec537767934](https://sepolia.etherscan.io/address/0x50299e4d454fc9ec788f735e004d1ec537767934).
- Recorded historical scan interval: [block 11739199](https://sepolia.etherscan.io/block/11739199) through [block 11739229](https://sepolia.etherscan.io/block/11739229).
- Fourteen transactions exercised release and refund paths with test-only value. Token `841501` was released against entry 2 while `isFinalAsOf(1789840680)` was false; the prior instant `1789833540` was final and retained the earlier holder even though current ownership had moved.
- Historical reads, custom-error decoding, interface discovery and trade-key derivation were checked. Provider log-range errors and transport/revert misclassification were identified and corrected; the subsequent historical scan returned the expected events.
- Three additional cases remain INCOMPLETE in that historical campaign. It is historical evidence for that implementation, not a rerun of the current wallet.

These Sepolia details are transcribed from the historical execution report. The block links identify its recorded range; this publication does not invent fourteen missing per-transaction hashes or claim a fresh independent archive-RPC replay.

## 5. Kit's own reproducible baseline

The Kit baseline [93035d2](https://github.com/GiraffeTechnology/ERC8415-Kit/commit/93035d2c1384dbb6b974a9680326fbff623c2d9b) passed **169 Node tests and 32 local-EVM tests**, including four record-date consumer tests, in [CI run 37026227378](https://github.com/GiraffeTechnology/ERC8415-Kit/actions/runs/37026227378). Both Node-matrix jobs have real runners and successful typecheck, coverage and on-chain-delivery steps.

This is a separate Kit baseline, not the source of the wallet's 60-case count. Wallet public-chain integration evidence does not silently replace the Kit's documented conformance limits or claim that all deployments have identical bytecode. The result tables above state the tested scope; they are not a certification of every normative requirement or a regulatory approval.

## Evidence interpretation

Public block and transaction links allow readers to inspect chain facts directly. Local regressions, synthetic fault injection, historical reports and current application progress are labelled separately. This report publishes test outcomes and public-chain identifiers only; underlying private operational material and product source are outside its scope.
