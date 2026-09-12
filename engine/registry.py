"""Single command boundary: validate -> state -> adapter -> transactional audit."""

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm.exc import StaleDataError

from engine.database import Asset, Finality, History


class RegistryError(Exception):
    def __init__(self, status, message):
        self.status = status
        self.message = message


def snapshot(asset):
    return {
        "id": asset.id, "holder": asset.holder, "state": asset.state,
        "execution_status": asset.execution_status,
        "frozen": asset.frozen, "version": asset.version, "metadata": asset.metadata_,
    }


class Registry:
    def __init__(self, sessions, adapter, verifier=None, tenant="default"):
        self.sessions = sessions
        self.adapter = adapter
        self.lock = sessions.kit_lock
        self.verifier = verifier
        self.tenant = tenant

    def _snapshot(self, asset):
        return {**snapshot(asset), "institution": self.tenant}

    def _asset(self, session, asset_id):
        asset = session.get(Asset, asset_id)
        if asset is None:
            raise RegistryError(404, "Asset not found")
        return asset

    def list_assets(self, limit=100, offset=0):
        with self.lock, self.sessions() as session:
            return [self._snapshot(asset) for asset in session.scalars(select(Asset).order_by(Asset.id).limit(limit).offset(offset))]

    def get(self, asset_id):
        with self.lock, self.sessions() as session:
            return self._snapshot(self._asset(session, asset_id))

    def history(self, asset_id):
        with self.lock, self.sessions() as session:
            self._asset(session, asset_id)
            rows = session.scalars(
                select(History).where(History.asset_id == asset_id).order_by(History.id)
            )
            return [
                {"operation": row.operation, "version": row.version,
                 "record": row.record, "created_at": row.created_at.isoformat()}
                for row in rows
            ]

    def _record(self, session, operation, asset, proof=None):
        asset.execution_status = {"outbox": "QUEUED", "local-evm": "LOCAL_EVM"}.get(
            getattr(self.adapter, "mode", "mock"), "SIMULATED"
        )
        session.flush()
        result = self._snapshot(asset)
        receipt = self.adapter.execute(operation, result)
        if getattr(self.adapter, "mode", "mock") == "outbox":
            from engine.operations import Outbox

            session.add(Outbox(id=receipt["transaction_id"], asset_id=asset.id,
                               version=asset.version, operation=operation, payload=result))
        session.add(Finality(asset_id=asset.id, version=asset.version,
                             transaction_id=receipt["transaction_id"],
                             status=receipt["finality"], evidence=receipt))
        session.add(History(asset_id=asset.id, operation=operation, version=asset.version,
                            record={"asset": result, "receipt": receipt, "proof": proof}))
        return result

    def register(self, asset_id, holder, metadata):
        with self.lock, self.sessions.begin() as session:
            if session.get(Asset, asset_id):
                raise RegistryError(409, "Asset already registered")
            asset = Asset(id=asset_id, holder=holder, metadata_=metadata)
            session.add(asset)
            try:
                return self._record(session, "register", asset)
            except IntegrityError as error:
                raise RegistryError(409, "Asset already registered") from error

    def command(self, operation, asset_id, expected_version, state=None, proof=None, holder=None):
        from engine.verification import validate_transition

        with self.lock, self.sessions.begin() as session:
            asset = self._asset(session, asset_id)
            if asset.execution_status not in {"SIMULATED", "LOCAL_EVM", "CONFIRMED"}:
                raise RegistryError(409, "Prior chain operation requires confirmation or reconciliation")
            if asset.version != expected_version:
                raise RegistryError(409, "Stale asset version")
            if asset.state in {"SETTLED", "REVOKED"}:
                raise RegistryError(409, "Terminal asset cannot change")
            if asset.frozen and operation != "revoke":
                raise RegistryError(409, "Asset is frozen")
            verified_proof = None
            if operation == "verify":
                if self.verifier is None:
                    raise RegistryError(503, "Proof verifier is not configured")
                validate_transition(asset.state, "VERIFIED")
                verified_proof = self.verifier.verify(self._snapshot(asset), **proof)
                asset.state = "VERIFIED"
            elif operation == "transfer":
                validate_transition(asset.state, "TRANSFERRED")
                if not holder or holder == asset.holder:
                    raise RegistryError(422, "Transfer requires a different holder")
                asset.holder = holder
                asset.state = "TRANSFERRED"
            elif operation == "update":
                if state not in {"ACTIVE"}:
                    raise RegistryError(422, "Unsupported state")
                if state == asset.state:
                    raise RegistryError(409, "State is unchanged")
                validate_transition(asset.state, state)
                asset.state = state
            elif operation == "freeze":
                asset.frozen = True
            elif operation == "revoke":
                asset.state = "REVOKED"
            elif operation == "settlement":
                validate_transition(asset.state, "SETTLED")
                asset.state = "SETTLED"
            else:
                raise RegistryError(422, "Unsupported operation")
            try:
                return self._record(session, operation, asset, verified_proof)
            except StaleDataError as error:
                raise RegistryError(409, "Concurrent asset update") from error
