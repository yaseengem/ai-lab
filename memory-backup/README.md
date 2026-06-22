# memory-backup

**Generated mirror — do not edit by hand.**

This folder is a versioned backup of Claude's per-project memory, whose source of truth lives
*outside* the repo at:

```
~/.claude/projects/c--pro-active-ai-lab/memory/
```

Claude reads and writes the live memory there. This repo copy exists only for **recovery and
history** — it is refreshed as part of the spec close-out routine (after every spec completion),
per the `spec-lifecycle-workflow` memory and `specs/done/memory-backup-on-spec-completion.md`.

To restore: copy these files back into the live memory directory above.
