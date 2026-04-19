# Rule: Tests

> Vitest for unit; Playwright for end-to-end against Electron. Tests are part of the contract — an implementer is not DONE without them for non-trivial logic.

---

## When to Write a Test

| Code type | Test required? | Framework |
|---|---|---|
| Zod schemas (non-trivial parse / validate logic) | Yes | Vitest |
| IPC handlers (request → response logic) | Yes | Vitest (main-process unit) |
| Correlator / graph inference | Yes — property-based where feasible | Vitest |
| FS watcher classification | Yes | Vitest |
| React presentational components | No — test the feature | n/a |
| React feature (route-level interaction) | Yes | Playwright |
| CodeMirror extension / linter | Yes | Vitest (unit on the extension logic) |
| Trivial pure utilities (`cn()`) | No | n/a |
| Electron main / renderer integration | Yes | Playwright |

**Rule of thumb:** if it has branching logic or an external boundary (FS, IPC, subprocess, DB), it needs a test. If it's glue, it doesn't.

---

## Vitest

- Configure per-package via `vitest.config.ts`. Workspaces inherit root config if absent.
- Test files: `*.test.ts` next to the file under test.
- `describe` blocks group by unit; `it` names read as sentences: `it('returns BLOCKED when brief is missing target directory', ...)`.
- Use `beforeEach` for per-test setup; never share mutable state across tests.
- Prefer explicit fixtures over factory functions that hide randomness. Determinism beats cleverness.

---

## Property-Based Testing

Reserved for:

- The agent-graph **correlator** — given any sequence of stream-JSON + hook events, the inferred parent/child relationships must respect: (a) a node's parent is never later than the node itself, (b) Agent-tool-invoked children always appear as dashed edges, (c) no cycles.
- **Frontmatter round-trip** — parse → serialize → parse must be a fixed point.
- **Settings merge** — registering hooks into an existing `settings.json` must preserve all unrelated keys.

Use `fast-check` (installed when we actually write these — not pre-emptively).

---

## Fixtures

- `tests/fixtures/` (root) holds shared test data: sample `.claude/` projects, recorded transcripts, example agent files.
- Each fixture has a README describing what it represents and what it asserts about.
- When a bug is fixed that was caused by a specific fixture shape, add that shape as a regression fixture and reference it in the bug's test name.

---

## Playwright (Electron E2E)

- One test file per feature route.
- Use `playwright.config.ts` at the app root to launch Electron via `_electron.launch()`.
- Never test against a production build in CI; always use the dev build.
- Tests read data from a fixture project; each test gets a fresh fixture copy in a temp dir so state doesn't leak.
- Screenshots on failure are opt-in per test (set `screenshot: 'only-on-failure'` in config).

---

## What to Assert

- **Behavior, not implementation.** Assert on user-visible output (text, DOM, file contents), not on whether an internal function was called.
- **One primary assertion per test; secondary assertions support it.** Ten assertions in one test means ten overlapping tests masquerading as one.
- **Negative cases explicitly.** Invalid input gets its own test. "Should not throw" is a weak assertion — what should it return?
- **Timing / race conditions** — if a test needs `waitFor` > 500ms, it probably has a real bug under it. Investigate instead of bumping the timeout.

---

## What NOT to Test

- Framework behavior (React rendering, Vite imports, TanStack Query caching primitives) — you're testing the framework, not your code.
- Private implementation details — if you have to `as any` to read a field, test through a public path instead.
- "Happy path only" tests that pass for trivial reasons — every test should have a failure mode.
- Overly broad integration tests that would pass even if half the units were broken.

---

## Mocks

- Prefer real objects. For pure logic, tests should be zero-mock.
- For FS: use a temp directory (not a mock FS).
- For subprocess: use a stub command (`node -e "console.log('…')"`) that emits the shape you need, not a mock of `child_process`.
- For IPC: test the handler function directly; don't mock `ipcMain`.
- For HTTP: use a real Fastify instance on an ephemeral port. Hook server testing especially: its <5ms contract can only be verified against a real server.

---

## Coverage

- No hard coverage threshold. Coverage is a leading indicator, not a target.
- Missing coverage on an error branch is a smell. Missing coverage on a pure transform is fine if the transform is obvious.

---

## Test Names (from learnings.md of any future bug)

When a bug is caught by a test, the test's `it` name should contain the keywords from the bug report. Future searches for "agent frontmatter dropped passthrough keys" should land on the regression test instantly.
