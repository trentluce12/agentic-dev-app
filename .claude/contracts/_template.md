---
feature: <feature-name>
task_id: <task-id>
created: <YYYY-MM-DD>
status: draft | ratified | shipped
---

# Feature Contract: <feature-name>

> The single source of truth for field shapes that cross a layer boundary. Written by `meta-contract-writer` before any implementation starts. Modified only by `meta-contract-writer` (never by an implementer mid-task). Drift from this contract during implementation is surfaced in the LEAD REPORT, never silently fixed.

---

## Scope

<One paragraph: what layers does this feature touch? main, renderer, schemas package, SQLite, filesystem?>

---

## IPC Contract

> Defines new or modified channels in `apps/desktop/src/shared/ipc.ts`.

### Channel: `<scope>:<action>`

**Request:**

```ts
{
  // one field per line, with the final TS type
  projectPath: string;
  agentName: string;
}
```

**Response:**

```ts
{
  // same
}
```

**Errors:** <enumerate error shapes the handler may throw, and what the renderer should show for each>

---

## UI Contract

> Fields the UI displays, binds to, or submits.

| Field | Input type | Maps to request | Displays response | Notes |
|---|---|---|---|---|
| `name` | text | `agentName` | `frontmatter.name` | |
| `tier` | select | `frontmatter['x-tier']` | `summary.tier` | values: orchestrator / lead / implementer |

---

## Filesystem Contract

> For any `.claude/*` file this feature reads or writes.

| Path | Read by | Written by | Schema | Notes |
|---|---|---|---|---|
| `.claude/agents/*.md` | agent-editor | agent-editor | `agentFrontmatterSchema` | frontmatter + markdown body |

---

## SQLite Contract

> For any new tables / columns / queries in `apps/desktop/src/main/db/schema.ts`.

| Table | Columns changed | Migration | Indexes |
|---|---|---|---|
| `sessions` | `linked_ticket_id TEXT` added | `0004_link_ticket.sql` | `idx_sessions_ticket` |

---

## Schema Contract

> Changes to `packages/schemas` or `packages/claude-protocol`.

| File | Change | Breaking? |
|---|---|---|
| `packages/schemas/src/agent.ts` | Add `x-tier` field | No (optional, backward-compatible) |

---

## Acceptance Criteria

- [ ] <checklist item>
- [ ] ...

---

## Verification Plan

> How the `lead-qa` verifies end-to-end.

- Unit: <schema tests, IPC handler tests>
- E2E: <Playwright scenarios>
- Manual: <if any — e.g., "open buster project, expect 28 agents listed with correct tiers">

---

## Roadblocks

> Populated during implementation. Each entry shapes a future `learnings.md` line.

```yaml
- agent: <implementer-name>
  tried: <what was attempted>
  failed: <what went wrong>
  resolved: <the fix>
  rule_fix: <which .claude/rules/* file this suggests updating, or "none">
```
