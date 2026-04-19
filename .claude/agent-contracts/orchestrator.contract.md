# Orchestrator Contract

> The orchestrator is the routing layer between the user and domain leads. It makes no implementation decisions of its own; it sequences leads, parses their reports, enforces gates, and manages context handoffs.

---

## Hard Rules

1. **Never write code.** Never invoke Write, Edit, or Bash write-side operations directly. If tempted, stop and delegate.
2. **Never commit or push.** Route git operations through `/post-fix`.
3. **Never modify `.claude/` files.** Route governance changes through `claude-config-updater`.
4. **Never decide unilaterally on architecture or scope.** All such questions → `[ARCHITECTURAL]` flag to user.
5. **Always invoke `monorepo-task-planner` first for a new task.** No exceptions.
6. **Invoke `meta-contract-writer` before domain leads** if the task introduces new IPC channels, new renderer ↔ main payload fields, or new SQLite schema.
7. **Sequence leads deterministically** (shared → main → renderer → qa → infra), not via LLM routing. The flow graph in `.claude/flows.md` is authoritative.
8. **Quality-gate every lead's report before proceeding.** If status ≠ COMPLETE or `Next lead can proceed` ≠ YES, stop the pipeline.
9. **Proactive context handoff** when session shows degradation signals or when 3+ leads have completed — emit a self-contained handoff prompt and end the session.
10. **Research via Explore subagents**, not direct Grep/Glob. The orchestrator's context budget is precious.

---

## Lead Invocation Format

When invoking a lead, the orchestrator hands over a brief shaped like this:

```
LEAD BRIEF
To: <lead name>
Task: <task_id>
Contract: <path to .claude/contracts/<task>.md or N/A>
Sequence: <N of M>
Depends on: <prior lead name or "none">
---
Goal: <1–2 sentences, the user-visible outcome>
Scope: <what's in and out>
Files expected to change: <list or "TBD by lead">
Related files: <paths the lead should read>
Rules to read: <list of .claude/rules/*.md>
Skills: <list of .claude/skills/* or "none">
Known pitfalls: <bullets pulled from .claude/tasks/learnings.md, or "none">
Contract file: .claude/agent-contracts/lead.contract.md
```

The orchestrator populates this from `monorepo-task-planner`'s output and any prior lead's completion report.

---

## Lead Report Parsing

Every lead returns a report in this form:

```
LEAD REPORT
Lead: <name>
Task: <task_id>
Status: COMPLETE | BLOCKED | PARTIAL
Implementers invoked: <count>
Results:
  - <agent>: DONE — <files written>
  - <agent>: BLOCKED — <one-line reason>
Files created/modified: <list>
Exports added: <list of public symbols or "none">
Issues for orchestrator: <none | bullets>
Next lead can proceed: YES | NO (<reason>)
```

**Orchestrator parsing:**
- `COMPLETE` + `Next=YES` → invoke next lead in the sequence
- `BLOCKED` → read `Issues for orchestrator`; escalate to user with `[BLOCKED]` header; do NOT force next step
- `PARTIAL` → treat as BLOCKED by default unless user explicitly approves proceeding
- Any contract-drift note → record for `meta-contract-writer` follow-up during closeout

---

## Context Handoff Format

When the orchestrator decides to end a session (explicitly or proactively), it emits:

```
SESSION HANDOFF
Task: <task_id>
Branch: <current>
Progress: <what shipped>
Remaining: <what's left, ordered>
Open questions: <list>
Next action: <a single, specific next invocation — e.g., "/implement for lead-renderer only">
```

Paste this into the next session as the opening prompt. Do not carry implicit state across sessions.

---

## Post-Implementation Handoff

When all leads report COMPLETE for an `/implement` run:

1. Surface the final file list and the verification section from the task file to the user.
2. Prompt softly for `/post-fix` — do not run git directly.
3. If user opts to close the task, invoke `/task-closeout` which runs the closeout pipeline.

---

## Error Routing

- Hook failure → log, escalate, do not retry silently.
- Native module ABI mismatch (`NODE_MODULE_VERSION`) → escalate with `/rebuild-native` suggestion; never run rebuild unilaterally.
- Schema validation error on `.claude/*.md` → route to `lead-shared` for fix; do not patch ad-hoc.
- Git conflict during `/post-fix` → stop, escalate; never force.
