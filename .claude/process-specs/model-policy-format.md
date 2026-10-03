# The Model Policy format (`model-policy/1`)

**Status:** the format spec for the enforceable half of the run's model policy (ADR-056 §6
amendment 2026-08-27, #1068). The **policy** — which tier each kind of work runs on — lives in
the runtime's `tiers.ts`, one table so every launch recipe and every gate reads the same thing.
This file is what a **project** may add to it.

## Purpose

The model policy is role-relative (#1041) and, since the SA's ruling of 2026-08-27, **scoped by
the kind of work**: the working tier is an option for writing code and for running tools, and
nothing else. That ruling is enforced at the `Task`/`Agent` call by the PreToolUse hook, which
refuses a dispatch whose explicit model is below the floor the work demands.

Two things a project still needs to say for itself, and this file is where:

- **A blanket denial.** "Never Sonnet here, whatever the work" — the backstop the SA asked for
  beside the scoped rule. Cheap to express, cheap to check, and it does not depend on anyone
  classifying the work correctly.
- **A vouch.** A model the tier table has never heard of is refused everywhere by default. That
  refusal is the backstop working, not a bug — a model nobody has placed is a model nobody has
  decided anything about. This is how a project lifts it deliberately.

It lives at **`.theagent/model-policy.yaml`**, committed. Deliberately **not** under `.claude/`:
that tree is installed by `theagent2 init` and refreshed **wholesale** by `theagent2 sync`
(#846), so a policy pinned there would be silently replaced by the toolchain's copy at the next
sync — a project could never hold a position of its own. `.theagent/` is the project's.

## Shape (by example — illustrative)

```yaml
format: model-policy/1

deny:                      # forbidden outright, whatever the work — the blanket backstop
  - sonnet                 # matched by FAMILY: denies `sonnet`, `claude-sonnet-5`, dated ids
allow:                     # models this project vouches for that the tier table does not know
  - haiku
```

Both keys are optional; the file itself is optional. Absent means "the defaults, unchanged" —
which are the strict ones.

## Rules (checker-enforced)

- **Both lists match on the model FAMILY, not on an exact id.** `sonnet` covers the alias
  (`sonnet`), the pinned id (`claude-sonnet-5`), a dated id (`claude-sonnet-5-20260101`) and a
  window suffix. A denial that could be walked around by naming the model differently would not
  be a denial.
- **A denial beats a vouch.** A model in both lists is refused. The backstop is the last word by
  construction: the blanket half exists precisely for the case where the scoped reasoning is
  wrong or has not been thought through yet.
- **An unparseable or malformed file falls back to the defaults, never to nothing.** A policy
  file nobody can read must not brick every dispatch in the project, and it must not silently
  become permission either. The strict defaults still apply.
- **The gate fires only on a dispatch that names an explicit `model`.** A `Task`/`Agent` call
  without one inherits the dispatching session's model, which the conduct ledger's birth assert
  and the context andon already verify (ADR-056 §6). The deliberate override is the whole
  subject of this mechanism.
- **What is refused is refused with its reason and its way out** — the work kind, the floor that
  kind demands, and this file's path. A refusal that does not say how to clear itself is how a
  session gets bricked with no way back in (#830).

## The work kinds and their floors

Owned by the runtime (`packages/runtime/src/conduct/tiers.ts`), restated here for readers, not
as a second source:

| kind | floor | what it is |
|---|---|---|
| `design` | second tier | business design, system design, every session that talks to a human |
| `review` | second tier | blind peer review (ADR-015), conformance audit, retro, the spec layer |
| `conduct` | second tier | the conductor — it relays to and rules for the Software Architect |
| `code` | working tier | writing implementation code |
| `tools` | working tier | sweeps, rebuilds, re-renders, searches, chores |

A floor is a floor: anything at or above it is permitted.

There is no tier above the second one to be a floor OR a ceiling any more. The table named a
frontier tier (`claude-fable-5-1`) and guarded it for one day; the Software Architect deleted
the name and the guard together on 2026-09-03 (#1231) — *"we don't need any special guardrails,
just set the 'model' to opus 1m max/high where the model will ever be passed … a human can,
using the app's UI components, at any time, choose fable if he desired to do so."* What the
toolchain passes is the second tier, everywhere it passes a model; what a human chooses in the
app is his own business, and this policy does not reach it.

**A role that does not say what its work is inherits the dispatcher's** — `general-purpose`,
`claude`, and any project-local agent. That is the inheritance #1068 calls the crux: a design
session must not be able to launder a review through a catch-all agent, and a code session must
not be punished for using one.

## The check

The enforcement point is the hook; there is no separate verb to run.

```sh
theagent2 hook pre-tool-use     # refuses a Task/Agent dispatch below its work's floor
```

Beside it, and unchanged by this file, the reporting half (#1066): the context andon names a
sub-agent that ran off its entry's model, `conduct ledger close` records every sub-agent's model
in the session row's `subagents:` block (`session-metrics/1`), and `conduct boot` reports any
that ran off policy. The two halves are complementary — this one refuses the deliberate
override, that one catches everything else — and neither replaces the other.
