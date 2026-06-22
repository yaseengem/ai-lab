---
name: ui-casing-restraint
description: "Don't aggressively re-case established/professional UI labels when polishing copy"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 84640c98-2adb-4890-b026-c13d2ccc6724
---

When polishing UI copy for professionalism, do NOT do wholesale Title Case → sentence case conversion on labels that already read as professional/established (e.g. "Approval Required", "Human Approval Required", "Operations Command Center", "Settlement Watchlist"). The user stopped a broad recasing pass on the agent4 frontend for this reason.

**Why:** Forcing established status/action/section terms into sentence case makes them read worse, not more professional. Capitalization consistency matters less than not degrading good labels.

**How to apply:** Leave existing capitalization alone unless it's a genuine defect — e.g. a lowercase button word ("clear" → "Clear") or a stray ALL-CAPS string used inconsistently as a table column header among Title Case headers ("CRITICAL" → "Critical"). Focus copy-polish effort on removing decorative emoji, replacing debug/backend strings, and fixing casual wording instead. See [[ui-professional-polish]] spec at specs/ui-professional-polish.md.
