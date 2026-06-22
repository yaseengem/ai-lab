# Specs

This folder is the authoritative record of what the AI Lab platform is,
what has been built, and what is planned.

## Process

1. New feature → copy `_template.md` into `backlog/` (or `active/` if scheduled now)
2. Spec is reviewed and status set to `approved` before any code is written; move it to `active/`
3. Check off items in the Implementation Checklist as work progresses
4. When done, set status to `done` and move it to `done/` — the spec stays permanently as a decision record

See [roadmap.md](roadmap.md) for the full index of every spec.

## Status values

| Status | Meaning |
|--------|---------|
| `draft` | Being written, not ready for review |
| `approved` | Agreed, implementation can start |
| `in-progress` | Actively being implemented |
| `done` | Fully implemented and verified |
| `superseded` | Replaced by a newer spec (link to successor) |

## Folder guide

Specs are filed by lifecycle — the folder a spec lives in always matches its status.

| Path | Holds |
|------|-------|
| `_template.md` | Blank spec to copy for new features |
| `roadmap.md` | Single index of every spec, grouped by status |
| `backlog/` | `draft` — drafted but not yet scheduled (the product roadmap) |
| `active/` | `approved` / `in-progress` — being worked now |
| `done/` | `done` / `superseded` — shipped, frozen decision records |

Reference docs that describe the system *as it is now* (always-current, not point-in-time)
live in [`docs/`](../docs/), not here. Specs record *why* a decision was made; `docs/` records *what is true today*.

## Golden rule

**No code without a spec.** If you can't point to a spec item for the change you're making, write the spec first.
