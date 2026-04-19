# Vision

> The cockpit for agentic software engineering.

---

## Product

A personal-grade desktop app that wraps Claude Code (the CLI) with a UI built around three things current tooling does poorly:

1. **Editing `.claude/` with the structure visible** — agents, settings, commands, hooks have shape and constraints (the `.claude/rules/`, the 3-tier model, schema contracts). A good UI shows those constraints while you edit, instead of letting you learn them by breakage.
2. **Seeing a multi-tier agent system actually run** — real-time graph of orchestrator → lead → implementer invocations with tool-call edges, timing, and per-agent transcript slices. The architecture should be visible while it's executing, not reconstructed from logs after the fact.
3. **Linking tasks to the sessions that implemented them** — scrum-style tickets, with a "start Claude session from this ticket" button and automatic back-references in the transcript. The session transcript, the ticket, and the resulting commits should be one click apart.

Secondary (Phase 4+): a visual workflow editor that generates `.claude/agents/*.md` from a designed graph — n8n for Claude agents, respecting the 3-tier constraints.

---

## Target User

One person, initially: the maintainer (Trent). The app is designed for a developer already running deep, multi-tier agent orchestrations (the Buster pattern) and hitting friction operating them.

If the app works for that user, broader distribution is a downstream decision, not a current goal.

---

## Positioning

- **Not** a reimplementation of Claude Desktop. That's a general chat UI. This is an orchestration cockpit.
- **Not** a cloud service. Local-first. Everything runs on the dev machine. The only network calls are those Claude Code itself makes.
- **Not** a framework for building agents. The framework is Claude Code. This is the UI that sits on top of it.
- **Not** an IDE replacement. VS Code remains the editor for code. This app owns the `.claude/` surface, session monitoring, and task management.

---

## Current Milestone (as of 2026-04-19)

**Phase 1 — Foundation + Agent Folder Editor** (3–4 weeks).

Ships:
- pnpm workspace scaffold with `apps/desktop` + `packages/schemas` + `packages/claude-protocol`. ✅ (done)
- Electron shell (main + preload + renderer), typed IPC surface, SQLite via Drizzle, chokidar FS watcher, Fastify hook server, keytar-stored bearer token. ✅ (scaffolded)
- Project picker (open a folder, detect `.claude/`). ✅ (scaffolded)
- Agent editor — list, CM6 split frontmatter/body, Zod-validated, 3-tier role picker with Agent-tool-consistency warnings.
- Settings editor — form-based for `.claude/settings.json` + hooks.
- Slash-command editor + hook-script editor.
- Basic session launcher — run `claude -p` against current project, stream output.

Not in Phase 1: the visualizer, task management, workflow designer.

---

## Anti-Goals

- **No multi-user features.** No auth, no cloud sync, no team workspaces. This is a single-user local app.
- **No framework abstractions over Claude Code.** If Claude Code adds a feature, the app exposes it; if Claude Code removes one, the app loses it. The app is a LENS, not a wrapper that tries to stabilize a moving target.
- **No tuning for distribution until it's useful.** App signing, notarization, auto-update are post-MVP.
- **No telemetry.** At all. Ever.

---

## Design Principles

1. **Filesystem is the source of truth.** The app reads and writes `.claude/*.md` directly. Never mirror those files in SQLite. If the user opens VS Code and edits a file, the UI updates within a second.
2. **Schemas are the contract.** Zod schemas in `packages/schemas` define what's valid. Editors are driven by them; validation errors render inline with line precision.
3. **Aesthetic ceiling is set high.** The bar is shadcn-level polish, motion that means something (not decorative), legible typography, dark theme that reads well at 2 AM.
4. **Real-time by default.** Hook events + stream-JSON feed the UI live. No "refresh" buttons.
5. **Determinism where possible, branching where necessary.** The 3-tier agent model prefers deterministic workflows over LLM routing. The app enforces this: the visualizer warns when a supposed nested subagent turns out to be flat.

---

## Long-Term Horizon (not a roadmap, just directions)

- MCP server browser and one-click install.
- Shared agent marketplace (opt-in).
- Cost/token analytics per session and per ticket.
- Integration with external PM tools (Linear, GitHub Issues) — still opt-in.
- A CLI companion (`agentic` binary) that reuses `packages/schemas` and `packages/claude-protocol` for headless operations.

---

## How to Use This Doc

Read before any scope or priority decision. When the app or a proposed feature starts drifting from "orchestration cockpit" toward "general-purpose IDE" or "multi-user SaaS," stop and re-anchor here. Updates to the vision go through `/claude-rules` (it's a governance change).
