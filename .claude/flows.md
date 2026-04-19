# Flows

> Six flows. Each has its own slash command. All work routes through one of them.

---

## Flow Map

```
                 ┌───────────────────────┐
                 │   1. Frontend Design  │   (optional, UI-only)
                 │   /frontend-design    │
                 └──────────┬────────────┘
                            │ (feeds task planning)
                            ▼
┌───────────────────────────────────────────────────────────┐
│ 2. Task Planning — /task-plan                             │
│                                                           │
│   monorepo-task-planner                                   │
│     → writes .claude/tasks/<name>.md                      │
│     → (if new IPC/schema fields) meta-contract-writer     │
│       → writes .claude/contracts/<name>.md                │
│     → updates .claude/tasks/task-history.md               │
└──────────────────────────┬────────────────────────────────┘
                           │ HARD BREAK — user reviews task file
                           ▼
┌───────────────────────────────────────────────────────────┐
│ 3. Implementation — /implement <task-name>                │
│                                                           │
│   branch-sync                                             │
│   orchestrator                                            │
│     ├─ lead-shared      (packages/schemas, claude-protocol)│
│     ├─ lead-main        (Electron main)                   │
│     ├─ lead-renderer    (React renderer)                  │
│     ├─ lead-qa          (Vitest + Playwright)             │
│     ├─ lead-infra       (electron-vite / builder / CI)    │
│     ├─ lead-deep-review (5-lens deep analysis)            │
│     └─ cross-pr-reviewer                                  │
│                                                           │
│   soft prompt → /post-fix                                 │
└──────────────────────────┬────────────────────────────────┘
                           │ soft gate — user accepts
                           ▼
┌───────────────────────────────────────────────────────────┐
│ 4. Task Closeout — /task-closeout                         │
│                                                           │
│   extract learnings → .claude/tasks/learnings.md          │
│   cross-docs-sync                                         │
│   archive .claude/tasks/<name>.md                         │
│   invoke /improve-claude if learnings suggest             │
└───────────────────────────────────────────────────────────┘

        ┌─────────────────────────┐   ┌─────────────────────────┐
        │ 5. Claude Rules          │   │ 6. Folder Improvement    │
        │ /claude-rules            │   │ /improve-claude          │
        │                          │   │                          │
        │ Create/update a rule file│   │ Propose .claude/ changes │
        │ via claude-config-updater│   │ via claude-config-updater│
        └─────────────────────────┘   └─────────────────────────┘
```

---

## Flow 1 — Frontend Design `/frontend-design`

**Purpose:** UI prototyping against design references. No production code lands from this flow.

**Steps:**
1. Open a scratch workspace (temp branch or local folder).
2. Invoke a design agent (future: `lead-design`) with references: screenshots, notes, competitor flows.
3. Produce one or more `.tsx` mocks as throwaway components.
4. Hand results to the user; user decides what becomes a task.

**Exits to:** `/task-plan` when the user commits to shipping something.

---

## Flow 2 — Task Planning `/task-plan`

**Purpose:** Produce a complete, user-reviewable task file. Nothing ships from this flow.

**Steps:**
1. Invoke `monorepo-task-planner` with the user's intent.
2. Planner classifies the task:
   - **Design-first?** If UI novelty is high, planner requires a `/frontend-design` pass first and stops.
   - **Contract-needed?** If new IPC channels or cross-layer fields exist, planner notes the requirement.
3. Planner writes `.claude/tasks/<task-name>.md` with: Goal, Scope, Files expected, Rules to read, Acceptance criteria, Dependencies.
4. If contract-needed: invoke `meta-contract-writer` to write `.claude/contracts/<task-name>.md`.
5. Append a row to `.claude/tasks/task-history.md`.

**Hard break:** user reviews and approves the task file before `/implement` runs.

---

## Flow 3 — Implementation `/implement <task-name>`

**Purpose:** Execute a task file end-to-end.

