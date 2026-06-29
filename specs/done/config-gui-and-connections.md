# Spec: Config GUI fields + OAuth-style connections

**Status:** done
**Version:** v1
**Date:** 2026-06-29

---

## Problem

The agent **Configuration** experience exposes `agent.config.yaml` as raw JSON in a
textarea (marketplace `AgentDetailPage` → Configuration tab) and as
`JSON.stringify`'d key/value blobs (each agent's own read-only `ConfigPage`).
That is developer-facing, error-prone (a stray comma breaks Save), and assumes the
operator understands the config schema.

Operators should edit only the fields that matter for their agent through a proper
GUI — not hand-edit JSON. And when an agent needs to connect to an external system
(e.g. an OAuth-protected service or a cloud account), that should be a **Connect
button**, not a JSON field the operator fills in by hand.

Separately, the static **Integrations** showcase is missing **GCP** under Cloud and
should surface **S3** under Data.

---

## Solution

**1. Marketplace Configuration tab becomes a GUI form** (`AgentDetailPage` →
`ConfigurationTab`). No JSON textarea. It loads the full `agent.config.yaml`, exposes
a bounded set of editable fields, and on Save merges edits back into the full doc and
PUTs it (preserving personas/capabilities untouched). The existing Save + Restart flow
is unchanged. Editable fields (per the product decision):

- **Model** — `defaults.model_id` as a dropdown of known Bedrock model ids plus an
  "Inherit platform default" option (blank).
- **Human-in-the-loop** — `features.hitl_approval` as an on/off toggle.
- **Connected systems** — the new `integrations` list (below), each rendered as a row
  with a **Connect** button.

Personas and capabilities remain visible (read-only cards) and are preserved on save,
not editable here.

**2. New `integrations` section in `agent.config.yaml`.** Declares the external
systems an agent can connect to. Each entry drives a Connect button:

```yaml
integrations:
  # Systems this agent can connect to. The platform Config page renders a Connect
  # button per entry. If auth_url is set, the button opens that URL in a new tab
  # (functional OAuth). If auth_url is blank, the button is a mock toggle for the demo.
  - id: aws_s3
    name: "AWS S3"
    category: data          # cloud | data | productivity | business
    description: "Object storage for case documents and data."
    auth_type: oauth        # oauth | apikey | mock
    auth_url: ""            # blank => mock connect in the demo; set a URL to make it functional
    connected: false
```

**Connect behaviour:** if `auth_url` is non-empty the button opens it (`window.open`,
new tab) — this is the "functional button" path for future agents. If blank, it is a
mock toggle that flips `connected` in the form state (current agents). Either way the
`connected` flag is persisted on Save. This satisfies "mock now, functional if I
decide later" without a code change — only `auth_url` need be filled in.

**3. Each agent's own `ConfigPage` (v2.0 template) renders friendly fields**, not
`JSON.stringify` blobs, and gains a read-only **Connected systems** section showing
each integration's connected status. It stays read-only (authoritative edit is at the
platform level, per the v2.0 standard).

**4. Integrations showcase tab** — add **GCP** to the Cloud category and ensure
**S3** appears under Data.

No new dependency, port, or backend route. Config still saves through the existing
`PUT /api/agents/{id}/config` and reloads via `POST /admin/restart`.

---

## Scope

### In scope

- Rewrite `ConfigurationTab` in `demos/demo0/frontend/src/pages/AgentDetailPage.tsx`
  from JSON textarea → GUI form (Model dropdown, HITL toggle, Connected systems with
  Connect buttons). Load-merge-save preserving untouched config keys.
- Add the `integrations` schema block to the **v2.0 template** `agent.config.yaml`
  (with `aws_s3` as a sample entry) and document it in the file's header comment.
- Update the **v2.0 template** `ConfigPage.tsx` to render friendly fields + a read-only
  Connected systems section (replace `JSON.stringify` rendering).
- Add `integrations` to the agent config type(s) on the frontend (`api/platform.ts`
  and the template's `api/client.ts` `AgentConfig`).
- Integrations showcase tab: add **GCP** under Cloud; surface **S3** under Data.
- Update `GUIDELINES.md` (and the v2.0 standard wording in `docs/conventions.md` /
  `CLAUDE.md` where it describes the Config page) to reflect GUI fields + integrations.

### Not in scope

- Real OAuth backend / token storage / credential vaulting. `auth_url` simply opens a
  URL; no callback handling. (A real OAuth flow would be its own architecture spec.)
- Editing personas or capabilities from the GUI (kept read-only / preserved).
- Backbone changes to `app/` config routes — the existing GET/PUT/restart suffice.
- Backfilling `integrations` into already-created agents beyond the template
  (existing agents pick it up when copied; their configs can add it later).
- Wiring the static Integrations showcase to live `connected` state.

---

## Architecture impact

- **No new files, ports, or dependencies.** Config continues to flow through
  `app/`'s existing `GET/PUT /api/agents/{id}/config` and `POST /admin/restart`.
- **`agent.config.yaml` gains an optional `integrations:` list.** Backend reads/writes
  it opaquely (config is passed through as JSON), so no schema enforcement is required
  in `app/`; the frontend treats a missing `integrations` as an empty list.
- Template change touches `agentx_v2_0` — still on the `feat/agentx-v2-template`
  branch and not yet frozen (only `agentx_v1_0` is frozen). Treated as a v2.0 standard
  amendment, not a new template version.
- Light theme only; reuse the existing form/toggle/button styling already used by
  `ConnectWorkspacePage` and the current Configuration tab.

---

## Implementation Checklist

- [x] Extend frontend config types: add `Integration` + optional `integrations` to
      `AgentConfigDoc` (`api/platform.ts`) and `AgentConfig` (`agentx_v2_0/.../api/client.ts`).
- [x] Rewrite `ConfigurationTab` (AgentDetailPage) as a GUI form: Model dropdown,
      HITL toggle, Connected systems rows with Connect buttons; load → edit subset →
      merge into full doc → `saveAgentConfig`; keep Restart + status messaging.
- [x] Add `integrations:` block (with `aws_s3` sample + header doc) to
      `agentx_v2_0/agent.config.yaml`.
- [x] Update `agentx_v2_0` `ConfigPage.tsx`: friendly field rendering + read-only
      Connected systems section (drop `JSON.stringify` blobs).
- [x] Integrations showcase tab: add `GCP` under Cloud; ensure `S3` under Data.
- [x] Update `GUIDELINES.md` + the v2.0 Config-page wording in `docs/conventions.md`
      and `CLAUDE.md`.
- [x] Move this spec to `done/` and propose a git push once verified.

---

## Verification

- Open the marketplace → an agent → **Configuration**: no JSON textarea; Model
  dropdown, HITL toggle, and Connected systems rows render. Toggle HITL, pick a model,
  click Connect on a mock entry → it shows Connected. **Save** → success; **Restart**
  → applies. Reload the page → the saved model / HITL / connected state persists.
- A Connect entry with a non-empty `auth_url` opens that URL in a new tab.
- The agent's own `/config` page shows friendly fields + Connected systems, read-only.
- Integrations showcase shows **GCP** under Cloud and **S3** under Data.
- Existing agents with no `integrations` key still load Config without error
  (empty Connected systems list).
