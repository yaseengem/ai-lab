# Spec: agent5 — fix barge-in (AI not interrupted) on Nova 2 Sonic

**Status:** approved
**Version:** v1
**Date:** 2026-07-01

---

## Problem

After switching agent5's voice model to Nova 2 Sonic (`amazon.nova-2-sonic-v1:0`), the AI no
longer stops talking when the user speaks over it (barge-in). The session itself works (the AI
responds), so the regression is specifically in interruption handling.

Root cause: the browser's local barge-in (`voiceClient.ts`) calls `stopPlayback()` once per
animation frame, which stops *already-scheduled* AI audio buffers. Nova 2 Sonic generates audio
**faster than real-time** and streams it in larger bursts than v1, so fresh `audioOutput` chunks
keep arriving from the still-generating model during the interruption and `playPcm()` immediately
schedules + starts them — the AI audibly continues between frames. Merely clearing the queue is
insufficient; in-flight chunks must be **dropped** for a short window after a barge-in.

---

## Solution

1. **Frontend (`voiceClient.ts`)** — introduce a barge-in suppression window. A single
   `bargeIn()` helper flushes scheduled audio (`stopPlayback`) and sets `suppressUntil`.
   `playPcm()` drops any audio chunk that arrives while the window is open, so trailing in-flight
   AI audio is discarded instead of played. Both the local (mic RMS) detector and the server
   `interrupted` event route through `bargeIn()`. Lower the local RMS threshold slightly so the
   user reliably trips it through echo cancellation.
2. **Backend (`sonic_session.py`)** — set Nova 2's `turnDetectionConfiguration`
   (`endpointingSensitivity: HIGH`) in `sessionStart` so the model switches to listening (and
   emits the interruption signal) promptly. Add a log line when an interruption is detected
   (via the `{"interrupted":true}` textOutput marker or `contentEnd` `stopReason: INTERRUPTED`)
   to confirm the server-side signal during testing.

Both interrupt-detection paths in the backend are kept (Nova 2 still emits the textOutput marker
per the official sample, and also `contentEnd` `INTERRUPTED` on TEXT content).

---

## Scope

### In scope

- `agent5/frontend/src/voice/voiceClient.ts` — suppression window + threshold.
- `agent5/agentic/sonic_session.py` — turn detection config + interrupt logging.

### Not in scope

- The text chat path, tools, other agents.
- Reverting the Nova 2 Sonic default (kept).

---

## Architecture impact

None — behavioural fix within agent5's existing voice loop. No new files/ports/deps.

---

## Implementation Checklist

- [x] `voiceClient.ts`: add `suppressUntil` + `bargeIn()`, drop suppressed chunks in `playPcm`,
      route local + server barge-in through it, lower RMS threshold (0.22 → 0.14).
- [x] `sonic_session.py`: add `turnDetectionConfiguration: {endpointingSensitivity: HIGH}` to
      `sessionStart`; log barge-in detection on both paths.

---

## Verification

- Restart agent5 (no `--reload`; relaunch the process) so it picks up the change.
- Start a voice session, let the AI talk, then speak over it: the AI audio stops promptly and
  stays stopped while you talk.
- `state/logs/agent.log` shows `[SONIC] barge_in_detected …` when the server detects it.
