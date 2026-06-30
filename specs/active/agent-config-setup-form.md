# Spec: Schema-driven per-agent Config form (setup_fields → state/config/setup.yaml)

**Status:** approved
**Version:** v1
**Date:** 2026-06-30

---

## Problem

The marketplace per-agent Config tab renders a **fixed** form (model dropdown, HITL toggle,
integration Connect buttons) and writes the agent's **`agent.config.yaml`**. That can't
express agent-specific operator settings — e.g. agent5 (Trianz Concierge) needs
`ses_sender`, `sales_contact_email`, `sonic_model_id`, `allowlist_domains`, `otp_ttl_seconds`,
none of which have inputs. The v2.0 design intends operator overrides to live in
**`state/config/setup.yaml`**, edited via GUI fields — but that path was never wired, so the
agent stays `awaiting_setup` and the new fields are unreachable from the UI.

## Solution

Make the Config tab **schema-driven and agent-specific**. An agent declares a `setup_fields`
list in its `agent.config.yaml`; the platform renders one input per field (type-aware),
pre-filled from the effective value (`agent.config.yaml` default ⊕ `state/config/setup.yaml`
override), and on save writes the operator's values to **`state/config/setup.yaml`**. The
agent's `effective_config` merges all setup keys over defaults so the values take effect, and
saving a setup file clears `awaiting_setup`. A collapsible **raw-JSON** editor of the setup
object stays as an advanced fallback, with an **"Insert sample"** button that generates a
template from `setup_fields` so an operator can author a new setup from scratch.

**Backward compatible:** agents *without* `setup_fields` keep the existing fixed form that
writes `agent.config.yaml` (so agent1/agent4/template are unaffected).

## Scope

### In scope
- **agent5 `agent.config.yaml`** — add a `setup_fields:` block (key, label, type, help, group,
  options) covering model_id, sonic_model_id, ses_sender, sales_contact_email,
  allowlist_domains, blocked_public_domains, otp_ttl_seconds, hitl_approval.
- **agent5 `apis/service.py`** — `effective_config()` merges *every* setup key that matches a
  `defaults` key (plus `hitl_approval`→features, `integrations[].connected`), not just model_id.
- **Platform backend** (`app/services/agent_config_service.py` + `app/routers/agent_config.py`)
  — add `read_setup`/`write_setup` and `GET`/`PUT /api/agents/{id}/setup` targeting
  `agents/{id}/state/config/setup.yaml` (works whether the agent is running or not).
- **Platform frontend** (`AgentDetailPage.tsx`, `api/platform.ts`) — when the agent declares
  `setup_fields`, render the generated form (grouped, type-aware inputs) + integration Connect
  toggles, saving to setup.yaml; raw-JSON editor edits the setup object + "Insert sample";
  otherwise fall back to the current fixed form writing agent.config.yaml.

### Not in scope
- Modifying the frozen `agentx_v2_0` template (a future `agentx_v3_0` can adopt this).
- Per-field server-side validation beyond type coercion (the agent still self-checks on /ping).
- Changing v1.0 agents (agent1/agent4) behaviour.

## Architecture impact

- New platform endpoints `GET`/`PUT /api/agents/{id}/setup`; new `read_setup`/`write_setup`
  in the platform config service (writes `state/config/setup.yaml`, the gitignored override file).
- `setup_fields` becomes an optional, recognised key in `agent.config.yaml`.
- agent5 `effective_config` merge becomes generic; no new dependency.
- No change to the canonical agent API contract (agent already exposes `/admin/setup`; the
  platform writes the file directly, mirroring how it already writes `agent.config.yaml`).

## Field types

`string | email | number | boolean | select (options[]) | list (multi-line ↔ string[])`.
Each field: `{ key, label, type, help?, group?, options? }`. Rendering groups by `group`.

## Implementation Checklist

- [x] Save this spec to `specs/active/`
- [x] agent5 `agent.config.yaml` — add `setup_fields`
- [x] agent5 `apis/service.py` — generic setup⊕defaults merge in `effective_config`
- [x] Platform backend — `read_setup`/`write_setup` + `GET`/`PUT /api/agents/{id}/setup`
- [x] `api/platform.ts` — `fetchAgentSetup`/`saveAgentSetup` + types
- [x] `AgentDetailPage.tsx` — schema-driven form + integrations + raw setup editor + Insert sample; fixed-form fallback retained
- [x] Verify: typecheck/build clean; backend script confirms setup→setup.yaml, generic merge, `awaiting_setup → ok`, ses_sender/allowlist take effect; 34 tests pass

## Verification

1. Frontend `tsc`/build clean; backend imports + agent5 tests still pass.
2. Marketplace → agent5 → Config shows grouped inputs for its declared fields, pre-filled from
   defaults. Set `ses_sender` + `sales_contact_email`, Save → `state/config/setup.yaml` written.
3. `GET /ping` flips `awaiting_setup → ok`; `GET /config` defaults reflect the saved `ses_sender`;
   a meeting request now sends via SES (or the OTP leaves dev mode).
4. Raw-JSON fallback: "Insert sample" fills a valid template from `setup_fields`; editing + Save
   round-trips to setup.yaml.
5. An agent without `setup_fields` (e.g. agent4) still shows the original fixed form.
