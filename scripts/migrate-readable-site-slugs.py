#!/usr/bin/env python3
"""Give every legacy website the readable address its owner expects.

A website created before readable identities has its runtime tenant id stored as
its slug, so its owner-facing URL is `/<tenant-id-with-digest>` and the readable
name answers 404. This plan computes the slug each of those rows should have
without touching the tenant id, which is the immutable runtime identity behind
the Worker, the D1 databases and the queues.

Dry run by default. `--apply` writes the SQL through `wrangler d1 execute` and
keeps a mode-0600 backup of the previous addresses first.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import re
import subprocess
import sys
import tempfile
import unicodedata
from pathlib import Path

DATABASE = "helloada"
ROOT = Path(__file__).resolve().parents[1]
RESERVED = {
    "_next", "admin", "admin-entry", "api", "favicon.ico", "icon.svg", "login",
    "portfolio", "robots.txt", "signup", "sitemap.xml", "websites",
}
MAX_SLUG_LENGTH = 48


def slug_from_name(name: str) -> str:
    value = unicodedata.normalize("NFKD", str(name or ""))
    value = "".join(character for character in value if not unicodedata.combining(character))
    value = value.lower().replace("'", "").replace("\u2019", "")
    value = re.sub(r"[^a-z0-9]+", "-", value).strip("-")[:MAX_SLUG_LENGTH].rstrip("-")
    return value or "site"


def plan(rows: list[dict]) -> list[dict]:
    taken = {str(row["slug"]) for row in rows} | {str(row["tenant_id"]) for row in rows}
    changes: list[dict] = []
    for row in rows:
        current = str(row["slug"] or "")
        if current != str(row["tenant_id"] or "") or not current:
            continue
        candidate = slug_from_name(row["name"])
        if candidate in RESERVED:
            candidate = f"{candidate}-site"
        unique, counter = candidate, 1
        while unique in taken and unique != current:
            counter += 1
            unique = f"{candidate}-{counter}"
        if unique == current:
            continue
        taken.add(unique)
        changes.append({"id": int(row["id"]), "name": row["name"], "from": current, "to": unique})
    return changes


def wrangler(args: list[str]) -> str:
    command = ["npx", "wrangler", *args]
    return subprocess.run(command, cwd=ROOT, check=True, text=True, capture_output=True).stdout


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="write the planned slugs")
    parser.add_argument("--backup-dir", default=".slug-migrations",
                        help="where the previous addresses are kept (mode 0600)")
    args = parser.parse_args()

    output = wrangler([
        "d1", "execute", DATABASE, "--remote", "--json",
        "--command", "select id, name, slug, tenant_id from websites order by id",
    ])
    rows = json.loads(output)[0]["results"]
    changes = plan(rows)
    if not changes:
        print("every website already has a readable address")
        return 0
    for change in changes:
        print(f"{change['id']:3d}  {change['from']}  ->  {change['to']}")
    if not args.apply:
        print(f"{len(changes)} planned; re-run with --apply")
        return 0

    stamp = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    backup_dir = Path(args.backup_dir).expanduser().resolve()
    backup_dir.mkdir(parents=True, exist_ok=True, mode=0o700)
    backup = backup_dir / f"website-slug-backup-{stamp}.json"
    backup.write_text(json.dumps({"takenAt": stamp, "rows": rows}, indent=2) + "\n", encoding="utf-8")
    os.chmod(backup, 0o600)
    print(f"backup {backup}")

    statement = "\n".join(
        "update websites set slug = '{to}' where id = {id} and slug = '{from}';".format(**change)
        for change in changes
    )
    with tempfile.NamedTemporaryFile("w", suffix=".sql", delete=False, encoding="utf-8") as handle:
        handle.write(statement + "\n")
        path = handle.name
    try:
        wrangler(["d1", "execute", DATABASE, "--remote", f"--file={path}"])
    finally:
        Path(path).unlink(missing_ok=True)

    output = wrangler([
        "d1", "execute", DATABASE, "--remote", "--json",
        "--command", "select id, slug, tenant_id from websites order by id",
    ])
    for row in json.loads(output)[0]["results"]:
        expected = next((c["to"] for c in changes if c["id"] == row["id"]), None)
        if expected is not None and row["slug"] != expected:
            print(f"mismatch for {row['id']}: {row['slug']} != {expected}", file=sys.stderr)
            return 1
    print(f"{len(changes)} addresses updated")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