**Steps:**
1. `/branch-sync` — ensure branch is up-to-date with `dev-tl` or `main` as appropriate.
2. Update the task file's `status` from `planned` to `in-progress` before invoking the orchestrator. This is what `/task-closeout`'s pre-flight check (requiring `in-progress` or `review`) was written against; without this transition the check is vacuously bypassed and `/tasks-overview` misreports active work as `planned`. If the task file is already `in-progress` or `review` (e.g., resuming after a BLOCKED pause), leave it unchanged.
3. Invoke `orchestrator` with the task file + contract paths.
4. Orchestrator sequences leads deterministically: `shared → main → renderer → qa → infra`.
5. Each lead reads its contract, reads `learnings.md`, produces briefs, invokes its implementers, quality-gates output.
6. `lead-deep-review` runs after `lead-qa` COMPLETE.
7. `cross-pr-reviewer` runs last.
8. Orchestrator surfaces the verification section from the task file + files changed, and soft-prompts for `/post-fix`.

**Hard gates:** any lead BLOCKED stops the pipeline. Orchestrator escalates with `[BLOCKED]`.

**Soft gate:** the `/post-fix` invitation — user opts in.

---

## Flow 4 — Task Closeout `/task-closeout`

**Purpose:** Extract everything worth remembering, then close the task.

**Steps:**
1. Read the finished task file and its contract.
2. Extract roadblocks, pitfalls, and non-obvious decisions → append to `.claude/tasks/learnings.md` under the task's ID.
3. Invoke `cross-docs-sync` to update READMEs / JSDoc / `docs/` as needed.
4. If learnings suggest `.claude/` should change (missing rule, inadequate contract section), invoke `/improve-claude`.
5. Archive the task file (move to `.claude/tasks/archive/` — future enhancement; for now, mark as "closed" in-file).
6. Update the task-history row with outcome + link to PR.

---

## Flow 5 — Claude Rules `/claude-rules`

**Purpose:** Create or update a file in `.claude/rules/`.

**Steps:**
1. Invoke `claude-config-updater` with the intent.
2. Agent drafts the new / updated rule as a diff.
3. Present the diff to user.
4. On approval, write the file. No partial writes.

Triggered when: a pitfall in `learnings.md` suggests a rule is missing; a new library / pattern is adopted; a rule becomes outdated.

---

## Flow 6 — Folder Improvement `/improve-claude`

**Purpose:** Propose structural improvements to `.claude/` itself.

**Steps:**
1. Invoke `meta-improvement-lead` (a lead-type agent that coordinates `.claude/` audits).
2. Agent reviews: recent learnings, recent task history, any closeout notes.
3. Agent proposes changes: new rules, new agents, tweaks to contracts, reorganization.
4. Proposals route through `claude-config-updater` for per-file diff review.

Triggered when: `/task-closeout` decides learnings warrant structural change; quarterly as a scheduled tune-up; user explicitly requests.

---

## Sequencing Rules

- **Never run `/implement` without a corresponding task file.** No fallback.
- **Never close a task without a closeout.** Dropped tasks rot `task-history.md`.
- **Never modify `.claude/` outside flows 5 / 6.** The only path to a `.claude/*` edit is `claude-config-updater`.
- **Flow exit → new flow entry.** Don't chain flows in a single prompt. Each flow is its own session boundary.

---

## Supporting Commands (not flows, but referenced)

| Command | Purpose |
|---|---|
| `/post-fix` | Commit + push + open PR. Only path for git write operations. |
| `/branch-sync` | Merge `main`/`dev-tl` into the working branch. |
| `/rebuild-native` | Run `@electron/rebuild` for `better-sqlite3` and `keytar` after fresh installs. User-gated. |
| `/package-dist` | Run `electron-builder` to produce installers. Not in default `/implement` — called explicitly. |
| `/task-update` | Update a task file mid-flight (scope change, blocker found). |
| `/task-review` | Re-run `cross-pr-reviewer` + `lead-deep-review` without a full `/implement`. |
| `/tasks-overview` | List all tasks by status. |
