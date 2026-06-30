# Spec: agent5 — fix Nova Sonic credentials import (smithy-aws-core 0.7.0)

**Status:** done
**Version:** v1
**Date:** 2026-07-01

---

## Problem

Starting a voice session fails at the WS with:

```
No module named 'smithy_aws_core.credentials_resolvers'
```

`agentic/sonic_session.py` imports:

```python
from smithy_aws_core.credentials_resolvers.environment import EnvironmentCredentialsResolver
```

But the installed `smithy-aws-core==0.7.0` (matching `aws-sdk-bedrock-runtime==0.7.0`) has
no `credentials_resolvers` submodule — the resolver moved to `smithy_aws_core.identity`
(`identity/environment.py`, re-exported from `identity/__init__.py`). The old path was from
an earlier pre-release. So every voice start raises ImportError and degrades to text.

Verified in `.venv`: `from smithy_aws_core.identity.environment import
EnvironmentCredentialsResolver` imports, instantiates no-arg, and the
`aws_sdk_bedrock_runtime` client/config imports still resolve.

---

## Solution

Update the import to the current path. No dependency change (the package is already
installed at 0.7.0; this aligns code to it):

```python
from smithy_aws_core.identity.environment import EnvironmentCredentialsResolver
```

Constructor and usage (`aws_credentials_identity_resolver=EnvironmentCredentialsResolver()`)
are unchanged. This clears the import blocker; whether audio fully streams then depends on
AWS creds + Nova Sonic model access at runtime (still degrades to text if absent, by design).

---

## Scope

### In scope

- `demos/demo0/agents/agent5/agentic/sonic_session.py` — the resolver import path.

### Not in scope

- Version pinning (current pins are consistent at 0.7.0; pinning smithy backward would
  fight `aws-sdk-bedrock-runtime`). If we later want to lock versions, that's a separate
  `requirements.txt` change.
- `agentx_v2_0` template (no voice feature).
- Runtime AWS credential / model-access configuration.

---

## Architecture impact

None. One import-path correction against an already-installed SDK.

---

## Implementation Checklist

- [x] Change the import in `sonic_session.py` to `smithy_aws_core.identity.environment`.
- [x] Confirm the module imports cleanly (`python -c "import agents.agent5.agentic.sonic_session"`
      from `demos/demo0`) — OK.
- [x] Run agent5 test suite — 21 passed.

---

## Verification

1. Restart agent5; click **Start voice** in Chat.
2. Backend log no longer shows `No module named 'smithy_aws_core.credentials_resolvers'`.
   The session either goes live (if AWS creds + Sonic access are present) or fails on a
   *credentials/model* reason — not on the import.
