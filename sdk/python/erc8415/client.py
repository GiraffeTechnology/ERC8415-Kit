"""Standard library only: no dependencies to install, nothing to pin."""

from __future__ import annotations

import json
import urllib.error
import urllib.request
from dataclasses import dataclass
from typing import Any, Callable, Optional


class ProjectionClientError(Exception):
    def __init__(self, status: int, code: str, message: str) -> None:
        super().__init__(message)
        self.status = status
        self.code = code


class NotCoveredError(ProjectionClientError):
    """The projection does not cover this instant. Not a failure of the query."""

    def __init__(self, message: str) -> None:
        super().__init__(404, "INSTANT_NOT_COVERED", message)


@dataclass(frozen=True)
class Entry:
    version: int
    holder: str
    effective_at: int
    superseded_at: int
    record_commitment: str
    previous_commitment: str
    registry_reference: str

    @staticmethod
    def from_wire(wire: dict[str, Any]) -> "Entry":
        # Every uint64 arrives as a decimal string. Python ints are arbitrary
        # precision, so nothing is lost, but the wire format stays explicit.
        return Entry(
            version=int(wire["version"]),
            holder=wire["holder"],
            effective_at=int(wire["effectiveAt"]),
            superseded_at=int(wire["supersededAt"]),
            record_commitment=wire["recordCommitment"],
            previous_commitment=wire["previousCommitment"],
            registry_reference=wire["registryReference"],
        )


@dataclass(frozen=True)
class Settlement:
    settlement_id: str
    token_id: int
    initiator: str
    expected_holder: str
    snapshot_hash: str
    opened_at: int
    deadline: int
    status: str

    @staticmethod
    def from_wire(wire: dict[str, Any]) -> "Settlement":
        return Settlement(
            settlement_id=wire["settlementId"],
            token_id=int(wire["tokenId"]),
            initiator=wire["initiator"],
            expected_holder=wire["expectedHolder"],
            snapshot_hash=wire["snapshotHash"],
            opened_at=int(wire["openedAt"]),
            deadline=int(wire["deadline"]),
            status=wire["status"],
        )


@dataclass(frozen=True)
class Resolution:
    """All three facts, each still labelled as itself.

    ``holder`` is who was recorded, ``final`` is whether that can still move,
    and ``open_gap`` is whether a change is in flight. Acting on ``holder``
    without reading ``final`` acts for the wrong party when a later admission
    supersedes the answer.
    """

    holder: str
    final: bool
    open_gap: Optional[Settlement]


Opener = Callable[[str], tuple[int, dict[str, Any]]]


def _default_opener(url: str) -> tuple[int, dict[str, Any]]:
    request = urllib.request.Request(url, headers={"accept": "application/json"})
    try:
        with urllib.request.urlopen(request) as response:
            return response.status, json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        return error.code, json.loads(error.read().decode("utf-8"))


class ProjectionClient:
    def __init__(self, base_url: str, opener: Optional[Opener] = None) -> None:
        self._base_url = base_url.rstrip("/")
        self._open = opener or _default_opener

    def holder_as_of(self, token_id: int, instant: int) -> str:
        """The holder the register had confirmed at an instant. Nothing more."""
        return self._get(f"/projection/{token_id}/holder/as-of/{instant}")["holder"]

    def is_final_as_of(self, token_id: int, instant: int) -> bool:
        """Whether a later admission can still change that answer."""
        return bool(self._get(f"/projection/{token_id}/finality/as-of/{instant}")["final"])

    def entry_as_of(self, token_id: int, instant: int) -> Entry:
        return Entry.from_wire(self._get(f"/projection/{token_id}/entry/as-of/{instant}")["entry"])

    def entry_at(self, token_id: int, version: int) -> Entry:
        return Entry.from_wire(self._get(f"/projection/{token_id}/entry/version/{version}")["entry"])

    def entry_count(self, token_id: int) -> int:
        return int(self._get(f"/projection/{token_id}/entries")["entryCount"])

    def entries(self, token_id: int) -> list[Entry]:
        return [Entry.from_wire(item) for item in self._get(f"/projection/{token_id}/entries")["entries"]]

    def open_gap_of(self, token_id: int) -> Optional[Settlement]:
        gap = self._get(f"/projection/{token_id}")["openGap"]
        return None if gap is None else Settlement.from_wire(gap)

    def resolve(self, token_id: int, instant: int) -> Resolution:
        return Resolution(
            holder=self.holder_as_of(token_id, instant),
            final=self.is_final_as_of(token_id, instant),
            open_gap=self.open_gap_of(token_id),
        )

    def _get(self, path: str) -> dict[str, Any]:
        status, body = self._open(f"{self._base_url}{path}")
        if status >= 400:
            code = body.get("error", "UNKNOWN")
            message = body.get("message", code)
            if code == "INSTANT_NOT_COVERED":
                raise NotCoveredError(message)
            raise ProjectionClientError(status, code, message)
        return body
