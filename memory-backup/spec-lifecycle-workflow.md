---
name: spec-lifecycle-workflow
description: "Always spec-first before any change; at end of dev, propose git push AND close the spec — keep going until both done"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 3d6772e8-407a-4a39-9d89-429d2f1cf39f
---

For every change the user asks for in this repo, follow this lifecycle:

1. **Before starting any change: create a spec first.** Copy `specs/_template.md`, fill it in, and save it under `specs/active/` (or `specs/backlog/` if not scheduled). Do this even in auto/Edit mode when NOT in plan mode. There is **no separate plan file** — the spec *is* the plan. Don't begin editing code until the spec exists.
2. **Once development is complete, do not consider the task finished until all of these are done:**
   - **Refresh the memory backup** — copy the full live memory folder (`MEMORY.md` + all memory files) into the repo's `memory-backup/` so it mirrors the current state.
   - **Propose a git push** (commit + push the work, including the refreshed `memory-backup/`).
   - **Close the spec in context** — set its `Status:` to `done` and move it to `specs/done/`.
   Keep prompting/driving toward these until they're all actually done.

**Why:** The user wants spec-first traceability on every change without the overhead of a separate plan doc, plus a consistent session close-out (push + spec done) so work is never left dangling. This extends the repo's "no code without an approved spec" rule with explicit start and finish gates.

**How to apply:** At the START of a change request → write the spec to `specs/active/` before touching code. At the END of development → explicitly propose `git push` and reclassify the spec to `done/`; treat the task as open until both happen. Spec folder/status conventions: see `specs/README.md` and [[demo0-brand-name]] context for repo norms.
