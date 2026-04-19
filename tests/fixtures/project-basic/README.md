# Fixture: project-basic

Minimal `.claude/` project used by the agent-editor Vitest and Playwright suites. Contains exactly six agent files under `.claude/agents/` that together exercise every code-path the downstream tests need to assert: the passing case, each tier-consistency warning, passthrough-key preservation, malformed-YAML recovery, and the orchestrator branch of `validateTierConsistency`. Flat listing, no subdirectories, no `.tmp` leftovers.

## Layout

```
project-basic/
  .claude/
    agents/
      valid-lead.md
      lead-missing-agent.md
      implementer-with-agent.md
      passthrough-note.md
      malformed-yaml.md
      no-tier-orchestrator.md
```

## Agents

| Filename | Represents | Property downstream tests rely on |
|---|---|---|
| `valid-lead.md` | A correctly-configured lead agent (lead + Agent tool) | `parseAgentFile` returns zero issues; `validateTierConsistency` emits no warnings |
| `lead-missing-agent.md` | A lead agent missing the `Agent` tool | Exactly one warning with code `tier.lead-missing-agent-tool` on `path: 'tools'` |
| `implementer-with-agent.md` | An implementer incorrectly granted the `Agent` tool | Exactly one warning with code `tier.implementer-has-agent-tool` on `path: 'tools'` |
| `passthrough-note.md` | An implementer carrying unknown frontmatter keys (`custom-note`, `custom-array`) | `agentFrontmatterSchema.passthrough()` preserves both keys verbatim; zero issues |
| `malformed-yaml.md` | A file with deliberately invalid YAML between the fences | `parseFrontmatter` throws `FrontmatterParseError`; `agents:list` does NOT throw and returns a summary with `hasIssues: true`, `description: '(parse error)'` |
| `no-tier-orchestrator.md` | An orchestrator-tier agent with the `Agent` tool | `validateTierConsistency` emits zero warnings (orchestrator branch is permissive) |

## Consumers

- `packages/schemas/src/agent.test.ts` — Vitest unit coverage of `parseAgentFile`, `validateTierConsistency`, and `diagnosticsToCodeMirror`.
- `apps/desktop/src/main/ipc/agents.test.ts` — Vitest coverage of `agents:list`, `agents:read`, `agents:write`, `agents:create`, `agents:delete` against a temp copy of this fixture.
- `apps/desktop/tests/e2e/agent-editor.spec.ts` — Playwright end-to-end against Electron, loading this fixture via an IPC helper (no system open dialog).

## Invariants

- LF line endings only. No CRLF anywhere under `project-basic/`.
- Flat listing: no subdirectories under `.claude/agents/`.
- No `.md.tmp` files. The `agents:list` handler filters them; the fixture must never introduce them even transiently.
- Filenames match the frontmatter `name` key exactly (same slug regex as `agentNameSchema`).
- Bodies are deterministic (one `#` heading + one paragraph). Tests that assert on body content may do so verbatim.
- No timestamps, no absolute paths, no user-specific strings embedded in any file.

## Regenerating

This fixture is hand-authored. Do not script its generation — the malformed-yaml file in particular must remain byte-stable to keep parse-error tests deterministic.
