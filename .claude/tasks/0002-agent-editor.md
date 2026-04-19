---
task_id: 0002-agent-editor
title: Agent editor — list, CM6 split frontmatter/body, Zod diagnostics, 3-tier picker, FS-watcher live reload
created: 2026-04-19
closed: 2026-04-19
owner: trentluce12
status: closed
design_first: false
contract_needed: true
domains:
  shared: true
  main: true
  renderer: true
  qa: true
  infra: true
contract: .claude/contracts/0002-agent-editor.md
pr: https://github.com/trentluce12/agentic-dev-app/pull/3
---

## Goal

Ship the flagship Phase 1 agent editor: open a project, see every `.claude/agents/*.md` file as a list, click one to open a CodeMirror 6 split view (frontmatter | body), get inline Zod-driven diagnostics with line precision, pick the 3-tier role from a dedicated control that warns on Agent-tool inconsistency, save without dropping unknown frontmatter keys, and have the UI live-reload when the file changes on disk (e.g., from VS Code).

## Scope

### In scope

- Finish wiring `agents:list`, `agents:read`, `agents:write`, `agents:delete` IPC handlers. `agents:delete` currently has no handler (declared in `shared/ipc.ts`, bound in preload, missing in main). Add it.
- Align the FS-watcher → renderer broadcast with the typed `IpcEvent` shape declared in `shared/ipc.ts`. Today the main process emits `{ channel: 'fs:changed', projectPath, kind, path }`, but the shared type surface declares `fs:agentChanged` / `fs:settingsChanged`. Pick one shape, implement it, and document the decision in the contract.
- Add a typed `IpcEvent` for `fs:agentAdded` and `fs:agentRemoved` (or fold them into a single `fs:agentChanged` with a `kind` discriminator — contract decides). The FS watcher already produces these kinds; the shared IPC surface must expose them.
- Renderer feature module `features/agent-editor/` with:
  - A two-pane layout (left: agent list; right: editor + diagnostics). Uses existing shadcn primitives (`button`, to be added: `input`, `select`, `separator`, `scroll-area`, `tooltip`, `badge`, `alert`).
  - List item renders: `name`, tier badge (color-coded orchestrator / lead / implementer / none), description preview, error-chip if `hasIssues`.
  - "New agent" button opens a minimal form (name, description, tier) and writes the initial file.
  - "Delete agent" action with a confirm modal.
- CM6 split editor:
  - Two `EditorView` instances (frontmatter YAML + body markdown) per `.claude/rules/react.md` ("two CM6 editors side-by-side, with a shared linter extension driven by Zod parse results").
  - Frontmatter editor uses `@codemirror/lang-yaml`; body editor uses `@codemirror/lang-markdown`.
  - Dark theme matching the rest of the app (use existing CSS vars; construct a minimal theme extension, do not pull in a full third-party theme bundle).
  - Diagnostics gutter: Zod `issues` array → CM6 `Diagnostic[]` with `from`/`to` line offsets computed against the frontmatter text. `@codemirror/lint` extension.
  - Debounced parse on change (250ms) so diagnostics update as the user types; save is a separate explicit action.
- 3-tier role picker:
  - Dedicated shadcn `Select` bound to `frontmatter['x-tier']` (orchestrator / lead / implementer / none).
  - Agent-tool-consistency warning renders inline next to the picker AND as a CM6 diagnostic on the `tools` line. Both come from `validateTierConsistency` (already exported from `packages/schemas/src/agent.ts`), so they cannot drift.
- Passthrough-preserving round-trip:
  - Reading → editing → saving an agent file that contains unknown keys (e.g., `custom-key: foo`) must write those keys back in the same relative order. Validated in Vitest with a property-based test.
  - Unknown keys are NOT shown in the 3-tier picker UI — they live in the YAML pane. The UI is additive over the raw frontmatter, not a replacement for it.
