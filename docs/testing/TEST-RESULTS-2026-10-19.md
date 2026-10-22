# ERC-8415 implementation and wallet test results

Updated: 2026-10-22 UTC. Public evidence summary for ERC-8415 ecosystem integration.

## Summary: the forum question first, then the complete wallet campaign

**Forum-specific additional test (+1): same-block release/admission ordering — PASS within the variants documented below.** Can a later register admission change the historical answer without rewriting the entry actually used by an earlier release, even when both transactions share a block? The public Hoodi A run establishes release-before-admission at equal effective time: the release records entry 2, while the end-of-block historical query returns entry 3. The B run establishes reverse ordering: admission precedes the release attempt, which reads entry 3 and reverts as expected. The public B run is not the stricter equal-time variant; controlled local-EVM tests covered the equal-time variants. Section 1 preserves the exact receipts, positions and limits.

**Wallet campaign: all 60 case identities have recorded PASS results in their stated execution scopes.** The consolidated ledger covers setup, release-history audit, registration catch-up, payment composition, returns, detached history, recovery, network isolation, authorization and observation consumers. This is a version-pinned body of evidence, not a claim that every case was rerun on one current build or that the installed UI, production API or complete product has passed acceptance.

The reporting shorthand is **60+1**: the original 60-case wallet ledger and one additional same-block A/B campaign. The +1 is one testing topic with multiple variants and setup transactions, not one transaction or one extra ledger row. It is not the Kit suite. Historical and newer evidence remain distinguished in the provenance details rather than split into separate headline totals.

The same-block wallet-reader regression suite separately recorded **56 passing tests**, including 9 ordering tests. That unit-test count is not the wallet-case count. The Kit baseline and earlier Sepolia campaign are also separate, version-pinned results.

8415Wallet is a general-purpose wallet with native ERC-8415 support, being developed as infrastructure for ERC-8415-based RWA products with compliance requirements.

## 1. Public Hoodi same-block results

Network: Hoodi, chain ID **560048**. Synthetic assets and test-network value were used. Registrar inputs are simulated; transaction execution and receipts are public-chain facts.

### A: release first, later admission at exactly the same effective time — PASS

Block 3847831, timestamp `1792433052`, block hash `0x4078da4b90cbb2cfd04e079e2105e3413dc1edbe52e94e0706c404b26deb07a5`.

| Action | Transaction index | Receipt | Evidence |
| --- | ---: | --- | --- |
| Release using entry 2 | 20 | Success | `0xffec2724f53872708605ea62d9e623b7cb1a6f487b7d4f209f1f747829e6219c` |
| Admit entry 3 | 21 | Success | `0x8121149ae78291d4408b792dd5ecb1b31d52e910ddea5e63c0c330cb4b306ba5` |

Entry 3's effective time is exactly `1792433052`. The release execution reads entry 2 and records its commitment `0x6b81981ddc06bacb59c301f7afb8bec9579a1079c91ec9a6408462ff17a9c81d`. The end-of-block historical query sees entry 3. These are consistent observations at different execution positions: later admission does not rewrite the earlier release event.

### B: admission first, release attempt second — PASS for reverse ordering

Block 3847880, timestamp `1792433664`, block hash `0x7ac87f8fea49539e5777fddb2347c2edc6313cb40dbdb80cdb3aa849a28d2539`.

| Action | Transaction index | Receipt | Evidence |
| --- | ---: | --- | --- |
| Admit entry 3 | 15 | Success | `0x0c352d7b42dbcef9cc747d01a07485e017e3472a2d53fb0d86861ddcc84e8ee9` |
| Attempt release | 16 | Expected revert | `0x1a723d70edd8f9b440c9f724bc9296ca141e43dbc57311468bdf3ad756a96b82` |

The release reads entry 3 and reverts with `NotConfirmed()` because the holder no longer matches the buyer. There is no successful release event. Entry 3's effective time is `1792433652`, 12 seconds before the block timestamp: this run demonstrates reverse transaction ordering, not the stricter equal-time B variant. The controlled local-EVM A/B tests also covered the equal-time variants.

The updated reader distinguishes supersession after release from supersession before a release attempt while retaining the original release commitment. Block-end state alone is insufficient; the audit uses transaction positions and execution traces. Event positions help locate emissions but do not independently prove when a state read occurred.

The machine-readable receipt index contains all 18 distinct receipts in this same-block campaign: 17 successful transactions and one expected reverted release. Setup transactions are included; 18 receipts do not mean 18 test cases. Each record includes block number/hash, transaction index and the original evidence references.

## 2. Earlier Hoodi historical-release and application results

The earlier release/history test used separate blocks:

