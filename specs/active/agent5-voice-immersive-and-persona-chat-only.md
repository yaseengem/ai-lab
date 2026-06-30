# Spec: agent5 — Immersive voice stage + chat-only personas
**Status:** approved
**Version:** v1
**Date:** 2026-07-01

---

## Problem

agent5 (Trianz Concierge) is a voice-first front door, but its voice mode is a small
panel wedged between the header and the transcript — it does not feel like a dedicated
voice experience. We also want a clearer signal of *who* is talking, and the Prospect /
Sales personas currently see platform pages (Command center, Processing, Memory, Test
runner) that are operator concerns, not customer-facing.

---

## Solution

1. **Immersive voice stage** — when the user starts voice, the snowflake panel enlarges
   into a highlighted hero stage that stays until they exit voice. The transcript stays
   in a scrollable region and the chat input stays pinned (always visible).
2. **Richer snowflake** — more strands (arms + branches); a *grey* monochrome snowflake
   with a sharp jitter while the **user** speaks, and a **multi-coloured** snowflake with
   a smooth rotating pulse while the **AI** speaks. Distinct motion per speaker.
3. **Chat-only personas** — Prospect (`visitor`) and Trianz Sales (`sales`) see **only
   Chat**. Administrator keeps all pages.

---

## Scope

### In scope

- `agent5/frontend/src/voice/SnowflakeVoice.tsx` — more arms/branches, per-arm colours,
  grayscale-on-user, distinct user vs AI vibration.
- `agent5/frontend/src/pages/ChatPage.tsx` — enlarged highlighted voice stage; transcript
  scrolls; input pinned.
- `agent5/frontend/src/components/Ribbon.tsx` — hide the page sidebar when a persona has a
  single visible page (clean chat-only view).
- `agent5/agent.config.yaml` — `visitor` and `sales` `visible_pages` → `[chat]`.

### Not in scope

- Backend / voice protocol changes; other agents; theme changes.

---

## Architecture impact

No new files, ports, or dependencies. Light theme preserved. Persona visibility remains
declared in `agent.config.yaml` and filtered by the Ribbon (a chosen view, not auth).

---

## Implementation Checklist

- [x] Snowflake: 12 arms + extra branches; per-arm rainbow palette; grayscale while user
      speaks; distinct user (sharp jitter, no spin) vs AI (smooth rotate + pulse) motion.
- [x] ChatPage: enlarged highlighted voice stage shown for the whole voice session;
      transcript scrollable; input pinned.
- [x] Ribbon: hide sidebar when only one page is visible.
- [x] agent.config.yaml: `visitor` and `sales` → `visible_pages: [chat]`.
- [x] Barge-in: stop AI speech when the user interrupts. Backend forwards Nova Sonic's
      `INTERRUPTED` signal (`contentEnd.stopReason` + `{"interrupted":true}` marker);
      client tracks scheduled audio sources and flushes them on the server signal AND on
      local mic-level detection; mic uses echo cancellation to avoid false barge-ins.
- [x] Scroll: only the transcript scrolls — chat header and input are pinned
      (`flexShrink:0` on header/input, `minHeight:0` on the scroll region).

---

## Verification

- As Prospect and as Sales: only Chat is reachable; no sidebar clutter.
- As Administrator: all pages still present.
- Start voice → large highlighted snowflake; speaking turns colour grey (you) vs
  multi-colour (AI) with different motion; transcript scrolls; input always visible;
  exit voice returns to the normal chat layout.
