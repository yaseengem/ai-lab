# Specs

This folder is the authoritative record of what the AI Lab platform is,
what has been built, and what is planned.

## Process

1. New feature → create a spec file here first (copy `_template.md`)
2. Spec is reviewed and status set to `approved` before any code is written
3. Check off items in the Implementation Checklist as work progresses
4. When done, set status to `done` — the spec stays permanently as a decision record

## Status values

| Status | Meaning |
|--------|---------|
| `draft` | Being written, not ready for review |
| `approved` | Agreed, implementation can start |
| `in-progress` | Actively being implemented |
| `done` | Fully implemented and verified |
| `superseded` | Replaced by a newer spec (link to successor) |

## Files

| File | Description |
|------|-------------|
| `_template.md` | Blank spec to copy for new features |
| `v1-platform-restructure.md` | First spec: full platform restructure and UI overhaul |
| `backlog/` | Drafted specs not yet scheduled — the product roadmap |

## Golden rule

**No code without a spec.** If you can't point to a spec item for the change you're making, write the spec first.
