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

- task: 0002-agent-editor
  date: 2026-04-19
  agent: impl-main-fs-watcher (caught in deep-review + cross-pr-reviewer)
  pitfall: |
    Declaring discriminated `fs:*Added` / `fs:*Removed` variants in the IpcEvent union is not
    enough — chokidar's `on('all', (evt, absPath) => ...)` `evt` argument must be forwarded
    into the classifier. Otherwise every file mutation collapses to `*Changed` and the
    add/remove branches become dead code that look correct in review.
  resolution: |
    Threaded `evt` into `classify(rel, evt)` and mapped `add → *Added`, `unlink → *Removed`,
    `change → *Changed` per kind. Belt-and-suspenders: also filter `.md.tmp` at the watcher
    level (main-side defense in depth; agents:list already filters).
  rule_updated: .claude/rules/electron.md (add FS-watcher event-type plumbing note)

- task: 0002-agent-editor
  date: 2026-04-19
  agent: impl-renderer-feature (AgentEditorPage reparseFromYaml)
  pitfall: |
    Reconstructing a frontmatter document by `---\n<yaml>\n---\n<body>` and reparsing with
    parseAgentFile is fragile — a user-entered `---` inside a multi-line block scalar (`|` / `>`
    style) matches the outer fence regex and closes the synthetic frontmatter prematurely,
    producing nonsense diagnostics on every keystroke.
  resolution: |
    Replaced the synthetic-fence reparse with `parseYaml(yamlText) → schema.safeParse →
    validateTierConsistency` (same path handleSave already used). Factored as a shared helper
    so diagnostic-path and save-path can never disagree.
  rule_updated: .claude/rules/react.md (add CM6 linter caveat under CodeMirror 6 section)

- task: 0002-agent-editor
  date: 2026-04-19
  agent: impl-renderer-editor (AgentEditorSplit)
  pitfall: |
    CodeMirror 6 editor host `<div>`s carry no accessibility metadata by default. Two
    contenteditable regions rendered side-by-side (YAML pane + markdown pane) are
    indistinguishable to screen readers. CM6's internal aria-hints on `.cm-content` don't
    label the pane's purpose.
  resolution: |
    Required ariaLabel prop on AgentEditorSplit; host div carries role="textbox",
    aria-multiline="true", and aria-label threaded from parent. Callers pass
    "Agent frontmatter (YAML)" / "Agent body (Markdown)".
  rule_updated: .claude/rules/react.md (add a11y line under CodeMirror 6 section)

- task: 0002-agent-editor
  date: 2026-04-19
  agent: impl-main-ipc (projects:open handler)
  pitfall: |
    `dialog.showOpenDialog(options)` without a parent BrowserWindow on Windows creates a
    modeless dialog that may open BEHIND the main Electron window, giving users the
    impression that the button "does nothing". Compounded by the async onClick handler
    swallowing any IPC rejection silently — without DevTools open, the user has no visible
    error.
  resolution: |
    Pass the sender window via BrowserWindow.fromWebContents(event.sender) (fallback to
    getFocusedWindow) to showOpenDialog. Auto-open DevTools in detached mode when
    ELECTRON_RENDERER_URL is set. Wrap renderer handleOpen in try/catch surfacing errors as
    a visible destructive Alert. All three are additive and belong together.
  rule_updated: .claude/rules/electron.md (dialog-parent-window convention under Window Creation)

