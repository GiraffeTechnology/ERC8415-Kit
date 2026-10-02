# Stage 3 adapter boundary

Pinned technical reference: GiraffeTechnology/ERCs main commit
c9bf1a59c3e65e791fcdeddd79c185128ae02ce3, ERCS/erc-8415.md blob
3e4da32c05e0c3939b6bb187eaa4f4472ba8c246. This is a draft, not a claim of adopted status.
CC0 reference contract copied without changes from GiraffeTechnology/ERC-xxxx,
reference/RegisterProjectionReference.sol blob 7bbe2d877b3bf4adbc180ddecb3a900297030a8c.
No source repository was modified.

KitLifecycle implements the PRD's five named workflow functions. It does not advertise ERC-8415
interfaces. Its institutional workflow states, holder commitments and freeze flag are distinct
from ERC-721 ownership and historical register projection. Workflow freezing must never be
interpreted as freezing ERC-721 transfers while a projection gap is open.

RegisterProjectionReference supplies actual historical projection and proof-verified settlement.
ProjectionAdapter queries confirmed holder/finality/gap independently. Its finalization verifies
remote quorum, membership and all destination/settlement-bound fields inside the contract.
Stage 2 Ed25519 attestation is institutional preflight, not the ERC-8415 settlement proof.

EthereumAdapter supports typed submission and canonical receipt/depth monitoring.
L2Adapter additionally requires a supplied L1 settlement-finality policy.
PermissionedTransport defines submission/monitoring requirements.
LocalEVMAdapter accepts only an in-process EthereumTesterProvider; it may be injected into
Registry for disposable integration tests. No public RPC or real accounts are used.

External synchronous registry execution is deliberately refused: SQL rollback cannot reverse an
already submitted transaction. Durable outbox/reconciliation is required before production use.
The supplied reference profile has immutable validators/registrar, no equivocation detection,
and unbounded proof inputs; see its header. It is a simulation/reference dependency, not an
institutional production profile approval.

Build on abcdyi:
cd contracts; npm ci; npm run build; cd ..
.venv/bin/pytest
Compiler output goes in contracts/out and is not committed.
