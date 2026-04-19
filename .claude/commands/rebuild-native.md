---
description: Run `@electron/rebuild` for native modules (better-sqlite3, keytar) against Electron's Node ABI. User-gated; never auto-invoked.
---

Rebuild native modules for the current Electron version.

## When to Run

- First `pnpm install` after a clone.
- After upgrading Electron (which changes the Node ABI).
- If `pnpm dev` throws `NODE_MODULE_VERSION mismatch`.

## Steps

1. Confirm with the user that native rebuild is desired. If not explicit, ASK — this is user-gated.
2. Run from `apps/desktop`:
   ```bash
   pnpm dlx @electron/rebuild -f -w better-sqlite3,keytar
   ```
3. Surface the output. Errors almost always point at a missing build toolchain (MSVC on Windows, Xcode CLI on macOS).

## Hard Rules

- ALWAYS explicit — never auto-invoke after `pnpm install`.
- NEVER add this as a `postinstall` hook in `package.json`.
- NEVER rebuild against a different Electron version than the one installed.

## Output

```
NATIVE REBUILD
Modules: better-sqlite3, keytar
Electron version: <version>
Status: <success | error>
Next: `pnpm dev` should now launch without ABI errors.
```
