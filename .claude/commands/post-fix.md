---
description: Commit + push + open PR after an /implement run. The ONLY path for git write operations in the agent system.
argumentHint: <optional PR title override>
---

Commit, push, and open a PR.

## Pre-flight

1. Run `git status` — ensure we're on a feature branch (not `main`, not `dev-tl` direct).
2. Run `git diff --cached` and `git diff` to see what's staged and unstaged.
3. Read the task file associated with the branch if it exists (in `.claude/tasks/`).

## Steps

1. If there are unstaged changes, prompt the user which files to stage. NEVER run `git add -A` or `git add .` blindly — .env or stray debug output could be swept in.
2. Draft a commit message following `.claude/rules/git.md`:
   - Subject line ≤72 chars, imperative, no trailing period.
   - Body explains WHY (not WHAT), wrapped at 72.
   - Footer includes `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>` if Claude contributed.
3. Create the commit.
4. Push: `git push -u origin <branch>`.
5. Open PR via `gh pr create --title "<title>" --body "$(cat <<'EOF' ... EOF)"`:
   - Title from task file or `$ARGUMENTS`.
   - Body: Summary (bullets), linked task file, test plan (checklist), screenshots/recordings for UI tasks.
6. Return the PR URL to the user.

## Hard Rules

- NEVER push to `main` directly.
- NEVER `git commit --no-verify`. If a pre-commit hook fails, FIX THE CAUSE.
- NEVER amend a pushed commit.
- NEVER force-push to a shared branch.
- NEVER `git add -A` / `git add .`.

## Output

```
POST-FIX COMPLETE
Branch: <branch>
Commit(s): <count>
Pushed: yes
PR: <url>
Checks: <status>
Next: wait for CI; then `/task-review` for a final review round, or proceed to merge.
```
