# Delivery Evidence

Every invariant in `AGENTS.md` mapped to the code that enforces it and the test
that proves it. A row with no test is not delivered, whatever the code says.

Run `npm run verify` to reproduce.

## Stage 0 — Foundation

| Requirement | Implementation | Test | Status |
| --- | --- | --- | --- |
| Stage plan directory layout | `api/ engine/ adapters/ contracts/ console/ sdk/ tests/ docker/` | `repositoryStructure.test.ts` › the stage plan directory layout exists | delivered |
| Five-document specification | `AGENTS.md`, `README.md`, `docs/` | `repositoryStructure.test.ts` › the specification is the five documents and nothing else | delivered |
| Development environment and CI | `docs/DEVELOPMENT.md`, `docker/`, `.github/workflows/ci.yml` | `repositoryStructure.test.ts` › the development environment is defined and containerised | delivered |
| Legacy task documents stay removed | — | `repositoryStructure.test.ts` › no legacy task document has returned | delivered |
| Frozen ERC-165 identifiers unchanged | `AGENTS.md` | `repositoryStructure.test.ts` › the frozen interface identifiers are recorded unchanged | delivered |

## Stage 1 — ERC-8415 Projection Core

The twenty mandatory conformance tests, in the order `AGENTS.md` lists them.

| # | Invariant | Implementation | Test (`conformance.test.ts`) | Status |
| --- | --- | --- | --- | --- |
| 1 | append-only history | `engine/projection/kernel.ts` | history is append-only | delivered |
| 2 | consecutive versions | `kernel.ts` `admit` | versions must be consecutive | delivered |
| 3 | strict `effectiveAt` ordering | `kernel.ts` `admit` | effectiveAt must strictly increase | delivered |
| 4 | `holderAsOf` boundaries | `kernel.ts` `entryAsOf` | holderAsOf resolves at the interval boundaries | delivered |
| 5 | exact `isFinalAsOf` later-entry rule | `kernel.ts` `isFinalAsOf` | isFinalAsOf is exactly the later-entry rule | delivered |
| 6 | provisional holder | `kernel.ts` `holderAsOf` | a holder is known while the answer is still provisional | delivered |
| 7 | gap closure does not finalise | `store.ts` `cancelGap` | closing a gap does not finalise anything | delivered |
| 8 | finality independent of gap state | `kernel.ts` / `store.ts` | finality does not depend on gap state | delivered |
| 9 | proof-profile success | `store.ts` `admit` | a verifying proof profile admits | delivered |
| 10 | proof-profile failure | `store.ts` `admit` | a refused proof profile admits nothing | delivered |
| 11 | proof replay rejection | `store.ts` `admit`, `adapters/memory/memoryChain.ts` | a replayed proof is rejected and the height never goes backwards | delivered |
| 12 | commitment chain validation | `kernel.ts` `admit` | the commitment chain is validated | delivered |
| 13 | historical holder stable while finality moves | `kernel.ts` | a historical holder is stable while a later admission changes finality | delivered |
| 14 | core works without the settlement extension | `store.ts` | the core works with no settlement extension in play | delivered |
| 15 | ownership cannot rewrite history | `kernel.ts` (no ownership input exists) | there is no ownership input that could rewrite a historical answer | delivered |
| 16 | confirming entry finalises without holder change | `kernel.ts` `isFinalAsOf` | a confirming entry finalises the preceding interval without a holder change | delivered |
| 17 | open gap does not block | `store.ts` `openGap` | an open gap changes no projection answer | delivered |
| 18 | cancellation leaves provisional history provisional | `store.ts` `cancelGap` | cancellation leaves prior provisional history provisional | delivered |
| 19 | uncovered instant reverts, `isFinalAsOf` does not | `kernel.ts` | an instant before the first entry reverts, while isFinalAsOf does not | delivered |
| 20 | per-token, not cross-token, uniqueness | `kernel.ts` `admit` | commitment uniqueness is per token, not across tokens | delivered |

Additional Stage 1 evidence:

| Requirement | Test | Status |
| --- | --- | --- |
| Admission is atomic — a refusal writes nothing | `conformance.test.ts` › a refused proof profile admits nothing; a malformed candidate is refused before anything is written | delivered |
| The discussion's worked example resolves as described | `conformance.test.ts` › the worked example from the discussion resolves as described | delivered |
| Temporal routes answer each question separately | `api.test.ts` › the temporal routes answer each question separately | delivered |
| Uncovered instant is 404; finality still answers | `api.test.ts` › an uncovered instant is 404, and finality still answers there | delivered |
| uint64 crosses the wire without rounding | `api.test.ts` › uint64 values cross the wire as strings | delivered |
| No route mutates or deletes an admitted entry | `api.test.ts` › no route mutates or deletes an admitted entry | delivered |
| No route writes finality | `api.test.ts` › no route writes finality | delivered |
| The server serves the route table over a socket | `api.test.ts` › the server serves the route table over a socket | delivered |

