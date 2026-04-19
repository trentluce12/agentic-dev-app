---
description: Create or update a `.claude/rules/*.md` file. Invokes claude-config-updater for the diff proposal; nothing lands without user approval.
argumentHint: <rule-name or rationale>
---

You are running **Flow 5 — Claude Rules** (see `.claude/flows.md`).

## Steps

1. Read `.claude/rules/` to know the current set.
2. Invoke `claude-config-updater` with the request: `$ARGUMENTS`.
3. The agent:
   - Drafts the new rule file (or diff for an existing one).
   - Presents it to the user in diff form.
4. On user approval, the agent writes the file.
5. If the new rule warrants updating `CLAUDE.md`'s Rules Files table, include that in the same approval round.

## Do Not

- Write `.claude/rules/*` directly. Always through `claude-config-updater`.
- Create a rule file that duplicates an existing one. Propose amendments instead.
- Ship a rule without a concrete motivating example in `.claude/tasks/learnings.md` or the rationale argument.

## Output

```
CLAUDE RULES UPDATE
Rule file: .claude/rules/<name>.md
Action: <create | amend>
Applied: <yes | pending | rejected>
```
