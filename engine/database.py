"""Persistence definitions; deployed services use a dedicated external MySQL database."""
from datetime import UTC, datetime
from typing import ClassVar

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, Integer, String, create_engine
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, sessionmaker
from sqlalchemy.pool import StaticPool


def now():
    return datetime.now(UTC)


class Base(DeclarativeBase):
    pass


class Asset(Base):
    __tablename__ = "assets"
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    holder: Mapped[str] = mapped_column(String(128))
    state: Mapped[str] = mapped_column(String(24), default="REGISTERED")
    frozen: Mapped[bool] = mapped_column(Boolean, default=False)
    version: Mapped[int] = mapped_column(Integer, default=1)
    metadata_: Mapped[dict] = mapped_column("metadata", JSON, default=dict)
    __mapper_args__: ClassVar[dict] = {"version_id_col": version}


class History(Base):
    __tablename__ = "asset_history"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    asset_id: Mapped[str] = mapped_column(ForeignKey("assets.id"), index=True)
    operation: Mapped[str] = mapped_column(String(24))
    version: Mapped[int] = mapped_column(Integer)
    record: Mapped[dict] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class Permission(Base):
    __tablename__ = "permissions"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    principal: Mapped[str] = mapped_column(String(128))
    role: Mapped[str] = mapped_column(String(24))
    asset_id: Mapped[str | None] = mapped_column(ForeignKey("assets.id"), nullable=True)


class Finality(Base):
    __tablename__ = "finality_records"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    asset_id: Mapped[str] = mapped_column(ForeignKey("assets.id"), index=True)
    version: Mapped[int] = mapped_column(Integer)
    transaction_id: Mapped[str] = mapped_column(String(128))
    status: Mapped[str] = mapped_column(String(24))
    evidence: Mapped[dict] = mapped_column(JSON)


def database(url):
    if url == "sqlite+pysqlite:///:memory:":
        engine = create_engine(url, connect_args={"check_same_thread": False}, poolclass=StaticPool)
    elif url.startswith("mysql+pymysql://"):
        engine = create_engine(url, pool_pre_ping=True)
    else:
        raise ValueError("Use dedicated MySQL or isolated in-memory test storage")
    Base.metadata.create_all(engine)
    return sessionmaker(engine, expire_on_commit=False)
