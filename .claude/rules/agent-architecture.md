# Rule: Agent Architecture

> Context is the scarcest resource in this system. Every rule here exists to keep context clean, brief, and sufficient.

---

## The Three-Tier Model

All work flows through exactly three tiers. No more, no less.

```
Tier 0 (Orchestrator)  — routes; has Agent tool; never writes code
Tier 1 (Leads)         — brief and gate; have Agent tool; never write code
Tier 2 (Implementers)  — write code; never have Agent tool
```

**Why three tiers and not two:** Tier 1 gives us a place to apply domain-specific briefing discipline and quality gating without loading all of it into Tier 0's context. A good lead is worth three orchestrator turns.

**Why three tiers and not four:** Claude Code's native subagents cannot spawn further subagents. The three-tier model works because Tier 1 leads are explicitly given the `Agent` tool in their frontmatter. Adding a fourth tier would require nesting Agent-tool invocations two deep — which Claude Code does not support.

Concrete consequence: every Tier-1 agent file MUST have `tools: [..., Agent]` in its frontmatter. Every Tier-2 agent file MUST NOT have the Agent tool. The `x-tier` annotation in frontmatter (`orchestrator | lead | implementer`) is how the visualizer distinguishes the two edge types; it's also how the `lead-shared` / `impl-shared-zod` schema validator warns on misconfigured nesting.

---

## The Four-Element Brief

Every brief passed to an implementer MUST contain exactly these four elements:

1. **Objective** — one or two sentences describing the user-visible outcome.
2. **Output format** — exact file paths, exported symbols, and shapes.
3. **Tools / sources** — the files the implementer will read or call.
4. **Boundaries** — what's explicitly out of scope.

A brief missing any element is not a brief. Implementers are contractually required to reject it with BLOCKED. This is not bureaucracy; missing-element briefs are where 80% of implementer failures originate.

---

## Context Discipline

1. **Progressive disclosure.** Each tier loads only what it needs. Orchestrator reads flows.md + task file. Leads read the lead contract + domain rules + learnings.md. Implementers read the implementer contract + their target directory + specifically-named files. Nothing more.
2. **Explore subagents for investigation.** When the orchestrator or a lead needs to understand code, it launches an Explore subagent and reads its distilled report — not the raw file contents. Exception: final reading of the file-to-be-modified happens in the implementer.
3. **Never pass full file contents through briefs.** Pass paths. The implementer reads.
4. **Never paste transcripts.** Pass structured summaries.
5. **Session handoffs are self-contained prompts.** If a handoff prompt doesn't let the next session start cold, it's broken.

---

## Workflows Preferred Over Agents

A sequence that is deterministic (same order every time) should be a **workflow** (orchestrator-sequenced calls), not an **agent** that decides which sub-agent to call.

In this project:
- The domain-lead order (`shared → main → renderer → qa → infra`) is deterministic → workflow.
- Within a lead, the implementer order is deterministic for the lead's domain → workflow.
- Picking which lead-deep-review lens to apply may be dynamic → agent.

Rule of thumb: if you can write the sequence as a numbered list that doesn't change, make it a workflow. Only use an agent for genuine branching.

---

## The `x-tier` Frontmatter Convention

Because Claude Code ignores unknown frontmatter keys, the `x-tier` field is safe to persist and drives:

- **Schema validation** (`packages/schemas/src/agent.ts`):
  - Lead without `Agent` tool → warning (silently flat)
  - Implementer with `Agent` tool → warning (accidental deep nesting)
- **Visualizer edge styling**:
  - Tier-1 → Tier-2 via Agent-tool invocation → dashed edge
  - Tier-0 → Tier-1 native subagent invocation → solid edge
- **Workflow editor validation** (Phase 4): rejects graphs that violate tier constraints.

Keep the convention advisory — warnings, not errors — so it's retired cleanly if Claude Code ever supports native deep nesting.

---

## When to Escalate

Escalate (return BLOCKED) when:

- Brief is incomplete or ambiguous.
- Work requires files / directories outside your scope.
- Work requires another lead's domain.
- Work requires `.claude/*` edits (→ `claude-config-updater`).
- A rule referenced by the brief is missing.
- Contract referenced by the brief doesn't match the expected shape.

Escalation is cheap. Silent reach-arounds into other domains are the single most expensive failure mode.

---

## Learnings Loop

After every task closeout, roadblocks are extracted into `.claude/tasks/learnings.md`. Before the first implementer brief in any future task, the lead reads learnings.md and embeds relevant pitfalls into the "Known pitfalls" field.

This is how the system gets sharper over time. Skipping the read is how it regresses.

---

## Anti-Patterns

- Lead writing code "because it was easier" → violates separation; quality gate disappears.
- Implementer invoking another agent "to help" → removes the sequencing contract.
- Orchestrator deciding architecture mid-flow → decisions outside `monorepo-task-planner` drift from the task file.
- Reading huge files into the orchestrator's context → one task burns the session.
- Skipping the pre-flight pathExists check → implementer writes to a phantom directory, file is lost.
