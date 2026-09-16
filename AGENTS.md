# ERC-8415 Native Infrastructure Kit AGENTS.md

## Repository Execution Rule

The implementing agent MUST use repository-local files only.

Required reading order:

1. AGENTS.md
2. CODEX_TASK.md
3. CODEX-ITERATION-TASK-v2.1.md
4. docs/ERC8415-Native-Infrastructure-Kit-PRD-v2.1.md
5. docs/ERC-8415-Native-Infrastructure-Kit-PRD-Stage-Delivery-v2.0.md
6. docs/ERC8415-SEMANTIC-MODEL.md

The ERC itself ranks above all of them. Where this repository and the ERC
disagree, the ERC wins, and the disagreement MUST be fixed here rather than
worked around in code.

If requirements are missing:

STOP.
Do not infer product scope.

---

## Product Boundary

ERC-8415 Native Infrastructure Kit is temporal projection infrastructure for
ERC-8415 ecosystems.

The Kit provides:

- projection infrastructure;
- admission primitives;
- temporal query capability;
- proof-profile integration;
- ecosystem integration primitives.

The Kit is NOT:

- a wallet product;
- an application frontend;
- a marketplace;
- a new blockchain standard;
- a generic RWA registry;
- an adjudicator of legal title, entitlement or remedy.

The Kit MUST consume ERC-8415 semantics, not redefine them.

---

## Layer Placement

ERC-8415 is a faithful record and audit trail across an asynchronous boundary:
a mirror, not a tribunal. Four layers:

1. **identity** — the premise that, at a final state, the on-chain owner and the
   register-confirmed holder refer to the same underlying right. The protocol
   does not, and cannot, verify this equivalence. State this explicitly wherever
   it could otherwise be read as verified legal identity;
2. **faithful record** — append-only admitted entries and the ERC-721 ownership
   sequence they sit alongside. What happened, not whether it was legally valid;
3. **diagnosis** — `holderAsOf`, `isFinalAsOf`, `openGapOf`, and whether the two
   sequences align at an instant. The Kit reports the signal and does not label
   it success or failure;
4. **remedy** — cancellation, escrow, timeouts, refunds, downstream unwinding.

The Kit implements layers two and three, and **supports but never imposes**
layer four.

`holderAsOf(tokenId, t)` is read as: the holder the registrar had confirmed at
effective time `t`, as recorded on chain, with no opinion on the legal validity
of that record.

---

## Scope Statement

The Kit does:

1. **record both sequences faithfully** — holder entries carrying holder
   address, effective time, record commitment, previous commitment, registry
   reference and version; consecutive versions; strictly increasing effective
   times; per-token commitment uniqueness;
2. **expose alignment and projection status at any historical instant** —
   `holderAsOf`, `isFinalAsOf`, `openGapOf`, `openedAt`, plus the entry walk
   `currentEntry`, `entryAt`, `entryCount`, `entryAsOf`;
3. **guarantee deterministic auditability of recorded transitions** — every
   admitted entry and gap transition visible on chain, admission atomic;
4. **remain non-blocking** — opening a gap does not freeze ERC-721 transfers,
   settlement authority is separate from token ownership, anyone may relay a
   proof and submitting one grants no special rights.

The Kit does NOT:

1. **guarantee eventual alignment.** Normative text MUST NOT say "eventual
   consistency". The correct phrasing is: records both sequences and exposes
   their alignment. If the registrar stops issuing entries, recent instants may
   stay non-final indefinitely. Convergence is an operational property of the
   registrar;
2. **adjudicate legal title or entry validity.** A proof establishes inclusion
   in accepted remote state, not the truth of the underlying register;
3. **enforce cross-token uniqueness** of registry references or commitments;
4. **prescribe remedy**;
5. **prescribe entitlement or compliance outcomes**, move tokens across chains,
   or absorb recursive registration risk.

---

## Core Semantic Rules

Implementation MUST preserve:

