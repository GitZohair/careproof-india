from __future__ import annotations

import json
import os
import threading
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from typing import Any, Iterator

from databricks import sql
from databricks.sdk.core import Config

from .settings import settings


class Warehouse:
    @contextmanager
    def connection(self) -> Iterator[Any]:
        if os.getenv("DATABRICKS_CLIENT_ID") or os.getenv("DATABRICKS_TOKEN"):
            cfg = Config()
        else:
            cfg = Config(profile=settings.databricks_profile)
        with sql.connect(
            server_hostname=cfg.host.removeprefix("https://"),
            http_path=f"/sql/1.0/warehouses/{settings.warehouse_id}",
            credentials_provider=lambda: cfg.authenticate,
        ) as connection:
            yield connection

    def query(self, statement: str, parameters: dict[str, Any] | None = None) -> list[dict[str, Any]]:
        with self.connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute(statement, parameters=parameters or {})
                columns = [column[0] for column in cursor.description]
                return [dict(zip(columns, row, strict=True)) for row in cursor.fetchall()]


class ReviewStore:
    """Lakebase in production; a thread-safe local store keeps development usable."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._reviews: list[dict[str, Any]] = []
        self._lakebase_ready = False
        self._checked = False

    def _connect(self):
        if not os.getenv("PGHOST"):
            return None
        import psycopg
        from databricks.sdk import WorkspaceClient

        client = WorkspaceClient()
        token = client.database.generate_database_credential(
            request_id=str(uuid.uuid4()),
            instance_names=[os.environ["LAKEBASE_INSTANCE"]],
        ).token
        return psycopg.connect(
            host=os.environ["PGHOST"],
            port=os.getenv("PGPORT", "5432"),
            dbname=os.getenv("PGDATABASE", "databricks_postgres"),
            user=os.environ["PGUSER"],
            password=token,
            sslmode=os.getenv("PGSSLMODE", "require"),
        )

    def ensure_schema(self) -> None:
        if self._checked:
            return
        self._checked = True
        connection = self._connect()
        if connection is None:
            return
        try:
            with connection, connection.cursor() as cursor:
                cursor.execute(f"CREATE SCHEMA IF NOT EXISTS {settings.review_schema}")
                cursor.execute(
                    f"""
                    CREATE TABLE IF NOT EXISTS {settings.review_schema}.review_decision (
                        id UUID PRIMARY KEY,
                        facility_id TEXT NOT NULL,
                        capability TEXT NOT NULL,
                        decision TEXT NOT NULL CHECK (decision IN ('CONFIRM','VERIFY','OVERRIDE')),
                        override_tier TEXT,
                        note TEXT NOT NULL,
                        reviewer_email TEXT,
                        score_version TEXT NOT NULL DEFAULT 'v1.0',
                        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
                    )
                    """
                )
                cursor.execute(
                    f"CREATE INDEX IF NOT EXISTS review_facility_idx ON {settings.review_schema}.review_decision (facility_id, capability, created_at DESC)"
                )
            self._lakebase_ready = True
        finally:
            connection.close()

    def create(self, review: dict[str, Any]) -> dict[str, Any]:
        review = {
            **review,
            "id": str(uuid.uuid4()),
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        self.ensure_schema()
        if self._lakebase_ready:
            connection = self._connect()
            assert connection is not None
            try:
                with connection, connection.cursor() as cursor:
                    cursor.execute(
                        f"""
                        INSERT INTO {settings.review_schema}.review_decision
                        (id, facility_id, capability, decision, override_tier, note, reviewer_email)
                        VALUES (%s, %s, %s, %s, %s, %s, %s)
                        """,
                        (
                            review["id"], review["facility_id"], review["capability"], review["decision"],
                            review.get("override_tier"), review["note"], review.get("reviewer_email"),
                        ),
                    )
            finally:
                connection.close()
            return review
        with self._lock:
            self._reviews.append(review)
        return review

    def latest(self, facility_id: str, capability: str) -> dict[str, Any] | None:
        self.ensure_schema()
        if self._lakebase_ready:
            connection = self._connect()
            assert connection is not None
            try:
                with connection, connection.cursor() as cursor:
                    cursor.execute(
                        f"""
                        SELECT id::text, facility_id, capability, decision, override_tier, note, reviewer_email, created_at
                        FROM {settings.review_schema}.review_decision
                        WHERE facility_id=%s AND capability=%s
                        ORDER BY created_at DESC LIMIT 1
                        """,
                        (facility_id, capability),
                    )
                    row = cursor.fetchone()
                    if not row:
                        return None
                    columns = [item.name for item in cursor.description]
                    result = dict(zip(columns, row, strict=True))
                    result["created_at"] = result["created_at"].isoformat()
                    return result
            finally:
                connection.close()
        with self._lock:
            matches = [r for r in self._reviews if r["facility_id"] == facility_id and r["capability"] == capability]
            return matches[-1] if matches else None

    def count(self) -> int:
        self.ensure_schema()
        if self._lakebase_ready:
            connection = self._connect()
            assert connection is not None
            try:
                with connection, connection.cursor() as cursor:
                    cursor.execute(f"SELECT COUNT(*) FROM {settings.review_schema}.review_decision")
                    return int(cursor.fetchone()[0])
            finally:
                connection.close()
        return len(self._reviews)


warehouse = Warehouse()
reviews = ReviewStore()


def json_array(value: Any) -> list[Any]:
    if value is None:
        return []
    if isinstance(value, list):
        return value
    try:
        parsed = json.loads(value)
        return parsed if isinstance(parsed, list) else []
    except (TypeError, json.JSONDecodeError):
        return []
