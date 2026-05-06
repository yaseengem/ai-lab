"""
Starts the FastAPI backend and Vite frontend for the Settlement Failure Prevention Agent.

Usage (from repo root):
    python agents/demo4/main.py
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

import yaml

_AGENT_DIR = Path(__file__).parent
_REPO_ROOT = _AGENT_DIR.parent.parent


def main() -> None:
    meta = yaml.safe_load((_AGENT_DIR / "metadata.yaml").read_text(encoding="utf-8"))
    api_port: int = meta["api_port"]
    frontend_port: int = meta["frontend_port"]
    entry_point: str = meta["entry_point"]
    name: str = meta["name"]

    frontend_dir = _AGENT_DIR / "frontend"
    frontend_dir.mkdir(parents=True, exist_ok=True)
    (frontend_dir / ".env").write_text(
        f"VITE_API_URL=http://localhost:{api_port}\n"
        f"VITE_AGENT_ID={_AGENT_DIR.name}\n",
        encoding="utf-8",
    )

    procs: list[subprocess.Popen] = []

    print(f"[{name}] Starting API on :{api_port}")
    procs.append(subprocess.Popen(
        [sys.executable, "-m", "uvicorn", entry_point,
         "--host", "0.0.0.0", "--port", str(api_port), "--reload"],
        cwd=_REPO_ROOT,
    ))

    if (frontend_dir / "package.json").exists():
        if not (frontend_dir / "node_modules").exists():
            print(f"[{name}] Installing frontend dependencies ...")
            subprocess.run(["npm", "install"], cwd=frontend_dir, shell=True, check=True)
        print(f"[{name}] Starting frontend on :{frontend_port}")
        procs.append(subprocess.Popen(
            ["npm", "run", "dev", "--", "--port", str(frontend_port)],
            cwd=frontend_dir,
            shell=True,
        ))
    else:
        print(f"[{name}] No frontend found at {frontend_dir.relative_to(_REPO_ROOT)}, skipping.")

    try:
        for p in procs:
            p.wait()
    except KeyboardInterrupt:
        print(f"\n[{name}] Shutting down...")
        for p in procs:
            p.terminate()


if __name__ == "__main__":
    main()
