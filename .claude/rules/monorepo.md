# Rule: Monorepo

> pnpm workspace, cleanly layered. One app today; structured to grow without restructure.

---

## Layout

```
agentic-dev-app/
├─ apps/
│  └─ desktop/                   # @agentic-dev-app/desktop (Electron app)
├─ packages/
│  ├─ schemas/                   # @agentic-dev-app/schemas
│  └─ claude-protocol/           # @agentic-dev-app/claude-protocol
├─ package.json                  # workspace root
├─ pnpm-workspace.yaml
├─ tsconfig.base.json
├─ biome.json
└─ .claude/
```

**Rules for adding a new package:**
- `apps/*` — runnable apps (Electron, future CLI, future web viewer).
- `packages/*` — library code importable by apps or other packages.
- Never create `libs/`, `tools/`, `utils/`, `common/` as top-level dirs. If it's code you import, it's a package.

---

## Package Boundaries

- `@agentic-dev-app/schemas` — Zod schemas + parse/serialize helpers for `.claude/*` files. Pure; no Node, Electron, DOM. Runtime deps: `zod`, `yaml`.
- `@agentic-dev-app/claude-protocol` — TypeScript types for Claude Code's stream-json, transcript, and hook payloads. No runtime deps.
- `@agentic-dev-app/desktop` — the Electron app. Imports both packages above.

**Never:** a package importing from another package via relative `../../packages/*` path. Always use the workspace package name.

---

## Workspace Package Dependencies

In `apps/desktop/package.json`:
```json
"dependencies": {
  "@agentic-dev-app/schemas": "workspace:*",
  "@agentic-dev-app/claude-protocol": "workspace:*"
}
```

`workspace:*` is pnpm-specific and resolves to the in-repo version. Do not hand-edit to a semver range.

---

## Scripts

Run from repo root:

- `pnpm dev` — launch Electron dev (currently `pnpm --filter @agentic-dev-app/desktop dev`).
- `pnpm build` — build all packages.
- `pnpm typecheck` — typecheck every package (runs in each; order: packages first, then apps).
- `pnpm lint` — Biome check the whole workspace.
- `pnpm lint:fix` — Biome auto-fix.
- `pnpm test` — Vitest across packages that have tests.
- `pnpm test:e2e` — Playwright against Electron.

Script naming is consistent across packages: every package that has tests exposes `test`, every package with types exposes `typecheck`. The root recursively runs them with `pnpm -r <script>`.

---

## Adding a Package

1. Invoke `/claude-rules` or `claude-config-updater` if the new package changes monorepo rules.
2. Create `packages/<name>/package.json` with `"name": "@agentic-dev-app/<name>"`, `"type": "module"`, `"private": true`.
3. Create `packages/<name>/tsconfig.json` extending `../../tsconfig.base.json`.
4. Create `packages/<name>/src/index.ts`.
5. Run `pnpm install` from root — pnpm picks up the new workspace entry.
6. Add to `apps/desktop/package.json` as a `workspace:*` dep if needed.

---

## TypeScript in the Monorepo

- Every package has its own `tsconfig.json` extending `tsconfig.base.json`.
- `apps/desktop` has THREE tsconfigs (`tsconfig.json` is a composite root; `tsconfig.node.json` covers main + preload + shared; `tsconfig.web.json` covers the renderer).
- Workspace packages are imported as source (`"main": "./src/index.ts"`), not as build output. This keeps the dev loop fast.
- When/if a package ships standalone (e.g., for a CLI companion), we'll add `tsup` build + proper `exports` field then — not pre-emptively.

---

## Biome & Linting

- One `biome.json` at the root. All packages share it.
- `routeTree.gen.ts` and other generated files go in `biome.json` → `files.ignore`.
- Biome runs on `pnpm lint` and as a pre-commit hook; new files inherit existing rules automatically.

---

## Dependencies

- **Root dev deps:** `@biomejs/biome`, `typescript`. Anything every package uses at dev time.
- **Package deps:** pinned to the package that needs them. Don't hoist to root "in case someone else needs it."
- **Shared versions:** use pnpm `catalog:` when multiple packages need the same version of a third-party (e.g., `react`, `zod`). Defer introducing catalogs until we actually have two consumers.
- **Installing:** `pnpm --filter <name> add <pkg>` from the root; never `cd` into the package.

---

## Native Module Rebuild

After `pnpm install` on a fresh clone, `better-sqlite3` and `keytar` are built against system Node. Electron needs them built against its own Node ABI:

```bash
pnpm dlx @electron/rebuild -f -w better-sqlite3,keytar
```

This is user-gated (see `.claude/rules/electron.md` and the hard rule in `CLAUDE.md`).

---

## Anti-Patterns

- Importing across packages via relative paths — always use the workspace name.
- Running a script from inside a package with `cd` — use `--filter` from root.
- Hand-editing `pnpm-lock.yaml` — let pnpm manage it.
- Creating `index.ts` files that re-export everything at every directory level — only at package root.
- Cross-package source imports that skip the package's `src/index.ts` (e.g., `from '@agentic-dev-app/schemas/src/internal/foo.ts'`) — add a proper `exports` map if you need a deep entry.
