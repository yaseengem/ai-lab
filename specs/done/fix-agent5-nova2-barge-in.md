# Spec: agent5 — fix barge-in (AI not interrupted) on Nova 2 Sonic

**Status:** done
**Version:** v4
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

## Follow-up (v2): REVERTED — broke barge-in

**Attempt.** To fix the clipped opening words, v2 made the server `interrupted` handler
**clear** suppression (`stopPlayback()` + `suppressUntil = 0`) instead of arming the window, and
lowered `BARGE_IN_SUPPRESS_SEC` 0.5 → 0.3, on the assumption that `interrupted` is a clean turn
boundary (everything after it = new turn).

**Why it was wrong.** That assumption is false for Nova 2. The model streams audio **faster than
real-time**, so trailing chunks of the *interrupted* turn keep arriving **after** the `interrupted`
signal (confirmed: `state/logs/agent.log` logs `barge_in_detected` reliably, yet audio continued).
Clearing suppression on `interrupted` let those trailing chunks play → **the AI no longer stopped on
barge-in.** The clipped-opening symptom also persisted, proving it has a *different* root cause than
the suppression re-arm. v2 was reverted; barge-in (0.5 s window, `interrupted` → `bargeIn()`) is
restored to the known-good v1 behaviour.

## Follow-up (v3): turn-boundary suppression — fixes BOTH symptoms

**Symptoms confirmed with the user.** (a) Barge-in "keeps talking / resumes" — the AI doesn't stay
stopped. (b) First 1–2 words of every reply are clipped. (There is no AI-first greeting today, so
every AI utterance is a reply after the user speaks — see the separate greeting-first item below.)

**Root cause — a timer cannot win.** After a barge-in, Nova 2 (faster-than-real-time) keeps streaming
trailing chunks of the *interrupted* turn for an **unknown** duration, and the *new* turn's opening
chunks follow. A fixed suppression window can't separate them: too short → the interrupted turn
resumes ("keeps talking"); too long → the new turn's opening is dropped ("first words clipped"). v1's
0.5 s was simultaneously too short for (a) and long enough to cause (b). We need the model's real
turn boundary, not a guess-timer.

**Fix (backend + frontend).**

1. **Backend (`sonic_session.py`)** — in `_read_loop`, handle `contentStart` for ASSISTANT AUDIO and
   forward `{"type": "speech_start"}`. By stream order this is the first event of the *new* spoken
   turn (after the interrupted turn's `contentEnd`), so all trailing old-turn audio precedes it. Log
   `[SONIC] assistant_audio_start` so we can **confirm Nova 2 emits it** before trusting it live.
2. **Frontend (`voiceClient.ts`)** — after a barge-in, **drop all** AI audio until `speech_start`
   (the boundary), then play from there. `suppressUntil` becomes a long **fallback** (only used if
   `speech_start` never arrives — prevents permanent silence); `speech_start` sets `suppressUntil = 0`
   to release at the true boundary. This drops *all* trailing audio (fixes "keeps talking") and plays
   the new turn from its first word (fixes the clip).

### Checklist (v3)

- [x] `sonic_session.py`: forward `speech_start` on ASSISTANT AUDIO `contentStart` + log `assistant_audio_start`.
- [x] `voiceClient.ts`: handle `speech_start` → `suppressUntil = 0`; raise fallback window to 1.5 s.
- [x] `voiceClient.ts`: 60 ms startup lead in `playPcm` so a cold AudioContext doesn't clip the opening.

### Verification (v3)

- Relaunch agent5 (backend change, no `--reload`) and rebuild/refresh the frontend.
- Talk over the AI: it stops and **stays** stopped; its next reply plays from the first word.
- `state/logs/agent.log` shows `[SONIC] assistant_audio_start` at the start of each spoken reply —
  if it does **not**, the boundary signal isn't firing and we fall back to tuning the window.

## Follow-up (v4): AI greets first

The user wants the AI to **speak first** when a voice session opens. Nova Sonic only generates after a
USER turn, so on connect (after `start()`, before `begin_audio()`) the backend sends a short USER
**text** cue ("(The visitor just joined…)") via a new `SonicSession.greet()`; a `=== GREETING ===`
directive appended in `_voice_system_prompt` turns that into a brief spoken welcome. The TEXT turn
opens and closes before the mic AUDIO block, so only one USER content block is ever open.

### Checklist (v4)

- [x] `sonic_session.py`: add `greet()` (USER text cue → spoken welcome) + `greeting_kickoff_sent` log.
- [x] `routes.py`: append `=== GREETING ===` directive; call `sess.greet()` between start and begin_audio.

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
