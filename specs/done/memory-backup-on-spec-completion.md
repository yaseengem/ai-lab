# Spec: Memory backup into the repo on spec completion
**Status:** done
**Version:** v1
**Date:** 2026-06-22
**Owner:** Yaseen Mohammed

---

## Problem

Claude's per-project memory lives outside the repo at
`~/.claude/projects/c--pro-active-ai-lab/memory/` (user-local, not version-controlled).
If that profile directory is lost, reset, or the user switches machines, the accumulated
memory (workflow rules, feedback, context) is gone — there is no recoverable copy and no history.

---

## Solution

Keep a **versioned backup of the memory folder inside the repo**, refreshed as part of the
spec close-out routine. The repo copy is a mirror, not the source of truth — Claude still
reads/writes the live memory under `~/.claude/...`; the repo copy exists for recovery and history.

- Backup location: `memory-backup/` at the repo root.
- Backup contents: the **entire** memory folder (`MEMORY.md` + every `*.md` memory file) — the
  index alone is useless without the files it references.
- Trigger: as a step in the spec close-out gate (see [[spec-lifecycle-workflow]]), i.e. **after
  every spec completion**, before/with the git push.

---

## Scope

### In scope

- A `memory-backup/` folder at repo root containing a copy of the live memory directory.
- A `memory-backup/README.md` noting it is a mirror (do not edit by hand; source is `~/.claude/...`).
- Extending the spec-lifecycle close-out routine to refresh this backup on every spec completion.

### Not in scope

- Any automated/scheduled mechanism (cron, hooks) — there is no deterministic "spec completed"
  event; the refresh is a manual close-out step Claude performs.
- Gitignoring the backup — it is intentionally committed so it travels with the repo and has history.
  (If the user later wants local-only, add `memory-backup/` to `.gitignore` instead.)

---

## Architecture impact

New top-level `memory-backup/` folder. No code, ports, or dependencies. Documentation/artifact only.
The backup is committed and pushed by the existing close-out gate, so memory content becomes
version-controlled — acceptable per the user's explicit request.

---

## Implementation Checklist

- [ ] Create `memory-backup/` at repo root
- [ ] Copy the full live memory folder (`MEMORY.md` + all memory files) into `memory-backup/`
- [ ] Add `memory-backup/README.md` explaining it is a generated mirror
- [ ] Update `spec-lifecycle-workflow` memory: add "refresh `memory-backup/` from live memory" to the close-out gate
- [ ] On completion: propose git push + close this spec (move to `specs/done/`), which itself triggers a final backup refresh

## Verification

1. `memory-backup/` exists and contains `MEMORY.md` plus one file per live memory.
2. `diff` of `memory-backup/` vs the live memory folder shows no content differences.
3. The close-out step in `spec-lifecycle-workflow` memory mentions the backup refresh.
