# The Software Architect state format (`sa-state/1`)

**Status:** the format spec for `.theagent/conduct/sa.yaml` — what a conducted run knows about
the **Software Architect himself** (ADR-072 §7, #1248). Written and read only through
`theagent2 conduct sa set | show`. The single source for this shape; agents and skills cite it
and do not restate it.

## Purpose

Everything a run knows about the RUN already had a home before this file: the standing goal and
its `done_when` conditions (`conduct-state-format.md`), the session ledger, the relays, the open
items. Nothing anywhere held the other half — what the run needs to know about **him**.

The AI Architect (role id `sa-twin`) exists to decide *whether, when and on which channel* the
Software Architect is asked, and *"he especially has the intelligence about what I'm after — for
example right now he would know that I'm preparing for the summit, for the speech, but at the
same time I want to deliver quality for the figaro owner stakeholder."* That intelligence has to
live somewhere a successor can read, because the twin succeeds like every other long-lived
session and everything it knows must survive that (ADR-056 §2: *everything the run knows is on
the committed surface*). A memory of his state carried in a session's context is a memory that
dies at the 50 % tier.

## Where it lives

`.theagent/conduct/sa.yaml`, **committed**, one per conduct surface — beside `state.yaml` and
`ledger.yaml` and for the same reasons. Per box at v1; a host-level twin overseeing several
projects (ADR-072 §12) would hold the cross-project part, and that is not built.

**Never edited by hand.** `theagent2 conduct sa set` validates the whole document before it
lands, stamps who wrote it and when, and commits it path-scoped — so *"when did he say that?"*
is answered from git rather than from anybody's memory. The rule and its reason are `open-item
add`'s (#1124).

## Shape (by example — illustrative)

```yaml
format: sa-state/1
updated: 2026-09-05T21:40Z
updated_by: S-042

# His priorities, in order, most important first. His own words when `source:
# verbatim` — and then `ref` must say where he said them.
priorities:
  - text: the summit talk on 2026-09-12
    on: 2026-09-05
    source: verbatim
    ref: design session 2026-09-05 (session_01Ji1GswDLNZmzCd7chwU5RH)
  - text: quality for the figaro owner stakeholder
    on: 2026-09-05
    source: verbatim
    ref: design session 2026-09-05

# Whether he is reachable at all.
availability:
  state: asleep          # open | asleep | busy
  until: "07:00"
  note: I'm going to bed
  said: 2026-09-05T22:10Z

# What reaches him REGARDLESS of the twin's judgement (ADR-072 §9).
interrupts:
  always:
    - a gate that is blocked
    - a finding carrying the tracker's blocking label for the gate at hand
    - a session idle beyond 15 minutes with nothing open
    - the AI Architect itself idle or gone beyond 30 minutes
    - a relay that came back UNDELIVERED, INCOMPLETE or MISMATCH twice
    - an andon at or above 70 % on any session

digest:
  cadence: his first prompt of the day, and on request
  last: 2026-09-05T08:12Z
```

## Fields

| Field | Required | Meaning |
|---|---|---|
| `format` | yes | `sa-state/1`. A surface whose format is unstated is one no reader can be sure it understands. |
| `priorities` | yes (may be empty) | Ordered list, most important first. |
| `priorities[].text` | yes | One line. |
| `priorities[].on` | yes | `YYYY-MM-DD`. A priority nobody dated cannot go stale, and a stale priority is worse than none. |
| `priorities[].source` | yes | `verbatim` (his own words) or `reading` (somebody's paraphrase, standing until he confirms). Same closed vocabulary, and the same reason, as the run goal's (#1218): on the figaro run a conductor's paraphrase stood unchallenged because nothing on the surface said it was one. |
| `priorities[].ref` | with `verbatim` | Where he said it. A quotation nobody can check is not evidence. |
| `availability.state` | yes | `open`, `asleep`, `busy`. |
| `availability.until` | no | When the state expires — `HH:MM` or `YYYY-MM-DDTHH:MMZ`. |
| `availability.note` | no | His own words about it. |
| `availability.said` | no | When it was recorded. |
| `interrupts.always` | yes | One line each. The **escalation floor** is code (`supervise`, ADR-072 §9); this list is what the floor is FOR, and it is written from him rather than decided by the twin — a twin that may be wrong toward silence must not also own the list of things that overrule its silence. |
| `digest.cadence` | yes | When he wants the batch, in his own terms. |
| `digest.last` | no | When one last went out. |

## Defaults

A project that has never run `conduct sa set` has no file, and readers get the defaults:
`priorities: []`, `availability.state: open`, `digest.cadence: his first prompt of the day, and
on request`, and **`interrupts.always` pre-filled with ADR-072 §9's six items**. That last one is
deliberate: a floor that starts empty is a floor that does not exist until somebody remembers to
build it, and this run has twice paid for silence that nobody had authorised — 7h09m of
authorised overnight work lost (#1149) and 201 minutes with the conducting function absent. He
narrows the list; he does not have to write it.

`conduct sa show` says *NOTHING RECORDED YET* when it is printing defaults, so a twin never
mistakes them for his answers.

## Who reads it

- The **`sa-twin` boot skill**, first thing, every life: priorities, availability, floor, digest.
- The **escalation floor** in `theagent2 supervise` (ADR-072 §9), for `availability` and
  `interrupts.always` — the clock is the supervisor's, not the twin's.
- Nothing else. It is not a run-status surface and no gate reads it.

## What it is not

- **Not the goal.** The goal is what the RUN is for (`conduct-state-format.md`); this is what
  HE is after. A question can be on-goal and still wait until morning, and that is exactly the
  distinction the twin is for.
- **Not a schedule or a calendar.** `availability` is one state with an expiry, recorded because
  he said it. A calendar connector is named as future work in ADR-072 §7 and is not this.
- **Not a place for the twin's own notes.** Standing directives are open items (#1124); an
  Interviewer's proposal is a relay answer. This file holds only what came from him.
