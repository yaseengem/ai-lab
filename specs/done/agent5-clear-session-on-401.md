# Spec: agent5 — clear session and re-gate on 401

**Status:** done
**Version:** v3
**Date:** 2026-07-01

> v2: the v1 redirect was too abrupt (jumped to login with no explanation).
> `handleUnauthorized` now sets a one-shot `reauth` flag in sessionStorage; the auth
> gate reads-and-clears it (`consumeReauthNotice`) and shows "Your session expired —
> please verify your work email again." Files: `auth.ts` (flag + `consumeReauthNotice`),
> `pages/AuthGatePage.tsx` (notice banner on the email step). tsc clean.
>
> v3: extend re-gating to the **voice WS** (the v1 "not in scope" follow-up). With a stale
> token the WS sent `{type:error, message:"not verified", fallback:false}`, which the UI
> showed as a dead-end raw "not verified" with no way to re-auth. Backend now tags it
> `code:"unauthorized"`; `voiceClient` passes the `code` through to `onError`; `ChatPage`
> calls `handleUnauthorized()` on `code==='unauthorized'` — same clear+redirect as HTTP.
> Files: `apis/routes.py` (voice WS error payload), `voice/voiceClient.ts` (onError code arg),
> `pages/ChatPage.tsx` (handle unauthorized). agent5-only (voice is agent5-only).

---

## Problem

agent5's SES email-OTP gate stores a verified-session token in `localStorage`; gated
calls (`/chat`, `/run`, voice WS) send it as `X-Auth-Token`. The frontend gates only on
the token's **presence**:

```ts
// auth.ts
export function isVerified(): boolean { return !!getToken() }
```

When the server-side session is gone (12h TTL expiry, or `state/auth/` was empty for this
instance), the server returns **401** but the UI still believes it is verified — and
**nothing calls `clearSession()` on a 401**. `apiFetch` and `streamChat` just `throw`.
Result: the app renders the chat screen while every gated call fails with 401, the user
sees a generic error, and there is no path back to the email gate. The `auth.ts` comment
claims "a 401 clears it," but that wiring was never implemented.

(Confirmed not a regression from the restart fix — sessions are durable files under
`state/auth/`; restart/setup do not clear them.)

---

## Solution

Add a single `handleUnauthorized()` helper that `clearSession()`s and forces the app back
to `/auth`, and call it from every place that gets a 401 from the server:

- `apiFetch` (generic JSON calls),
- `streamChat` (the POST + ReadableStream chat path — not routed through `apiFetch`).

Voice WS auth failures are out of scope here (the WS already emits an `error`/`fallback`;
a follow-up can map its close code to the same helper).

```ts
// auth.ts
export function handleUnauthorized(): void {
  clearSession()
  if (typeof window !== 'undefined' && window.location.pathname !== '/auth') {
    window.location.assign('/auth')   // full reload back through the SES gate
  }
}
```

A hard `window.location` redirect is acceptable: the token is invalid, the client lives
outside React Router, and this is a demo gate. `isVerified()` stays as the cheap first-load
gate; the 401 handler is the correction when a present token is stale.

---

## Scope

### In scope

- `demos/demo0/agents/agent5/frontend/src/auth.ts` — add `handleUnauthorized()`.
- `demos/demo0/agents/agent5/frontend/src/api/client.ts` — call it on 401 in `apiFetch`
  and `streamChat`.

### Not in scope

- The `agentx_v2_0` template (the SES gate is an agent5-specific departure; template has
  no such gate — nothing to propagate).
- Voice WS 401/close-code handling (follow-up).
- Any backend / auth.py change — the 401 itself is correct behaviour.

---

## Architecture impact

None. Frontend-only, agent5-only. No new files, deps, or ports.

---

## Implementation Checklist

- [x] Add `handleUnauthorized()` to `auth.ts`.
- [x] In `client.ts` `apiFetch`: on `res.status === 401`, call `handleUnauthorized()`
      before throwing.
- [x] In `client.ts` `streamChat`: on `res.status === 401`, call `handleUnauthorized()`
      before throwing.
- [x] `npx tsc --noEmit` on the agent5 frontend — clean.

---

## Verification

1. Verify (email → code → token in localStorage), then make the server-side session
   invalid (wait out TTL, clear `state/auth/`, or hand-edit the localStorage token).
2. Open Chat and send a message.
3. Confirm the app clears the token and redirects to `/auth` (the email gate) instead of
   showing a stuck 401 error.
4. Re-verify; confirm `/chat` works and carries `X-Auth-Token`.
