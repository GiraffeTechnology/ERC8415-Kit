# ERC-8415 Native Infrastructure Kit (NIK)

Temporal projection infrastructure for [ERC-8415 — Asynchronous Register
Projection for NFTs](https://github.com/GiraffeTechnology/ERC-8415).

Positioning:

**Stripe API + AWS SDK for ERC-8415 native assets**

## Why this exists

An ERC-721 can trade faster than an external register updates. `ownerOf`
answers who holds the tradeable position now; it does not answer who the
register had confirmed at a past instant.

ERC-8415 keeps those two sequences apart on purpose:

- **the tradeable position** — `ownerOf`, which moves the moment the market moves;
- **the confirmed holder** — the register's own record, which moves only when a
  proof admits an entry.

At rest they agree. In flight they diverge. The Kit is the infrastructure that
admits entries into the projection, keeps the history append-only, and answers
temporal queries over it.

## Responsibility Boundary

ERC-8415 is a faithful record and audit trail across an asynchronous boundary —
a mirror, not a tribunal. Four layers:

1. **Identity** — the premise that, at a final state, the on-chain owner and the
   register-confirmed holder refer to the same underlying right. The protocol
   does not, and cannot, verify this equivalence. It is an operational premise
   the projection assumes, never a property the Kit enforces.
2. **Faithful record** — the admitted holder entries indexed by effective time,
   alongside the ERC-721 ownership sequence they sit next to. The Kit records
   what happened, not whether what happened was legally valid.
3. **Diagnosis** — whether the two sequences align at a given instant, and
   whether that answer can still move: `holderAsOf`, `isFinalAsOf`, `openGapOf`.
   The Kit reports the signal; it does not label it success or failure.
4. **Remedy** — cancellation, escrow, timeouts, refunds, downstream unwinding.
   These belong to the transaction terms between the parties.

The Kit implements layers two and three, and serves layer four without deciding
it.

## What the Kit does

- **Records both sequences faithfully.** Each holder entry carries a holder
  address, effective time, record commitment, previous commitment, registry
  reference and version. Versions are consecutive and effective times strictly
  increase. Commitment uniqueness is enforced strictly per token.
- **Exposes alignment and projection status at any historical instant.**
  `holderAsOf` for point-in-time lookup, `isFinalAsOf` for whether a later
  admission can still change that answer, `openGapOf` and `openedAt` for whether
  a change is in flight, and `currentEntry` / `entryAt` / `entryCount` /
  `entryAsOf` for the append-only entry walk.
- **Guarantees deterministic auditability.** Every admitted entry and gap
  transition is visible on chain. Admission is atomic: proof consumption,
  remote-height advancement, entry admission and gap closure happen together.
- **Remains non-blocking.** Opening a gap does not freeze ERC-721 transfers.
  Settlement authority is separate from token ownership. Anyone may relay a
  proof, and submitting one grants no special rights.

## What the Kit does not do

- **It does not guarantee eventual alignment.** It records both sequences and
  exposes whether they align at a given instant. If the registrar stops issuing
  entries, recent instants may stay non-final indefinitely. Convergence is an
  operational property of the registrar, not a guarantee made here.
- **It does not adjudicate legal title or entry validity.** A proof establishes
  inclusion in accepted remote state, not the truth of the underlying register.
- **It does not enforce cross-token uniqueness** of registry references or
  commitments. Preventing cross-token replay is a registrar or application
  constraint; indexers should detect and surface collisions rather than rely on
  the Kit to reject them.
- **It does not prescribe remedy.** Whether to cancel a trade, when cancellation
  is permitted, escrow, timeouts, refunds and downstream unwinding are governed
  by the parties' transaction terms.
- **It does not prescribe entitlement or compliance outcomes**, does not move
  tokens across chains, and does not absorb recursive registration risk.

It is not a wallet product, an application frontend, a marketplace, a new
blockchain standard, or a generic RWA registry.

## Vocabulary

Only protocol-defined terms are used in interfaces, code identifiers and
documentation:

| Term | Meaning |
| --- | --- |
| open gap / closed gap | whether a settlement gap is currently outstanding (`openGapOf`, `openedAt`) |
| provisional / final | whether a historical answer at an instant could still change (`isFinalAsOf`) |
| admitted | an entry has been accepted through a verified proof (`entryAt`, `currentEntry`) |
| confirmed holder | the holder the register had confirmed at an instant, as recorded on chain |
| tradeable position | `ownerOf` |

`Pending` / `Confirmed` / `Rejected` are **not** protocol states and MUST NOT be
used as state names. The protocol emits no rejection event: a proof that fails
verification never becomes an admitted entry, and admission is final once it
happens. Cancellation closes an open gap and settles nothing — prior provisional
history stays provisional.

## Architecture

```
Wallet / Application
        |
      Oracle
        |
ERC-8415 Native Infrastructure Kit
        |
 Verification Engine
        |
Blockchain Adapter Layer
        |
Ethereum / L2 / Permissioned Chains
```

Frozen interface identifiers, neither of which is the Kit's to change or
recompute:

```text
IRegisterProjection     0x6309e170
IProjectionSettlement   0xf4a7d71b
```

## Core Modules

1. **Projection Kernel** — append-only entries and the temporal queries over them.
2. **Admission Engine** — proof-profile verification and atomic admission.
3. **Settlement Composition Layer** — gap primitives, consumed by applications.
4. **Register API and Verification Engine** — institutional registry surfaces.
5. **ERC-8415 Adapter** — chain abstraction.
6. **Developer SDK** — projection queries and integration interfaces.
7. **Institutional Console** — audit, roles and controls.

The optional watchtower freshness layer is a separate, non-normative annex. It
measures on-chain reorg exposure and attestation staleness, never registrar
finality; see `docs/ERC8415-SEMANTIC-MODEL.md`.

## Stage Delivery Roadmap

```
Stage 0  Foundation
Stage 1  ERC-8415 Projection Core
Stage 2  Verification Engine
Stage 3  ERC-8415 Adapter
Stage 4  Settlement Engine MVP
Stage 5  Oracle / Application SDK
Stage 6  Institutional Console
Stage 7  Production Infrastructure
```

## Engineering Rule

All implementation follows, in precedence order:

1. [AGENTS.md](AGENTS.md) — product boundary, semantic rules and forbidden inferences;
2. [docs/ERC8415-Native-Infrastructure-Kit-PRD-v2.1.md](docs/ERC8415-Native-Infrastructure-Kit-PRD-v2.1.md) — product definition and core modules;
3. [docs/ERC-8415-Native-Infrastructure-Kit-PRD-Stage-Delivery-v2.0.md](docs/ERC-8415-Native-Infrastructure-Kit-PRD-Stage-Delivery-v2.0.md) — stage delivery and acceptance;
4. [docs/ERC8415-SEMANTIC-MODEL.md](docs/ERC8415-SEMANTIC-MODEL.md) — the semantic model every module preserves.

The ERC itself is the source of truth above all four. Where this repository and
the ERC disagree, the ERC wins and this repository gets fixed.

No direct frontend-to-blockchain interaction is allowed.

## Current Status

Stage 0 — repository and specification foundation. The repository currently
carries the engineering and semantic documents; module implementation begins at
Stage 1.
