from __future__ import annotations

import argparse
import os
import time
from pathlib import Path

from databricks.sdk import WorkspaceClient


def statements(path: Path):
    text = path.read_text(encoding="utf-8")
    for chunk in text.split("-- COMMAND ----------"):
        sql = chunk.strip()
        if sql:
            yield sql


def main() -> None:
    parser = argparse.ArgumentParser(description="Build the CareProof trust layer using Databricks SQL.")
    parser.add_argument("--warehouse-id", default=os.getenv("WAREHOUSE_ID", "dd096fed6be1701b"))
    parser.add_argument("--profile", default=os.getenv("DATABRICKS_CONFIG_PROFILE"))
    parser.add_argument("--sql", type=Path, default=Path("sql/trust_layer.sql"))
    args = parser.parse_args()

    client = WorkspaceClient(profile=args.profile) if args.profile else WorkspaceClient()
    chunks = list(statements(args.sql))
    for index, statement in enumerate(chunks, start=1):
        print(f"[{index}/{len(chunks)}] Running {statement.splitlines()[0][:90]}")
        response = client.statement_execution.execute_statement(
            warehouse_id=args.warehouse_id,
            statement=statement,
            wait_timeout="50s",
        )
        if response.status and response.status.state and response.status.state.value == "FAILED":
            raise RuntimeError(response.status.error)
        if response.statement_id and response.status and response.status.state and response.status.state.value in {"PENDING", "RUNNING"}:
            response = client.statement_execution.get_statement(response.statement_id)
            while response.status and response.status.state and response.status.state.value in {"PENDING", "RUNNING"}:
                time.sleep(2)
                response = client.statement_execution.get_statement(response.statement_id)
            if response.status and response.status.state and response.status.state.value == "FAILED":
                raise RuntimeError(response.status.error)
    print("CareProof trust layer is ready.")


if __name__ == "__main__":
    main()
