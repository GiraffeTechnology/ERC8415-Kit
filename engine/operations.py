"""Durable operation intent and replay-safe broadcast coordination."""
import hashlib
import json

from sqlalchemy import JSON, Integer, String, select, update
from sqlalchemy.orm import Mapped, mapped_column

from engine.database import Asset, Base, Finality, History


class Outbox(Base):
    __tablename__ = "transaction_outbox"
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    asset_id: Mapped[str] = mapped_column(String(64), index=True)
    version: Mapped[int] = mapped_column(Integer)
    operation: Mapped[str] = mapped_column(String(24))
    payload: Mapped[dict] = mapped_column(JSON)
    status: Mapped[str] = mapped_column(String(24), default="QUEUED")
    prepared: Mapped[dict | None] = mapped_column(JSON, nullable=True)


class OutboxAdapter:
    mode = "outbox"

    def execute(self, operation, asset):
        digest = hashlib.sha256(json.dumps(
            {"operation": operation, "asset": asset}, sort_keys=True
        ).encode()).hexdigest()
        return {"mode": self.mode, "transaction_id": digest, "finality": "QUEUED"}


class OutboxWorker:
    """Transport.prepare must durably identify a signed transaction before broadcast.

    broadcast(prepared) must resend exactly those bytes, never re-sign or allocate a new nonce.
    Implementations need an approved Singapore signer/transport; none is configured by default.
    """

    def __init__(self, sessions, transport):
        self.sessions = sessions
        self.transport = transport

    def process(self, operation_id):
        # Persist the signed transaction/hash before any network broadcast.
        with self.sessions.begin() as session:
            row = session.scalar(select(Outbox).where(
                Outbox.id == operation_id
            ).with_for_update())
            if row is None:
                raise ValueError("Unknown operation")
            if row.status in {"CONFIRMED", "FAILED"}:
                return row.status
            if row.prepared is None:
                prepared = self.transport.prepare(row.operation, row.payload)
                if not prepared.get("transaction_id") or not prepared.get("signed_transaction"):
                    raise ValueError("Transport must supply a stable signed transaction")
                row.prepared = prepared
                row.status = "PREPARED"
            prepared = dict(row.prepared)
        # A crash here leaves PREPARED; retry broadcasts the same signed transaction.
        self.transport.broadcast(prepared)
        receipt = self.transport.monitor(prepared["transaction_id"])
        status = receipt["finality"]
        if status not in {"PENDING", "PENDING_L1", "CONFIRMED", "FAILED", "REORGED"}:
            raise ValueError("Unsupported finality result")
        with self.sessions.begin() as session:
            row = session.scalar(select(Outbox).where(
                Outbox.id == operation_id
            ).with_for_update())
            previous_status = row.status
            row.status = status
            if previous_status != status:
                session.add(History(asset_id=row.asset_id, operation="chain_" + status.lower(),
                                    version=row.version, record={
                                        "asset": {**row.payload, "execution_status": status},
                                        "receipt": receipt, "proof": None,
                                    }))
            session.execute(update(Asset).where(
                Asset.id == row.asset_id, Asset.version == row.version
            ).values(execution_status=status))
            finality = session.scalar(select(Finality).where(
                Finality.asset_id == row.asset_id, Finality.version == row.version
            ))
            if finality:
                finality.transaction_id = prepared["transaction_id"]
                finality.status = status
                finality.evidence = receipt
        return status
