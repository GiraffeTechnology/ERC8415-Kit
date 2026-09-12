"""Single command boundary: validate -> state -> adapter -> transactional audit."""
from threading import RLock

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm.exc import StaleDataError

from engine.database import Asset, History


class RegistryError(Exception):
    def __init__(self, status, message):
        self.status = status
        self.message = message


def snapshot(asset):
    return {
        "id": asset.id, "holder": asset.holder, "state": asset.state,
        "frozen": asset.frozen, "version": asset.version, "metadata": asset.metadata_,
    }


class Registry:
    def __init__(self, sessions, adapter):
        self.sessions = sessions
        self.adapter = adapter
        self.lock = RLock()

    def _asset(self, session, asset_id):
        asset = session.get(Asset, asset_id)
        if asset is None:
            raise RegistryError(404, "Asset not found")
        return asset

    def get(self, asset_id):
        with self.lock, self.sessions() as session:
            return snapshot(self._asset(session, asset_id))

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

    def _record(self, session, operation, asset):
        session.flush()
        result = snapshot(asset)
        receipt = self.adapter.execute(operation, result)
        session.add(History(asset_id=asset.id, operation=operation, version=asset.version,
                            record={"asset": result, "receipt": receipt}))
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

    def command(self, operation, asset_id, expected_version, state=None):
        with self.lock, self.sessions.begin() as session:
            asset = self._asset(session, asset_id)
            if asset.version != expected_version:
                raise RegistryError(409, "Stale asset version")
            if asset.state in {"SETTLED", "REVOKED"}:
                raise RegistryError(409, "Terminal asset cannot change")
            if asset.frozen and operation != "revoke":
                raise RegistryError(409, "Asset is frozen")
            if operation == "update":
                if state not in {"REGISTERED", "VERIFIED", "ACTIVE", "TRANSFERRED"}:
                    raise RegistryError(422, "Unsupported state")
                if state == asset.state:
                    raise RegistryError(409, "State is unchanged")
                asset.state = state
            elif operation == "freeze":
                asset.frozen = True
            elif operation == "revoke":
                asset.state = "REVOKED"
            elif operation == "settlement":
                asset.state = "SETTLED"
            else:
                raise RegistryError(422, "Unsupported operation")
            try:
                return self._record(session, operation, asset)
            except StaleDataError as error:
                raise RegistryError(409, "Concurrent asset update") from error
