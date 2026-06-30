# Spec: agent5 — default voice model to Nova 2 Sonic (model dropdown)

**Status:** done
**Version:** v1
**Date:** 2026-07-01

---

## Problem

agent5 (Trianz Voice Concierge) pins its speech-to-speech model to `amazon.nova-sonic-v1:0`.
Amazon released **Nova 2 Sonic** (`amazon.nova-2-sonic-v1:0`, launched Dec 2025, available
in `us-east-1` — the project's region) as the next-generation speech-to-speech model on the
same `InvokeModelWithBidirectionalStream` API. We want the agent on the newer model, and the
operator-facing model picker in the Config page to be a real dropdown rather than a free-text
field, defaulting to Nova 2 Sonic.

---

## Solution

In `demos/demo0/agents/agent5/agent.config.yaml`:

- Change `defaults.sonic_model_id` to `amazon.nova-2-sonic-v1:0` (the new default).
- Change the `sonic_model_id` `setup_field` from `type: string` to `type: select` with the two
  known Sonic model ids as options, so the platform Config page renders a dropdown.

The Config page already renders a `setup_fields` entry of `type: select` as a `<select>`
dropdown (`AgentDetailPage.tsx` → `SetupFieldInput`), and the selected default comes from
`defaults`. No frontend or backend code change is needed — the voice loop uses the same
bidirectional-stream API, so `sonic_session.py` is unaffected.

---

## Scope

### In scope

- agent5 `agent.config.yaml`: new `sonic_model_id` default + select dropdown.

### Not in scope

- Changes to the text `model_id` field.
- Any change to `sonic_session.py` / the voice protocol (same API).
- Other agents.

---

## Architecture impact

None — config-only change to one agent's git-tracked definition. No new files, ports, or
dependencies. Operator overrides still flow through `state/config/setup.yaml` as before.

---

## Implementation Checklist

- [x] Set `defaults.sonic_model_id: amazon.nova-2-sonic-v1:0`.
- [x] Convert the `sonic_model_id` setup_field to `type: select` with options
      (`amazon.nova-2-sonic-v1:0`, `amazon.nova-sonic-v1:0`).
- [x] Bump the hard fallback `_FALLBACK_SONIC_MODEL` in `agentic/model.py` to
      `amazon.nova-2-sonic-v1:0` for consistency when nothing else resolves.

---

## Verification

- Open the agent5 Config page in the marketplace → the **Nova Sonic model** field is a
  dropdown showing both ids, with **Nova 2 Sonic** selected by default.
- A fresh agent (no `setup.yaml`) resolves `sonic_model_id` to `amazon.nova-2-sonic-v1:0`.
