#!/usr/bin/env python3
"""
Backup / restore an agent's runtime state.

Each agent keeps ALL its mutable, backup-eligible data under
`<agent_dir>/state/` (config/setup, memory, sessions, data, runs, secrets,
events, logs). This tool snapshots that tree — EXCLUDING `index/`, which is
rebuildable derived data — into a single zip with a manifest, and restores it.

Lifecycle this supports (see specs/per-agent-state-layout.md):
  • backup   = snapshot state/ (minus index/) + manifest (agent id, versions,
               timestamp, per-file sha256).
  • restore  = git pull (definition + code) → THIS lays state/ back down →
               validate schema version → rebuild index/.

Usage (run from the repo root):
  python scripts/agent_state.py backup  demos/demo0/agents/agent1
  python scripts/agent_state.py backup  demos/demo0/agents/agent1 --out backups/agent1.zip
  python scripts/agent_state.py restore demos/demo0/agents/agent1 backups/agent1.zip
  python scripts/agent_state.py restore demos/demo0/agents/agent1 backups/agent1.zip --force
"""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import sys
import zipfile
from datetime import datetime, timezone
from pathlib import Path

MANIFEST_NAME = "manifest.json"
# Subdirs (relative to state/) excluded from backups because they are rebuildable.
EXCLUDED_DIRS = ("index",)
# Transient lock/temp files never worth capturing.
SKIP_SUFFIXES = (".lock", ".tmp")


def _sha256(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def _read_text(path: Path, default: str = "") -> str:
    try:
        return path.read_text(encoding="utf-8").strip()
    except FileNotFoundError:
        return default


def _agent_id(agent_dir: Path) -> str:
    return agent_dir.resolve().name


def _agent_version(agent_dir: Path) -> str:
    meta = agent_dir / "metadata.yaml"
    # Avoid a yaml dependency here — grab the version line directly.
    for line in _read_text(meta).splitlines():
        if line.strip().startswith("version:"):
            return line.split(":", 1)[1].strip().strip('"').strip("'")
    return "unknown"


def _excluded(rel: Path) -> bool:
    return rel.parts and rel.parts[0] in EXCLUDED_DIRS


def _backup_files(state_dir: Path) -> list[Path]:
    files = []
    for p in state_dir.rglob("*"):
        if not p.is_file():
            continue
        rel = p.relative_to(state_dir)
        if _excluded(rel) or p.suffix in SKIP_SUFFIXES:
            continue
        files.append(p)
    return sorted(files)


def backup(agent_dir: Path, out: Path | None) -> int:
    state_dir = agent_dir / "state"
    if not state_dir.is_dir():
        print(f"error: no state/ to back up at {state_dir}", file=sys.stderr)
        return 1

    out = out or (agent_dir / f"{_agent_id(agent_dir)}-state-backup.zip")
    out.parent.mkdir(parents=True, exist_ok=True)

    files = _backup_files(state_dir)
    manifest = {
        "agent_id": _agent_id(agent_dir),
        "agent_version": _agent_version(agent_dir),
        "state_schema_version": _read_text(state_dir / "VERSION", "unknown"),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "excluded": [f"{d}/" for d in EXCLUDED_DIRS],
        "files": {
            str(p.relative_to(state_dir)).replace("\\", "/"): {
                "size": p.stat().st_size, "sha256": _sha256(p),
            }
            for p in files
        },
    }

    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr(MANIFEST_NAME, json.dumps(manifest, indent=2))
        for p in files:
            zf.write(p, arcname=str(p.relative_to(state_dir)).replace("\\", "/"))

    print(f"backed up {len(files)} file(s) -> {out}")
    print(f"  agent={manifest['agent_id']} v{manifest['agent_version']} "
          f"schema={manifest['state_schema_version']} (index/ excluded)")
    return 0


def restore(agent_dir: Path, backup_path: Path, force: bool) -> int:
    if not backup_path.is_file():
        print(f"error: backup not found: {backup_path}", file=sys.stderr)
        return 1

    state_dir = agent_dir / "state"
    with zipfile.ZipFile(backup_path, "r") as zf:
        try:
            manifest = json.loads(zf.read(MANIFEST_NAME))
        except KeyError:
            print("error: backup has no manifest.json — not a valid state backup", file=sys.stderr)
            return 1

        # Schema-version gate: refuse a cross-format restore unless forced.
        current = _read_text(state_dir / "VERSION", "")
        backup_schema = str(manifest.get("state_schema_version", "unknown"))
        if current and current != backup_schema and not force:
            print(f"error: schema mismatch — existing state is v{current}, "
                  f"backup is v{backup_schema}. Re-run with --force to override.", file=sys.stderr)
            return 1

        if state_dir.exists():
            if not force:
                print(f"error: {state_dir} already exists. Re-run with --force to replace it.",
                      file=sys.stderr)
                return 1
            shutil.rmtree(state_dir)
        state_dir.mkdir(parents=True, exist_ok=True)

        restored = 0
        for name in manifest.get("files", {}):
            data = zf.read(name)
            dest = state_dir / name
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_bytes(data)
            expected = manifest["files"][name]["sha256"]
            if hashlib.sha256(data).hexdigest() != expected:
                print(f"error: checksum mismatch for {name}", file=sys.stderr)
                return 1
            restored += 1

    # Rebuild derived data that was excluded from the backup.
    (state_dir / "index").mkdir(parents=True, exist_ok=True)
    if not (state_dir / "VERSION").exists():
        (state_dir / "VERSION").write_text(backup_schema, encoding="utf-8")

    print(f"restored {restored} file(s) -> {state_dir}")
    print("  index/ rebuilt empty; restart the agent to apply.")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Backup/restore an agent's state/ folder.")
    sub = parser.add_subparsers(dest="cmd", required=True)

    b = sub.add_parser("backup", help="snapshot <agent_dir>/state (minus index/)")
    b.add_argument("agent_dir", type=Path)
    b.add_argument("--out", type=Path, default=None, help="output zip path")

    r = sub.add_parser("restore", help="restore a backup zip into <agent_dir>/state")
    r.add_argument("agent_dir", type=Path)
    r.add_argument("backup", type=Path)
    r.add_argument("--force", action="store_true", help="replace existing state / override schema check")

    args = parser.parse_args()
    if args.cmd == "backup":
        return backup(args.agent_dir, args.out)
    return restore(args.agent_dir, args.backup, args.force)


if __name__ == "__main__":
    raise SystemExit(main())
