# Trianz knowledge content

Drop Trianz pages here as **`.md`, `.txt`, or `.html`** files. On startup the agent
ingests every file in this folder (recursively) into a lightweight keyword index
(`state/index/knowledge.json`, rebuildable) and exposes them to the concierge via the
`search_trianz_knowledge` tool. The short overview in `00-overview.md` also seeds the
agent's opening pitch.

**This folder is git-tracked** (part of the agent's definition, like `seeds/`), so the
knowledge ships with the agent. To refresh:

1. Add / edit files here.
2. Restart the agent (or call `POST /admin/restart`) — the index rebuilds on boot.

Keep each file focused on one topic (one offering, one industry, one platform module),
with a clear `# Title` heading on the first line — titles are used as citation labels.
