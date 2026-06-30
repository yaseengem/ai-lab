# Spec: Fix chat 500 — duplicate `session_id` to `update_session`

**Status:** done
**Version:** v1
**Date:** 2026-07-01

---

## Problem

The first chat turn for a brand-new chat session 500s:

```
TypeError: Service.update_session() got multiple values for argument 'session_id'
```

`update_session(self, session_id: str, **kwargs)` is called by the chat route with
`session_id` **both positionally and as a keyword**:

```python
service.update_session(session_id, session_id=session_id, persona=req.persona, …)
```

So Python receives two values for `session_id`. The route only hits this branch when
`get_session(session_id) is None` (i.e. the very first message of a chat session), which
is why it surfaced only once auth started passing.

This is in the **`agentx_v2_0` template** (`apis/routes.py`) and inherited by **agent5** —
meaning the template's first-chat path has never worked. (The browser also shows a CORS
error for this request; that is a symptom — a 500 raised before the CORS middleware adds
headers — and disappears once the 500 is fixed.)

---

## Solution

Two-part, so the crash is fixed *and* the original intent (record `session_id` in the
chat-session meta) is preserved:

1. **Route:** drop the redundant `session_id=session_id` keyword — pass it positionally only.
2. **Service:** make `update_session` always stamp `session_id` into the persisted meta, so
   the field is guaranteed present and a caller can never double-pass it again.

```python
def update_session(self, session_id: str, **kwargs) -> None:
    meta = self.get_session(session_id) or {}
    meta.update(kwargs)
    meta["session_id"] = session_id   # always recorded; can't be double-passed
    self._sessions[session_id] = meta
    _write_json(SESSIONS_DIR / f"{session_id}_meta.json", meta)
```

Fix the **template** first, then mirror to agent5.

---

## Scope

### In scope

- `demos/demo0/agents/agentx_v2_0/apis/routes.py` + `…/agent5/apis/routes.py` — chat route,
  remove duplicate kwarg.
- `demos/demo0/agents/agentx_v2_0/apis/service.py` + `…/agent5/apis/service.py` —
  `update_session` stamps `session_id`.

### Not in scope

- `agentx_v1_0` (frozen).
- The SES auth gate / 401 handling (separate spec).
- Any other `update_session` caller (they pass only `**kwargs`, already correct; the
  service hardening keeps them working).

---

## Architecture impact

None. Behavioural fix inside an existing route + service method, mirrored template → agent.

---

## Implementation Checklist

- [x] Template `service.py`: `update_session` stamps `session_id`.
- [x] Template `routes.py`: drop `session_id=session_id` from the chat `update_session` call.
- [x] agent5 `service.py`: same as template.
- [x] agent5 `routes.py`: same as template.
- [x] Run agent5 test suite from `demos/demo0` — 21 passed.

---

## Verification

1. Verified session; open Chat; send the first message of a fresh session.
2. Confirm `POST /chat/{id}` returns 200 and streams (no 500, no `TypeError`, no CORS error).
3. `GET /sessions` shows the chat session with a populated `session_id`.
