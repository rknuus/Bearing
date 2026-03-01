# CLAUDE.md

> Think carefully and implement the most concise solution that changes as little code as possible.

## Project-Specific Instructions

- See [README](README.md) for background about the project.
- To build, test, etc. use `make` commands. Do not come up with own commands. If a `make` command you need is missing, tell the user.
- Cover new/changed code by tests, unless coverage is not possible: in this case confirm with the user.
- Always lint code before committing and only disable rules for genuine false positives, not for non-idiomatic code.
- Always run tests before committing.
- For Svelte 5 questions, fetch and use: https://svelte.dev/llms-full.txt
- For svelte-dnd-actions, refer to the local README snapshot at `tmp/docs/svelte-dnd-action/README.md`
- For Wails v2, refer to the local docs snapshot at `tmp/docs/wails/`
- Apply frontend changes to both the browser-based testing variant based on mock bindings and the native application variant based on Wails runtime.
- When changing frontend code, carefully avoid uncaught exceptions and infinite loops in the native application.
- In Svelte 5 `$effect` blocks, never read and write the same `$state` variable. Use `untrack()` for state the effect modifies but should not depend on.
- Task state modifications in the frontend must verify state consistency with backends at the end.
- No business logic in client code.
- Avoid code duplication.
- Do not pollute production code with test code, e.g. no testid in frontend code.
- avoid `$()` in common operations like `git commit` (OK for rare, specific exceptions)

## Code Style

Follow existing patterns in the codebase.
