# Spec: agent5 — voice toggle stuck "on" after a failed/fallback voice session

**Status:** done
**Version:** v1
**Date:** 2026-07-01

---

## Problem

Nova Sonic voice is optional and degrades to text when the experimental
`aws-sdk-bedrock-runtime` / `smithy_aws_core` stack isn't importable (current env:
`No module named 'smithy_aws_core.credentials_resolvers'`). The backend correctly emits an
`error` with `fallback:true` and closes the WS — that degradation is by design.

But the **frontend leaves the voice toggle stuck "on"** afterward. `ChatPage` uses a
`VoiceState` of `off | connecting | live | error`, and on failure sets `voice='error'`,
which is mishandled:

- The voice panel renders whenever `voice !== 'off'`, so the orb/visualiser **stays visible**
  in the `error` state ("voice still showing on").
- The button label for `error` is **"Voice off"** (implying voice is running), but its
  `onClick` falls through to **`startVoice`** (since `error` is neither `live` nor
  `connecting`) — so the label and action contradict each other.

Net: after voice fails, the UI looks like voice is active, with a button that claims to
turn it off but actually re-starts it.

---

## Solution

Drop the stuck `error` UI state. On any voice failure, revert `voice` to `off` (collapsing
the orb and returning the button to "🎙 Start voice"); the explanatory message already
renders independently via the existing `error` banner ("Voice unavailable (…). You can keep
chatting by text."). So the user clearly sees voice is off, reads why, and can retry.

- `VoiceState` becomes `off | connecting | live`.
- `onError` and the `start()` `catch` set `voice='off'` (was `'error'`) and still `setError(...)`.
- Remove the now-unreachable `error` branch in `voiceLabel`.

agent5-only — the template has no voice feature (no `frontend/src/voice/`).

---

## Scope

### In scope

- `demos/demo0/agents/agent5/frontend/src/pages/ChatPage.tsx` — voice state handling.

### Not in scope

- The `smithy_aws_core` / `aws-sdk-bedrock-runtime` dependency itself (a Bedrock voice SDK
  version issue; enabling real voice is a separate dependency/architecture change requiring
  its own spec per `docs/tech_stack.md`). Text fallback is the intended behaviour.
- `agentx_v2_0` template (no voice).

---

## Architecture impact

None. Frontend-only, agent5-only.

---

## Implementation Checklist

- [x] `VoiceState = 'off' | 'connecting' | 'live'`.
- [x] `onError`: `setVoice('off')`; keep `setError(...)` and client teardown.
- [x] `start()` `catch`: `setVoice('off')`; keep `setError(...)`.
- [x] Remove the `error` case from `voiceLabel`.
- [x] `npx tsc --noEmit` clean.

---

## Verification

1. With voice unavailable (current env), open Chat and click **🎙 Start voice**.
2. Confirm: orb panel collapses back, the button returns to "🎙 Start voice" (not "Voice
   off"), and the banner reads "Voice unavailable (…). You can keep chatting by text."
3. Text chat still works; clicking Start voice again retries cleanly.
