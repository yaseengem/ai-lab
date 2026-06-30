# Spec: Fix `/admin/restart` re-exec crash on Windows

**Status:** done
**Version:** v2
**Date:** 2026-07-01

---

## Problem

`POST /admin/restart` self-restarts an agent by re-execing the process. The current
implementation re-execs with `sys.argv`:

```python
os.execv(sys.executable, [sys.executable, *sys.argv])
```

Agents are launched via `python -m uvicorn …`, so `sys.argv[0]` is the **file path**
of uvicorn's `__main__.py` (e.g. `…\.venv\Lib\site-packages\uvicorn\__main__.py`).
When Python is asked to run a script **by path**, it prepends that script's directory
to `sys.path[0]`. That directory (`…\site-packages\uvicorn\`) contains uvicorn's own
`logging.py`, which then shadows the stdlib `logging` module, producing a circular
import on startup:

```
AttributeError: partially initialized module 'logging' has no attribute 'Formatter'
(most likely due to a circular import)
```

Result: the agent process dies on restart instead of coming back up. Observed live on
agent5 after a Config-page **Restart agent** (operator saves setup → restart → crash).
The original launch works because `-m uvicorn` sets `sys.path[0]` to the cwd, not the
uvicorn package dir — only the *restart* path regresses it.

This is in the **`agentx_v2_0` template**, so every agent built from v2.0 inherits it.
Today that is just **agent5**.

### v2 finding — `--reload` makes re-exec unfixable

The first fix (`sys.orig_argv`) surfaced a deeper, OS-independent incompatibility:
agents are launched in `main.py` with `python -m uvicorn … --reload`. With `--reload`,
uvicorn runs as a **reloader supervisor** that spawns the ASGI app in a separate
**multiprocessing worker**. The `admin_restart` route runs *in the worker*, where:

- `sys.orig_argv` is the multiprocessing bootstrap
  (`-c "from multiprocessing.spawn import spawn_main; …"`) — re-execing it is a syntax error;
- `sys.argv` is uvicorn's reconstructed by-path form (the original Windows crash);
- and even with a correct argv, the **supervisor owns the listening socket**, so a
  worker that re-execs into a fresh `uvicorn --reload` collides on the port.

So self-re-exec restart and `--reload` are mutually exclusive.

---

## Solution

**Two parts:**

1. **Re-exec with `sys.orig_argv`** (Python 3.10+; project is on 3.12). In a single
   uvicorn process it is exactly `[python, "-m", "uvicorn", "agents.<id>.apis.main:app", …]`,
   so the re-launch reproduces the `-m uvicorn` module invocation, `sys.path[0]` stays
   the cwd, and the process is replaced in place (same PID) — rebinding the socket cleanly.

   ```python
   os.execv(sys.executable, sys.orig_argv)
   ```

2. **Drop `--reload` from the agent launcher** (`main.py`), so the agent is a single
   uvicorn process that owns its socket and can re-exec itself. Auto-reload-on-save is a
   dev-only convenience that conflicts with the operator-facing Restart feature; a
   developer can still run a single agent with `--reload` manually while editing it.

Fix the **template** first (source of truth), then propagate the identical changes to
agent5 (the only inheriting agent). No API/contract change — same endpoint, same response.

---

## Scope

### In scope

- `demos/demo0/agents/agentx_v2_0/apis/routes.py` — `admin_restart` re-exec.
- `demos/demo0/agents/agent5/apis/routes.py` — same change (inherited copy).
- Update the surrounding log line / docstring to reflect `orig_argv`.
- `demos/demo0/agents/agentx_v2_0/main.py` + `demos/demo0/agents/agent5/main.py` —
  remove `--reload` from the uvicorn launch.

### Not in scope

- `agentx_v1_0` (frozen; does not contain this route).
- Any change to the restart contract, setup flow, or HITL durability.
- Non-Windows behaviour (the fix is also correct on POSIX — `orig_argv` is portable).

---

## Architecture impact

None. No new files, folders, ports, or dependencies. One-line behavioural fix inside an
existing route, mirrored from template → agent.

---

## Implementation Checklist

- [x] Template: replace `os.execv(sys.executable, [sys.executable, *sys.argv])` with
      `os.execv(sys.executable, sys.orig_argv)` in `agentx_v2_0/apis/routes.py`; update
      the log/docstring wording from `sys.argv` to `sys.orig_argv`.
- [x] agent5: apply the identical change in `agent5/apis/routes.py`.
- [x] Remove `--reload` from the uvicorn launch in `agentx_v2_0/main.py` and
      `agent5/main.py` (with a comment explaining why).
- [x] Run agent5 test suite from `demos/demo0` — 21 passed.
- [ ] Live verify the Config-page **Restart agent** flow (see Verification).

---

## Verification

1. Start the squad; open agent5 Config page.
2. Edit setup (e.g. model) → Save → **Restart agent**.
3. Confirm agent5 logs show `executing os.execv now` followed by a clean uvicorn
   startup and `GET /ping → 200` (no `logging.Formatter` / circular-import traceback).
4. `GET /api/agents/agent5/config` reflects the saved setup after restart.