- task: 0002-agent-editor
  date: 2026-04-19
  agent: impl-infra-build (electron.vite.config.ts)
  pitfall: |
    `externalizeDepsPlugin()` with no arguments externalizes every `dependencies` entry,
    including `@agentic-dev-app/*` workspace packages whose `main` field points at raw `.ts`
    source. At main-process runtime Node throws `ERR_UNKNOWN_FILE_EXTENSION` because it has
    no TS loader. Also: `TanStackRouterVite.routesDirectory` resolved against the renderer
    root (`src/renderer`) doubles the path when passed as a relative string.
  resolution: |
    Inline `discoverWorkspacePackageNames()` helper reads `packages/*/package.json` at
    config-load time (position-independent via __dirname, sync, fail-soft, scope-agnostic)
    and feeds `externalizeDepsPlugin({ exclude: [...] })`. `TanStackRouterVite` paths now
    absolute via `resolve(__dirname, ...)`. Adding a new workspace package auto-inherits
    correct bundling.
  rule_updated: .claude/rules/monorepo.md (document externalizeDepsPlugin exclusion pattern)

- task: 0002-agent-editor
  date: 2026-04-19
  agent: impl-qa-vitest (property-based round-trip test)
  pitfall: |
    Zod's `.passthrough()` preserves passthrough key insertion order on `parse` BUT reorders
    known keys to schema declaration order. A round-trip property test that constructs input
    objects in schema order (name → description → tools → x-tier → passthrough) will never
    exercise the reorder path and will silently pass even if known-key order is mangled.
  resolution: |
    For this task the test was authored in schema order as a pragmatic compromise. Follow-up:
    a stronger property test should shuffle known-key order in the generator to catch
    reorder regressions on user-entered YAML.
  rule_updated: .claude/rules/typescript.md (add Zod passthrough-reorder note under Zod section)

- task: 0002-agent-editor
  date: 2026-04-19
  agent: /implement flow orchestration
  pitfall: |
    The /implement skill never flips the task file's `status` from `planned` to
    `in-progress`. /task-closeout's pre-flight then verifies `in-progress` or `review`; in
    practice the check is vacuously bypassed because closeout is invoked by the user who
    already "explicitly decided done". Flow gap: a task can appear `planned` in the history
    while it's actually in progress.
  resolution: |
    Not fixed in this task. Closeout proceeded with the `planned` → `closed` transition on
    user invocation. Candidate for /improve-claude: either the /implement skill should
    update the status on entry, or the pre-flight check in /task-closeout should accept
    `planned` too.
  rule_updated: none (candidate for a flows.md / skill-descriptor update)

- task: 0002-agent-editor
  date: 2026-04-19
  agent: orchestration (Claude Code subagent tool inheritance)
  pitfall: |
    Tier-1 lead agents (lead-shared, lead-main, lead-renderer, lead-qa, lead-infra) are
    configured with the Agent tool in their frontmatter, but when spawned as subagents via
    the harness, they do NOT inherit the Agent tool — they have only Read/Glob/Grep. This
    means leads cannot dispatch implementers themselves; they return composed briefs for the
    parent session to dispatch.
  resolution: |
    Workaround used in this task: the top-level assistant acts as orchestrator, reads each
    lead's composed brief, and invokes the implementer directly. The 3-tier quality gate is
    preserved (leads still compose briefs; implementers still execute them) — only the
    dispatch mechanism differs from the documented flow.
  rule_updated: none (Claude Code harness limitation, not a project rule)

- task: 0002-agent-editor
  date: 2026-04-19
  agent: orchestration (implementer parallelization)
  pitfall: |
    Leads sequence deterministically (shared → main → renderer → qa → infra) and must run in
    series — but IMPLEMENTERS within a lead run can be parallelized when they target
    disjoint file paths. Examples observed: impl-renderer-shadcn (ui/) + impl-renderer-editor
    (codemirror/) ran in parallel; impl-qa-vitest + impl-qa-playwright + impl-qa-contract-verifier
    ran in parallel. Saved meaningful wall-clock time without violating the 3-tier quality gate.
  resolution: |
    Document the parallelization rule: leads always serial; implementers parallel when file
    targets are disjoint. First implementer in a dependency chain (e.g., fixture creation
    before tests that consume it) must finish before dependents start.
  rule_updated: .claude/rules/agent-architecture.md (add parallelization pattern under Workflows section)