- `0xef0d70d9a574aee5225762c3c799e1318ea0f4b3f63ce5840fb059b25e563ab2`.
- `0x0ab7ecf5f235134e9e1d026bb8594fe38f9c1fcae4bd36e3ccec285a56053fa2`.
- `0x1a9e3333b8b28992fda81cc596d1726a7a6e5fed6cbfc073ced7d6d5d3636b46`, eight blocks / 96 seconds after release.

The original entry-2 release commitment remained intact after entry 3 changed the historical answer. This cross-block result is complemented by the same-block evidence above.

Additional successful wallet application paths include:

- Three-wallet forward transfers while registration lags; independent completion of AB before BC.
- Registration catch-up after missing an intermediate refresh: `0xdb5ec8cbdf944fb221e5e121ec7ffe1d91242c0a59ee14e7fa55c165a66aec2d`.
- Separate reverse hops `0x19d1d2153626c8603f8e265710c9efa6d0259a3147f8d4857436b53b6543bc20` and `0x9e92214f60a07c73715ad5b5125f5fab5dd103750294d4786c9cff3b6ef084d0`.
- Recovery of a completed hop from its original receipt without replaying it.
- `0xa32dcd149a5f8eba5667ae8b4867bda2105a796c82419e54e68aa873f5dcead7`, preserving the earlier returned sequence.
- Independent settlement/refund of 1-wei and 2-wei test principals, completed-prefix protection and new sequences retaining old history.

Returns, payments, occurrences and completed prefixes are application composition. They do not add rollback or rejection of admitted history to ERC-8415 itself.

## 3. Consolidated wallet ledger: 60 scoped case results

PASS below means the test operator recorded a pass in the documented execution scope. The 60 cases are not 60 real transactions: they include artifacts, actual chain reads, native contract/CLI consumers, deployed-contract negative calls and controlled fault injection. Contract negative checks performed with `eth_call` are not described as mined transactions. Deliberate client disconnects and synthetic reorg/receipt overlays are fault-injection tests, not claims of an observed public-network outage or reorg. A native-contract result is not automatically an installed UI/API result.

| ID | Test | Recorded scoped result |
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
| N06 | Logout, natural session expiry, explicit revocation and in-flight recovery | PASS — isolated API/native scope below |
| X01 | Default network and explicit test-network selection | PASS |
| X02 | Same-address cross-chain identity, authorization and history isolation | PASS — API/native and read-only second-chain scope below |
| X03 | Sequential authorized steps, out-of-scope refusal and revocation boundaries | PASS — exact-operation API/native scope below |
| X04 | Pending, stale, not-covered, unavailable and reverted observation consumers | PASS — read-only API/native consumer scope below |

### Interpretation and acceptance boundary

All original case identities are retained. PASS denotes the recorded applicable execution layer, not unrestricted acceptance of every interface or deployment. No requirement is made optional to obtain the total. The campaign is not an exhaustive acceptance matrix for the wallet or ERC-8415, and unrelated incomplete production or UI work does not invalidate independently evidenced native scenarios.

The historical case evidence retains source `b567f4f9745dea9e11f1b748a8dae5068fbceedb` and its original execution boundaries. The October 22 API/native evidence for N06, X02, X03 and X04 records author-declared runtime source `ffbe8a9d382ef898449e7197b548132c0def5ba2`, tree `ea995f4743bf86f4182f5fa14b42537f7b747a88`. The reported main checkpoint `b2181559c8341c7781437eeafa17abb77653b6a7` has the same tree, but is a different commit and is not substituted for the executed source. These are author-declared wallet implementation source identities, not the heads of these documentation repositories. Independent review verified package integrity and the limited reused-consumer closure, not every loaded module against that tree. The live worker records hard-coded commit/tree metadata and checks the PRD hash; its final clean-tree check covers a candidate directory different from the directory imported by the runtime. The 35-file closure does not cover authentication, exact-operation signer, receipt, source-registry or web-consumer modules. A full runtime-to-commit binding therefore remains unverified. Per-case references and timing are retained in the provenance appendix.

This documentation revision runs no tests. It incorporates the October 22 evidence without extending historical passes to newer code, treating simulated receipts as live receipts, or claiming production authentication or installed/rendered UI acceptance.

### Scope of the recorded passes

