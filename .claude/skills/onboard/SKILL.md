---
name: onboard
description: "Bootstrap theagent2 on a project that has never used it — scaffold, SNS binding, .method model store — via `theagent2 onboard`. Use when the session-start banner or an error says the project is not onboarded / has no SNS binding / has no .method store, when the user asks how to start using theagent2 or IDesign here, or right after installing the theagent2 plugin on a fresh repo."
---

# Onboarding a fresh project

`theagent2 onboard` takes a plain git checkout from zero to fully working in
one idempotent command. There is no account, no server, no registration, no
manual workstream setup behind it — everything is local to the checkout
(D-CHECKOUT-LOCAL-V1):

1. **Scaffold** — `theagent2 init` (agents, skills, hooks into `.claude/`,
   plus `.theagent/` + `.theagent-run/`).
2. **SNS binding** — `.theagent/sns-binding.json` records which SNS project
   label this checkout targets. Project name defaults to the directory name.
   There is no workstream to bind: the checkout IS the workstream.
3. **`.method` model store** — created via `sns-cli init --kind
   InitFromScratch` when the checkout has none. If a `<project>.method/`
   directory is already in the clone (e.g. created on another machine, store
   in git), nothing needs doing — sns-cli resolves the store from the
   checkout (CWD, walking up), so its presence is the whole setup.

## Steps

1. Preconditions: a git clone (`.git/` directory — worktrees are not
   supported, ADR-009) and the toolchain on PATH (`theagent2 --version &&
   sns-cli version`; if missing, run `/theagent2:setup` first). The clone may
   be an ancestor of where you run: a project that is one directory of a
   larger checkout (`golden-process/` in a mono-repo, say) onboards in place —
   the scaffold, binding and `.method` store all land in the project
   directory (#416).

2. Show the user the plan, then run it:

   ```bash
   theagent2 onboard --dry-run   # preview — writes nothing
   theagent2 onboard             # do it (idempotent; --project <name> to override)
   ```

3. If a fresh `.method/` store was created, commit it:

   ```bash
   git add <project>.method .claude .theagent .gitignore
   git commit -m "chore: onboard theagent2"
   ```

4. Hand off: `theagent2 status` shows the passive state (which Diamond-Process
   stage, what is const, which gate is next — ADR-040 §8). A fresh project starts
   at Discovery — the Software Architect opens `claude --agent interview-architect`.
   There is no `theagent2 next` routing in the design stages. For an ungated
   exploratory session there is raw mode: `THEAGENT_RAW=1 claude` (ADR-029).

## Failure modes

- **Not a git repository** → `git init && git add -A && git commit` first.
- **sns-cli not on PATH** → scaffold + binding still land; run
  `/theagent2:setup` (plugin) or `just install` (monorepo), then re-run
  `theagent2 onboard` — it picks up where it left off.
- **Binding exists for a different project name** → onboard refuses rather
  than guessing; re-bind deliberately with `theagent2 sns bind --project
  <name>` if the rename is intended.

## What onboarding is NOT

- It does not start a workflow run (no state is created — that happens on the
  first `theagent2 transition`).
- It does not create sibling checkouts; the checkout you are in is the
  workstream. Parallel workstreams remain a deliberate human act via
  `git clone` / `git worktree add`.
- It does not touch anything outside the checkout; theagent2 keeps no global
  state (D-CHECKOUT-LOCAL-V1).
