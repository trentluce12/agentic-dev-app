---
description: Run `electron-builder` to produce installers (NSIS on Windows, dmg on macOS, AppImage/deb on Linux). Not part of the default /implement flow; called explicitly when packaging is needed.
argumentHint: <optional --target platform>
---

Build distributable installers.

## Pre-flight

1. Confirm the working tree is clean (`git status`).
2. Confirm tests pass (`pnpm test`). If not, STOP.
3. Confirm a native rebuild is current — if ambiguous, ASK the user whether to run `/rebuild-native` first.

## Steps

1. Run:
   ```bash
   pnpm --filter @agentic-dev-app/desktop build
   ```
   which invokes `electron-vite build && electron-builder`.
2. If `$ARGUMENTS` includes a `--target` flag, pass it to `electron-builder`.
3. Surface the resulting installer paths under `apps/desktop/dist/`.

## Known Gotchas

- **No app icon yet.** `electron-builder` warns; the installer still works for dev.
- **No signing configured.** Installers are unsigned. Fine for personal use; not for distribution.
- **Windows Defender SmartScreen** will warn on unsigned installers — expected for now.

## Hard Rules

- NEVER run against uncommitted changes without user acknowledgment.
- NEVER ship a build that didn't pass `pnpm test`.
- NEVER configure signing / notarization here — it's a separate `/task-plan`.

## Output

```
PACKAGE DIST
Platform: <win | mac | linux | all>
Installers: <paths>
Size: <each>
Signed: no (expected — no signing configured)
Next: manual install + smoke test.
```