- `holderAsOf(tokenId, instant)` — the confirmed holder at an instant;
- `entryAsOf(tokenId, instant)` — the entry whose effective interval covers it;
- `isFinalAsOf(tokenId, instant)` — whether a later admission can still change
  that answer;
- `currentEntry`, `entryAt`, `entryCount` — the append-only entry walk;
- `openGapOf(tokenId)` and the gap's `openedAt`;
- `registerId` — what this is a projection of;
- append-only projection history;
- derived temporal finality;
- the proof-profile admission model.

Instants are `uint64` seconds since the Unix epoch, on the same scale as
`block.timestamp`. Formatted time is a display concern only; every query carries
the integer.

Frozen interface identifiers, neither the Kit's to change or to recompute:

```text
IRegisterProjection     0x6309e170
IProjectionSettlement   0xf4a7d71b
```

### The finality rule

For `t >= firstEntry.effectiveAt`:

```text
isFinalAsOf(t) == true
iff
there exists a strictly later admitted entry.
```

An interval `[entry[n].effectiveAt, entry[n+1].effectiveAt)` is final once entry
`n+1` is admitted; the latest interval stays provisional. A later entry may
confirm the same holder — holder change is not required for finality, and a
confirming entry is how a historical instant becomes final without the holder
moving.

FINAL is derived, never a mutable lifecycle flag. It MUST NOT be set by an
operator, a proof profile, a settlement workflow, a cancellation or a timeout.

Mandatory invariants:

```text
cancellation  != finality
gap closure   != finality
proof verified != finality
timeout expiry != finality
```

Proof Profile determines admission validity. It MUST NOT directly set finality.

### Uniqueness scoping

Commitment and registry-reference uniqueness is enforced **strictly per token**:
within a token's local projection history a commitment cannot be reused. The Kit
does not maintain global cross-token state and cannot infer cross-token
uniqueness. A compliant implementation may admit an entry whose registry
reference or commitment duplicates one held by another token.

Preventing cross-token replay, and tracking continuity across tokens, belongs to
the registrar or the application. Documentation MUST state this rather than
leave it to be discovered.

### Three orthogonal signals

Never collapse these into one flag or one badge:

- **final / provisional** — can a later admission still change this instant's
  holder;
- **open gap / closed gap** — is a change in flight whose `openedAt` is at or
  before this instant;
- **reorg-safe / fresh / stale** — the optional watchtower freshness layer.

Finality does not depend on whether a gap is open. Freshness is not finality.

---

## Watchtower Freshness Layer

Non-normative, informational annex only. It sits above the projection and MUST
NOT alter the core state machine or the projection interface.

- **Freshness is a safety property, not liveness.** A stale attestation must not
  be mistaken for a current one. Liveness — the registrar eventually issuing an
  entry — is a separate claim the Kit does not make.
- **Naming.** A classification derived from block depth is reorg safety of the
  projection head, not registrar-asserted finality. Name it `REORG_SAFE`. Do not
  name it `FRESH_FINAL`, which invites a downstream integrator to read registrar
  finality that was never asserted.
- **Key rotation vs revocation are distinct.** A verifier checking "fresh as of
  block N" validates against the key authoritative at block N, not the current
  key. A rotated-away key still validates a signature made while it was active;
  a revoked key never does, retroactively. Revocation means key compromise, so
  neither natural expiry nor a timelock is an acceptable softening; the
  zero-active-key gap is closed instead by an atomic rotate-and-revoke call.
- **Monotonic sequence.** Enforce `seq == head + 1` — no gaps, no rewinds — and
  check block height to prevent rewinds.
- **Migration hatch.** `initialSequence` is a registration-time parameter only,
  never a callable admin function that could rewind a live feed. The contract
  keeps no native link between a predecessor asset identifier and its migrated
  successor; consuming applications and indexers track that continuity.
