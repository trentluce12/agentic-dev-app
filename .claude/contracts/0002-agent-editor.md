---
feature: agent-editor
task_id: 0002-agent-editor
created: 2026-04-19
status: ratified
---

# Feature Contract: agent-editor

> Single source of truth for field shapes that cross a layer boundary in task 0002. Written by `meta-contract-writer` before implementation begins. Only `meta-contract-writer` may amend it. Drift during implementation surfaces in the LEAD REPORT and triggers an amendment cycle — never a silent patch.

---

## Scope

This feature touches **shared**, **main**, **renderer**, and **qa** layers. It finishes wiring the four agent CRUD IPC handlers (`list`, `read`, `write`, `delete`), adds atomic-write semantics, tightens Zod validation on every handler input, rewrites the `IpcEvent` filesystem variants into a properly-discriminated union (aligning what `main/index.ts` broadcasts with what `shared/ipc.ts` declares), extends `packages/schemas/src/agent.ts` with a line-anchored diagnostic helper, and builds the renderer `features/agent-editor/` module (two-pane CM6 split editor, tier picker, conflict-resolution dialog, create/delete flows). **SQLite is not touched** (agent files are pure filesystem per hard rule #4). **The hook server and subprocess supervisor are not touched.**

---

## IPC Contract

> Every channel below has: (a) a Zod input-validation schema enforced in the main handler; (b) a typed response shape; (c) enumerated error cases. The handler types in `apps/desktop/src/shared/ipc.ts` are the compile-time source of truth; the Zod schemas live at the handler (imported from `@agentic-dev-app/schemas` when reusable).

### Channel: `agents:list`

**Status:** existing handler tightened — add Zod validation on `projectPath`, keep response shape unchanged.

**Request (validated on main):**

```ts
const agentsListRequestSchema = z.object({
  projectPath: z.string().min(1),
});
```

**Request type (shared):**

```ts
// invocation: ipcRenderer.invoke('agents:list', projectPath)
type AgentsListRequest = { projectPath: string };
```

**Response:**

```ts
type AgentsListResponse = AgentSummary[]; // existing export from shared/ipc.ts

interface AgentSummary {
  path: string;              // absolute (main-normalized)
  relativePath: string;      // relative to projectPath, POSIX separators
  name: string;              // from frontmatter.name, fallback to filename (without .md)
  description: string;       // from frontmatter.description, "" if missing
  tier?: 'orchestrator' | 'lead' | 'implementer'; // key OMITTED when no tier (exactOptionalPropertyTypes)
  tools: string[];           // resolved from frontmatter.tools (CSV or array)
  model?: string;            // key OMITTED when absent
  hasIssues: boolean;        // true iff parseAgentFile produced any level:'error' issue
  lastModified: number;      // mtimeMs — NEW field for list sorting / display
}
```

> **Contract change vs. current code:** `AgentSummary` adds `lastModified: number`. Not breaking at runtime; adds one field. Consumers (renderer list) start using it; old consumers ignore it.

**Behavior:**
- If `<projectPath>/.claude/agents/` does not exist, return `[]`.
- If a single file fails to parse, include a summary with `hasIssues: true`, `description: '(parse error)'`, `name: <filename without .md>` — do NOT throw. A broken file must not hide good files.
- Sort by `name` (locale-aware, case-insensitive, ascending). Deterministic ordering is required for the renderer list.
- Listing is flat — subdirectories under `.claude/agents/` are ignored (per task out-of-scope).

**Errors (handler throws; preload re-throws; renderer `useQuery` surfaces via `error`):**
- `ZodError` on invalid `projectPath` → renderer shows "Invalid project path" toast (route-level error boundary catches).
- `Error` wrapping `ENOENT` on `readdir` — never reached because handler guards with `pathExists`, but documented for defense in depth.

---

### Channel: `agents:read`

**Status:** existing handler tightened — add Zod validation, keep response shape unchanged.

**Request:**

```ts
const agentsReadRequestSchema = z.object({
  projectPath: z.string().min(1),
  agentName: agentNameSchema, // see Filesystem Contract below
});
```

```ts
// invocation: ipcRenderer.invoke('agents:read', projectPath, agentName)
type AgentsReadRequest = { projectPath: string; agentName: string };
```

**Response:**

```ts
type AgentsReadResponse = AgentFile;

interface AgentFile {
  path: string;
  relativePath: string;
  frontmatter: AgentFrontmatter; // from @agentic-dev-app/schemas, passthrough preserved
  body: string;
  issues: AgentValidationIssue[]; // parse + tier-consistency warnings
  mtimeMs: number;
  rawFrontmatter: string; // NEW — the exact YAML text between the --- fences, needed by CM6 diagnostics helper
}
```

> **Contract change vs. current code:** `AgentFile` adds `rawFrontmatter: string`. The renderer's CM6 YAML pane is seeded from this field and preserves the user's original formatting (comments, quoting, blank lines) until they edit. `parseFrontmatter` already returns it — just expose it up the chain.

**Behavior:**
- Read with `readFile(absPath, 'utf8')`. Line endings in the stored file are preserved verbatim in `rawFrontmatter` and `body`. UTF-8 only.
- `stat` after read to fill `mtimeMs`. Used by the renderer to suppress a self-inflicted conflict modal (see UI contract).

**Errors:**
- `ZodError` on invalid request fields.
- `Error` (fs ENOENT) when the file is missing → renderer surfaces "Agent file not found"; typically indicates the list is stale; the renderer should invalidate the `['agents', projectPath]` key.
- `FrontmatterParseError` when the file exists but has malformed frontmatter → renderer shows the file with `issues` populated and an error banner (handler does NOT throw in this case — it returns an `AgentFile` with `issues` containing the parse error; the body is the raw text after the closing delimiter if one was found, otherwise empty string).

> **Contract clarification:** a file whose frontmatter is so broken that `parseFrontmatter` throws (no opening `---`, no closing `---`) results in the handler throwing. A file whose frontmatter parses as YAML but fails the Zod schema returns successfully with `issues` populated. This matches the current behavior of `parseAgentFile`.

---

### Channel: `agents:write`

**Status:** existing handler — tightened validation on ALL input fields; switched to atomic-write semantics.

**Request:**

```ts
const agentsWriteRequestSchema = z.object({
  projectPath: z.string().min(1),
  agentName: agentNameSchema,
  file: z.object({
    path: z.string().min(1),          // accepted but not used for write target; main re-derives from projectPath+agentName
    relativePath: z.string().min(1),  // accepted but not used
    frontmatter: agentFrontmatterSchema, // z.passthrough() preserved
    body: z.string(),                  // may be empty
  }),
});
```

```ts
// invocation: ipcRenderer.invoke('agents:write', projectPath, agentName, file)
type AgentsWriteRequest = {
  projectPath: string;
  agentName: string;
  file: Omit<AgentFile, 'issues' | 'mtimeMs' | 'rawFrontmatter'>;
};
```

**Response:**

```ts
type AgentsWriteResponse = AgentFile; // same shape as read, with post-write mtimeMs and re-serialized rawFrontmatter
```

**Behavior:**
1. Zod-validate the full request envelope. Reject with ZodError if `agentName` fails the slug regex, `projectPath` is empty, or `frontmatter.name` / `frontmatter.description` is missing.
2. **Cross-check:** `request.agentName` must equal `request.file.frontmatter.name`. If they diverge, throw `Error('agent name mismatch: request.agentName=<a> file.frontmatter.name=<b>')`. Rename is out of scope.
3. Resolve target path: `absPath = join(projectPath, '.claude', 'agents', `${agentName}.md`)`. Main normalizes separators; the renderer never constructs this path.
4. Ensure parent directory exists (`mkdir({ recursive: true })` on `.claude/agents/`).
5. Serialize: `content = serializeAgentFile(parsed, body)`. Trailing newline rules: `serializeFrontmatter` in `packages/schemas` already produces `---\n<yaml>\n---\n<body>` with a leading newline injected into the body if missing. Keep that behavior.
6. **Atomic write:**
   - Write to `<absPath>.tmp` via `writeFile(tmpPath, content, 'utf8')`.
   - `fsync` the temp file handle (use `fs.open` / `fsync` / `close` — the `fs.writeFile` shortcut does not fsync).
   - `rename(tmpPath, absPath)`. On Windows, `fs.rename` atomically replaces the target file on the same volume.
   - On any error during the above, attempt `unlink(tmpPath)` (best-effort), then rethrow.
7. `stat(absPath)` → `mtimeMs`.
8. Re-read raw frontmatter via `parseFrontmatter` to populate `rawFrontmatter` in the response (since serialization may canonicalize formatting).
9. Return `AgentFile` with `issues` re-computed from the written content (the handler re-parses to ensure what was written is what validates).

**Failure modes documented (atomic write):**
- Disk full during `writeFile(tmpPath)` → tmp file may exist partially; handler unlinks it; the real file is untouched.
- Process crash between `writeFile` and `rename` → `<name>.md.tmp` is left on disk. The list handler ignores `.tmp` files. A startup sweep of stale `.tmp` files is NOT in scope.
- Process crash between `rename` start and completion → on NTFS and APFS `rename` is atomic within a volume; the real file is either the old one or the new one, never a torn state. Good.
- File is held open by another process (rare on Windows) → `rename` throws `EBUSY`; handler rethrows. Renderer surfaces "File is locked — close it in your editor and retry."

**Errors:**
- `ZodError` on validation → renderer leaves the editor dirty, surfaces the failing field in the diagnostics panel.
- `Error('agent name mismatch: ...')` → renderer shows a modal instructing the user that rename is not supported in this release.
- `Error` wrapping fs error codes (`EACCES`, `EBUSY`, `ENOSPC`) → propagated to the renderer's mutation `onError`.

---

### Channel: `agents:create`

**Status:** NEW explicit channel. Distinct from `agents:write` to make "refuses to overwrite" semantics a property of the channel (not a flag on write).

**Request:**

```ts
const agentsCreateRequestSchema = z.object({
  projectPath: z.string().min(1),
  agentName: agentNameSchema,
  frontmatter: agentFrontmatterSchema,
  body: z.string().default(''),
});
```

```ts
type AgentsCreateRequest = {
  projectPath: string;
  agentName: string;
  frontmatter: AgentFrontmatter;
  body: string;
};
```

**Response:**

```ts
type AgentsCreateResponse = AgentFile;
```

**Behavior:**
1. Same validation pipeline as `agents:write`, including `agentName === frontmatter.name`.
2. Resolve `absPath`. If it already exists (`pathExists(absPath) === true`), throw `Error('agent already exists: <agentName>')`. Do NOT overwrite.
3. `mkdir({ recursive: true })` on `.claude/agents/`.
4. Atomic write exactly as `agents:write` step 6.
5. Return `AgentFile`.

**Errors:**
- `ZodError` on validation.
- `Error('agent already exists: ...')` → renderer surfaces inline in the "New agent" dialog.
- `Error` wrapping fs codes.

> **IpcChannel union addition:** `'agents:create'` must be added to the `IpcChannel` string literal union in `shared/ipc.ts`. Preload gains `agents.create(projectPath, agentName, frontmatter, body) => Promise<AgentFile>`.

---

### Channel: `agents:delete`

**Status:** NEW handler. Already declared in `shared/ipc.ts` and bound in preload; the main handler is missing and must be added.

**Request:**

```ts
const agentsDeleteRequestSchema = z.object({
  projectPath: z.string().min(1),
  agentName: agentNameSchema,
});
```

```ts
type AgentsDeleteRequest = { projectPath: string; agentName: string };
```

**Response:**

```ts
type AgentsDeleteResponse = void;
```

**Behavior:**
1. Validate request.
2. Resolve `absPath = join(projectPath, '.claude', 'agents', `${agentName}.md`)`.
3. `unlink(absPath)`.
4. Return (no response body).

**Error semantics (Q1 resolved — throw on missing):**
- File does not exist → handler throws `Error('agent not found: <agentName>')`. **Non-idempotent by design.** Rationale: the UI only exposes delete via a list item the user clicked; the item can only have come from a successful `agents:list`. A missing file at delete time means the list is stale; the error surfaces that staleness to the renderer, which invalidates the list query.
- `EACCES` / other fs errors → rethrow verbatim.

---

### IpcEvent — FS subchannel (main → renderer broadcast)

**Status:** REVISED discriminated union. The current `IpcEvent` declares `fs:agentChanged` and `fs:settingsChanged`, but `main/index.ts` broadcasts `fs:changed` with `{ projectPath, kind, path }` — the two never meet. Resolution: (a) expand the union with per-kind discriminators; (b) fix `main/index.ts` `broadcastEvent` to emit typed variants.

**New union (complete `IpcEvent`):**

```ts
export type IpcEvent =
  // Existing session / hook events — unchanged
  | { channel: 'session:event'; sessionId: string; payload: unknown }
  | { channel: 'session:status'; sessionId: string; status: SessionSummary['status'] }
  | { channel: 'hook:received'; sessionId: string; payload: HookPayload }
  // FS events — REVISED, per-kind discriminators
  | { channel: 'fs:agentAdded'; projectPath: string; agentPath: string }
  | { channel: 'fs:agentChanged'; projectPath: string; agentPath: string }
  | { channel: 'fs:agentRemoved'; projectPath: string; agentPath: string }
  | { channel: 'fs:commandAdded'; projectPath: string; commandPath: string }
  | { channel: 'fs:commandChanged'; projectPath: string; commandPath: string }
  | { channel: 'fs:commandRemoved'; projectPath: string; commandPath: string }
  | { channel: 'fs:settingsChanged'; projectPath: string; settingsPath: string }
  | { channel: 'fs:hookScriptChanged'; projectPath: string; hookPath: string };
```

**Broadcast translation (in `main/index.ts`):**

```ts
fsWatcher.onChange((event) => {
  // event.kind is the existing FsChangeKind from fs-watcher.ts
  switch (event.kind) {
    case 'agentAdded':
      broadcastTyped({ channel: 'fs:agentAdded', projectPath: event.projectPath, agentPath: event.path });
      break;
    case 'agentChanged':
      broadcastTyped({ channel: 'fs:agentChanged', projectPath: event.projectPath, agentPath: event.path });
      break;
    case 'agentRemoved':
      broadcastTyped({ channel: 'fs:agentRemoved', projectPath: event.projectPath, agentPath: event.path });
      break;
    case 'commandAdded':
    case 'commandChanged':
    case 'commandRemoved':
      broadcastTyped({ channel: `fs:${event.kind}`, projectPath: event.projectPath, commandPath: event.path });
      break;
    case 'settingsChanged':
      broadcastTyped({ channel: 'fs:settingsChanged', projectPath: event.projectPath, settingsPath: event.path });
      break;
    case 'hookScriptChanged':
      broadcastTyped({ channel: 'fs:hookScriptChanged', projectPath: event.projectPath, hookPath: event.path });
      break;
  }
});
```

Where `broadcastTyped(evt: IpcEvent)` does `win.webContents.send('ipc:event', evt)` for every open window. The current untyped `broadcastEvent(channel, payload)` helper is **removed**; it was the source of the drift.

**Existing fs-watcher kinds retained:** `fs-watcher.ts`'s `FsChangeKind` union already enumerates every kind emitted (`agentAdded | agentChanged | agentRemoved | commandAdded | commandChanged | commandRemoved | settingsChanged | hookScriptChanged`). No changes to the watcher required. The bug is purely in the broadcast-translation layer.

**Command fs events:** included in the union even though the command editor is out of scope for task 0002. The cost is two extra variants now; the benefit is that future tasks do not have to re-amend this contract. Renderer ignores unrecognized `fs:command*` events until the commands editor ships.

---

### Preload bindings (`window.api.agents.*`)

Final preload shape:

```ts
window.api.agents = {
  list:   (projectPath: string) => Promise<AgentSummary[]>;
  read:   (projectPath: string, agentName: string) => Promise<AgentFile>;
  write:  (projectPath: string, agentName: string, file: Omit<AgentFile, 'issues' | 'mtimeMs' | 'rawFrontmatter'>) => Promise<AgentFile>;
  create: (projectPath: string, agentName: string, frontmatter: AgentFrontmatter, body: string) => Promise<AgentFile>;
  delete: (projectPath: string, agentName: string) => Promise<void>;
};
```

Each method is a thin `ipcRenderer.invoke(<channel>, ...args)` — no business logic in preload.

---

## UI Contract

> Renderer-side bindings. Route lives at `/agents`, the placeholder already scaffolded in `routes/agents.tsx`. All data reaches the renderer exclusively through `window.api`.

### Route

- Path: `/agents` (already exists; replace placeholder body with `<AgentEditorPage />`).
- Search params (Zod-validated via `validateSearch`):
  ```ts
  const agentsSearchSchema = z.object({
    name: z.string().optional(), // currently-selected agent slug
  });
  ```
- Selecting an agent updates the URL (`/agents?name=<slug>`) so the selection is shareable and back/forward works.

### Data bindings

| Binding | Hook | Key | Source | Consumer |
|---|---|---|---|---|
| Project path (current) | Zustand `useProjectStore` | n/a | selected in Home route | required prop/context for `AgentEditorPage` |
| Agent list | `useQuery` | `['agents', projectPath]` | `window.api.agents.list(projectPath)` | `AgentList` |
| Selected agent file | `useQuery` | `['agents', projectPath, name]` | `window.api.agents.read(projectPath, name)` | `AgentEditorSplit`, `AgentMetaPanel`, `DiagnosticsList` |
| Write mutation | `useMutation` | n/a | `window.api.agents.write(...)` | Save button, Cmd/Ctrl-S |
| Create mutation | `useMutation` | n/a | `window.api.agents.create(...)` | `NewAgentDialog` submit |
| Delete mutation | `useMutation` | n/a | `window.api.agents.delete(...)` | `DeleteAgentDialog` confirm |

Cache invalidation rules:
- Successful `write` → set `['agents', projectPath, name]` to the returned `AgentFile` (writeback); invalidate `['agents', projectPath]` (list might show stale `lastModified` / `hasIssues`).
- Successful `create` → same as write, plus navigate to `/agents?name=<newName>`.
- Successful `delete` → remove `['agents', projectPath, name]` from cache; invalidate `['agents', projectPath]`; if it was the currently-selected agent, clear URL `name` param.

### UI field ↔ IPC field mapping

| UI element | Input type | Request field | Response field | Notes |
|---|---|---|---|---|
| Agent list item name | readonly text | n/a | `AgentSummary.name` | |
| Tier badge | readonly | n/a | `AgentSummary.tier` | color: orchestrator=purple, lead=blue, implementer=green, undefined="(no tier)" muted |
| Description preview | readonly | n/a | `AgentSummary.description` | single line, ellipsis overflow |
| Error chip | readonly | n/a | `AgentSummary.hasIssues` | shows when true |
| YAML pane content | CM6 `EditorView` | `file.frontmatter` (parsed YAML) + contributes to `rawFrontmatter` | seeded from `AgentFile.rawFrontmatter` | the pane is the source of truth for YAML text; on save, text is parsed + validated |
| Body pane content | CM6 `EditorView` | `file.body` | seeded from `AgentFile.body` | |
| Tier picker | shadcn `Select` | rewrites `frontmatter['x-tier']` in YAML pane | reads `AgentFile.frontmatter['x-tier']` | "(no tier)" option DELETES the key; does not set to `undefined` |
| Tool list (readonly view) | read-only badges | derived from YAML pane parse | `AgentSummary.tools` | editable only via YAML pane |
| Save button | button | triggers write mutation | n/a | disabled when `issues.some(i => i.level === 'error')` |
| New Agent dialog — `name` | text (regex-validated) | `AgentsCreateRequest.agentName` and `frontmatter.name` | n/a | same regex as `agentNameSchema` |
| New Agent dialog — `description` | text | `frontmatter.description` | n/a | required, min 1 char |
| New Agent dialog — tier | radio group | `frontmatter['x-tier']` | n/a | optional; "(no tier)" = omit |
| Delete confirm | button | `AgentsDeleteRequest.agentName` | n/a | modal shows `<name>` and file path |

### Tier picker and Agent-tool consistency

- Picker values: `'orchestrator' | 'lead' | 'implementer' | '(no tier)'`.
- Changing the picker rewrites the YAML pane's text:
  - Selecting a non-none tier → ensures a `x-tier: <value>` line exists in the frontmatter. If the key exists, its value is updated; otherwise the key is inserted immediately before the closing `---` fence (so round-trip order for existing keys is preserved).
  - Selecting "(no tier)" → DELETES the `x-tier` key from the frontmatter (not set to `undefined`; this matches `exactOptionalPropertyTypes`).
- Picker does NOT auto-mutate the `tools` array. When the user changes tier, the existing `validateTierConsistency` check re-runs on the parsed frontmatter and surfaces a warning inline next to the picker AND as a CM6 yellow underline on the `tools:` line. Both warnings come from the same `AgentValidationIssue[]` — single source of truth.
- A "Fix: add Agent tool" / "Fix: remove Agent tool" action button appears inline next to the inline warning. Clicking it rewrites the `tools:` line in the YAML pane. Applying the fix is explicit; never automatic on tier change.

### Conflict modal (hard rule #9 — no silent overwrite)

Trigger: the renderer receives an `fs:agentChanged` event for `<currentProjectPath>/.claude/agents/<currentAgentName>.md` AND the Zustand `agentEditorStore.dirty === true`.

Suppression: the write mutation records the response's `mtimeMs` in the store. If a subsequent `fs:agentChanged` event arrives within a debounce window (implementation detail: compare the file's new `mtimeMs` via a fresh `stat` triggered by the FS event, to the store's last-written `mtimeMs`. If they match, it's a self-inflicted event — suppress the modal AND do not invalidate the cache).