- S01 records role/address and chain-read anchors, not proof that every address could sign at that earlier checkpoint. S02 is a synthetic receipt artifact, not chain execution. S03-S06 combine actual mint/readback and fixture/accounting evidence with simulated registrar facts.
- F01-F08 concern the native reference-escrow path and its receipt/history audit. F02 used zero principal. F07 reconstructs direct release fields from the event and obtains token, terms and canonical time from linked records. F08 uses deliberately mismatched audit inputs against real records.
- A01-A07, P01-P06, R01-R08 and D01-D06 concern native application-contract paths. Registrar facts are simulated; the documented admissions, transfers, completions, returns and small test-principal movements are actual Hoodi execution. Negative contract checks use deployed-contract `eth_call`, not mined negative transactions. R06 checks real historical blocks around the agreed deadline. Client-persistence interruptions in P04 and D03 are controlled fault injection.
- A08 combines actual native asset reads with controlled elapsed-time and transport-fault simulations. The expected mined release revert is separate evidence, not a network outage or an actual elapsed-deadline observation.
- D05 records the actual A-to-B-to-C-to-A sequence with distinct occurrences and legs. The initial A occurrence cannot stand in for the later A occurrence; a later admitted entry bound to the correct occurrence completes the three legs.
- H01-H06 use actual native history reads and receipt-linked reconstruction. H04 distinguishes the corrected release-reader candidate from the separate completion/refund readers. H07 repeats pinned reads in a fresh client process, not a service-restart test. H08 covers native history and contiguous public-log pages; an unsupported opaque cursor is explicitly rejected, not evidence of implemented cursor-expiry semantics.
- N01-N04 combine actual chain observations with deliberately interrupted clients or injected transport faults. N05 combines a real canonical receipt and confirmation-depth checks with synthetic missing-receipt, reorg and error overlays. These do not claim a public-network outage or an observed real reorg.
- X01 covers bounded native CLI chain-selection preflight, a separate actual asset read and preserved network bindings. It does not establish successful execution of an entire all-views CLI run.

These historical scopes do not establish installed browser UI, hosted production API or full-product acceptance and are not extended to later code revisions.

### API/native evidence and case-specific limits

The October 22 execution loaded the product authentication service, exact-operation signer, receipt/runtime components and encrypted store into an isolated test namespace. The registration index and store were test-only, not production accounts or production persistence. Original-wallet login proofs and actual Hoodi transactions were used; simulated signatures, grants and receipts from the superseded report are not evidence of live-chain completion.

- **N06:** Original-wallet login, logout returning 401, explicit revocation before dispatch, actual natural 15-minute session expiry, UNKNOWN reconciliation after controlled response loss, and reopening the same encrypted test store. Logout/expiry does not silently revoke an independently valid task grant. One actual Hoodi transaction is reconciled by its original hash without resending. Natural expiry was observed from issuance at `2026-10-22T01:22:55.434Z` through expiry at `01:37:55.434Z` and completion at `01:37:55.832Z`, without clock changes or a shortened TTL.
- **X02:** Same-address chain-bound login/task/child identities, nonce and budget isolation, duplicate-operation refusal, cancellation/revocation persistence, and discarding a delayed response after chain selection changes. Hoodi was active; Sepolia was read-only. Historical Sepolia receipt evidence was reused with current block/transaction checks: the provider returned null for the old receipt and could not supply pruned genesis data. This is not a fresh live receipt retrieval. The evidence records a 35-file unchanged-dependency check for reused native coverage, not a rerun of the entire campaign.
- **X03:** Two sequential one-wei transfers used two separate exact-operation grants, each with quota 1, prepared/authorized by the same already logged-in test runtime without another human prompt. Wrong-recipient requests were refused before signing/broadcast. This does not establish that one exact-operation grant permits multiple transfers or that the original ALL ON settings UI was verified end to end: the policy factor was `preoperational-default-on`, `policyRevision=0`, `NOT_EVALUATED`. Both transaction steps reached successful receipt states. The execution worker then failed importing an unbuilt browser dependency; its later third-step revocation and four-record reopen were not executed. Revocation, UNKNOWN and reopen coverage is cross-referenced from N06/X02, not claimed as a reopen of X03's two terminal transaction records. The failed worker record is retained alongside the later separate consumer run.
- **X04:** Real Hoodi observations were composed with exported product source/decoder/consumer components through an isolated read-only HTTP test facade. Pending registration was not treated as a failed transaction or automatic transfer lock; stale history preserved its source/time; controlled RPC unavailability preserved old evidence; reconnect refreshed observation data; before-first-entry queries remained not-covered. Freshness remained false: reconnect does not establish a current public Watchtower/feed or restore public-feed freshness. Wrong-chain HTTP 503 was enforced by the test facade, not proven as a production resolver rejection. Logout/chain-switch late-response fences and the read-only evidence-store reopen were exercised. The original mined revert was read again and the unchanged legacy consumer evidence was reused. An inapplicable fixed-account adapter rejected that legacy escrow input; no validation was weakened to force a pass. This is not installed/rendered UI or deployed production API acceptance.