- FS watcher integration:
  - On `fs:agentChanged` events for the currently-open project, invalidate the `['agents', projectPath]` and `['agents', projectPath, name]` TanStack Query keys.
  - If the user has unsaved edits to an agent that changed on disk, DO NOT silently overwrite. Show a non-destructive merge modal (per hard rule #9) with three options: "Keep my changes" (discard disk), "Load disk version" (discard mine), "Open in external diff" (deferred — render as disabled for now with a tooltip). Hard rule: never pick a side silently.
  - Debounce UI refresh so that a save the user just performed doesn't cause a flash of reload (compare `mtimeMs` from the write response to the event).
- **Infra: modular electron-vite config.** Two pre-existing bugs from 0001 (found on first `pnpm dev`) block any main-process use of workspace packages and any renderer route resolution. Fix both in a way that doesn't hardcode package names or paths:
  - `externalizeDepsPlugin` must exclude all `@agentic-dev-app/*` workspace packages. Exclusion list is derived at config-load time by globbing `<repoRoot>/packages/*/package.json` and reading each `name` field — so adding a future workspace package (e.g., `@agentic-dev-app/cli`) auto-inherits correct bundling with zero config change.
  - `TanStackRouterVite.routesDirectory` is computed via `resolve(__dirname, 'src/renderer/src/routes')` (absolute, position-independent) — resilient to the Vite renderer `root` being `src/renderer`, which today produces the doubled-path `src\renderer\src\renderer\src\routes` error.
  - The resolution helper lives in a small local module (`apps/desktop/scripts/workspace-packages.ts` or inline in the config) — pure Node, no new deps. Documented in the infra lead brief.

### Out of scope

- Renaming an agent (changing `name` in frontmatter or the filename). Out of scope: filename drives the identity today, and rename implies delete+write+path change + refresh of open editors. Ship read-only-name-in-UI for this task; rename is a follow-up.
- `.claude/agents/` subdirectories (nested paths). The list is flat, matching the current `agents:list` handler.
- Settings editor, slash-command editor, hook-script editor. Tracked separately in Phase 1 but not this task.
- Session launcher and visualizer. Phase 1 later slices.
- The "Open in external diff" button on the conflict modal. Disabled-with-tooltip placeholder is acceptable.
- A workflow-editor-style graph view of agents. Phase 4.
- Light theme. Dark-only per vision.
- Generalizing the workspace-package discovery helper into a shared `packages/` utility. It lives in `apps/desktop/` only for now; promote if and when a second consumer appears (YAGNI per typescript.md).

## Files expected to change

### New
- `apps/desktop/src/renderer/src/features/agent-editor/AgentEditorPage.tsx` (page component — the two-pane layout)
- `apps/desktop/src/renderer/src/features/agent-editor/AgentList.tsx`
- `apps/desktop/src/renderer/src/features/agent-editor/AgentListItem.tsx`
- `apps/desktop/src/renderer/src/features/agent-editor/AgentEditorSplit.tsx` (the two CM6 panes)
- `apps/desktop/src/renderer/src/features/agent-editor/AgentMetaPanel.tsx` (tier picker + metadata form)
- `apps/desktop/src/renderer/src/features/agent-editor/DiagnosticsList.tsx`
- `apps/desktop/src/renderer/src/features/agent-editor/NewAgentDialog.tsx`
- `apps/desktop/src/renderer/src/features/agent-editor/DeleteAgentDialog.tsx`
- `apps/desktop/src/renderer/src/features/agent-editor/ConflictResolutionDialog.tsx`
- `apps/desktop/src/renderer/src/features/agent-editor/codemirror/buildExtensions.ts` (composition of CM6 extensions; no wrapper mega-component)
- `apps/desktop/src/renderer/src/features/agent-editor/codemirror/zodLinter.ts` (maps `AgentValidationIssue[]` → CM6 `Diagnostic[]`)
- `apps/desktop/src/renderer/src/features/agent-editor/codemirror/theme.ts`
- `apps/desktop/src/renderer/src/features/agent-editor/hooks/useAgentFile.ts` (TanStack Query wrapper over `window.api.agents.read` + mutation for write + FS-event invalidation wiring)
- `apps/desktop/src/renderer/src/features/agent-editor/hooks/useAgentList.ts`
- `apps/desktop/src/renderer/src/stores/agentEditorStore.ts` (Zustand slice: selected agent name, dirty flag, conflict state)
- `apps/desktop/src/renderer/src/components/ui/input.tsx` (shadcn copy)
- `apps/desktop/src/renderer/src/components/ui/select.tsx` (shadcn copy)
- `apps/desktop/src/renderer/src/components/ui/separator.tsx` (shadcn copy)
- `apps/desktop/src/renderer/src/components/ui/scroll-area.tsx` (shadcn copy)
- `apps/desktop/src/renderer/src/components/ui/tooltip.tsx` (shadcn copy)
- `apps/desktop/src/renderer/src/components/ui/badge.tsx` (shadcn copy)
- `apps/desktop/src/renderer/src/components/ui/alert.tsx` (shadcn copy)
- `apps/desktop/src/renderer/src/components/ui/dialog.tsx` (shadcn copy)
- `apps/desktop/src/renderer/src/components/ui/label.tsx` (shadcn copy)
- `apps/desktop/src/renderer/src/components/ui/textarea.tsx` (shadcn copy)
- `packages/schemas/src/agent.test.ts` (round-trip + diagnostics + tier-consistency unit tests)
- `packages/schemas/src/frontmatter.test.ts` (passthrough + CRLF round-trip)
- `apps/desktop/src/main/ipc/agents.test.ts` (list / read / write / delete handlers against a temp fixture dir)
- `apps/desktop/tests/e2e/agent-editor.spec.ts` (Playwright: full flow — open fixture project, open agent, edit, see diagnostic, save, reload-from-disk, conflict modal)
- `tests/fixtures/project-basic/.claude/agents/*.md` (a handful of sample agents, at least one lead with Agent tool, one implementer with Agent tool to trigger the warning, one with a passthrough unknown key, one with invalid YAML)
- `tests/fixtures/project-basic/README.md`
- `apps/desktop/scripts/workspace-packages.ts` (optional; resolves workspace package names from `packages/*/package.json` at config-load time — keep it inline in the vite config if it's <15 lines)

### Modified
- `apps/desktop/src/shared/ipc.ts` (align `IpcEvent` fs shapes with what main actually broadcasts; ensure `fs:agentAdded` / `fs:agentRemoved` are representable; no breaking changes to request/response shapes unless the contract says so)
- `apps/desktop/src/main/ipc/index.ts` (add `agents:delete` handler; align the fs event shape the main emits with the declared `IpcEvent` union — currently emits `{ channel: 'fs:changed', ... }` which is not in the union)
- `apps/desktop/src/main/index.ts` (broadcastEvent shape correction — emit typed `IpcEvent` variants)
- `apps/desktop/src/renderer/src/routes/agents.tsx` (replace placeholder with `<AgentEditorPage />`; add `validateSearch` if we want to preserve the selected agent name in the URL — recommended per react.md)
- `apps/desktop/src/renderer/src/stores/` (create directory if missing; add `agentEditorStore.ts`)
- `apps/desktop/package.json` (add deps: `@codemirror/state`, `@codemirror/view`, `@codemirror/commands`, `@codemirror/language`, `@codemirror/lang-yaml`, `@codemirror/lang-markdown`, `@codemirror/lint`, `@codemirror/search`, `@radix-ui/react-select`, `@radix-ui/react-dialog`, `@radix-ui/react-tooltip`, `@radix-ui/react-scroll-area`, `@radix-ui/react-separator`, `@radix-ui/react-label`, `class-variance-authority` if not present, `fast-check` as devDep for schema prop tests)
- `apps/desktop/src/renderer/src/lib/utils.ts` (add `cn` variants if needed — likely no change)
- `packages/schemas/src/agent.ts` (minor: export a helper that converts `AgentValidationIssue[]` to line-anchored diagnostics given a raw frontmatter string; keeps renderer from hand-rolling YAML line math)
- `apps/desktop/electron.vite.config.ts` (modular exclusion list for `externalizeDepsPlugin`; absolute `routesDirectory`)

## Rules to read (by domain)

- shared: `.claude/rules/typescript.md`, `.claude/rules/monorepo.md`
- main: `.claude/rules/electron.md`, `.claude/rules/typescript.md`, `.claude/rules/tests.md`
- renderer: `.claude/rules/react.md`, `.claude/rules/typescript.md`, `.claude/rules/tests.md`
- qa: `.claude/rules/tests.md`, `.claude/rules/typescript.md`
- infra: `.claude/rules/monorepo.md`, `.claude/rules/electron.md`, `.claude/rules/typescript.md`

## Skills to load

- none (no skills directory populated yet)

## Acceptance criteria

### List + navigation
- [ ] Opening a project via Home → "Open project" and navigating to `/agents` renders a list of every `.md` file in `<project>/.claude/agents/`.
- [ ] The list shows each agent's `name`, a tier badge (`orchestrator` / `lead` / `implementer`, or "(no tier)"), a one-line description preview, and an error chip when `hasIssues`.
- [ ] Clicking a list item loads the agent into the editor pane in under 200ms on a warm cache (query already populated from the list).
- [ ] URL reflects selection (`/agents?name=<agent-name>`), validated via `validateSearch` with a Zod schema.
- [ ] With no `.claude/agents/` directory, the list shows an empty state with a "Create your first agent" call-to-action.

### Editor (CM6 split)
- [ ] Opening an agent renders TWO CodeMirror 6 editor instances: one for YAML frontmatter, one for markdown body. They share a theme but are independent `EditorView` instances.
- [ ] YAML pane uses `@codemirror/lang-yaml`; body pane uses `@codemirror/lang-markdown`. Neither pane imports the `codemirror` meta-package.
- [ ] Editing either pane marks the agent "dirty" in the Zustand slice. A header bar shows an unsaved indicator and a Save button.
- [ ] Ctrl/Cmd-S in either pane triggers save (handled via CM6 `keymap` extension).
- [ ] Save invokes `window.api.agents.write(projectPath, name, { path, relativePath, frontmatter, body })`. On success, dirty clears and `mtimeMs` is recorded in the store.
- [ ] Save button is disabled when there are `error`-level diagnostics; warnings do NOT block save.

### Diagnostics
- [ ] Any Zod error on the frontmatter renders as a red underline in the YAML pane at the line containing the offending key.
- [ ] Hover on the underline shows a tooltip with the error message.
- [ ] A sidebar diagnostics list mirrors the CM6 diagnostics. Clicking an entry scrolls the YAML pane to that line.
- [ ] `validateTierConsistency` warnings appear as yellow underlines on the `tools:` line AND render as inline warnings in the meta panel next to the tier picker. Both come from the same `AgentValidationIssue[]` — no duplicate logic in the renderer.
- [ ] Parse debounce is 250ms; diagnostics update within ~300ms of typing stopping.

### 3-tier picker
- [ ] A shadcn `Select` above the editor shows the current `x-tier` value, or "(no tier)".
- [ ] Changing the picker writes `x-tier` into the frontmatter YAML (the YAML pane updates to reflect the change) and marks the editor dirty.
- [ ] Changing tier from `implementer` to `lead` on an agent without the `Agent` tool immediately surfaces the "Lead agents should include the Agent tool" warning.
- [ ] Changing tier from `lead` to `implementer` on an agent that has the `Agent` tool immediately surfaces the "Implementer agents typically should not have the Agent tool" warning.
- [ ] Selecting "(no tier)" removes the `x-tier` key from frontmatter (not sets it to `undefined` — per `exactOptionalPropertyTypes` rules, the key must be omitted).

### Passthrough round-trip
- [ ] Reading an agent file that contains `custom-key: foo` and `another-unknown: [1, 2]`, making NO edits, then writing it yields byte-for-byte-equivalent frontmatter for those keys (ordering preserved). A Vitest property-based test in `packages/schemas/src/agent.test.ts` generates random frontmatter objects with both known and unknown keys and asserts round-trip stability.
- [ ] Editing only the body preserves all frontmatter keys, order, and values exactly.
- [ ] Editing only a known frontmatter field (e.g., `model`) preserves all unknown keys unchanged.

### FS watcher live reload
- [ ] With an agent open in the editor and NO unsaved edits, modifying the file on disk (simulated in Playwright by writing via `fs.writeFile`) updates the editor content within 1 second.
- [ ] With UNSAVED edits to an agent that changes on disk, a `ConflictResolutionDialog` appears within 1 second. The user can choose "Keep my changes" or "Load disk version". No silent overwrite.
- [ ] Adding a new file to `.claude/agents/` adds it to the list within 1 second.
- [ ] Removing a file from `.claude/agents/` removes it from the list within 1 second. If it was the open agent, the editor returns to an empty state with a notice.
- [ ] Saving from the app does NOT trigger a conflict modal (the event's mtime matches the one just written).

### Create / delete
- [ ] "New agent" opens a dialog with required fields: `name` (validated against the same regex as the schema: `/^[a-z0-9][a-z0-9-]*$/`), `description`, tier (optional). On submit, writes the file and navigates to it.
- [ ] Attempting to create an agent with a name that already exists surfaces an error in the dialog (does not overwrite).
- [ ] "Delete agent" opens a confirmation dialog. On confirm, calls `window.api.agents.delete`, removes from list, clears the editor pane if it was open.

### Schema + IPC contract
- [ ] `packages/schemas/src/agent.ts` exports a `diagnosticsToCodeMirror(issues, rawFrontmatter)` helper so renderer code doesn't hand-roll YAML line math.
- [ ] `apps/desktop/src/shared/ipc.ts` `IpcEvent` union accurately represents every shape main actually broadcasts. No `{ channel: 'fs:changed' }` events that aren't in the union.
- [ ] All IPC handlers validate their inputs with Zod on the main side (per `.claude/rules/electron.md`). Today `agents:write` calls `agentFrontmatterSchema.parse(file.frontmatter)` but does NOT validate `projectPath` / `agentName` / `body`. Tighten.
- [ ] Preload binds all four agent channels. Already does; verify after any signature change.

### Infra config (electron-vite)
- [ ] `pnpm dev` starts without errors. Main/preload/renderer all build; the Electron window opens.
- [ ] `externalizeDepsPlugin` receives an `exclude` list derived at config-load time from `packages/*/package.json` — not hardcoded. Adding a new empty workspace package (temporarily, in a test) with a unique name causes that name to appear in the exclusion list with no config edit.
- [ ] `TanStackRouterVite.routesDirectory` is absolute (`resolve(__dirname, ...)`); no `src/renderer/src/renderer/...` appears in any error output.
- [ ] A Vitest unit test covers the workspace-package discovery helper: given a fixture with N workspace packages, returns exactly those N names in deterministic order.
- [ ] Main process can import and execute code from `@agentic-dev-app/schemas` and `@agentic-dev-app/claude-protocol` at runtime (no `ERR_UNKNOWN_FILE_EXTENSION` for `.ts`).

### Quality gates
- [ ] `pnpm typecheck` passes across the workspace.
- [ ] `pnpm lint` passes.
- [ ] `pnpm test` passes (Vitest on schemas + main IPC handlers).
- [ ] `pnpm test:e2e` passes for the new Playwright spec.
- [ ] No `any`, no `@ts-ignore`. `@ts-expect-error` only with a reason comment.
- [ ] Renderer imports zero `node:*` modules. Main imports zero `react`/`@tanstack/react-*` modules.

## Verification plan

### Unit (Vitest)
- `packages/schemas/src/agent.test.ts`
  - Parse valid agent file → no issues.
  - Parse invalid YAML → error issue with `code: 'parse'`.
  - Parse frontmatter with extra unknown key → key present in result, no issue.
  - `validateTierConsistency`: lead without Agent → warning; implementer with Agent → warning; orchestrator with or without Agent → no tier-consistency warning; no tier → no tier-consistency warning.
  - Property test (fast-check): generate random frontmatter objects (known + unknown keys), serialize + parse, assert equality including key order for unknown keys.
  - Round-trip: parse → serialize → parse is a fixed point for both sample fixtures and generated inputs.
- `packages/schemas/src/frontmatter.test.ts`
  - LF and CRLF input produce equivalent parsed output.
  - Missing closing delimiter → `FrontmatterParseError`.
  - BOM-prefixed input is stripped.
- `apps/desktop/src/main/ipc/agents.test.ts`
  - Uses a temp dir with a fixture `.claude/agents/` layout.
  - `agents:list` returns summaries sorted by name, including parse-error entries with `hasIssues: true`.
  - `agents:read` for a missing file throws an Error (not returns an envelope).
  - `agents:write` preserves unknown frontmatter keys.
  - `agents:write` rejects invalid frontmatter (Zod error) without writing the file.
  - `agents:delete` removes the file and emits no error for a non-existent file if the contract says idempotent (contract to decide — flag in meta-contract-writer brief).

### E2E (Playwright)
- `apps/desktop/tests/e2e/agent-editor.spec.ts`
  - Launch Electron against a fresh copy of `tests/fixtures/project-basic`.
  - Open project via IPC helper (don't drive the system open dialog).
  - Navigate to `/agents`, assert list renders N fixture agents.
  - Click a lead-with-no-Agent-tool fixture; assert yellow underline on `tools:` line and inline warning in meta panel.
  - Click an agent with passthrough key `custom-note: hello`; edit body only; save; read file from disk; assert `custom-note: hello` still present.
  - While an agent is open with unsaved edits, modify the same file on disk via `fs.writeFile`; assert `ConflictResolutionDialog` appears within 2s; click "Load disk version"; assert editor content matches disk.
  - Create a new agent via the dialog; assert file exists on disk and navigation lands on it.
  - Delete that agent; assert it's gone from the list and file is removed from disk.

### Manual (smoke)
- Open the agentic-dev-app repo itself (it has its own `.claude/agents/` — currently empty / minimal, so manual may be deferred to a Buster-sample fixture folder).
- Open CLAUDE.md in VS Code while editing the same agent file in the app; trigger conflict modal by editing both and saving in VS Code.

## Dependencies

- Depends on task(s): 0001-foundation-scaffold (closed)
- Blocks task(s): future "settings editor", "commands editor", "hook script editor" — those tasks can reuse the CM6 split-editor composition and the FS-watcher conflict-resolution dialog written here, so the architectural shape this task lands is load-bearing for Phase 1.

## Notes

### Contract drift to resolve (meta-contract-writer must address)
1. **FS event shape.** `apps/desktop/src/main/index.ts` today emits `broadcastEvent('fs:changed', event)` with `{ projectPath, kind, path }`, but `shared/ipc.ts` `IpcEvent` union declares `fs:agentChanged` and `fs:settingsChanged`. The union is missing `agentAdded` / `agentRemoved` / `commandChanged` / `hookScriptChanged`. Contract decision: either (a) expand the union with discriminated variants per `kind`, or (b) collapse to a single `fs:changed` with a `kind` field and update the union. Recommendation: (a) — discriminated unions at the boundary per `.claude/rules/typescript.md`. The broadcast function in `main/index.ts` also currently spreads the event into the envelope incorrectly (`{ channel, ...(payload as Record<string, unknown>) }`) which would produce `{ channel: 'fs:changed', projectPath, kind, path }` — this does not match any current variant of `IpcEvent`. Fix is a two-line change once the contract is settled.
2. **`agents:delete` error semantics.** The IPC surface declares `delete: (projectPath, agentName) => Promise<void>`. Handler is absent. Decide: is deleting a non-existent agent idempotent (ENOENT → resolve) or an error? Contract decides; suggested: error, because the UI only exposes delete via a list item that must have existed.
3. **`agents:write` validation surface.** Today only frontmatter is Zod-validated. Per `.claude/rules/electron.md`: "Payloads are Zod-validated on the main side. Trust nothing from the renderer." Add request envelope validation (`projectPath: string`, `agentName: string matching ^[a-z0-9][a-z0-9-]*$`, `body: string`).
4. **Atomic write semantics.** Writing with plain `writeFile` risks a partial-file state if the process crashes mid-write. Contract should specify: write to `<agent>.md.tmp`, fsync, rename. This is extra-important on Windows where rename-over-existing requires `fs.rename` (not `fs.link`).

### Known constraints
- **Windows paths**: renderer treats paths as opaque strings (hard rule #10). All path construction / `.claude/agents/<name>.md` resolution happens in main. The renderer never calls `path.join`.
- **Native deps**: nothing new. CM6 and Radix primitives are pure JS.
- **Existing `parseAgentFile` issue surface**: it returns `AgentValidationIssue` without `from`/`to` line offsets. The renderer needs those to position CM6 diagnostics. Proposal: add a new helper in `packages/schemas/src/agent.ts` that takes the raw frontmatter string and issues, then returns diagnostics annotated with line number (computed by matching the issue's dotted `path` against YAML source line-by-line). Keep the helper pure (no CM6 imports) so the schemas package stays framework-free. The renderer wraps it to produce `Diagnostic[]` with actual `from` / `to` character offsets.

### Known pitfalls (embed into implementer briefs)
- `allowImportingTsExtensions: true` is ON — all new local imports must end in `.ts` / `.tsx`. (0001 learning)
- `routeTree.gen.ts` must exist before typecheck — new routes trigger `pnpm routes:generate`. (0001 learning)
- `exactOptionalPropertyTypes: true` — when building the `AgentFile` response object or the `AgentSummary` object, never assign `undefined` to optional fields. Use conditional spread. Specifically: setting `x-tier` to "(no tier)" in the editor must DELETE the key from the frontmatter object, not set it to `undefined`. (0001 learning)
- `RouterContext` must stay exported from `__root.tsx`. Any addition of typed context for this feature must keep that export. (0001 learning)
- `z.passthrough()` is already on `agentFrontmatterSchema` — do not introduce `.strip()` or `.strict()` variants accidentally during refactor. (electron.md + typescript.md both call this out.)
- `awaitWriteFinish: { stabilityThreshold: 150 }` in chokidar is intentional; don't tune it down even if tests feel slow. A shorter threshold produces duplicate events on VS Code saves. (electron.md)
- CM6 editors must dispose their `EditorView` on unmount. Failing to dispose leaks DOM and listeners.
- TanStack Query: filesystem-backed queries integrate with chokidar events — main emits, renderer invalidates. Don't poll. (react.md)
- Hook server contract (<5ms) is not in this task's path, but any IPC handler added here must still respond quickly; large read/write for an agent is < 50KB typical so sync file IO is not a concern — but use `node:fs/promises` everywhere for consistency.
- NEVER test against a production build in E2E — always dev build. (tests.md)

### Design references
- shadcn default styling is the baseline. No novel patterns requested.
- The split-editor layout mirrors the "VS Code with frontmatter visible" metaphor. One pane per MIME type, shared gutter style, shared theme.
- Tier badge colors: pick three distinct hues from the existing Tailwind palette for orchestrator (purple), lead (blue), implementer (green). Token names in `globals.css` — additive, backward-compatible.

### Scope update — 2026-04-19
Two infra bugs surfaced on the first `pnpm dev` run after 0001 closeout:
1. `TanStackRouterVite({ routesDirectory: 'src/renderer/src/routes' })` combined with renderer `root: 'src/renderer'` produces `scandir ...src\renderer\src\renderer\src\routes` ENOENT.
2. `externalizeDepsPlugin()` with no args externalizes every `dependencies` entry, including `@agentic-dev-app/schemas`. At runtime Node follows the workspace resolution to `packages/schemas/src/index.ts` and throws `ERR_UNKNOWN_FILE_EXTENSION`.
Folded into 0002 because (a) agent editor cannot run without main-process access to `@agentic-dev-app/schemas`, and (b) adding the fix as a standalone pre-task would break the six-flow rule against touching config outside a task file. Fix approach is modular (workspace-package discovery at config-load time) so future workspace packages inherit correct bundling automatically. Contract is NOT amended — these changes are config-only and do not alter IPC, UI, filesystem, or schema surfaces.
