# CLAUDE.md

> Think carefully and implement the most concise solution that changes as little code as possible.

## Project-Specific Instructions

- See [README](README.md) for background about the project.
- To run common development operations, use `make` commands. Do not come up with own commands. If a `make` command you need is missing, tell the user.
- When changing code, a) ensure linters pass by writing idiomatic code and only disable rules for genuine false positives, and b) ensure all tests pass.
- Cover new/changed code by tests, unless coverage is not possible: in this case confirm with the user.
- Apply frontend changes to both the browser-based testing variant based on mock bindings and the native application variant based on Wails runtime.
- When changing frontend code, carefully avoid uncaught exceptions and infinite loops in the native application.
- In Svelte 5 `$effect` blocks, never read and write the same `$state` variable. Use `untrack()` for state the effect modifies but should not depend on.
- No business logic in client code.

## Testing

Always run tests before committing.

## Code Style

Follow existing patterns in the codebase.
