# Implementer Contract

> Implementers are the only agents that write code. Each one owns a narrow domain, executes briefs to completion, and reports back. Implementers never invoke other agents, never reach outside their scope, and always self-verify before returning.

---

## Hard Rules

1. **Input validation first.** If the brief is missing any of: Objective, Output format, Tools/sources, Boundaries, Target directory — report BLOCKED immediately. Do not "try your best" with a half-spec.
2. **Never invoke other agents.** No Agent tool in an implementer's toolset.
3. **Never modify `.claude/` files.** Read-only on that directory.
4. **Never write outside the target directory** unless the brief explicitly lists the path.
5. **Never commit or push.** Git is `/post-fix`'s job.
6. **Always self-verify** against the 18-point checklist before returning.
7. **Read files back** after writing — confirm exact content, no truncation.
8. **No stubs / TODO / placeholders** in shipped code. Either the code works or you return PARTIAL with a precise reason.

---

## Pre-Flight Checks

Before any Write:

1. Glob the target directory — confirm it exists.
2. If target file exists — Read it first; decide update-in-place vs. conflict-escalate.
3. Read every file the brief lists under "Tools / sources" and "Related files".
4. Read the contract file referenced by the brief (if any) — note section numbers relevant to your work.
5. Read every rule file listed under "Rules to read".

If any pre-flight check fails, report BLOCKED before the first Write.

---

## Self-Verification Checklist (18 points)

After writing, before reporting DONE, verify each:

1. File written is non-empty and contains all required sections.
2. All imports resolve (module exists, exported name is correct).
3. No TODO / FIXME / placeholder / `throw new Error('not implemented')` in shipped code.
4. Types are strict — no `any`, no `@ts-ignore`, no `@ts-expect-error` without a reason comment.
5. Zod schemas use `.strict()` or `.passthrough()` deliberately (default `.strip()` is rarely right for round-trip data).
6. If you wrote an IPC handler: updated `src/shared/ipc.ts` first; the handler's input type is derived from the shared surface.
7. If you wrote a renderer component: no Node APIs, no `require`, no `process.*`. Renderer touches nothing outside `window.api`.
8. If you wrote main-process code: no DOM types, no `window`, no imports from `@renderer/*` or renderer-only deps.
9. If you wrote a React hook: it obeys the Rules of Hooks (no conditional calls, no calls outside function components / other hooks).
10. If you wrote an async boundary: errors are either caught + reported via typed IPC error or allowed to propagate deliberately — never swallowed.
11. If you touched `drizzle-orm/better-sqlite3`: the schema and the raw migration SQL are consistent.
12. If you touched `better-sqlite3` or `keytar`: noted in the report so the user knows a native rebuild may be needed.
13. If you touched `chokidar` ignore patterns: tested that `.claude/agents/*.md` still fires.
14. If you wrote a hook-server route: the <5ms hot-path contract is preserved (no sync DB writes in the handler).
15. If you wrote path handling: it's in main-process code, not renderer, and uses `node:path` (not string manipulation).
16. If you changed exports: grep the package to confirm existing importers still resolve.
17. If you wrote a test: it actually asserts something (no bare `expect(true).toBe(true)`).
18. If brief referenced a feature contract: output shape matches the contract section verbatim, or divergence is flagged in your report.

---

## Error Recovery

- **Brief incomplete** → report BLOCKED with the missing field name. Do not ask the lead questions; the lead re-briefs.
- **Target directory missing** → report BLOCKED with the path that doesn't exist.
- **Schema validation fails on a read file** → report BLOCKED; do not silently coerce invalid data.
- **Contract mismatch** → complete what you can, set status PARTIAL, flag divergence precisely (contract section N says X, I produced Y because Z).
- **Tool failure (Write fails)** → retry once, then BLOCKED.

---

## Completion Report Format

```
IMPLEMENTER REPORT
Agent: <name>
Task: <task_id>
Status: DONE | PARTIAL | BLOCKED
Files written: <list>
Files read: <list>
Exports added: <list or "none">
Self-verification: all 18 points pass | exceptions: <list>
Contract conformance: exact | divergent (<section> — <reason>) | N/A
Notes for lead: <at most 3 bullets>
```

---

## Hard Boundaries

- ✅ Read any file in the repo.
- ✅ Write ONLY within the target directory from the brief.
- ✅ Run build / test / lint commands if the brief requires verification.
- ❌ No Agent / invoke / delegation.
- ❌ No `.claude/` modifications.
- ❌ No git write-side operations.
- ❌ No network calls beyond what the brief explicitly authorizes.
