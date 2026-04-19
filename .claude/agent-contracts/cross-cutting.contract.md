# Cross-Cutting Contract

> Cross-cutting agents (code review, docs sync, deep review, config updater) run OUTSIDE the main implementation pipeline. They audit, review, or propose — they don't decide scope or re-open design questions.

---

## Hard Rules

1. **Run only after the main pipeline** (all domain leads COMPLETE) — except `claude-config-updater`, which is invoked explicitly by the user or orchestrator at any time.
2. **Read-only on implementation code** (cross-pr-reviewer, lead-deep-review). `cross-docs-sync` may edit JSDoc, READMEs, and `docs/`. `claude-config-updater` may edit `.claude/*` and `CLAUDE.md` only after user approval.
3. **Never re-open settled design decisions.** If a design choice was resolved upstream (in `monorepo-task-planner`, orchestrator, or user input), accept it. Flag concerns as observations, not blockers.
4. **Scope is limited to changed files + one import hop.** Don't audit the whole repo — audit the diff and its direct callers.
5. **Produce a structured report, not free prose.** Reviews have sections: Findings, Severity, Suggestions, Blockers (if any).
6. **Never invoke other agents** except as documented for your specific agent (e.g., `claude-config-updater` may invoke `meta-contract-writer` when updating contracts).
7. **Learnings-aware.** Read `.claude/tasks/learnings.md` before reviewing — apply the extracted pitfalls as a checklist.

---

## Invocation Timing

| Agent | Invoked by | When |
|---|---|---|
| `cross-pr-reviewer` | orchestrator at end of `/implement`, or via `/task-review` | After qa-lead COMPLETE |
| `lead-deep-review` | orchestrator at end of `/implement` | Between qa-lead and `cross-pr-reviewer` |
| `cross-docs-sync` | `/task-closeout` | During closeout, after tests pass |
| `claude-config-updater` | user or orchestrator explicitly | Never auto; always requires user approval of the diff |

---

## Scope Rules

- **Files in scope:** every file in the git diff since task branch origin.
- **Files in scope (one hop):** direct importers of any changed exported symbol.
- **Files NEVER in scope:** `node_modules/`, `dist/`, `out/`, `drizzle/migrations/` (migrations are reviewed at creation, not at PR time).

When unclear, scope narrower, not wider. A cross-cutting agent that auditss the whole repo produces useless noise.

---

## Report Format

```
CROSS-CUTTING REPORT
Agent: <name>
Task: <task_id>
Files audited: <count>
Findings:
  - [BLOCKER] <path:line> — <one line>
  - [HIGH]    <path:line> — <one line>
  - [MEDIUM]  <path:line> — <one line>
  - [LOW]     <path:line> — <one line>
  - [NIT]     <path:line> — <one line>
Pattern observations: <cross-file findings, or "none">
Suggestions for learnings.md: <bullets, or "none">
Blockers for proceed: <list, or "none">
```

**Severity guide:**
- `BLOCKER` — incorrect behavior, security issue, data loss risk, broken contract. Pipeline stops.
- `HIGH` — correctness risk, missing critical validation, obvious bug. Should fix before merge.
- `MEDIUM` — maintainability concern, code smell, partial coverage. Fix if quick; otherwise file a follow-up.
- `LOW` — style inconsistency or minor improvement.
- `NIT` — entirely subjective; mention but don't block.

---

## Independence Rules

1. Cross-cutting agents do NOT coordinate with each other. Each produces its own report; the orchestrator synthesizes.
2. If two cross-cutting agents disagree, flag both findings to the user — don't pick a winner.
3. Cross-cutting agents never escalate to leads — their only upstream is the orchestrator.

---

## Hard Boundaries

- ✅ Read any file in the repo.
- ✅ `cross-docs-sync` may edit `README.md`, `docs/`, JSDoc comments only.
- ✅ `claude-config-updater` may edit `.claude/*` and `CLAUDE.md` only after the user approves the diff.
- ❌ All other cross-cutting agents are read-only.
- ❌ Never invoke leads or implementers.
- ❌ Never modify task files or contracts directly.
