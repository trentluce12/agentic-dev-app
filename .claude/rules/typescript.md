# Rule: TypeScript

> The whole stack is TypeScript strict. These rules keep the type surface honest and the runtime surface safe.

---

## Configuration

- `strict: true` everywhere. No project opts out.
- `noUncheckedIndexedAccess: true` — array / record access returns `T | undefined`.
- `exactOptionalPropertyTypes: true` — `x?: T` means "omit or T", NOT "omit, T, or undefined". Conditional spread to avoid assigning `undefined` to optional fields.
- `verbatimModuleSyntax: true` — use `import type` for types; it also means you can't import values and types in the same ungrouped line.
- `allowImportingTsExtensions: true` — imports MUST end with `.ts` (or `.tsx` for React components). No bare specifiers for local files.
- `noEmit: true` at the package level. Build output comes from electron-vite / tsup, never from `tsc`.

---

## Imports

- Local imports MUST include the `.ts` / `.tsx` extension: `from './foo.ts'`, not `from './foo'`.
- Workspace package imports use the package name: `from '@agentic-dev-app/schemas'`, not a relative path.
- Use `import type` for type-only imports; Biome flags missing `type` modifiers.
- Node built-ins MUST use the `node:` prefix: `from 'node:path'`, not `from 'path'`.

---

## No `any`, No `@ts-ignore`, No Unsafe Casts

- `any` is banned. Use `unknown` and narrow, or define the right type.
- `@ts-ignore` is banned. `@ts-expect-error` is allowed only with a `// reason: ...` comment explaining why the error is expected and under what condition it would become unexpected.
- `as T` casts are banned for value-shape assumptions. The exceptions:
  - Narrowing after a `satisfies` check.
  - `as const` for literal narrowing.
  - Casting a validated result (e.g., post-Zod `parse`, which already returns the right type — so this case is rare).
  - Re-asserting that `ipcRenderer.invoke` returns the typed response.

---

## Zod

- Every IPC payload, every `.claude/*` file parse, every subprocess output parse uses Zod.
- Default `.strip()` behavior is almost always WRONG for round-trip data. Use `.passthrough()` when round-tripping unknown keys (agent frontmatter, settings.json) or `.strict()` when you want to reject unknown keys (IPC payloads).
- Derive TS types from Zod: `type Foo = z.infer<typeof fooSchema>`. Do not hand-write types that parallel a Zod schema.
- Use discriminated unions for tagged shapes: `z.discriminatedUnion('type', [...])`.
- For numeric coercion of form values, use `z.coerce.number()` — not `z.number()`.
- `.passthrough()` preserves **passthrough** key insertion order on `.parse()`, but **reorders known keys to schema declaration order**. A round-trip property test that builds inputs in schema-declaration order never exercises the reorder path and will silently pass even if known-key ordering is mangled on real user input. When writing round-trip property tests for passthrough schemas, shuffle known-key order in the generator (e.g., `fc.shuffledSubarray` over the declared keys) to catch reorder regressions.

---

## Error Handling

- Throw `Error` subclasses with useful messages. Never throw strings, numbers, or bare objects.
- Catch `unknown` in `try/catch`: `catch (err) { ... }` — TS infers `unknown`. Narrow before access.
- Never swallow errors with empty `catch {}` unless the comment explains exactly why the thrown value is irrelevant.
- Async boundaries at IPC handlers and route loaders MUST either: (a) catch and return a typed error shape, or (b) let the error propagate to a known handler. No halfway.

---

## Naming

- Files: `kebab-case.ts` for modules, `PascalCase.tsx` for React components.
- Types / interfaces: `PascalCase`. Interfaces for object shapes, type aliases for unions / primitives / mapped types.
- Functions / variables: `camelCase`.
- Constants exported as enums-in-disguise: `SCREAMING_SNAKE_CASE` only for true compile-time constants (rare); otherwise `camelCase` const objects.
- Do NOT prefix interfaces with `I`.

---

## Exports

- Prefer named exports. Default exports are allowed only for: React components that need to be `React.lazy`-imported, and config files (`vite.config.ts`, `tailwind.config.ts`).
- Re-exports go through the package's `src/index.ts`. When adding a public API, update the index.
- Never re-export unused symbols "just in case" — dead exports are harder to delete than to add.

---

## Comments

Default: no comments. See the parent CLAUDE.md. Specific cases where a comment is warranted:

- A hidden invariant that's not expressible in types (e.g., "ordered by priority — callers depend on it").
- A workaround for a library bug with a link or issue number.
- A non-obvious performance trick.

Comments about the current task / PR / ticket belong in the PR description, not the code.

---

## Module Boundaries

- `packages/schemas` knows nothing about Electron, React, Node fs, or DOM. It's pure Zod + TS + YAML.
- `packages/claude-protocol` knows nothing about Electron, React, Node fs, or DOM. It's pure types.
- `apps/desktop/src/main` uses `node:*` APIs and electron main APIs. No DOM types.
- `apps/desktop/src/renderer` uses DOM / React APIs. No `node:*`, no electron main. Access to the main process only via `window.api`.
- `apps/desktop/src/shared` is the IPC surface — pure types, no imports from main or renderer.

Breaches of these boundaries are BLOCKERS at PR review.

---

## Common Pitfalls (from Buster)

- `z.coerce.number()` for form-input parsing, NOT `z.number()` (which rejects string inputs).
- `onConflictDoUpdate` / `onConflictDoNothing` require a unique constraint on the target columns.
- camelCase ↔ snake_case confusion at DB / JSON boundaries — pick one per layer and stick to it.
- Third-party SDK enums: verify against `node_modules/**/*.d.ts`, not docs — docs lag.
- Array `.find()` returns `T | undefined` under `noUncheckedIndexedAccess`; handle the `undefined` branch.
- `parseInt` without radix is a bug. Use `parseInt(x, 10)` or `Number(x)`.
