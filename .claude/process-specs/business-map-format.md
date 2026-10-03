# The Business Map template

**Status:** the design note the Discovery-stage/B tooling contract §5 and issue #406 call for — the
single source for the business map's shape. ADR-040 §2 defines the mechanic: the map is
**AI-built, one entry per BP**; the stakeholder and the Software Architect review it and
**define the numbers** — a price tag per BP, what automating it saves or earns — so that
scope and priority become an **economic decision at Intent**, where the map is blessed and
becomes const alongside the BPMNs, SIs, screen models, and approved walkthroughs.

## Purpose and consumers

- **Intent** — the blessing surface: the stakeholder challenges each entry's arithmetic,
  adjusts the factors, and decides per BP: in scope, deferred, or out. The decision column is
  filled *at the gate*, not before.
- **Design onward** — priority input: when capacity forces ordering, the price tags order
  the work.
- **A simulated run** — a conducted run with no real stakeholder (the simulation waiver)
  reviews the map as a *mechanic*: its numbers are invented fiction, so the numbers
  validate nothing; what is validated is that the gate could be conducted as an economic decision.

## Form

One Markdown file per project — human-reviewed at a gate, never machine-consumed, so
Markdown, not JSON. Location: the project's business docs tree
(`docs/02_Business/05_Business-Map/business-map.md`). Structure:

1. **Header + provenance banner** — where the numbers come from. The banner is mandatory:
   real stakeholder economics, or (simulated run) *invented, plausible; waiver caveat*.
2. **Summary table** — one row per BP: id, name, direction, price tag (per year, in the
   project's currency), Intent decision. The at-a-glance surface the gate works from.
3. **One entry per BP** — the challengeable detail (template below).
4. **Intent blessing record** — date, participants, adjustments made at the gate.

### Entry template

```markdown
## BPxx — <Name>

- **Direction:** saves | earns | protects   <!-- may combine: "saves + protects" -->
- **Price tag:** <N> / year                 <!-- the one number; sum of the basis lines -->

**Today (baseline):** <1–3 sentences: how the process runs without the system, and what
that costs — time, errors, lost revenue.>

**Value mechanism:** <bullets: through what the automation saves/earns — time per case,
error rate cut, revenue protected, …>

**Arithmetic basis:**                       <!-- one line per factor, so each can be
                                                 challenged and adjusted at the gate -->
- <frequency> × <unit effect> × <rate> = <n> / year
- …

**Assumptions to confirm at Intent:** <bullets: the factors the stakeholder must
confirm or correct.>
```

## Filled example entry (widgets, BP01)

Illustrative, authored for this design note — a real map is drafted in conduct, and a
simulated run's numbers are invented there under the waiver (and blessed as fiction).

```markdown
## BP01 — TakePhoneOrder

- **Direction:** saves + protects
- **Price tag:** 13,200 / year

**Today (baseline):** the counter clerk takes phone orders on paper: identity from memory,
prices from the printed price list, totals by head, ticket rewritten for the workshop.
Re-entry and mental arithmetic cost ~2 extra minutes per order and produce wrong tickets a
few times a week.

**Value mechanism:**
- Time: lookup, pricing, and ticket hand-off automated — no re-entry, no head math.
- Errors: wrong-ticket remakes (wrong item, wrong price, missed minimum) largely eliminated.

**Arithmetic basis:**
- Time saved: 25 orders/day × 2 min × 360 days = 300 h/year × 35/h = 10,500
- Remakes avoided: 9,000 orders/year × 2 %-points fewer errors × 15/remake = 2,700

**Assumptions to confirm at Intent:**
- 25 phone orders/day average (peak-season weighted?)
- 2 minutes saved per order is net of learning the new screen
- error rate today ~3 %, reachable ~1 %; 15 average remake cost
```

### Summary-table + blessing-record shape

```markdown
| BP | Name | Direction | Price tag (/yr) | Intent decision |
|---|---|---|---|---|
| BP01 | TakePhoneOrder | saves + protects | 13,200 | — |
| …  | … | … | … | — |

## Intent blessing record

- **Date / participants:** —
- **Adjustments:** —                        <!-- factor changes made at the gate, per BP -->
- **Verdict:** —                            <!-- blessed as const / rework list -->
```

## Rules

- **Every number carries its arithmetic.** A price tag without basis lines cannot be
  challenged and does not pass the gate.
- **The AI drafts, the humans define.** The draft's factors are proposals; the gate's
  adjustments are recorded in the blessing record, not silently edited into the entries.
- **Direction vocabulary:** *saves* = cost reduction, *earns* = new/retained revenue,
  *protects* = loss avoidance (errors, no-shows, compliance).
- **Simulation waiver (mandatory banner):** where a run has no real stakeholder, the numbers
  are invented and plausible; the mechanic — an economic scope/priority decision at Intent —
  is exercised, the numbers are fiction and are reviewed under the waiver's caveat.
