---
description: UI prototyping flow — throwaway .tsx mocks, design references, no production code lands. Exits to /task-plan when the user commits to shipping.
argumentHint: <feature area or design goal>
---

You are running **Flow 1 — Frontend Design** (see `.claude/flows.md`).

## Purpose

Explore visual + interaction solutions WITHOUT touching production source. Outputs are throwaway mocks that inform a later task file.

## Steps

1. Prompt the user for: design references (screenshots, URLs, competitor flows), target route / feature, interaction goals, any hard constraints.
2. Work in a scratch workspace:
   - A temp branch (`design/<name>`) OR
   - A separate folder under `scratch/` (gitignored).
3. Produce one or more `.tsx` mocks using our design tokens and shadcn primitives.
4. Surface the mocks to the user. Iterate.
5. When the user commits to shipping, exit to `/task-plan` with the mocks as reference.

## Hard Rules

- NEVER modify production routes or features in this flow.
- NEVER commit to `main` or `dev-tl` from a design branch.
- The mocks are THROWAWAY. If they make it into production without going through `/task-plan` + `/implement`, the flow is broken.

## Output

```
DESIGN EXPLORATION
References: <list>
Mocks produced: <list of file paths>
Decisions: <bullets of design choices made>
Next: run `/task-plan` to turn this into a shipping task.
```
