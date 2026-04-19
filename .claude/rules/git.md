# Rule: Git

> Branch protection on `main` is real. Every commit goes through a PR. Every PR passes checks. Every merge is a squash.

---

## Branches

- `main` — production. Protected. No direct pushes, ever.
- `dev-tl` — personal long-running work branch. Current default. Regular feature work lives here until it's PR-ready.
- `feat/<short-name>` — feature branches cut from `dev-tl` or `main`. One task per branch.
- `fix/<short-name>` — bugfix branches.
- `chore/<short-name>` — dependency bumps, tooling, docs-only.

**Never:**
- `git push` to `main`.
- `git push --force` to any shared branch.
- `git commit --no-verify` — pre-commit hooks exist for a reason. Fix the underlying issue instead.
- `git rebase -i` when the branch is already pushed and other work may depend on it.

---

## Commits

- **Message format:** subject line ≤ 72 chars, imperative mood ("Add agent editor split view", not "Added..."), no trailing period.
- Optional body: wrap at 72, explain *why* more than *what*.
- Footer for `Co-Authored-By:` lines when multiple contributors (Claude counts).
- Each commit should be self-consistent: tests for the commit's code should pass at that commit.
- Prefer several focused commits over one mega-commit. A reviewer can always squash; they can't always un-squash.

---

## Pre-Commit

Hooks run:
1. `biome check --write .` on staged files (auto-format).
2. Typecheck on the affected package.
3. A git-branch guard blocking direct commits to `main`.

If a hook fails, DO NOT `--no-verify`. Fix the cause. If the hook is broken, update it via `claude-config-updater`.

---

## PR Flow

1. Push feature branch.
2. `gh pr create` with a descriptive title (subject-case, no trailing period).
3. PR body:
   - Summary (1–3 bullets).
   - Linked task file or issue.
   - Screenshots / recordings for UI changes.
   - Test plan (bulleted checklist).
4. Checks must pass: typecheck, lint, unit tests, e2e (when configured).
5. Reviewer approval (self-review counts for solo project, but run `cross-pr-reviewer` first).
6. **Squash merge only.** Merge commit messages use the PR title as subject.

---

## Hotfixes

1. Cut `fix/<name>` from `main` (not `dev-tl`).
2. Minimal scope — only the fix, no opportunistic refactors.
3. PR + self-review + merge.
4. `/branch-sync` merges `main` back into `dev-tl` immediately.

---

## Rebasing

- `git rebase main` onto a feature branch is FINE while the branch is yours alone.
- Never rebase a branch someone else may have checked out.
- Prefer `git merge main` into long-running branches (like `dev-tl`) over rebase, to preserve merge history.

---

## What Never Goes in Git

- `.env*` except `.env.example`.
- `node_modules/`, `dist/`, `out/`, `*.db`, `*.log`.
- Personal editor configs (unless in `.vscode/*.recommended.json`).
- `.claude/settings.local.json` — this is personal.
- `routeTree.gen.ts` — generated.
- Signed certificates, tokens, keychain exports.

---

## Co-Author Attribution

When Claude Code contributes to a commit via `/post-fix` or a direct edit workflow, include:

```
Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

in the commit footer. This makes provenance obvious in `git log`.

---

## Anti-Patterns

- Amending a pushed commit (rewrite history after push).
- Letting a branch drift > 2 weeks from `main` before merging.
- PRs that touch > 1 domain without a clear reason (split the PR).
- `git add -A` / `git add .` — stage specific files to avoid sweeping in `.env.local` or stray debug output.
- Git operations from any agent that isn't `/post-fix` — always route through the slash command.
