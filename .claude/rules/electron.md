# Rule: Electron

> Three processes, three rule sets. The boundary between them is load-bearing.

---

## Process Model

```
Main (Node)         Preload (Node+DOM bridge)       Renderer (DOM)
───────────         ──────────────────────────      ──────────────
Node APIs           contextBridge only               window.api (typed)
Electron main       ipcRenderer invoke/on            React, shadcn, CM6
SQLite (native)     NO business logic                NO Node, NO Electron
fastify, chokidar   NO direct ipcMain                NO process.*
child_process
fs, path
```

**Iron-clad separation:**

- Main must not import from `@renderer/*`, React, or any DOM type.
- Renderer must not import from `@main/*`, `electron`, `node:*`, or any package that expects Node APIs.
- Preload is a thin bridge: defines `window.api` via `contextBridge.exposeInMainWorld`, implements each method as `ipcRenderer.invoke(channel, ...)`. No business logic.

Violating the boundary is a BLOCKER at review. Electron builds will often let the mistake slip to runtime where it manifests as `require is not defined` or `fs is undefined`.

---

## IPC Contract

- **Single source of truth:** `apps/desktop/src/shared/ipc.ts`. Update it FIRST when adding or changing a channel.
- **Channel names are kebab + colon-scoped:** `projects:open`, `agents:read`, `sessions:launch`. The scope (before `:`) matches the API section name.
- **All IPC handlers use `ipcMain.handle` + `ipcRenderer.invoke`** — request/response, not fire-and-forget. Use `webContents.send` only for server-pushed events (hook received, fs changed, session event).
- **Payloads are Zod-validated on the main side.** Trust nothing from the renderer. The `shared/ipc.ts` types are for developer ergonomics; runtime validation is separate.
- **Typed errors:** handlers throw — electron serializes the error across IPC. Renderer catches and surfaces. Never return `{ ok: false, error: ... }` envelopes; they obscure the type system.

---

## Security Baseline

- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: false` (preload needs `require`, but renderer does not).
- CSP in `index.html` is restrictive: `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self' http://127.0.0.1:*`. Loosen only with written justification.
- External links open in the OS browser via `shell.openExternal`, intercepted in `setWindowOpenHandler`. Do not embed arbitrary URLs in `<a href>` without interception.
- The hook-server bearer token is stored via `keytar` (OS keychain). Never write the token to a file. Regenerate if missing.

---

## Native Dependencies

- **Only `better-sqlite3` and `keytar` are permitted.** Adding any other native module requires `claude-config-updater` approval.
- **Native ABI matches Electron's Node, not system Node.** After `pnpm install`, running `pnpm dev` against a prebuilt-for-system-Node module will throw `NODE_MODULE_VERSION mismatch`.
- **Rebuild is user-gated.** Propose the command (`pnpm dlx @electron/rebuild -f -w better-sqlite3,keytar`) in the task report; never run it automatically.

---

## Subprocess Supervision (`ClaudeSupervisor`)

- One supervisor per session. Never reuse an exited child.
- Stdout parser buffers by `\n`; partial lines carry forward. The buffer must drop consumed bytes (`slice(idx + 1)`), not re-process them.
- Cancellation: SIGTERM with 3s grace, then SIGKILL. Never leave zombies on shutdown.
- stderr events are forwarded to the UI verbatim; never silence them in the supervisor.

---

## Hook Server

- Loopback only: `127.0.0.1`, ephemeral port, bound at app startup.
- Bearer token auth on every request. Missing / wrong token → 401. Without this, any process on the machine can inject fake hook events.
- Handler must respond in **<5ms**. Rule: read token, push payload to EventEmitter, return 200. All downstream work (DB write, correlation, UI emit) happens async.
- Never pass the token through a query string in logs — use `X-Hook-Token` header where possible. Query-string fallback is accepted because Claude's HTTP hook implementation sometimes prefers URL-based auth.

---

## Filesystem Watcher

- Only watch `<projectPath>/.claude/`. Do not watch the whole repo — it's too noisy and breaks the performance budget.
- `awaitWriteFinish: { stabilityThreshold: 150 }` prevents duplicate events during editor saves.
- Every event must be classified (`agentChanged`, `settingsChanged`, etc.). Unknown paths are dropped silently.
- On path changes to the watched root, unregister and re-register — don't try to "move" a watcher.

---

## Window Creation

- Minimum size: 1024×640. Below that the sidebar layout breaks.
- `show: false` until `ready-to-show` fires — prevents a flash of unstyled content.
- `backgroundColor: '#0b0b0f'` to avoid white flash on dark-theme default.
- On Windows: `autoHideMenuBar: true`. On macOS: `titleBarStyle: 'hiddenInset'` (traffic-light spacing).
- Do not open multiple windows for the same project without a use case — prefer tabs in-window.

---

## Logging

- Main process logs go to stdout. In production, electron-builder captures them; in dev, they appear in the terminal.
- Never log user tokens, `.env` contents, or transcript payloads at the default log level.
- Structured logging (JSON lines) preferred over free-form strings — makes the future viewer easier.

---

## Packaging (electron-builder)

- App ID: `dev.agenticdevapp.desktop`.
- NSIS installer on Windows, dmg on macOS, AppImage + deb on Linux.
- Signing / notarization: not configured yet. Add when first external user exists.
- `asarUnpack: ['resources/**']` — native binaries cannot live inside the asar archive.

---

## Anti-Patterns

- `nodeIntegration: true` in the renderer → immediate security hole.
- `require('electron')` in renderer → crash at runtime.
- Business logic in preload → harder to test, harder to evolve.
- Large IPC payloads (> ~1 MB) → use temp file + path handoff instead.
- Sync operations in the main process (sync `fs.readFileSync` in a hot path) → freezes the app.
- Hook endpoint doing DB writes before responding → breaks the <5ms contract, stalls Claude.
