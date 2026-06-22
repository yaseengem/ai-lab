# Conventions

**Living reference — kept current.** This is the detailed reference; the *enforced* short rules live in `CLAUDE.md`, and decision history in `specs/done/`.

> See also: [tech_stack.md](tech_stack.md) · [architecture.md](architecture.md).

---

## Naming

- **Agent folders are `agent1`, `agent2`, `agent3` … — never named after their use case.** Display names come from each agent's `metadata.yaml` (`name` field).
- **Demo folders** are `demo0`, `demo1`, … `demoN` under `demos/`. `demo0` is "AI Agents Squad".
- **Template folders** are `agentx_vN_M` (e.g. `agentx_v1_0`) — underscores keep them valid Python module paths so `entry_point` works after a copy.
- **Spec slugs** are kebab-case (e.g. `marketplace-nav-and-filters.md`); architectural specs may carry a `vN-` prefix.

## File layout

- **Each agent is self-contained** in `demos/demo0/agents/agentN/` — no agent code lives outside its folder. Memory backend lives in the agent's `agentic/memory_backend.py`.
- **`demos/demo0/commons/` holds only `logger.py`.** Everything else is agent-owned.
- **Platform logic** (agent list, config, health) lives in `demos/demo0/app/`.
- A new non-agent demo is a sibling `demos/demoN/` — keep it self-contained too.

## `app/` extension pattern

Adding a platform feature in `demos/demo0/app/`:
1. `app/routers/{domain}.py` with an `APIRouter`
2. `app/services/{domain}_service.py` for business logic
3. Schemas in `app/schemas/` if needed
4. Register in `app/main.py` — **one line**: `app.include_router({domain}.router, prefix="/api")`

## Tests

- **pytest.** Platform tests under `demos/demo0/app/tests/`; agent tests under `demos/demo0/agents/agentN/tests/`.
- Run from `demos/demo0` (working-directory root for imports). No `pytest.ini` — defaults apply.
- The template-skip behaviour is locked by `app/tests/test_scanner_template_skip.py` — don't rely on a folder-name check.

## Status axes (two separate things)

| Axis | Where | Values |
|------|-------|--------|
| **Spec lifecycle** | spec header `Status:` | `draft` → `approved` → `in-progress` → `done` → `superseded` |
| **Agent state** | `metadata.yaml` `status:` | `active` / `stub` / `template` (scanner skips `template`) |

## Golden rule

**No code without an approved spec.** If you can't point to a spec item for a change, write the spec first. See `specs/README.md`.