### Actual Hoodi transactions supporting the API/native cases

The following are the operator's raw RPC/receipt captures. Evidence-package byte/hash integrity was independently checked; an attempted fresh independent receipt lookup was blocked by the provider, so this revision does not claim an independent live receipt/finality replay.

| Case / step | Transaction | Nonce | Receipt status | Block | Gas used | Fee (wei) |
| --- | --- | ---: | --- | --- | ---: | ---: |
| N06 UNKNOWN reconciliation | `0x7924ce322a0c003655c23db3f7f943e86b250f5a8610baad7288d88083e0a22a` | 111 | 0x1 | 0x3af10b | 21000 | 21495315954000 |
| X03 step 1 | `0x5ce9026fa5502558986ff1a42a110ad562f60dbb228e952790c320486239c531` | 112 | 0x1 | 0x3af140 | 21000 | 23006083002000 |
| X03 step 2 | `0x7cfddcecb93967d18bdd6a109b6c00d9dce0c7178009c1a80b65f6bd0a7c7beb` | 113 | 0x1 | 0x3af145 | 21000 | 19014428790000 |

Each transaction transferred 1 wei. The recorded total fee is 63515827746000 wei, sender decrease 63515827746003 wei and recipient increase 3 wei. The captured finalized anchor is block `0x3af14e`, hash `0xa711442b5d1198444b05e76f24278d5777db68cc2ff634f98d233bc9791e6d1a`. These three transactions do not change the 18-receipt same-block index, which remains specific to that earlier campaign.

Production registration/authentication deployment, installed desktop/mobile UI, language/accessibility/layout acceptance and full-product readiness remain outside this test conclusion. No deployment, merge, credential change or production source change is claimed. The separately prepared X04 explanation correction and its specific regression are not included in this evidence and are not closed by these case results.

## 4. Historical Sepolia release/refund campaign

Network: Sepolia, chain ID **11155111**. Campaign date: **2026-09-19**.

- Projection: 0xaeeb157f40ffdad51693275258a465763be66cd8.
- Escrow: 0x50299e4d454fc9ec788f735e004d1ec537767934.
- Recorded historical scan interval: block 11739199 through block 11739229.
- Fourteen transactions exercised release and refund paths with test-only value. Token `841501` was released against entry 2 while `isFinalAsOf(1789840680)` was false; the prior instant `1789833540` was final and retained the earlier holder even though current ownership had moved.
- Historical reads, custom-error decoding, interface discovery and trade-key derivation were checked. Provider log-range errors and transport/revert misclassification were identified and corrected; the subsequent historical scan returned the expected events.
- Three additional cases remain INCOMPLETE in that historical campaign. It is historical evidence for that implementation, not a rerun of the current wallet.

These Sepolia details are transcribed from the historical execution report. The block numbers identify its recorded range; this publication does not invent fourteen missing per-transaction hashes or claim a fresh independent archive-RPC replay.

## 5. Kit's own reproducible baseline

The Kit baseline `93035d2c1384dbb6b974a9680326fbff623c2d9b` passed **169 Node tests and 32 local-EVM tests**, including four record-date consumer tests, in CI run 37026227378. Both Node-matrix jobs have real runners and successful typecheck, coverage and on-chain-delivery steps.

This is a separate Kit baseline, not the source of the wallet's 60-case count. Wallet public-chain integration evidence does not silently replace the Kit's documented conformance limits or claim that all deployments have identical bytecode. The result tables above state the tested scope; they are not a certification of every normative requirement or a regulatory approval.

## Evidence interpretation

Public block numbers and transaction hashes identify the chain facts without disclosing infrastructure endpoints. Local regressions, synthetic fault injection, historical reports and current application progress are labelled separately. This report publishes test outcomes and public-chain identifiers only; underlying private operational material and product source are outside its scope.


## Appendix: per-case source, timing and evidence provenance

Historical rows retain the original operator ledger's source and evidence digests; they are not newly executed. H = source `b567f4f9745dea9e11f1b748a8dae5068fbceedb`, tree `420d55bbff51c690744a010f5d3a2bc0539521e5`. C = author-declared runtime source `ffbe8a9d382ef898449e7197b548132c0def5ba2`, tree `ea995f4743bf86f4182f5fa14b42537f7b747a88`. Execution layers are defined by the case descriptions and scope paragraphs above. The earlier public summary recorded a cutoff of 2026-10-19 19:37:56 UTC; it is not reused as the execution time of later evidence. Exact per-case wall-clock time is not invented where absent from the preserved ledger. Block timestamps below are chain times, not client execution timestamps.

