# Final Delivery Report

ERC-8415 Native Infrastructure Kit, Stage 0 through Stage 7.

## Architecture

```
Wallet / Application
        |
      Oracle
        |
   SDK (JS / Python)
        |
   API gateway  ──  api keys, tenants, metrics
        |
   Projection API      Institutional console
        |                      |
   Projection kernel  ──  settlement composition
        |
   Verification engine (proof profiles)
        |
   Adapter layer (memory / Ethereum)
        |
Ethereum / L2 / permissioned chains
```

No frontend talks to a chain. The console and the SDKs reach the projection
through the engine, and only the adapter layer speaks to a node.

## Stages

| Stage | Delivered |
| --- | --- |
| 0 Foundation | layout, development environment, container, CI on Node 22 and 24 |
| 1 Projection core | append-only kernel, temporal queries, atomic admission, five routes |
| 2 Verification engine | bound Merkle profile, mock succinct profile, admission binding digest |
| 3 Adapter | frozen interfaces compiled, ERC-165 identifiers derived, chain adapter and reader |
| 4 Settlement composition | gap primitives, authority, deadlines, expiry |
| 5 SDK | JavaScript and Python clients, examples, documentation |
| 6 Console | role-gated read access, overview, audit timeline, permissions |
| 7 Production | API keys, multi-tenancy, metrics, audit export |

## What the semantics hold to

Three questions stay three answers, at every layer — kernel, API, SDK and
console alike. There is no accessor anywhere that returns one combined status,
and tests assert there is none, because a caller handed a single value cannot
tell which question it was answered.

Finality is the later-admission rule and nothing else. It is computed on every
call and never stored. Cancellation, gap closure, proof verification, timeout
expiry and block depth each have a test asserting they do not produce it.

Current ERC-721 ownership never answers a projection query. The kernel has no
ownership input at all, so there is no fallback path to take. The console shows
the tradeable position and the confirmed holder side by side and derives
neither from the other.

An instant preceding the first entry reverts, and `isFinalAsOf` answers false
there without reverting.

Commitment uniqueness is per token. The same commitment on another token is
admitted: cross-token replay belongs to the registrar or the application.

An open gap never blocks anything. There is no lock in the Kit a gap could
take.

There is no rejection event, no veto, and no rollback of an admitted entry.

The register's contents are never exposed. The chain carries a commitment and a
locator; reading the register needs entitlement the Kit does not have.

## Correction applied during delivery

Stage 3 read the standard's own interfaces and found five divergences in the
Stage 1 core, all traceable to a repository document rather than to the
standard. `holderAsOf` returns the holder alone; `entryAt` is indexed by
version; `RegisterEntry` carries `supersededAt`, set on the prior entry at
admission; the first entry must be version 1; and identifiers are `bytes32`.
The finality rule needed no change.

The precedence rule in `AGENTS.md` is what settled it: the standard outranks
this repository, and the repository gets fixed.

## Verification

```sh
npm install
npm run verify                    # typecheck + 118 tests
python3 sdk/python/test_client.py  # the Python suite standalone
docker compose -f docker/compose.yaml run --rm kit
```

CI runs the same steps on Node 22 and 24 for every push and pull request.

Coverage of the invariants, mapped to implementation file and test name, is in
`docs/DELIVERY-EVIDENCE.md`. The canonical gap decision is in
`docs/GAP-SEMANTICS.md`.

## Dependencies

None at runtime. `typescript`, `@types/node`, `solc` and
`ethereum-cryptography` are development dependencies; the adapter ships
function selectors as constants, and the suite recomputes each one from the
compiled ABI.

## Known limits

The succinct-proof profile is a mock and is documented as one. It exercises
non-transferability for real — a proof does not carry to another token, entry
or forgery — and a real verifier replaces it without anything above that file
changing.

Storage is in-process. Persisting it is a deployment concern and does not
change any semantics above the port.