- **Interop.** Expose the raw EIP-712 type string through a view function
  alongside the type hash and domain verifiers, so a cross-watchtower verifier
  can reconstruct the struct hash independently instead of trusting a README.
- **Three outcomes stay separate**: reorg-safe, fresh but provisional, and
  stale. An attestation is stale whatever `isFinalAsOf` says. Conflating stale
  with provisional makes a silently dead registrar look like ordinary delay,
  which is the whole failure mode this layer exists to name.

---

## Forbidden Inferences

The Kit MUST NOT treat any of the following as finality:

- `ownerOf` being equal to the confirmed holder;
- confirmation depth, block age, or a reorg-safe freshness classification;
- a proof having verified;
- a gap having closed, by admission or by cancellation;
- a settlement having been cancelled, or a timeout having expired.

The Kit MUST NOT:

- alias `holderAsOf` to current ERC-721 ownership, or infer the confirmed holder
  from `ownerOf`, ever, including as a fallback when a projection read fails;
- present a provisional answer as settled;
- invent a rejection event. A proof that fails verification never becomes an
  admitted entry, and there is no mechanism to retroactively invalidate an
  admitted entry. Cancellation ends a contest and settles nothing;
- rewrite, delete or retroactively mutate admitted history, including
  `effectiveAt`, commitment or historical holder;
- expose the register's contents. The chain carries a `recordCommitment` and a
  `registryReference` locator, never the record itself;
- claim projection data for a contract that does not advertise the matching
  ERC-165 identifier.

---

## Vocabulary Discipline

Use only protocol-defined terms in APIs, code identifiers, state names and docs:

- open gap / closed gap;
- provisional / final;
- admitted;
- confirmed holder;
- tradeable position (`ownerOf`).

Do NOT use `Pending` / `Locked` / `Confirmed` / `Rejected` / `Released` /
`Refunded` as protocol or infrastructure state names. They are not protocol
states and read as a rejection event the ERC does not define. Where an
application-layer escrow genuinely needs such names, they belong to that
application's own state machine and MUST be documented as such, never as Kit
semantics.

---

## Integration Rules

### Read-then-act

`holderAsOf`, `isFinalAsOf` and `openGapOf` are point-in-time reads, and state
can move between the read and the action that depends on it.

The recommended integration shape is the **on-chain atomic read**: the
integrating contract calls the query in the same transaction as the action that
depends on the result, which closes the window entirely rather than narrowing
it. An off-chain read taken for display purposes MUST NOT be cached across
transactions, and any contract acting on one MUST handle the state having moved
by the time the transaction lands.

### Application composition

Applications compose settlement behaviour according to their own risk model
while consuming common ERC-8415 semantics. The escrow pattern — quarantine
consideration while a gap is open, release on admission, refund if the gap is
cancelled without admission — is a non-normative reference pattern, not a
mandate. Applications that instead compose on non-final state accept that risk
themselves. The Kit guarantees the projection is auditable and queryable; it
does not guarantee that every downstream use of a non-final state can be safely
unwound. That boundary is deliberate: a single mandated unwind rule would break
either the netting model or the sequential chain-of-title model.

---

## Ecosystem Boundary

The Kit supports:

- wallet integrations;
- exchange integrations;
- custody systems;
- institutional asset systems.

Do not create protocol changes inside the Kit project. Do not introduce
rollback, veto or override semantics.

---

## Development Rule

Existing useful engineering is preserved.

Classify work:

KEEP
FINISH-NOW
FREEZE-LATER
REMOVE

Do not delete completed infrastructure when product positioning evolves.

---

## Delivery Rule

Each stage requires:

- implementation;
- tests;
- documentation;
- evidence;
- integration validation where applicable.

Tests MUST cover the forbidden inferences above as explicit negative cases,
including: a token whose `ownerOf` and confirmed holder diverge; a closed gap
over a non-final instant; a cancelled settlement; a confirming entry that
finalises an interval without changing the holder; and an instant preceding the
first entry.

Code completion alone does not equal delivery completion.