Evidence digests identify retained operator artifacts, not public downloads or independent re-execution. The complete October 22 bundle was 374977 bytes, SHA-256 `fd53acbbd5c4dbf2929501b5f14ca8951dbd0d8a67f89a75b27aafafc1ea2fda`; all 24 manifest-listed members matched. Private operational files are not published here.

| Case | Source | Timing / evidence class | Evidence SHA-256 digests |
| --- | --- | --- | --- |
| S01 | H | Historical retained scope; per-case wall-clock time not recorded in ledger | `2829ce197d2053b4129a12772b10e4638177b6b35a13956a7bea13943b553699` |
| S02 | H | Historical retained scope; per-case wall-clock time not recorded in ledger | `ff70206f1d6cbfaa42fe2a6e44f0468357352b8bbb16455bb4ffd73de7ff7d46` |
| S03 | H | Historical chain timestamps: 2026-10-19T10:59:12Z | `fc5255aeb66180df04e2e0453714be63356dd2f69d5a29501f9d2edb045b4d56`; `df9609592a9a6d1b825c24761c5a5f7b4668be4b3702012aed0223c182f5607e` |
| S04 | H | Historical chain timestamps: 2026-10-19T10:59:12Z | `fc5255aeb66180df04e2e0453714be63356dd2f69d5a29501f9d2edb045b4d56`; `df9609592a9a6d1b825c24761c5a5f7b4668be4b3702012aed0223c182f5607e` |
| S05 | H | Historical retained scope; per-case wall-clock time not recorded in ledger | `f6d7341a9de268617b93396d6ed9b7fe6227aa0cc6de38a09d68404bb884254c` |
| S06 | H | Historical retained scope; per-case wall-clock time not recorded in ledger | `f6d7341a9de268617b93396d6ed9b7fe6227aa0cc6de38a09d68404bb884254c` |
| F01 | H | Historical chain timestamps: 2026-10-19T11:02:12Z, 2026-10-19T11:02:48Z, 2026-10-19T11:03:24Z | `dc0fff569f8ba76805e383941f78ae79ce8927e8ee9fb2376e96698e748f1486`; `dd3f0c2ef72b82bcbf2b37253ecd78e3d69a5cd7bf5e3cb06de8ba07002531f0`; `bbeb8bb9492746727b38b74608951608bfa26679f38722e09e0eab1ed67b6d67`; `df9609592a9a6d1b825c24761c5a5f7b4668be4b3702012aed0223c182f5607e` |
| F02 | H | Historical chain timestamps: 2026-10-19T11:04:12Z | `135c7ba40f9787f5b8982e346d86ea4f244d25059eccd6dfe528adac8c4c5497`; `df9609592a9a6d1b825c24761c5a5f7b4668be4b3702012aed0223c182f5607e` |
| F03 | H | Historical chain timestamps: 2026-10-19T11:04:12Z | `135c7ba40f9787f5b8982e346d86ea4f244d25059eccd6dfe528adac8c4c5497`; `df9609592a9a6d1b825c24761c5a5f7b4668be4b3702012aed0223c182f5607e` |
| F04 | H | Historical chain timestamps: 2026-10-19T11:05:00Z, 2026-10-19T11:05:48Z | `59fe6aadb3aa4d9f3caf0bf9e5a69edbc52a49a70ce010f6de24d0e904f73220`; `ca0b6a549be32f46571645cd09eee0830378d6296ad339aae1ca2a4054883c52`; `df9609592a9a6d1b825c24761c5a5f7b4668be4b3702012aed0223c182f5607e` |
| F05 | H | Historical chain timestamps: 2026-10-19T11:04:12Z, 2026-10-19T11:05:48Z | `135c7ba40f9787f5b8982e346d86ea4f244d25059eccd6dfe528adac8c4c5497`; `ca0b6a549be32f46571645cd09eee0830378d6296ad339aae1ca2a4054883c52`; `df9609592a9a6d1b825c24761c5a5f7b4668be4b3702012aed0223c182f5607e` |
| F06 | H | Historical chain timestamps: 2026-10-19T11:04:12Z, 2026-10-19T11:05:48Z | `135c7ba40f9787f5b8982e346d86ea4f244d25059eccd6dfe528adac8c4c5497`; `ca0b6a549be32f46571645cd09eee0830378d6296ad339aae1ca2a4054883c52`; `df9609592a9a6d1b825c24761c5a5f7b4668be4b3702012aed0223c182f5607e` |
| F07 | H | Historical chain timestamps: 2026-10-19T11:04:12Z | `135c7ba40f9787f5b8982e346d86ea4f244d25059eccd6dfe528adac8c4c5497`; `df9609592a9a6d1b825c24761c5a5f7b4668be4b3702012aed0223c182f5607e` |
| F08 | H | Historical chain timestamps: 2026-10-19T11:04:12Z | `135c7ba40f9787f5b8982e346d86ea4f244d25059eccd6dfe528adac8c4c5497`; `df9609592a9a6d1b825c24761c5a5f7b4668be4b3702012aed0223c182f5607e`; `3f47e5745fd32e3030ff4952e232b9d3caffb1ef5709c8de4fa1cf5ef20d65e5` |
| A01 | H | Historical retained scope; per-case wall-clock time not recorded in ledger | `2f44d852ebdd42dfbd8cd56e3c548664d69de52bf63af5ea58accd65d9cd6023`; `7f643c690bc93dc7886b9d31c5d3b19ec2a0d0a3a6cbf492e685df2981cd81bc`; `20eac5b8c7d0bd11e27f988510913accbee7a0fdb73dc8fc5208eb7d1769018b`; `305a3f1b3676d4032123ed14a669f440e34fd64b18fa558b1239eea3d3c09f57`; `653e0f74d256040a73f2836334e6f5c9344ec7baabe1af544297f6d684af1305`; `2cdbdd5d1f6eaa371e71de561c46202514c1c7274815f65ab087fc2192c936fe`; `1c520e8ad8e5d4c1ca60b1116ad045892ef0342f76f25b1312976f6ff58c57cf`; `bdfefe7b148c1696465289101fb0ee7d6af39358f84100713c71d95c0cbf261e` |
| A02 | H | Historical retained scope; per-case wall-clock time not recorded in ledger | `3023c4bcd4bc7356abcc40ca0e20a74535515a20780359ef6ae790b7943cff56` |
| A03 | H | Historical retained scope; per-case wall-clock time not recorded in ledger | `65879fa00906387e8375a1df8b022f4d2fa6d35c6f387427c362f147cb4c470a` |
| A04 | H | Historical retained scope; per-case wall-clock time not recorded in ledger | `65879fa00906387e8375a1df8b022f4d2fa6d35c6f387427c362f147cb4c470a` |
| A05 | H | Historical retained scope; per-case wall-clock time not recorded in ledger | `65879fa00906387e8375a1df8b022f4d2fa6d35c6f387427c362f147cb4c470a` |
| A06 | H | Historical retained scope; per-case wall-clock time not recorded in ledger | `92f688c4653f6be58ca27c80101b4d40e0b38c8984ae2dd67cbe847caca8739c` |
| A07 | H | Historical retained scope; per-case wall-clock time not recorded in ledger | `65879fa00906387e8375a1df8b022f4d2fa6d35c6f387427c362f147cb4c470a` |
| A08 | H | Historical retained scope; per-case wall-clock time not recorded in ledger | `c5c04cb63efc6d6df922ea56e8f3e2388b7fb3fecfb2f65bc2fa7673ecdd7c82`; `d7619ce3c2914d03e07fad2bd7dc13eff79af170873bc8ae56604275050f8b63`; `53747c18c03a9f088ccdd7163424b5d613b75e04cc2ab191d56fe1a717a26006` |
| P01 | H | Historical retained scope; per-case wall-clock time not recorded in ledger | `65879fa00906387e8375a1df8b022f4d2fa6d35c6f387427c362f147cb4c470a` |
| P02 | H | Historical retained scope; per-case wall-clock time not recorded in ledger | `0a0ede80b4c5f6bdaf7683055c3c3ba7d3cf0e73f17e9702f2c567abc8f9da38` |
| P03 | H | Historical retained scope; per-case wall-clock time not recorded in ledger | `0a0ede80b4c5f6bdaf7683055c3c3ba7d3cf0e73f17e9702f2c567abc8f9da38` |
| P04 | H | Historical retained scope; per-case wall-clock time not recorded in ledger | `0a0ede80b4c5f6bdaf7683055c3c3ba7d3cf0e73f17e9702f2c567abc8f9da38`; `06ec3527973a5fd07a3c3be90746324bf9cfd569fd803ca92dd96d92540b04b9` |
| P05 | H | Historical retained scope; per-case wall-clock time not recorded in ledger | `0a0ede80b4c5f6bdaf7683055c3c3ba7d3cf0e73f17e9702f2c567abc8f9da38` |
| P06 | H | Historical retained scope; per-case wall-clock time not recorded in ledger | `0a0ede80b4c5f6bdaf7683055c3c3ba7d3cf0e73f17e9702f2c567abc8f9da38` |
| R01 | H | Historical retained scope; per-case wall-clock time not recorded in ledger | `2d686b2490b1e55bffcf7004e413ee0b47c0cf5adbe2faf5baafe43df10c593d` |
| R02 | H | Historical retained scope; per-case wall-clock time not recorded in ledger | `2d686b2490b1e55bffcf7004e413ee0b47c0cf5adbe2faf5baafe43df10c593d` |
| R03 | H | Historical retained scope; per-case wall-clock time not recorded in ledger | `abe2ccd08897da11029bb33f7fabb8cc6066ad94f9f00e40f73d14089a35628f` |
| R04 | H | Historical retained scope; per-case wall-clock time not recorded in ledger | `0a0ede80b4c5f6bdaf7683055c3c3ba7d3cf0e73f17e9702f2c567abc8f9da38` |
| R05 | H | Historical retained scope; per-case wall-clock time not recorded in ledger | `b787fd2b63318d023963224904927acb9943757ffdf5c92958e728a6aab27e1e` |
| R06 | H | Historical retained scope; per-case wall-clock time not recorded in ledger | `9d9c327555fee34bf4b46541c0fc8e4adb104d30287f43974d7d8ae9a68bec8b` |
| R07 | H | Historical retained scope; per-case wall-clock time not recorded in ledger | `2d686b2490b1e55bffcf7004e413ee0b47c0cf5adbe2faf5baafe43df10c593d` |
| R08 | H | Historical retained scope; per-case wall-clock time not recorded in ledger | `2d686b2490b1e55bffcf7004e413ee0b47c0cf5adbe2faf5baafe43df10c593d` |
| D01 | H | Historical retained scope; per-case wall-clock time not recorded in ledger | `65879fa00906387e8375a1df8b022f4d2fa6d35c6f387427c362f147cb4c470a` |
| D02 | H | Historical retained scope; per-case wall-clock time not recorded in ledger | `2d686b2490b1e55bffcf7004e413ee0b47c0cf5adbe2faf5baafe43df10c593d`; `e4811408a092c3ef51f5a0bed8d837a19adc128bbe7d5fb8aa34fbeb23d645de` |
| D03 | H | Historical retained scope; per-case wall-clock time not recorded in ledger | `2d686b2490b1e55bffcf7004e413ee0b47c0cf5adbe2faf5baafe43df10c593d` |
| D04 | H | Historical retained scope; per-case wall-clock time not recorded in ledger | `2d686b2490b1e55bffcf7004e413ee0b47c0cf5adbe2faf5baafe43df10c593d`; `c7859ebc18ee5a2c67c7c391cd6e601ec0e51c3a7bbbebcb82484e739144a281` |
| D05 | H | Historical retained scope; per-case wall-clock time not recorded in ledger | `2a7323d71579ac12dee67abdc239f9b927c0476fdf9e46dbb43cdf6596307120` |
| D06 | H | Historical retained scope; per-case wall-clock time not recorded in ledger | `2d686b2490b1e55bffcf7004e413ee0b47c0cf5adbe2faf5baafe43df10c593d` |
| H01 | H | Historical retained scope; per-case wall-clock time not recorded in ledger | `65879fa00906387e8375a1df8b022f4d2fa6d35c6f387427c362f147cb4c470a` |
| H02 | H | Historical retained scope; per-case wall-clock time not recorded in ledger | `6146e0f9356511a39f8c43ebacc010d639e26ec9512052ae259e542c61681439`; `f0e7368b9c5dd1abac46cde1dfa1c0cde5a1c3042ffe8db57f3595d5458eabde` |
| H03 | H | Historical retained scope; per-case wall-clock time not recorded in ledger | `65879fa00906387e8375a1df8b022f4d2fa6d35c6f387427c362f147cb4c470a` |
| H04 | H | Historical retained scope; per-case wall-clock time not recorded in ledger | `f6d7341a9de268617b93396d6ed9b7fe6227aa0cc6de38a09d68404bb884254c`; `4a716199dd8f600f1596c0b9e0685eea673c0b729f801150b90f57375a8ead04`; `0754d03864366aa8ad9cc3d7a204f6a5e0a9eea32775fde37d5c74db5b4fe683`; `bbb47dcddbd42d97221d9ad7e1879dd542ab88b39a363f1bade844e19db077c8` |
| H05 | H | Historical retained scope; per-case wall-clock time not recorded in ledger | `2d686b2490b1e55bffcf7004e413ee0b47c0cf5adbe2faf5baafe43df10c593d` |
| H06 | H | Historical retained scope; per-case wall-clock time not recorded in ledger | `6146e0f9356511a39f8c43ebacc010d639e26ec9512052ae259e542c61681439`; `f0e7368b9c5dd1abac46cde1dfa1c0cde5a1c3042ffe8db57f3595d5458eabde` |
| H07 | H | Historical retained scope; per-case wall-clock time not recorded in ledger | `6146e0f9356511a39f8c43ebacc010d639e26ec9512052ae259e542c61681439`; `f0e7368b9c5dd1abac46cde1dfa1c0cde5a1c3042ffe8db57f3595d5458eabde` |
| H08 | H | Historical retained scope; per-case wall-clock time not recorded in ledger | `b3058da44b93c43daf66dae6527c473c71484ee4493128c437b3f33fd58b5086`; `4a716199dd8f600f1596c0b9e0685eea673c0b729f801150b90f57375a8ead04`; `55a8b62906ae056f350623f564922ea6dc871701ffa8f53dc1ef85b7a9a5d41b` |
| N01 | H | Historical retained scope; per-case wall-clock time not recorded in ledger | `377cb5e102814aeedff1b97d9a48eaf4e7ce23523544e9e21fd567e5320e1554` |
| N02 | H | Historical retained scope; per-case wall-clock time not recorded in ledger | `377cb5e102814aeedff1b97d9a48eaf4e7ce23523544e9e21fd567e5320e1554` |
| N03 | H | Historical retained scope; per-case wall-clock time not recorded in ledger | `2d686b2490b1e55bffcf7004e413ee0b47c0cf5adbe2faf5baafe43df10c593d` |
| N04 | H | Historical retained scope; per-case wall-clock time not recorded in ledger | `b6273ded2cc70342d28ed3c3cf47555ced392d9bf366b39638579ba5b0b81180`; `04d10b145e9f7fa7c6b0774b9f84431b5f2aaf40234e2d2e35b982cce7cc40c3` |
| N05 | H | Historical retained scope; per-case wall-clock time not recorded in ledger | `85c1d10747c5eee75ecc89ecd14c015f9f94e27387f96fbbb1ac2b5295cc164e` |
| N06 | C | October 22 API/native; 2026-10-22T01:04:26.571Z to 2026-10-22T01:08:39.206Z; 2026-10-22T01:22:36.856Z to 2026-10-22T01:37:55.832Z | `b6327704c989db62e5181064105a4d8cf12a5036418e4af96500bc2bf4bbed61`; `91f20268a439b5bdc192032c73721bc36f0a7743b2a396824752b94dadcdb3b6`; `c72b79521080b102818b0d1f3ccab502fae307dc6e96aa5b42a2293176a9c938` |
| X01 | H | Historical retained scope; per-case wall-clock time not recorded in ledger | `8adced6a1c185483ad2c7603399722026774bc1a8c1d82d9ace39bd8263e6e13`; `50ccff1b8adfd1a2d34ad1924fd59c0094f56fb99157f56ee733fd1b5b600578`; `4a716199dd8f600f1596c0b9e0685eea673c0b729f801150b90f57375a8ead04` |
| X02 | C | October 22 API/native; 2026-10-22T01:26:57.075Z to 2026-10-22T01:28:14.963Z; 2026-10-22T01:44:22.437Z to 2026-10-22T01:44:51.620Z | `8b0b0b6fdbe4441c51b7cce884330b473ae259c34cf8ee92cd0c20756c703dcf`; `b19055abe76697b6a2722600a1dc3a1703f15ab8498f768c7970187c9b6d55d5`; `57f7aadf5d9139975f24bf6580f82893759ecc7a6c23996f2f7556ab37ffbe47`; `83eada448d2f74387b9fb7ef13dd323ca969e7ba5412b9bc6c8789ced3a39f64` |
| X03 | C | October 22 API/native; 2026-10-22T01:18:24.233Z to 2026-10-22T01:22:08.381Z; 2026-10-22T01:04:26.571Z to 2026-10-22T01:08:39.206Z | `4cca04d78dc0d9a7409896648d2f26d337c43e2d8e7eba1e9695b7fc7bfcf4e5`; `b6327704c989db62e5181064105a4d8cf12a5036418e4af96500bc2bf4bbed61`; `c72b79521080b102818b0d1f3ccab502fae307dc6e96aa5b42a2293176a9c938` |
| X04 | C | October 22 API/native; 2026-10-22T01:44:22.437Z to 2026-10-22T01:44:51.620Z | `b19055abe76697b6a2722600a1dc3a1703f15ab8498f768c7970187c9b6d55d5`; `57f7aadf5d9139975f24bf6580f82893759ecc7a6c23996f2f7556ab37ffbe47`; `c5c04cb63efc6d6df922ea56e8f3e2388b7fb3fecfb2f65bc2fa7673ecdd7c82` |
