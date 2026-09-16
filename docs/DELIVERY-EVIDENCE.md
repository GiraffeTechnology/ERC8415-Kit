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

## Not yet delivered

| Stage | Blocking gap |
| --- | --- |
| 2 | real proof profiles; the suite currently drives admission through test doubles |
| 3 | Solidity contracts and the Ethereum adapter |
| 4 | settlement composition workflow and `docs/GAP-SEMANTICS.md` |
| 5 | JavaScript and Python SDKs |
| 6 | institutional console |
| 7 | production infrastructure |