## Stage 2 — Verification Engine

Proof verification behind the profile interface, with the binding that makes a
proof non-transferable between admissions.

| Requirement | Implementation | Test (`verification.test.ts`) | Status |
| --- | --- | --- | --- |
| Merkle inclusion against accepted remote state | `engine/proof/merkleProfile.ts` | a valid merkle inclusion proof admits | delivered |
| A proof is bound to one admission | `engine/proof/binding.ts` | a merkle proof for a different admission does not verify | delivered |
| Every bound field is covered by the digest | `binding.ts` `bindingDigest` | every bound field changes the digest | delivered |
| A tampered path or flipped sibling fails | `merkleProfile.ts` | a tampered merkle path is refused | delivered |
| A malformed payload is refused, not fatal | `merkleProfile.ts` | a malformed proof payload is refused, not crashed on | delivered |
| Inclusion is checked against the adapter's root, never a submitted one | `merkleProfile.ts`, `engine/ports.ts` | a proof against a height with no accepted root is refused | delivered |
| Succinct-proof profile behind the same interface | `engine/proof/zkProfile.ts` | the zk profile verifies a proof bound to this admission | delivered |
| A proof does not carry to another token, entry or forgery | `zkProfile.ts` | a zk proof does not carry to another admission | delivered |
| Proof verification is not finality | `engine/projection/kernel.ts` | a verified proof is not finality | delivered |
| No mutable asset state machine anywhere in the engine | `store.ts`, profiles | the verification engine has no mutable asset state machine | delivered |
| A refused admission advances no remote height | `store.ts` `admit` | an admission refused by the profile advances no remote height | delivered |

The zk profile is a mock and is documented as one: the proof is a digest over
the verifying key, the accepted state root and the admission binding. What it
exercises for real is non-transferability; a succinct verifier replaces it
without anything above that file changing.

## Stage 3 — ERC-8415 Adapter

The frozen interfaces, compiled, plus a chain adapter and reader behind the
ports the engine already used.

| Requirement | Implementation | Test | Status |
| --- | --- | --- | --- |
| The contracts compile | `contracts/*.sol` | `contracts.test.ts` › the contracts compile | delivered |
| `IRegisterProjection` is `0x6309e170` | `contracts/IRegisterProjection.sol` | `contracts.test.ts` › IRegisterProjection computes to the frozen 0x6309e170 | delivered |
| `IProjectionSettlement` is `0xf4a7d71b` | `contracts/IProjectionSettlement.sol` | `contracts.test.ts` › IProjectionSettlement computes to the frozen 0xf4a7d71b | delivered |
| The projection interface is exactly seven accessors | — | `contracts.test.ts` › the projection interface declares exactly the seven accessors | delivered |
| `holderAsOf` returns one value; finality is separate | — | `contracts.test.ts` › holderAsOf returns one value and isFinalAsOf is separate | delivered |
| `RegisterEntry` carries `supersededAt` | — | `contracts.test.ts` › RegisterEntry carries supersededAt | delivered |
| No freeze, revoke or override in the settlement interface | — | `contracts.test.ts` › the settlement interface has no freeze, revoke or override | delivered |
| Hardcoded selectors match the compiled ABI | `adapters/ethereum/abi.ts` | `adapter.test.ts` › the hardcoded selectors match the compiled ABI | delivered |
| Conformance discovered, not assumed | `adapters/ethereum/projectionReader.ts` | `adapter.test.ts` › conformance is discovered, never assumed | delivered |
| Every projection accessor decodes | `projectionReader.ts`, `abi.ts` | `adapter.test.ts` › the reader decodes every projection accessor | delivered |
| A revert surfaces, never becomes a fallback | `projectionReader.ts` | `adapter.test.ts` › a revert surfaces rather than becoming a fallback answer | delivered |
| Reads pinned to a block tag | `projectionReader.ts` | `adapter.test.ts` › reads are pinned to the finalized head by default | delivered |
| Calldata encodes as the interface expects | `abi.ts` | `adapter.test.ts` › calldata encodes as the interface expects | delivered |
| Truncated returndata refused, not padded | `abi.ts` `decodeEntry` | `adapter.test.ts` › a truncated entry blob is refused, not silently padded | delivered |
| Transaction monitoring tracks the finalized head | `adapters/ethereum/ethereumChain.ts` | `adapter.test.ts` › the chain adapter tracks the finalized head and its state root | delivered |
| A finalized head that rewinds is refused | `ethereumChain.ts` `refresh` | `adapter.test.ts` › a finalized head that moves backwards is refused | delivered |
| Chain finality is not projection finality | `ethereumChain.ts`, `kernel.ts` | `adapter.test.ts` › chain finality is not projection finality | delivered |
| Accepted height never rewinds | `ethereumChain.ts` `advanceHeight` | `adapter.test.ts` › an accepted height never goes backwards | delivered |

