# Learnings

> Roadblocks and pitfalls extracted at task closeout. Leads MUST read this before producing the first implementer brief of a new task. Pitfalls relevant to the task are embedded in the "Known pitfalls" field of each brief.

Format per entry:

```yaml
- task: <task-id>
  date: <YYYY-MM-DD>
  agent: <where it was hit>
  pitfall: <one sentence>
  resolution: <how it was fixed>
  rule_updated: <path to .claude/rules/*.md or "none">
```

---

## Entries

- task: 0001-foundation-scaffold
  date: 2026-04-19
  agent: (scaffold, pre-agent-system)
  pitfall: |
    `allowImportingTsExtensions` must be true in tsconfig.base.json because the codebase uses `.ts`
    extensions in local imports (required under `verbatimModuleSyntax` + ESM). Without it, tsc rejects
    every local import. Combined with `noEmit: true` — we don't emit from tsc, build is via electron-vite.
  resolution: Added `allowImportingTsExtensions: true` + `noEmit: true` to the base tsconfig.
  rule_updated: .claude/rules/typescript.md (documented the convention)

- task: 0001-foundation-scaffold
  date: 2026-04-19
  agent: (scaffold, pre-agent-system)
  pitfall: |
    TanStack Router's `createFileRoute` requires `routeTree.gen.ts` to exist for typecheck to pass
    — without it, the path param is inferred as `undefined` and every route fails to compile.
    The Vite plugin regenerates it on dev start, but a CI typecheck runs before dev.
  resolution: |
    Added `@tanstack/router-cli` and `routes:generate` script; typecheck runs
    `pnpm routes:generate` first. Added `routeTree.gen.ts` to gitignore and biome ignore.
  rule_updated: .claude/rules/react.md (added note under TanStack Router section)

- task: 0001-foundation-scaffold
  date: 2026-04-19
  agent: (scaffold, pre-agent-system)
  pitfall: |
    Under `exactOptionalPropertyTypes: true`, `{ tier: undefined }` is NOT assignable to
    `{ tier?: Tier }` — TS treats them as distinct. Building objects with conditionally-undefined
    fields requires conditional spreads or incremental assignment.
  resolution: |
    Replaced object-literal construction with let-binding and conditional property assignment
    in `agents:list` IPC handler.
  rule_updated: .claude/rules/typescript.md (added note on exactOptionalPropertyTypes)

- task: 0001-foundation-scaffold
  date: 2026-04-19
  agent: (scaffold, pre-agent-system)
  pitfall: |
    TanStack Router's generated `routeTree.gen.ts` references the `RouterContext` interface from
    `__root.tsx`. If that interface is not exported, TS errors with TS4023 on every route.
  resolution: Added `export` to `RouterContext` in `__root.tsx`.
  rule_updated: .claude/rules/react.md (noted exported RouterContext requirement)
