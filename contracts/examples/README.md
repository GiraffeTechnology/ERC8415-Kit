# contracts/examples/

Minimal, CC0, deliberately small consumers of an ERC-8415 projection. They are
not infrastructure and nothing in the Kit depends on them. They exist so the
patterns the Kit recommends are executable rather than described.

## RecordDateClaim.sol

One distribution, paid once to whoever the register confirms held the token at
a fixed record date.

The point of the example is **where the reads happen**. The Kit recommends that
an application perform its projection read inside the transaction that acts on
it, rather than letting an earlier RPC or HTTP snapshot authorize a later
action. `claim` takes a token id and nothing else, so there is no parameter
through which a caller could hand it a holder, a version or an instant read
earlier — an earlier snapshot cannot authorize an action that never accepts
one.

Three checks, kept separate because they answer different questions:

| Check | Source | What it is |
| --- | --- | --- |
| is the record date final? | `isFinalAsOf` | protocol temporal finality, taken from the contract and never recomputed |
| who held it then? | `holderAsOf` | the confirmed holder at that instant, not the current one |
| is a gap open? | `openGapOf` | **this consumer's policy**, not an ERC-8415 rule |

The third is the one worth reading twice. An open gap does not make an
already-final historical instant non-final. A distribution that would rather
wait out an in-flight change than pay during one is a commercial choice, so it
is written in the example, named as a policy, and checked inside the claim —
never presented as an additional finality rule.

A record date becomes final only once an entry is admitted whose `effectiveAt`
is strictly after it. A **confirming entry for the same holder** supplies that
without any change of hands, which is how an application gets a payable answer
without waiting for an unrelated future transfer.

`tests/onchain/example.recordDateClaim.onchain.cjs` covers each of these
against deployed contracts, including the case documentation cannot
demonstrate: the admission that makes the claim eligible is mined **in the same
block as the claim**, after it. A read taken one block earlier would still have
looked right and would have been wrong.