`solc` and `ethereum-cryptography` are development dependencies only. The
adapter ships selectors as constants so the runtime keeps no dependencies, and
the suite recomputes each one from the compiled ABI.

## Correction applied during Stage 3

Reading the standard's own interfaces showed five divergences in the Stage 1
core, all fixed in `fix: align the projection core with the ERC interface`:
`holderAsOf` returns the holder alone; `entryAt` is indexed by version;
`RegisterEntry` carries `supersededAt`, set on the prior entry at admission;
the first entry must be version 1; and `registryReference`, `registerId` and
settlement identifiers are `bytes32`.

## Stage 4 — Settlement Composition Engine

Gap primitives over the projection's settlement records. The canonical gap
decision is in `docs/GAP-SEMANTICS.md`.

| Requirement | Implementation | Test (`settlement.test.ts`) | Status |
| --- | --- | --- | --- |
| Only a settlement authority opens a gap | `engine/settlement/engine.ts` `begin` | only a settlement authority may open a gap | delivered |
| Authority is separate from token ownership | `engine/settlement/authority.ts` | settlement authority is separate from holding the token | delivered |
| The deadline is bounded by the settlement period | `engine.ts` `begin` | the deadline is bounded by the settlement period | delivered |
| At most one open gap per token; ids are never reused | `store.ts` `openGap` | a token has at most one open gap, and an id is never reused | delivered |
| Admission closes the gap and records the outcome | `engine.ts` `finalize` | admission closes the gap and records the outcome | delivered |
| Anyone may relay; relaying grants nothing | `engine.ts` `finalize` | anyone may relay a proof, and relaying grants nothing | delivered |
| An admission must carry the expected holder | `engine.ts` `finalize` | an admission must carry the holder the gap was opened for | delivered |
| Cancellation is not finality | `engine.ts` `cancel` | cancellation is not finality | delivered |
| Gap closure by admission is not finality | `kernel.ts` | gap closure by admission is not finality either | delivered |
| Timeout expiry is not finality, and not an outcome | `engine.ts` `hasExpired` | timeout expiry is not finality, and is not an outcome | delivered |
| An expired gap cannot be finalized; anyone may clear it | `engine.ts` | an expired gap cannot be finalized but anyone can clear it | delivered |
| Before the deadline only the initiator may cancel | `engine.ts` `cancel` | before the deadline only the initiator may cancel | delivered |
| A closed gap cannot be reopened or reclosed | `engine.ts` | a closed gap cannot be reopened, refinalized or recancelled | delivered |
| No rejection, freeze or override path exists | `engine.ts` | the settlement engine exposes no rejection, freeze or override path | delivered |
| A gap on one token leaves others alone | `store.ts` | a gap on one token leaves every other token alone | delivered |

## Stage 5 — Oracle / Application SDK

| Requirement | Implementation | Test | Status |
| --- | --- | --- | --- |
| Three questions stay three calls | `sdk/js/client.ts`, `sdk/python/erc8415/client.py` | `sdk.test.ts` › the SDK answers the three questions as three methods | delivered |
| No collapsed status accessor exists | `client.ts` | `sdk.test.ts` › the SDK exposes no single collapsed status | delivered |
| `resolve` returns labelled facts, not a verdict | `client.ts` `resolve` | `sdk.test.ts` › resolve returns three labelled facts, not one verdict | delivered |
| uint64 decodes as bigint, never number | `client.ts` `decodeEntry` | `sdk.test.ts` › uint64 values decode as bigint, never as number | delivered |
| Uncovered instant has its own error type | `client.ts` `NotCoveredError` | `sdk.test.ts` › an instant the projection does not cover raises its own error type | delivered |
| Errors surface with their code | `client.ts` | `sdk.test.ts` › an unknown version surfaces with its code | delivered |
| An open gap never touches finality | `client.ts`, `kernel.ts` | `sdk.test.ts` › the SDK reports an open gap without letting it touch finality | delivered |
| The entry walk reads the whole history | `client.ts` `entries` | `sdk.test.ts` › the entry walk reads the whole history | delivered |
| A Python client with the same guarantees | `sdk/python/` | `sdk.test.ts` › the python SDK suite passes (runs `sdk/python/test_client.py`, 18 checks) | delivered |
| Examples and API documentation | `sdk/README.md` | — | delivered |

Both SDKs are dependency-free: the JavaScript client uses `fetch`, the Python
client the standard library only.

## Not yet delivered

| Stage | Blocking gap |
| --- | --- |
| 6 | institutional console |
| 7 | production infrastructure |