Modal (`ConflictResolutionDialog`) offers three options:
1. **Keep my changes** → discard the on-disk version. On next save, overwrite happens via the normal write flow. No immediate IPC call.
2. **Load disk version** → invalidate the `['agents', projectPath, name]` query; user loses their in-memory edits (they are warned in the modal copy).
3. **Open in external diff** → disabled for this task; tooltip: "External diff view — coming in a later release."

Behavior on `fs:agentAdded` / `fs:agentRemoved`: invalidate the list query. If the removed file was the currently-selected agent, clear the URL `?name` search param and show an in-page notice ("This agent was removed on disk.").

### URL-state handling (per react.md)

- Selected agent name is in the URL, not Zustand. Zustand holds only ephemeral editor state (dirty flag, draft YAML, draft body, conflict state, last-written mtimeMs).
- Leaving `/agents` preserves neither dirty flag nor drafts; the editor is reset on route entry.

---

## Filesystem Contract

> Every path this feature reads or writes. Only main touches the FS; the renderer treats paths as opaque strings (hard rule #10).

### `<projectPath>/.claude/agents/<agentName>.md`

| Aspect | Value |
|---|---|
| Read encoding | UTF-8 |
| Write encoding | UTF-8 |
| BOM handling | `parseFrontmatter` strips leading BOM; serializer does not emit BOM |
| Line endings on read | preserved verbatim in `rawFrontmatter` and `body` (both LF and CRLF tolerated by `parseFrontmatter`) |
| Line endings on write | serializer uses `\n` (LF). Files originally saved with CRLF will be converted to LF on write. Known trade-off; documented. VS Code on Windows defaults to CRLF but is tolerant of LF. If this becomes a user complaint, add a round-trip preservation pass in a follow-up task. |
| Schema | `agentFrontmatterSchema` from `@agentic-dev-app/schemas` (`.passthrough()`) |
| Write mode | atomic: write `<name>.md.tmp` → fsync → rename |
| Agent name regex | `/^[a-z0-9][a-z0-9-]*$/` (lowercase, digits, hyphens; starts alphanumeric) |
| Filename rule | identity — `agentName` is the slug AND the filename stem. No slug transformation. Invalid input is REJECTED by Zod, not silently slugified. |
| Listing policy | flat (subdirs ignored). `*.md` only. `*.md.tmp` explicitly filtered. |

**Agent name schema (shared, exported from `packages/schemas/src/agent.ts`):**

```ts
export const agentNameSchema = z
  .string()
  .regex(/^[a-z0-9][a-z0-9-]*$/, 'agent name must be lowercase letters, digits, and hyphens, starting alphanumeric');
```

Reused by:
- `agents:read`, `agents:write`, `agents:create`, `agents:delete` request schemas.
- Frontmatter `name` field (already uses the same regex inline — replace with `agentNameSchema` reference for single source).
- `NewAgentDialog` form validation via `@hookform/resolvers/zod`.

### No other `.claude/*` files touched

- `.claude/settings.json`, `.claude/commands/*.md`, `.claude/hooks/*` — untouched in this task.
- `.claude/agents/<name>.md.tmp` — only created transiently during atomic writes. Must be ignored by `agents:list` (filter out `*.tmp`). Any leftover `.tmp` file from a crashed prior write remains on disk — out of scope to clean up automatically in this task; file a follow-up if it bites.

---

## Schema Contract

> Changes to `packages/schemas`. No changes to `packages/claude-protocol`.

### `packages/schemas/src/agent.ts` — additions

| Export | Shape | Purpose | Breaking? |
|---|---|---|---|
| `agentNameSchema` | `z.string().regex(...)` (see Filesystem Contract) | single source of the agent-name regex | No — new export |
| `diagnosticsToCodeMirror` | `(issues: AgentValidationIssue[], rawFrontmatter: string) => CodeMirrorDiagnostic[]` | maps Zod/tier-consistency issues to line-anchored diagnostics for the renderer's CM6 linter | No — new export |
| `CodeMirrorDiagnostic` | type (see below) | plain-object diagnostic shape, framework-free | No — new export |
| `AgentValidationIssue` | existing, add optional `line?: number` and optional `col?: number` | lets consumers reason about location without re-computing | Non-breaking — fields optional |

**`CodeMirrorDiagnostic` shape (framework-free; renderer adapter maps to CM6 `Diagnostic`):**

```ts
export interface CodeMirrorDiagnostic {
  severity: 'error' | 'warning' | 'info';
  message: string;
  /** 1-indexed line within the rawFrontmatter (excluding the leading `---` fence). */
  line: number;
  /** 1-indexed column; omitted when unknown. */
  col?: number;
  /** Zod issue code or tier-consistency code (`tier.lead-missing-agent-tool` etc.). */
  code: string;
}
```

**`diagnosticsToCodeMirror` semantics (line-number resolution):**

- Input: the `AgentValidationIssue[]` from `parseAgentFile`, plus the `rawFrontmatter` string (the YAML text between the `---` fences, newline-normalized internally to `\n`).
- Output: one `CodeMirrorDiagnostic` per issue. `line` is 1-indexed in the raw frontmatter (so line 1 is the first YAML key line, NOT the `---` fence).
- Mapping algorithm:
  1. If `issue.path` is empty → `line: 1` (top-of-frontmatter marker).
  2. If `issue.path` is a single-segment key (e.g., `"description"` or `"tools"`) → find the first line in `rawFrontmatter` matching `^<key>\s*:` (ignoring whitespace-only leading lines). Use that line's 1-indexed position.
  3. If `issue.path` is dotted (e.g., `"skills.0"`, `"mcpServers.2"`) → locate the top-level key (`skills`, `mcpServers`), then scan subsequent lines for the N-th list item (lines starting with `-` at a deeper indent). If the index cannot be resolved, fall back to the parent key's line.
  4. If no key match found → `line: 1`.
- `col` is emitted only when the line match produces a clear column for the offending key/value; otherwise omitted.
- **Severity mapping:**
  - `issue.level === 'error'` → `severity: 'error'`. Emitted for: Zod parse failures (required fields missing, regex mismatches, union mismatches) and the `FrontmatterParseError` code.
  - `issue.level === 'warning'` → `severity: 'warning'`. Emitted for: `tier.lead-missing-agent-tool`, `tier.implementer-has-agent-tool`, and (future) unknown-tool-name warnings.
  - `severity: 'info'` is reserved; no issue currently emits info.
- Helper is **pure** — no CM6 imports, no Node imports. Uses only string operations on the YAML text. Renderer wraps the output with CM6's document model to compute `from`/`to` character offsets.

### `AgentValidationIssue` — optional line/col

Extending the existing interface:

```ts
export interface AgentValidationIssue {
  level: 'error' | 'warning';
  code: string;
  message: string;
  path?: string;
  line?: number; // 1-indexed in rawFrontmatter, optional
  col?: number;  // 1-indexed column, optional
}
```

Non-breaking because the fields are optional. `parseAgentFile` may populate them opportunistically (e.g., from Zod's path + a line scan) or leave them absent; `diagnosticsToCodeMirror` is the canonical producer.

### `serializeAgentFile` — passthrough key order guarantee

**Required behavior (contract, re-stated for clarity):**
- Unknown (passthrough) keys in the input frontmatter object MUST appear in the serialized YAML in the same relative order as in the input object.
- Because JavaScript `Object` insertion order is stable for string keys, the existing implementation (`yaml.stringify(frontmatter, { lineWidth: 0 })`) already satisfies this AS LONG AS the renderer / IPC boundary preserves key order through serialization.
- Risk: `JSON.stringify` / `JSON.parse` across IPC preserves key order in V8. OK.
- Risk: the Zod schema applies `.passthrough()` which on `parse` emits a new object — `z.passthrough` preserves insertion order of the validated shape. Verified by property-based test (`packages/schemas/src/agent.test.ts`).

### `packages/schemas/src/index.ts` — re-exports

Add:

```ts
export { agentNameSchema, diagnosticsToCodeMirror } from './agent.ts';
export type { CodeMirrorDiagnostic } from './agent.ts';
```

### `packages/claude-protocol` — no changes

This task does not touch the Claude stream-json / transcript / hook types. Explicitly out of scope.

---

## SQLite Contract

**NO SQLite tables are created, altered, or queried in this task.**

Explicit confirmation (per hard rule #4): agent `.md` files live on the filesystem; SQLite never shadows them. The `sessions`, `tickets`, `app_settings`, `recent_projects`, etc. tables are untouched. No migration file is generated. Any implementer that feels tempted to cache agent data in SQLite MUST escalate to the lead as a contract-amendment request; do not add a table silently.

---

## Hooks / Subprocess Contract

**NO hook-server routes are added, modified, or removed.** The hook server's <5ms hot-path contract is preserved by not touching it. `ClaudeSupervisor` and `startHookServer` are untouched.

---

## Acceptance Criteria

> Copied verbatim from the task file. Load-bearing — every implementer treats these as the definition of done.

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

### Quality gates
- [ ] `pnpm typecheck` passes across the workspace.
- [ ] `pnpm lint` passes.
- [ ] `pnpm test` passes (Vitest on schemas + main IPC handlers).
- [ ] `pnpm test:e2e` passes for the new Playwright spec.
- [ ] No `any`, no `@ts-ignore`. `@ts-expect-error` only with a reason comment.
- [ ] Renderer imports zero `node:*` modules. Main imports zero `react`/`@tanstack/react-*` modules.

---

## Verification Plan

> `lead-qa` owns this section. Verification happens after `lead-shared`, `lead-main`, and `lead-renderer` report DONE.

### Unit (Vitest)

**`packages/schemas/src/agent.test.ts`:**
- `parseAgentFile` on valid fixture → zero issues.
- `parseAgentFile` on malformed YAML → thrown `FrontmatterParseError`.
- `parseAgentFile` on valid YAML, invalid Zod (e.g., missing `description`) → returns with `issues[].level === 'error'`.
- `parseAgentFile` on frontmatter with passthrough keys (`custom-key: foo`) → key is present in `result.frontmatter`, zero issues.
- `validateTierConsistency`:
  - lead + no Agent tool → warning `tier.lead-missing-agent-tool`.
  - implementer + Agent tool → warning `tier.implementer-has-agent-tool`.
  - orchestrator (with or without Agent) → no tier-consistency warning.
  - no `x-tier` → no warnings.
- `diagnosticsToCodeMirror`:
  - issue with `path: 'description'` on frontmatter `name: x\ndescription: ""` → `line === 2`.
  - issue with `path: 'skills.2'` on frontmatter with `skills: [a, b, c]` → line resolves to the third list item (or falls back to the `skills:` line if list items span multiple YAML forms).
  - issue with empty `path` → `line === 1`.
- Property-based (`fast-check`):
  - Generate random frontmatter objects mixing known (`name`, `description`, optional `tools`, optional `x-tier`) and unknown keys. Assert: `parseAgentFile(serializeAgentFile(fm, body)).frontmatter` deep-equals `fm` AND preserves key order.
  - Generate agent-name strings matching `[a-z0-9][a-z0-9-]*` of varying lengths → always pass `agentNameSchema`.
  - Generate random strings → assert only those matching the regex pass.

**`packages/schemas/src/frontmatter.test.ts`:**
- LF input: parse → serialize → parse is a fixed point.
- CRLF input: parse succeeds; serialize output uses LF (documented conversion).
- BOM-prefixed input: BOM stripped, content intact.
- No opening `---` → `FrontmatterParseError` thrown.
- No closing `---` → `FrontmatterParseError` thrown.

**`apps/desktop/src/main/ipc/agents.test.ts`:**
- `agents:list` against a temp dir with 3 agent files (valid, invalid YAML, passthrough key) → returns 3 summaries, sorted by name, with `hasIssues` set correctly, and `.tmp` files (if any) filtered.
- `agents:read` against a valid agent → returns `AgentFile` including `rawFrontmatter` and `mtimeMs`.
- `agents:read` against non-existent file → throws (test that the error is thrown, not swallowed).
- `agents:write` with valid input → file written, re-read equals written content.
- `agents:write` with passthrough key in frontmatter → written file contains the passthrough key.
- `agents:write` with frontmatter missing `description` → Zod error, file NOT written (assert via `readFile` that content is unchanged).
- `agents:write` with `agentName !== frontmatter.name` → throws "agent name mismatch".
- `agents:write` atomic semantics: stub `rename` to throw; assert no `<name>.md` change AND `<name>.md.tmp` cleaned up.
- `agents:create` on a fresh name → file written, returned shape matches.
- `agents:create` on an existing name → throws "agent already exists"; file unchanged.
- `agents:delete` on existing file → file removed.
- `agents:delete` on missing file → throws "agent not found".

### E2E (Playwright)

**`apps/desktop/tests/e2e/agent-editor.spec.ts`:**
- Launch Electron against a fresh copy of `tests/fixtures/project-basic`.
- Open project via IPC helper (do NOT drive the system open dialog).
- Navigate to `/agents`, assert the list renders N fixture agents (N matches fixture count).
- Click a lead-with-no-Agent-tool fixture; assert yellow underline on the `tools:` line AND an inline warning next to the tier picker.
- Click an agent with passthrough key `custom-note: hello`; edit body only; save; read file from disk; assert `custom-note: hello` still present.
- While an agent is open with unsaved edits, modify the same file on disk via `fs.writeFile`; assert `ConflictResolutionDialog` appears within 2s; click "Load disk version"; assert editor content matches disk.
- Create a new agent via `NewAgentDialog`; assert file exists on disk and URL becomes `/agents?name=<new>`.
- Delete that agent; assert list no longer contains it and `readdir` confirms file removed.

### Manual smoke

- Open the agentic-dev-app repo itself (has its own `.claude/agents/` — currently empty). Validates empty-state UX.
- Open the Buster repo (`C:\Projects\buster`) as a fixture-rich project. Expect ~28 agents listed with correct tier badges.
- Edit `CLAUDE.md`-related agent in VS Code while editing the same agent file in the app; trigger conflict modal via VS Code save.

### Contract verification (lead-qa sub-task)

- Grep-verify that no IPC handler lacks Zod validation:
  - `rg 'ipcMain.handle\(' apps/desktop/src/main/ipc/` — every hit must be followed (within 10 lines) by either a `.parse(` call on the relevant input or a Zod schema reference.
- Grep-verify no renderer imports `node:` modules:
  - `rg "from 'node:" apps/desktop/src/renderer/` — must be empty.
- Grep-verify no main imports `react` / `@tanstack/react-*`:
  - `rg "from 'react" apps/desktop/src/main/` — must be empty.
- Grep-verify `IpcEvent` no longer has ad-hoc `fs:changed`:
  - `rg "'fs:changed'" apps/desktop/src/` — must be empty.

---

## Roadblocks

> Populated during implementation. Each entry becomes a future `learnings.md` line.

```yaml
# empty — implementers fill in during execution
```

---

## Change Log

- 2026-04-19 — Initial ratification by `meta-contract-writer`. Resolves all four "Contract drift to resolve" items in the task file:
  - Q1 (`agents:delete` semantics): THROW on missing file. Non-idempotent by design.
  - Q2 (atomic write): IN-SCOPE. Specified `<name>.md.tmp` → fsync → rename, with failure-mode documentation.
  - Q3 (`IpcEvent` FS shape): Expanded to discriminated union with per-kind variants (`fs:agentAdded`, `fs:agentChanged`, `fs:agentRemoved`, `fs:commandAdded`, `fs:commandChanged`, `fs:commandRemoved`, `fs:settingsChanged`, `fs:hookScriptChanged`). Untyped `broadcastEvent` helper removed in favor of a typed broadcaster.
  - `agents:write` validation: request envelope (`projectPath`, `agentName`, `file.body`) now Zod-validated, plus cross-check that `agentName === frontmatter.name`.
  - Added: `agents:create` as a distinct channel from `agents:write` (prevents accidental overwrite).
  - Added: `AgentFile.rawFrontmatter` field for CM6 seeding.
  - Added: `AgentSummary.lastModified` field for list sorting/display.
  - Added: `agentNameSchema` and `diagnosticsToCodeMirror` exports from `@agentic-dev-app/schemas`.
