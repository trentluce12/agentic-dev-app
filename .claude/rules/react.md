# Rule: React

> Renderer-only rules. Main process code doesn't see React. These rules cover components, hooks, state, routing, styling, and the three libraries that do most of the heavy lifting.

---

## Components

- Functional components only. No `React.Component` classes.
- One component per file for non-trivial components. Small utility components can share a file with their parent.
- Props: named type / interface, exported when the component is reusable. Destructure in the signature:
  ```tsx
  interface ButtonProps { … }
  export function Button({ variant, size, ...rest }: ButtonProps) { … }
  ```
- `forwardRef` only when a parent actually needs the ref. Don't ref-wrap speculatively.
- Every interactive element (`onClick`, `onKeyDown`) needs a semantic tag (`button`, `a`) or explicit `role` + `tabIndex` + keyboard handler.

---

## Hooks

- Rules of Hooks are non-negotiable: no conditional calls, no loop calls, no calls outside function components or other hooks.
- Custom hooks start with `use`. Return a stable shape — prefer tuples or objects, not positional mixed tuples.
- `useEffect` dependencies: every value referenced from outside the effect goes in the deps array. If you find yourself silencing the exhaustive-deps warning, the effect is almost certainly wrong.
- Prefer `useMemo` / `useCallback` only when: (a) the value is a dep of another memoized thing, or (b) profiling shows it matters. Default to no memoization.
- Avoid `useRef` as a "re-render dodge" for state — if the value affects render output, it's state, not a ref.

---

## State

- **Component-local state:** `useState` / `useReducer`.
- **Ephemeral app state** (active selection, panel open, graph layout): **Zustand** slices in `src/renderer/src/stores/`.
- **Server / filesystem data** (project list, agent list, session list, transcript): **TanStack Query** via `window.api.*` calls.
- **URL state** (current route, selected agent name in URL): **TanStack Router** search params, not component state.

**Rule:** data that lives on disk or across sessions belongs in TanStack Query. Data that vanishes on reload belongs in Zustand or `useState`. URL-shareable data belongs in the route.

---

## TanStack Query

- Query keys are tuples: `['agents', projectPath]`, `['agents', projectPath, agentName]`. Include every input that affects the fetch.
- Mutations invalidate by scope, not by individual key: `queryClient.invalidateQueries({ queryKey: ['agents', projectPath] })`.
- Default `staleTime` is 30s (configured at the QueryClient level). Override per-query for data that's more or less volatile.
- Filesystem-backed queries integrate with `chokidar` events — the main process emits `fs:agentChanged`; the renderer invalidates the relevant query key.
- Never use `refetchOnWindowFocus` (the default is `false` in our config) — it causes churn in a desktop app with multiple windows.

---

## TanStack Router

- File-based routing under `src/renderer/src/routes/`.
- Every route exports a `Route` from `createFileRoute('/path')({ component })`. The root uses `createRootRouteWithContext`.
- Route context is typed via `declare module '@tanstack/react-router' { interface Register { router: typeof router } }` in `main.tsx`.
- Search params are Zod-validated via `validateSearch`. Free-form object params are a smell.
- Use `<Link>` for navigation, never `window.location.*`.
- Loaders may prefetch via `queryClient.ensureQueryData` for warm route transitions.

---

## Styling — Tailwind + shadcn/ui

- shadcn components live at `src/renderer/src/components/ui/`. They are OWNED by the project (copy-paste model), not a dependency.
- Design tokens go in `src/renderer/src/styles/globals.css` as HSL CSS vars; Tailwind uses `hsl(var(--name))`.
- Prefer semantic tokens (`primary`, `muted`, `border`) over raw color classes. Only reach for raw colors for domain-specific hues (tier colors).
- Use `cn()` from `@/lib/utils` for conditional classes. Order: layout → spacing → typography → color → state.
- Dark mode is default (we add `class="dark"` on `<html>`). Light mode is not supported in Phase 1.

---

## Forms

- React Hook Form + Zod resolver (`@hookform/resolvers/zod`). One schema per form; the schema is the source of truth for both validation and TS types.
- Controlled inputs via `register` when possible; `Controller` for shadcn Select / Radix primitives that don't accept native refs.
- Submit handlers: `onSubmit={handleSubmit(async (values) => { ... })}`. Errors from the submit handler either set form errors via `setError` or throw for a page-level boundary to catch.

---

## CodeMirror 6

- Use CM6 primitives from `@codemirror/state`, `@codemirror/view`, `@codemirror/commands`, plus language packs (`@codemirror/lang-markdown`, `@codemirror/lang-yaml`).
- Prefer a composition of extensions over a "one big wrapper component."
- The agent editor splits frontmatter and body: two CM6 editors side-by-side, with a shared linter extension driven by Zod parse results.
- Never import `codemirror` (the meta-package) — import from the specific `@codemirror/*` packages so tree-shaking works.

---

## React Flow (visualizer + workflow editor)

- Custom node components ARE React components. Style them like any other component (Tailwind + shadcn), don't fight React Flow's built-in styles harder than needed.
- Node data is typed via `Node<MyData>`. Don't use `any` at the data slot.
- Edge types: `'native-subagent'` (solid) and `'agent-tool-child'` (dashed) — distinguishable at a glance.
- Layout is driven by ELK.js (hierarchical). Compute positions in a Worker or useEffect, never during render.
- React Flow performance degrades past a few hundred nodes — if we approach that limit, switch to virtualization before trying optimizations.

---

## Performance

- Default to no memoization. Profile before adding.
- Avoid inline object/array literals in deps arrays of memoized hooks — they change every render.
- Large lists → virtualization (`@tanstack/react-virtual`), not "just render them all."
- Route transitions preload via `defaultPreload: 'intent'` (already set).

---

## Error Boundaries

- Each feature route has a boundary (via TanStack Router's `errorComponent`). Errors from loaders, queries, and render are caught there.
- Errors MUST be logged to the main process via `window.api.logs.error` (to be added) so they show up in production logs.

---

## Anti-Patterns

- Props drilling past 3 levels → lift to Zustand or context.
- `useState` for anything that's also in a query → source of drift.
- `useEffect` doing data fetching → use TanStack Query.
- Reaching into main process via anything other than `window.api` → breaks the IPC contract.
- Inline styles (`style={{ ... }}`) for anything other than dynamic computed values (e.g., graph node position).
