# CLAUDE.md

This file provides guidance to Claude Code when working with code in this repo. Detailed rules for each domain live in `.claude/rules/` — read the relevant file before working in that area.

> Adapted from the Buster (`C:\Projects\buster`) agent system. The core model — orchestrator → leads → implementers with explicit contracts and briefs — is identical. The domains are tuned to this project: Electron main, React renderer, shared packages, QA, and build/infra.

---

## 🔴 Hard Rules (Non-Negotiable)

These override any other guidance in this file or in sub-package CLAUDE.md files.

1. **Always invoke `monorepo-task-planner` first** — for every new task, no exceptions, no matter how small.
2. **Proposing changes to `.claude/` or `CLAUDE.md` requires explicit approval** — use the `claude-config-updater` agent. Never silently modify these files.
3. **Never commit or push directly to `main`** — `main` is protected. Feature branches → squash-merge PRs only. Current working branch: `dev-tl`.
4. **Filesystem is the source of truth for `.claude/*` reads** — SQLite (`%APPDATA%/agentic-dev-app/app.db`) holds ONLY state with no filesystem home: sessions, tickets, workflows, app settings. Never shadow `.claude/agents/*.md` or `settings.json` in SQLite.
5. **Hook server responds in <5ms on the hot path** — accept payload → push to in-memory channel → return. All DB writes, correlation, and rendering happen async. A slow hook stalls Claude's run loop.
6. **IPC surface (`apps/desktop/src/shared/ipc.ts`) is the contract between main and renderer** — update the type surface BEFORE adding channels or payload shapes. Renderer must never reach into Node APIs directly; main must never depend on DOM types.
7. **Never introduce Rust or additional native modules without explicit approval** — the Electron-over-Tauri decision was deliberate to avoid Rust exposure. `better-sqlite3` and `keytar` are the only native deps; adding more requires `claude-config-updater` approval.
8. **Native module rebuilds are user-gated** — propose the `@electron/rebuild` invocation, explain why, wait for user to execute. Never rebuild automatically after `pnpm install`.
9. **Never auto-overwrite user edits on FS ↔ editor conflicts** — the reconciliation rule is non-destructive: show the merge modal, never pick a side silently.
10. **Windows paths normalized in main only** — the user is on Windows. `path` normalization happens in `src/main/`; the renderer treats paths as opaque strings. Never do path manipulation in the renderer.
11. **Never bypass the 3-tier agent model in generated `.claude/` content** — agent workflow codegen (Phase 4) must respect: Leads get the `Agent` tool explicitly, Implementers don't. Generated agent files include `x-tier` so the visualizer renders correctly.
12. **Mark tasks complete via `/task-closeout`** — this extracts learnings, updates `.claude/tasks/learnings.md`, archives the task file, and invokes `/improve-claude`. Never archive a task manually.

---

## Vision

Product vision and current milestone are in [`.claude/vision.md`](.claude/vision.md). Read this when making scope, design, or priority decisions.

---

## Active Tasks

Always read [`.claude/tasks/`](.claude/tasks/) directly for current task status and specs. Do not rely on any summary here — the task files are the single source of truth. Task history is in [`.claude/tasks/task-history.md`](.claude/tasks/task-history.md); extracted learnings are in [`.claude/tasks/learnings.md`](.claude/tasks/learnings.md).

---

## Meta-Governance: Updating .claude/ and CLAUDE.md

**Claude Code must never silently modify `.claude/` files or `CLAUDE.md`.**

When an update is needed:
1. Invoke the `claude-config-updater` agent
2. The agent produces a diff-format proposal showing exactly what would change and why
3. Present the full proposal and wait for explicit user approval
4. Only apply changes after confirmation — no partial or silent edits

---

## Six Flows

All work in this project happens through one of six flows, each with its own slash command. Detailed flow diagrams are in [`.claude/flows.md`](.claude/flows.md).

| Flow | Command | Purpose |
|---|---|---|
| 1. Frontend Design | `/frontend-design` | UI prototyping only. No production code. |
| 2. Task Planning | `/task-plan` | Create a task file and (if needed) a feature contract. |
| 3. Implementation | `/implement` | Execute a task file through the full agent tree. |
| 4. Task Closeout | `/task-closeout` | Extract learnings, update history, archive task. |
| 5. Claude Rules | `/claude-rules` | Develop or update a `.claude/rules/*` file. |
| 6. Folder Improvement | `/improve-claude` | Research and propose `.claude/` improvements. |

Supporting commands: `/post-fix` (commit + PR), `/branch-sync`, `/rebuild-native` (Electron ABI rebuild), `/package-dist` (build installers), `/task-update`, `/task-review`.

---

## Agent Tree

All work routes through this hierarchy:

```
orchestrator
  ├── meta agents
  │   ├── monorepo-task-planner
  │   ├── meta-contract-writer
  │   └── meta-improvement-lead
  ├── domain leads (sequence: shared → main → renderer → qa → infra)
  │   ├── lead-shared   → impl-shared-zod, impl-shared-protocol
  │   ├── lead-main     → impl-main-ipc, impl-main-subprocess, impl-main-hook-server,
  │   │                   impl-main-fs-watcher, impl-main-db-migration
  │   ├── lead-renderer → impl-renderer-route, impl-renderer-feature,
  │   │                   impl-renderer-component, impl-renderer-shadcn,
  │   │                   impl-renderer-editor, impl-renderer-visualizer
  │   ├── lead-qa       → impl-qa-vitest, impl-qa-playwright, impl-qa-fixture,
  │   │                   impl-qa-contract-verifier
  │   └── lead-infra    → impl-infra-build, impl-infra-native-rebuild
  ├── lead-deep-review (5-lens deep analysis — runs between qa and PR review)
  └── cross-cutting
      ├── cross-pr-reviewer
      ├── cross-docs-sync
      └── claude-config-updater
```

**Why `shared` runs first:** changes to `packages/schemas` or `packages/claude-protocol` are consumed by both main and renderer. Landing schema changes in one pass prevents drift.

Context handoffs between sessions are always produced by the orchestrator as a self-contained summary prompt. Never carry state between sessions by assumption.

---

## Rules Files

Domain-specific rules live in [`.claude/rules/`](.claude/rules/). Read the relevant file before working in that area.

| File | Governs |
|---|---|
| [`agent-architecture.md`](.claude/rules/agent-architecture.md) | Sub-agent briefing, context management, workflow vs agent |
| [`typescript.md`](.claude/rules/typescript.md) | TS style, Zod, `.ts` imports, strict mode, no `any` |
| [`electron.md`](.claude/rules/electron.md) | Main vs renderer, IPC contract, security, native deps |
| [`react.md`](.claude/rules/react.md) | shadcn, TanStack Query/Router, Zustand, performance |
| [`git.md`](.claude/rules/git.md) | Branch strategy, commit conventions, PR flow |
| [`monorepo.md`](.claude/rules/monorepo.md) | pnpm workspace, package boundaries, local dev |
| [`tests.md`](.claude/rules/tests.md) | Vitest, Playwright, fixture patterns |

---

## Monorepo Reference

Structure, build commands, and local dev setup are in [`.claude/rules/monorepo.md`](.claude/rules/monorepo.md).
