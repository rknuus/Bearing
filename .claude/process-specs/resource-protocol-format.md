# The Resource Protocol Sheet format (`resource-protocol/2`)

**Status:** the format ADR-059 calls for — the single source for the sheet's shape. Consumed
by the skeleton generator / `--check` gate (`resource-protocol.mjs`, built with #841 — see
"Tooling" below), the spec runner's simulator base (effect gate) and generic durable
round-trip (#842), the Contract dossier (standing evidence block), and the Step-7 driver author.
The sixth section, the answer-source walk, was added on the Software Architect's order on relay
R-260, 2026-09-13 — *"please address all recommended measures"* (#1620; see "The `walk:` section").

## What changed in `/2` — the sheet is keyed by the SEAM (ADR-065, #1088)

`resource-protocol/1` keyed one sheet to one ResourceAccess, because `deployment-view/1` gave
each Access one resource. **ADR-065 lifts that:** an Access stands on a list of named **slots**,
one per resource in one role, so it may own several seams.

Sheet identity therefore moves from the Access to the **seam**:

- **one sheet per seam** — not one per Access (an Access can hold several seams) and not one per
  slot (alike instances would be copy-pasted sheets that drift);
- the file is named after the seam — `ISalesStore.protocol.yaml`;
- **`resourceAccess:` is dropped from the sheet.** The owning Access resolves from the
  deployment view's slot table, so a design change that moves a seam to a different Access is a
  deployment-view edit and **zero** sheet edits;
- N slots may share one sheet;
- `resourceKind` — which selects every vocabulary below — is read from the **slot**, so one
  Access may legitimately span a relational store and a REST API.

The runtime needed no change for this: `ResourceProtocol.cs` already keyed installed sheets by
seam name, `ForSeam()` was already the only lookup, and two sheets claiming one seam was already
a loud refusal.

**There is no dual grammar.** A `/1` sheet is a refusal naming the migration, never a
silently-accepted legacy shape (ADR-065 decision 10).

## Purpose

One sheet per seam declaring the **resource-facing contract** of the resources reached through
that seam, in the only form that is universal across resource kinds (ADR-059):

1. the **resource shape** (kind-specific vocabulary — the human-review section),
2. the **fate of every owned contract-DTO field** (durable | selector | instructive |
   transformed), with the write/read-back pair for every durable field,
3. the **effect allowlist per use case** (which seam operations each use case may invoke),
4. the **answerable faults per operation** (which raised fault identities the resource seam
   turns into result data, and the result field each answers into — everything else
   rethrows),
5. the **answer-source walk per contract operation variant** (where every returned field comes
   from, the one seam call of every write, the one call of every "in the same act" — and, through
   it, the column and the seam row member of every durable field; #1620).

It is a **deployment-view artifact** (ADR-048): the model stays free of it. It is a
**hybrid file**: the left columns (DTO fields, use cases, seam operations) are *generated*
from the const model and the seam interface; the authored content (shape, fates, allowlists,
faults, notes) is Design-stage-architect-authored in the resource-designer pass and human-reviewed
at Contract. `--check` regenerates the generated half and fails on any disagreement — the sheet
can be wrong only loudly, never silently stale.

Location: `docs/03_Technology/03_Deployment/protocol/<Seam>.protocol.yaml` (alongside
`deployment-view.yaml`, whose slot table carries the kind and product this sheet's vocabulary is
keyed by, and names which Access owns the seam). One file per **seam**: a sheet is reviewed per
resource contract, and a domain architect reviews only their kind's sheets — which is a reason
for one sheet per (Access × kind), and `/1` implemented it as one sheet per Access. Keying on the
seam is that reason carried through (ADR-065 decision 4).

## Shape (by example — illustrative)

```yaml
format: resource-protocol/2
system: Widgets                   # the model's `projectName` — NOT the .bpd sources' system
                                  # pool, which is what `si-binding.yaml` keys its own
                                  # `system:` to. See "The `system:` field" below.
seam: ISalesStore                 # THE IDENTITY — the substitutable seam interface (ADR-048 §3).
                                  # The owning Access, kind and product are read from the
                                  # deployment view's slot table. There is no `resourceAccess:`.

# ── 1. resource shape — the HUMAN-REVIEW section, in the kind's own vocabulary ──────────────
# Vocabulary per resourceKind (see "Effect classes and shape vocabulary" below). AUTHORED.
shape:
  tables:
    - name: orders
      columns:
        - { name: order_id,          type: uuid,           key: primary }
        - { name: grand_total,       type: "numeric(10,2)" }
        - { name: carried_min,       type: "numeric(10,2)", nullable: true }
        - { name: carried_disc_pct,  type: "numeric(5,2)",  nullable: true }
      constraints:
        - "CHECK ((carried_min IS NULL) = (carried_disc_pct IS NULL))"   # both-or-neither
    - name: order_lines
      columns: [ ... ]

# ── 2. field fates — LEFT SIDE GENERATED (dto, field), RIGHT SIDE AUTHORED ──────────────────
# Fates are keyed on the OWNING ACCESS's contract DTOs, but the sheet now belongs to a seam, so
# under /2 completeness is a per-Access question answered across that Access's sheets: every
# request-reachable field has a row in AT LEAST ONE sheet of its owning Access. A field may
# legitimately appear in two sheets with different fates — durable in the store we own, selector
# against the customer's API. See "Where the fate rows live" below — ADR-065 decision 11, the
# Software Architect's ruling of 2026-08-28.
# One row per field of every REQUEST-REACHABLE Interface DTO this RA owns: every DTO some
# contract operation's request names, plus everything reachable through their field types
# (nested row/card DTOs included) AND everything reachable DOWN the inheritance edge — a
# polymorphic request (`dto X abstract` + `dto X_Variant sealed extends X`) names the abstract
# base as its request key while the fields live on the variants, so the variants are
# request-reachable and owe their rows (figaro#327). Generated from the RA's .methodcontract manifest — the
# model's own generated projection, and exactly the contract surface the runner's derived
# round-trip builds against. Response-only DTOs (results, read-projection sets) carry NO fate
# rows: the four fates name what the RA does with data ARRIVING at it, a response field never
# arrives — it is an observation, guarded by the durable round-trips of the written fields —
# and an unanswerable row would only pad the Contract review surface (#841). Where a response
# field's value COMES FROM is asked in section 6, the walk, per operation variant (#1620).
# A durable row may name where its value is stored when the names differ — `column: <table>.<column>`
# (or `<table>` for a field kept as that table's rows) and `member: <Row>.<Member>` — see [P12].
# fate: durable | selector | instructive | transformed.
# durable    → must survive to a later read; roundTrip is REQUIRED (write op / read op / path)
# selector   → addresses or locates; consumed inside the RA
# instructive→ changes what the resource does, not what a read returns
# transformed→ folded into something else; `into` names the observable it folds into
#
# roundTrip carries a THIRD, OPTIONAL coordinate — `observe: <Facet>.<Dto>.<Field>` — naming the
# RESPONSE-side record and field the written value is compared against. It is what a
# COMMAND/RESPONSE-SPLIT seam needs: a write whose request is a command record and a read that
# answers a different record. Without it the round-trip observes the row's own record on both
# sides, which is what every row meant before the coordinate existed (ADR-059 amendment
# 2026-08-30, #961).
#
# roundTrip carries a FOURTH, OPTIONAL coordinate — `given: <RA contract op>` — naming ONE setup
# write that runs BEFORE the write under observation. It is what an UPDATE-ONLY write needs: one
# write then one read is right for a create or an upsert, and impossible for an update, whose
# record must already exist. Without a setup write the update lands on a world where the record it
# updates was never created, the read answers nothing, and the row is red for a machinery reason
# that indicts neither the sheet nor the code — so those fields could carry no durable row at all.
# EXACTLY ONE, never a chain: a list here is a refusal, not a silently-used first element
# (ADR-059 amendment 2026-08-30, #1144).
#
# An INSTRUCTIVE row may state `roundTripValue: <whole number>` — the value a derived round-trip
# SENDS in that field when it composes the READ of a durable row's roundTrip. Without it every
# instructive whole number of a read is sent 100. A PAGED read needs it: `Skip(PageIndex * PageSize)`
# wants a page index of 0 while the page size beside it keeps 100. Whole-number fields of a read
# only; `--check` condition 2 refuses it anywhere else (ADR-059 amendment 2026-09-13, #1631).
fates:
  - dto: Orders.OrderRecord
    fields:
      - { field: OrderId,       fate: durable,
          roundTrip: { write: StoreConfirmedOrder, read: FetchOrder } }
      - { field: CarriedRates,  fate: durable,
          roundTrip: { write: StoreConfirmedOrder, read: FetchOrder },
          note: "the #796 field — all-or-nothing card, QA-025/026" }
      - { field: GrandTotal,    fate: durable,
          roundTrip: { write: StoreConfirmedOrder, read: FetchOrder } }
  - dto: Orders.PlaceOrderCommand      # command-shaped request — nothing reads a command back
    fields:
      - { field: CustomerNote,  fate: durable,
          roundTrip: { write: PlaceOrder, read: FetchOrder,
                       observe: Orders.OrderRecord.CustomerNote },
          note: "written as a command field, read back off the order record" }
  - dto: Orders.AmendOrderCommand      # UPDATE-ONLY write — the order must already exist
    fields:
      - { field: OrderId,       fate: selector, note: "addresses the order the amendment updates" }
      - { field: DeliverySlot,  fate: durable,
          roundTrip: { given: StoreConfirmedOrder, write: AmendOrder, read: FetchOrder,
                       observe: Orders.OrderRecord.DeliverySlot },
          note: "the setup write creates the order this amendment updates" }
  - dto: Orders.OrderQuery            # the request of FetchOrder, the READ the round-trips above use
    fields:
      - { field: Day,           fate: selector, note: "selects the day partition" }
      - { field: PageIndex,     fate: instructive, roundTripValue: 0,
          note: "Skip(PageIndex * PageSize): the round-trip's record is on the first page" }
      - { field: PageSize,      fate: instructive, note: "a cap — sent the default, 100" }

# ── 3. seam operations — GENERATED (name), effect class AUTHORED ────────────────────────────
# Every operation of the SEAM INTERFACE (ISalesStore — seam vocabulary, not the contract's),
# classified. The classifier vocabulary is per resourceKind (below). The DANGER CLASSES of the
# kind — the ones that destroy content already stored — are flagged by --check for review focus.
operations:
  - { op: UpsertConfirmedOrder, effect: upsert, on: [orders, order_lines] }
  - { op: GetOrder,             effect: read,   on: [orders, order_lines] }
  - { op: GetOrdersForDay,      effect: read,   on: [orders] }
  - { op: PurgeExpiredDrafts,   effect: delete, on: [draft_orders] }

# ── 4. effect allowlist per use case — LEFT SIDE GENERATED (use case ids), AUTHORED lists ───
# One entry per use case whose chain reaches this RA (from the model's sequences, ADR-036).
# A seam operation invoked by a use case outside its list fails the spec run (effect gate);
# the ops here are SEAM operations — the vocabulary the simulator, which implements the seam,
# can observe.
allow:
  - { useCase: SI02.01,  name: ConfirmOrder,     ops: [UpsertConfirmedOrder, GetDraftOrder] }
  - { useCase: SI01.02,  name: PriceOrder,       ops: [GetDraftOrder, UpsertDraftOrder] }
  - { useCase: SI05.03,  name: CloseOutDay,      ops: [GetOrdersForDay] }
  - { useCase: _maintenance, ops: [PurgeExpiredDrafts],
      note: "non-use-case housekeeping entry points must be declared, never implicit" }

# ── 5. answerable faults per operation — WHOLLY AUTHORED (#999) ──────────────────────────────
# Which RAISED fault identity the resource seam turns into result data, for which CONTRACT
# operation, and into which result field. Everything not declared here RETHROWS. An absent
# section declares nothing answerable. An Access that ANSWERS an identity no row here
# declares is a RED check (SA ruling 2026-08-24, the resource fault tables).
faults:
  - { op: StoreConfirmedOrder, identity: "store:version-mismatch", answers: [Applied, CurrentVersion],
      note: "the conditional write did not take effect; the caller re-reads and re-decides" }
  - { op: StoreConfirmedOrder, identity: "store:dedup-hit", answers: OrderId,
      note: "the idempotency key already ran — the ORIGINAL outcome, not a generic OK (ADR-048 §2)" }

# ── 6. answer-source walk — (op, variant, returned field) GENERATED; sources, writes, acts AUTHORED ──
# One entry per contract operation VARIANT, its `returns` rows the fields of ITS OWN response — the
# base result plus the arm that answers it, never a sibling arm's (#1626). Optional on a sheet blessed
# before it existed — an Access with no walk is NOT WALKED, green unless --require-source-walk names
# it (#1620, relay R-260).
walk:
  - op: FetchOrder
    variant: Orders.OrderKey
    writes: []                                    # the authored statement "this variant writes nothing"
    returns:
      - { field: Orders.OrderRecord.OrderId,    seam: GetOrder.OrderId }
      - { field: Orders.OrderRecord.GrandTotal, seam: GetOrder.GrandTotal }
```

### The `system:` field — keyed to the model, not to the drawings (#1065)

`system:` on this sheet and on `deployment-view.yaml` is compared against the **model's
`projectName`**: both files are statements about the model's components, so the model is their
authority. The sibling format under the same `03_Technology/` tree keys its own `system:`
differently — `si-binding.yaml` is a statement about the *drawn business design*, so
`seqmap complete` compares it against the **`.bpd` sources' system pool**
(`si-binding-format.md`). Two adjacent YAML files carrying the same key are therefore **not
carrying the same field**, and their spellings may legitimately differ; aligning them turns one
of the two checks red whichever way you align them. Both comparisons ignore case, so a
`Widgets`/`widgets` split across that divide is never a finding.

## Effect classes and shape vocabulary per `resourceKind`

Designed once, process-side; extended when a new kind appears. The `effect` value is what the
effect gate matches and what review attention keys on (the kind's **danger classes**, below).

| resourceKind | shape section | one entry is named by | and carries | effect classes | danger classes |
|---|---|---|---|---|---|
| RelationalDB | `tables` | `name` | `columns` (each `name` + `type`, optional `key`/`nullable`) and optional `constraints` | `read`, `insert`, `update`, `upsert`, `delete`, `ddl` | `delete`, `ddl` |
| DocumentDB | `collections` | `name` | `partitionKey` and `fields` (each `name`) — the document sketch | `read`, `upsert`, `delete` | `delete` |
| RestApi | `endpoints` | **`method` and `path` together** — e.g. `POST /api/v2/salesOrders` (#1104) | nothing further; the call IS the entry, and there is no member list under it | `GET`, `POST`, `PUT`, `PATCH`, `DELETE` (+ endpoint) | `DELETE` |
| File | `files` | `path` | `layout` — a list of named members, or one non-empty line of prose (e.g. the CSV header) | `read`, `append`, `rewrite`, `delete` | `rewrite`, `delete` |

### Danger classes — what puts a class in that last column (#977)

The Software Architect's Contract question is **"what can wipe data"** (ruling 2026-08-23), and the
danger column is the answer to it. A class is a danger class when invoking it **destroys content
that was already stored** — content a later read would otherwise still have found:

- `delete` removes rows/documents, `DELETE` removes the remote resource, and `ddl` can drop a
  table whole;
- **`rewrite` is a danger class for the same reason** (#977): overwriting a file destroys
  everything the file held. It was left off this list when the vocabulary was first written,
  which would have hidden a whole resource kind's destructive class from the one review that
  exists to see it;
- `append`, `read`, `GET` add or observe; `insert` / `update` / `upsert` / `POST` / `PUT` /
  `PATCH` write the value the design says they own, they do not remove content the design meant
  to keep. If a kind's own `update` can silently discard stored content, it belongs in the danger
  column and this paragraph is the argument for putting it there.

**A new resourceKind owes this column an answer.** The row is not complete when its effect
classes are listed; a kind whose danger classes nobody stated is treated as *unknown*, and every
reader falls back to the union of all kinds' danger classes rather than to the empty set — "the
kind is not in the table" must never read as "nothing here can wipe data".

The column lives in code exactly once, in `skills/sns-cli/bin/resource-danger.mjs`: `--check`'s
reviewer report and the Contract dossier's "What can delete data" section both read it, so the list
the reviewer reads and the list the checker prints cannot drift apart (ADR-059's own rule — the
review and the enforcement read the same file).

The entry-naming key is what an `operations` row's `on:` target refers to, and what the Contract
reviewer points at. **An entry that carries nothing is a failure, not an omission** (#968): a
`tables:` list of bare names declares no schema, and before #968 it passed `--check` green.

For `RelationalDB` the shape is also the SOURCE OF THE GENERATED SCHEMA (#970), so the checker
holds it to what a schema can be emitted from: every column typed; `key:` is `primary`, `unique`
or `primary (col, col…)` over columns that table declares; a table states at most one primary key;
every `constraints` entry begins `CHECK` / `FOREIGN KEY` / `UNIQUE` / `PRIMARY KEY` / `INDEX`; and
a `FOREIGN KEY … REFERENCES x` names a table of this same shape — a store owns its own tables.
Two more hold the shape to what a RUNNABLE script can be emitted from (#1742): a **filtered**
`UNIQUE … WHERE …` reads as `UNIQUE [name] (col, …) WHERE …` over columns that table declares,
because the generator writes it as a `CREATE UNIQUE INDEX` of its own rather than passing it
through; and the shape's foreign keys **form no cycle**, because the CREATE TABLE statements are
ordered by them.

For `RestApi`, `on:` names endpoints instead of tables, and the shape section **is the review
artifact the SA asked for**: the complete list of calls the system may ever issue against the
external system (a web shop, an ERP) — a call not listed is a red spec run, not a surprise in
production.

A REST entry is named by its **(method, path) pair**, and an `on:` target names the pair the same
way: `on: ['POST /api/v2/salesOrders']`. Keyed on the path alone — as it was until #1104 — a sheet
could not declare both `GET /api/v2/salesOrders` and `POST /api/v2/salesOrders`: the second read as
the first declared twice. That matters for the reason the section exists at all. It is the complete
call list and the reviewer's question of it is which calls can destroy data, so a vocabulary that
cannot express a read and a write of one resource path forces the author to either invent a
distinct path or leave a call off the list — and a call missing from the list is precisely the hole
the sheet was built to close. An endpoint stating no `method` therefore has no name at all, and is
reported as such.

## The `faults:` section — what the seam answers, and what it rethrows (#999)

ADR-061 decision 8 gives the ResourceAccess's resource seam one job in four verbs — *classify,
retry, answer what is answerable as data, rethrow what is not*. **Which** fault class is
answerable, **for which operation**, and **into which result field**, is a resource-design
decision: it depends on the contract question the operation asks and on the store design behind
it. The flavor-level rule (which classes may ever be answered, per resource kind) is the blessed
fault tables', taught by the five construction skills — each C# Access flavor skill carries its
table (the tables' source proposal lives in the theagent2 monorepo). **The per-resource mapping is this section**, ruled a checked sheet section
by the Software Architect on 2026-08-24 rather than a `note:` value reviewed once and never
checked again.

### Grammar

One flat list of rows; each row is one (operation, fault identity) pair:

| key | required | what it names |
|---|---|---|
| `op` | yes | the RA **contract** operation whose body carries the answering catch — the same vocabulary a `roundTrip` pair speaks, not the seam's. Only the operation knows which field carries the answer, which is why the answering catch is per-operation and filtered. |
| `identity` | yes | the **product-free fault identity** the seam classifies onto, `<domain>:<slug>` in lower case — `store:version-mismatch`, `store:dedup-hit`, `http:409`, `provider:refusal`. Never a raw product code: the product codes are the fault taxonomy's first hop (ADR-048 §3), and this section is the third. |
| `answers` | yes | the result field(s) the answer lands in — one name, or a list. Each names a field of that operation's **response DTO**; a dotted path (`Outcome.Applied`) reaches through a nested DTO. |
| `note` | no | the reviewer-facing why. This is the row the Contract reviewer reads. |

**The default is rethrow.** A sheet with no `faults:` section declares nothing answerable, which
is the honest state of most resources: the seam classifies, spends its retry budget, and rethrows.
Absence is green.

**Answerability is the NARROW reading** (SA ruling, 2026-08-24): a raised fault may become result
data only for optimistic-concurrency misses, dedup-marker duplicates, and the refusals a sheet
allowlists. A constraint violation, a schema disagreement, a permission failure and an exhausted
retry budget are failures to answer, and a row declaring one of them is a design error the
reviewer refuses — not something the checker can see, which is why the `note:` matters.

### How the check sees an "answer" in the code

The blessed tables fix the shape: the answering catch is **per-operation and filtered on one
declared fault identity** — `catch (StoreFault f) when (f.Identity == "store:version-mismatch")` —
while the retry-and-rethrow half is shared plumbing that classifies and `throw;`s. So `--check`
scans the ResourceAccess's **`Service/` sources** (the component body; the store driver under
`Store.<product>/` is where the identity is *minted*, not answered) for `catch … when (…)`
filters that mention `Identity`, and reads every string literal in such a filter as an identity
this Access answers.

The comparison is **per Access, not per operation**: attributing a catch to a contract operation
would need C# body parsing, and a wrong attribution would turn correct code red. An identity
answered anywhere in the Access must be declared by some row of the sheet; which operation the
row names is the reviewer's read, and the reviewer report prints both sides.

The **other direction is checked too**, once the Access is constructed (condition 10, #1004): an
identity a row declares that no `Service/` source answers is a rethrow where the design blessed an
answer. Until the body is written it is only the reviewer line it always was — the checker takes
"the body is written" from the absence of the scaffolder's `NotImplementedException` stubs under
`Service/`, reading only the sources somebody is meant to write: a file carrying the scaffolder's
own `<auto-generated>` header is skipped, because nobody may put a catch in it.

## The `walk:` section — the answer-source walk (#1620)

> **Dated note — 2026-09-13.** The Software Architect's order on relay R-260, 2026-09-13: *"please
> address all recommended measures."* This section is measure **P1** of that relay (the answer-source
> walk) and condition **[P12]** below is measure **P2** (the durable-field checker). The relay's
> letters and the checker's condition ids are two different numberings: measure P1 is checked as
> `[P11]`, measure P2 as `[P12]`; the checker's own `[P1]`/`[P2]` are the fates conditions they
> always were.

**Why it exists.** Figaro's first Access build round (four Access components, 2026-09-13) stopped on
design gaps in all four. The two biggest kinds were *"the answer has no source"* — a contract operation
promises a returned field that no request field and no seam member can supply (the original audit id
on a duplicate, a clearance flag, a delivery receipt) — and *"no store call can do the job"* — a write
no seam call performs, or "in the same act" spread over two calls. Every one of them passed the
Contract gate: the sheet walked tables, fates, grants and faults, never the **operation**, and by the
fates rule above a response field carries no row at all. The walk is that missing surface: each
contract operation variant performed on paper, one returned field and one write at a time.

The fates section still covers only request-reachable fields — nothing about it changed. Response
fields are walked here, per operation variant, because the same response field can come from a
different place in each operation that returns it.

### Grammar

One entry per **contract operation variant** of the sheet's owning Access. A variant is a concrete
request DTO: a polymorphic request (`dto X abstract` + `dto X_Variant sealed extends X`) is one entry
per concrete subtype; any other request is its operation's single variant.

| key | generated / authored | what it holds |
|---|---|---|
| `op` | generated | the RA **contract** operation |
| `variant` | generated | the concrete request DTO, `<Facet>.<Dto>` |
| `writes` | authored, **required** | a list of `{ write: <what is written>, call: <seam operation> }` — `[]` when the variant writes nothing. The skeleton leaves `writes: TODO`, never `[]`: an empty list is the author's statement that nothing is written, and a generator must not make it for them |
| `acts` | authored, optional | a list of `{ act: <what happens in the same act>, call: <seam operation> }` |
| `returns` | keys generated, sources authored | one row per field of **the variant's own** response, nested DTOs included: `{ field: <Facet>.<Dto>.<Field>, <source> }` — the base result plus the arm that answers this variant, never a sibling arm's (below) |
| `note` | authored, optional | reviewer-facing prose |

A **source** is exactly one of:

| source | names | `--check` verifies it exists as |
|---|---|---|
| `request: <field>` | a field of the request variant; a dotted path reaches through nested DTOs | a field of the variant or of a DTO it inherits from |
| `seam: <Op>` | what a seam operation returns | an operation of one of the Access's seams |
| `seam: <Op>.<Member>` | a member of what it returns — a row member, a named tuple element, deeper with more dots | a member of the operation's return type |
| `seam: <Row>.<Member>` | a member of a row type the seam declares | a record the seam's own namespace declares (or the design fence, before the code lands) carrying that member |
| `constant: <value>` | a fixed value | a non-empty value |
| `rule: <statement>` + `from: [...]` | a value computed from inputs | a non-empty statement AND a non-empty `from:` whose every input exists: `request.<field>`, `seam.<ref>` as above, or `fault.<identity>` — a `faults:` row declaring that identity answerable on this operation |

A `call:` is one seam operation name, `<Op>`, or `<ISeam>.<Op>` where the Access has two seams that
both declare the name. A `seam:` reference takes the same `<ISeam>.` prefix.

### Which returned fields a variant owes (#1626)

A polymorphic response is walked **per arm**, not whole. A request variant is paired with the result
arm named for it by the model's own contract — per-variant results are `{Base}_{Variant}_Result`
extending `{Base}_Result`, in the operation's own facet, which is the naming sns-cli's engine
enforces on `AddDto`/`SetDtoExtends` (ADR-027 §3) — and its `returns` rows are **the base result, the
paired arm, and whatever either carries through a FIELD**. A sibling arm's fields are not its rows:

- `FetchArticles_Page` owes `FetchArticles_Result.*` and `FetchArticles_Page_Result.*`;
- it does **not** owe `FetchArticles_Delta_Result.NewHighWaterLastModified` — that value has no
  source to give in a page request, and the only green available was a source that is not a source
  (figaro wrote `constant: 'not this arm: …'`, which reads correctly and is checked for nothing).

**Where the model declares no such arm, the WHOLE response closure stands**, exactly as it did
before: an operation whose arms are data-dependent OUTCOMES of one request (one request DTO, two
result arms) is answered whole by that request, and so is a variant the model gives no arm of its
own. Pairing narrows the walk only where the model itself says which arm answers which request.

**Data subtypes nested inside a result are untouched.** A row DTO with state arms is reached through
a field, not down the response's own inheritance edge, and every variant that returns the row owes
every arm's fields — the walk follows it exactly as before.

**Migrating a sheet walked before this** (a project that authored `constant: 'not this arm: …'`
rows): those rows are now **stale**, so `--check` is RED on each one, naming it — *"that field is
carried by a SIBLING result arm, and this variant is answered by `<Arm>`"*. One command finds and
removes them: `just resource-protocol-skeleton <project>` drops every row the walk no longer asks
for and leaves every authored source beside them alone.

**What "rule" means, and why.** A rule names its statement and its inputs, and the checker resolves
every input. The alternative — a rule id resolved against a rules registry — was not taken: the
nearest registry, `business-rules.yaml`, is the Blueprint mockup's explanation fuel, never imported
into production code, and its effects are keyed to System Interactions, not to what an Access computes.
A rule the checker cannot resolve would be a source that is checked for nothing.

### What `--check` refuses

**[P11] the answer-source walk**, per Access across its sheets (the fates reasoning: the operations are
the Access's, the sheets its seams'):

- `walk` is not a list; an entry is not a mapping, has no `op`, names an operation the Access's
  contract does not have (stale), or a `variant` that is not a concrete request variant of it;
- an operation variant is walked twice (on one sheet or on two), or has no entry on any sheet of its
  Access;
- `writes` is missing or not a list (`TODO` included); a write names no call, names a **list** where
  the one call belongs (*two calls are two writes, and neither guarantees the other*), names a call no
  seam of the Access declares, or names a call its sheet's `operations` classify as `read` / `GET`;
- an act names no call, names a list (*what happens "in the same act" happens in one call*), or names a
  call none of the variant's writes names;
- a returned field of the variant's own response has no row, a row names a field that response does
  not carry — a SIBLING result arm's field included (#1626, stale) — or appears
  twice; a row names no source, still carries the skeleton's `source: TODO`, names two sources, or
  carries `from:` without `rule:`; a named source does not exist (the table above);
- an entry carries a key the walk does not know.

**[P12] the durable field's storage** — measure P2, the rule both of Figaro's sheet reviews wrote down
as *"mechanisable: yes"* (finding F2, rounds 1 and 2). For every `durable` fates row, through the walk of
its `roundTrip.write` operation (each variant whose request reaches the row's DTO):

- the write names **no seam call** in its walk ⇒ red;
- **the storage half:** one of the shape entries that call acts on (its `operations` row's `on:`) must
  carry a member for the field — a column (RelationalDB), a document field (DocumentDB), a layout
  member (File, when the layout is a list). A RestApi endpoint lists no members, so only the seam row
  half applies to it;
- **the seam row half:** something the call passes must carry the field — a parameter, or a member of a
  row type it passes (followed through nested row types).

Names meet **case- and separator-insensitively** (`OrderId` meets `order_id` and `orderId`). Where
the stored name differs, the fates row states it, and the checker holds the statement instead:

- `column: <entry>.<member>` — must name a shape entry the write's call acts on, and a member it
  declares; `column: <entry>` alone when the field is kept as that entry's rows (a line list kept in its
  own table);
- `member: <Row>.<Member>` or `member: <Name>` — must be carried by what the call passes.

Both keys are refused on a fates row that is not `durable`.

**What the walk cannot see.** Existence is what a checker can verify: that `Applied` comes from
`fault.store:version-mismatch` exists as a declared row — not that the fault really says what the rule
claims, nor that a fault, which carries no value, can produce an id. Whether each source is the RIGHT
one stays the Contract reviewer's question, now asked of a list that exists. The analysis's own caveat
stands: a real implementor is the most thorough answer-source walk there is; the walk pays because it
runs before the gate makes the artefacts const, and before several packets hit the same class at once.

### Adoption — the NOT WALKED state and `--require-source-walk`

Sheets blessed before this section existed carry no walk, and a Contract gate has already passed on
them. So an Access **none of whose sheets carries `walk:`** is reported in its own state and stays green:

```
resource-protocol: note: …/ISalesStore.protocol.yaml: [P11] NOT WALKED — SalesAccess carries no answer-source walk on its sheet — 23 contract operation variant(s) unwalked, and 41 durable field(s) whose column and seam row member [P12] cannot check without it. Advisory; --require-source-walk makes it red (the Software Architect's order on relay R-260)
```

(Measured on a four-Access project the day this landed.) The summary line counts them — there, `… 4 of 4 sheeted
ResourceAccess(es) NOT WALKED`. **Once any sheet of an
Access carries `walk:`, the Access is walked,** and every [P11]/[P12] finding is red with or without the
flag — the section is complete or it is wrong.

`--require-source-walk` makes the NOT WALKED state red:

- `--require-source-walk` with no value — every sheet in the run;
- `--require-source-walk SalesAccess,ICatalogStore` — the named ResourceAccess(es), and the Accesses
  owning the named seams. A name that is neither is a usage error (exit 2): a requirement naming
  nothing would require nothing, silently.

Where the ruling puts it: before each component's next implementor round, for that component —
`just resource-protocol-check <project> --require-source-walk <Access>`.

### Starting a walk

`--skeleton` emits the section for a sheet that already carries `walk:`, and adds it where
`--require-source-walk` asks for the walk of an Access none of whose sheets has one — on the **one** sheet
the flag names, or on the Access's first sheet. It never grows the section into a sheet on its own
(#999's reason: a tool that adds a section to every blessed sheet retrofits a decision nobody made).
Two ways in, the same result:

```
node …/resource-protocol.mjs --skeleton --model <arch.json> --deployment <dir> --csharp <dir> --require-source-walk <Access>
# or: put `walk: []` at the end of the sheet, then
just resource-protocol-skeleton <project> <Access>
```

Regeneration keeps every authored source, write, act and note, adds a row for a response field the
contract gained, drops the entry of a variant the contract lost, and names both.

### Worked example

The Orders sheet above, walked for its confirm write and its read (the Sales seam is
`UpsertConfirmedOrder(SalesOrderRow row)`, `GetOrder(Guid orderId) → SalesOrderRow?`,
`VersionOf(Guid orderId) → int`; `SalesOrderRow(Guid OrderId, decimal GrandTotal, CarriedRatesRow?
CarriedRates, IReadOnlyList<OrderLineRow> Lines)`):

```yaml
fates:
  - dto: Orders.OrderRecord
    fields:
      - { field: CarriedRates,  fate: durable,
          roundTrip: { write: StoreConfirmedOrder, read: FetchOrder },
          column: orders.carried_min,
          note: "the #796 field — all-or-nothing card, QA-025/026; kept in two columns, column: names one" }
      - { field: Lines,         fate: durable,
          roundTrip: { write: StoreConfirmedOrder, read: FetchOrder },
          column: order_lines, note: "kept as the rows of its own table" }

walk:
  - op: StoreConfirmedOrder
    variant: Orders.OrderRecord
    writes:
      - { write: 'the order row, its lines and its carried card', call: UpsertConfirmedOrder }
    acts:
      - { act: 'the lines are stored with their order, never apart', call: UpsertConfirmedOrder }
    returns:
      - { field: Orders.StoreConfirmedOrder_Result.OrderId, request: OrderId }
      - { field: Orders.StoreConfirmedOrder_Result.Applied,
          rule: 'false when the conditional upsert raises store:version-mismatch, true otherwise',
          from: [seam.UpsertConfirmedOrder, 'fault.store:version-mismatch'] }
      - { field: Orders.StoreConfirmedOrder_Result.CurrentVersion, seam: VersionOf }
  - op: FetchOrder
    variant: Orders.OrderKey
    writes: []
    returns:
      - { field: Orders.OrderRecord.OrderId,      seam: GetOrder.OrderId }
      - { field: Orders.OrderRecord.GrandTotal,   seam: GetOrder.GrandTotal }
      - { field: Orders.OrderRecord.CarriedRates, seam: GetOrder.CarriedRates }
      - { field: Orders.OrderRecord.Lines,        seam: GetOrder.Lines }
      - { field: Orders.OrderLineRecord.Dish,     seam: OrderLineRow.Dish }
```

Read as findings: had `SalesOrderRow` lost `CarriedRates`, [P12] would name the field, the write
`StoreConfirmedOrder (variant Orders.OrderRecord)`, the call `UpsertConfirmedOrder` and *"the SEAM ROW half
is missing"*; had `orders` no column for it, *"the STORAGE half is missing"* — the #796 shape, and
Figaro's `LastSentImageSlotStoreRow`, caught at authoring time instead of by an implementor. Had
`AuditEntryId` on a duplicate been sourced from nothing but `fault.store:duplicate`, the walk would at
least put that claim on one reviewable line.

## Where the fate rows live — ADR-065 decision 11 (ruled 2026-08-28)

The four fates name what a **ResourceAccess** does with data arriving at its contract, so the
rows are keyed on the *Access's* contract DTOs. The sheet, since `/2`, belongs to a **seam**.
When an Access owns one seam these coincide, which is why `/1` never had to answer the question.
When it owns two, they do not.

**The rule**, which `--check` condition 1 implements: each field is attributed to the seam that
handles it, so completeness is *"every request-reachable field has a row in **at least one** sheet
of its owning Access"* rather than *"in this sheet"*. A field may legitimately carry different
fates in two sheets — `durable` in the store the system owns, `selector` against the customer's
ERP.

That is the point rather than a tolerated edge: it forces the architect to answer *"does this field
live in our store or in the customer's system?"*, which is the most useful question an integration
review can ask and which nothing forced before. The cost the Software Architect accepted when he
ruled is real — this is new authoring work in every project with a multi-resource Access.

Two mechanical consequences follow:

- a completeness finding names the **Access** and the sheets that jointly owe the row, when there
  is more than one — neither sheet on its own owes it;
- `--skeleton` does not push a field onto a sheet when a **sibling** sheet of the same Access
  already fates it, and never drops a row a sheet already carries. Without the first half the
  author's distribution would be undone on every regeneration; without the second half a field
  deliberately fated on two sheets would be deleted from one.

Two neighbouring questions are **still open** — put to the Software Architect on 2026-08-28 with
the build in front of him, and answered "cannot judge". The provisional shapes stand and neither
fails a check:

- **O1 — what guards an Access from becoming a catch-all.** ADR-065 sets no cap on slots
  deliberately, and nothing yet replaces the cap. Nothing in this format goes **red** on account
  of O1: the deployment view's per-Access `volatility:` line and the "no contract operation
  touches more than one of this Access's resources" observation are **reports** for the Contract
  reviewer, never failures, until he rules.
- **O3 — the Contract review surface.** `gate-record-format.md` said "one entry per
  ResourceAccess, quoting the reviewed sheet"; with sheets per seam an Access can carry several,
  so the entry is per **sheet**, grouped under its owning Access, with the record's `access:` key
  **optional** so nothing fails for want of it.

## `--check` — completeness and staleness (fails the build, same pattern as `seqmap complete`)

Regenerates the generated half from the const model + seam interface and fails when:

R1. **the ruling** (ADR-071, #1246): a slot of the sheet's seam carries no complete
   `ruled: { by, on, basis }` stamp in `deployment-view.yaml` (format `/3`). Kind and product are
   the Software Architect's ruling; a sheet that exists over an unruled slot was **authored ahead
   of its ruling** — Figaro's six were — and the line says so. Counts under `--require-all` like
   any finding. The remedy is the ruling, never a stamp typed to clear the line.
0. **sheet identity** (ADR-065): the sheet is not `format: resource-protocol/2`; it still carries
   a `resourceAccess:` key; its `seam` belongs to no slot of the deployment view; two sheets on
   disk claim the same seam; or a slot's seam has no sheet — the last only under
   `--require-all`, which counts **slots** (ADR-065 decision 9): an Access with two slots and one
   sheet is red. A sheet's or the deployment view's `system:` disagreeing with the model is a
   finding of this condition too — **a finding, never an exit** (#1065): a one-line name
   comparison must not stop the run before it has evaluated a single fate, effect class,
   allowlist or fault row, so it is reported alongside the rest, the way `seqmap complete`
   reports its `[C1]`.
1. any owned (request-reachable, see §2 above) Interface-DTO field of the sheet's **owning
   Access** has no `fates` row in **any** of that Access's sheets, or a `fates` row names a
   field/DTO the model no longer has. The completeness half of this condition is per Access and
   not per sheet — see "Where the fate rows live" below, and note that it rests on ADR-065's
   unruled question O2;
2. any `durable` field lacks a `roundTrip` pair, or the pair names operations that are not
   the RA's **contract** operations, or a pair that cannot carry the field — the write
   operation's request (the read operation's response) must reach the field's DTO, or the
   derived round-trip is unconstructible. **Both ends of an `observe:` coordinate are resolved
   here too** (ADR-059 amendment 2026-08-30, #961): the observable must read as
   `<Facet>.<Dto>.<Field>`, its record must be a contract DTO of this Access carrying that field,
   and the READ operation's response must reach that record — then the read end is asked about
   the observable's record instead of the row's own. **A `given:` coordinate is resolved here too**
   (ADR-059 amendment 2026-08-30, #1144): the setup write must be a **contract operation of this
   Access**, refused as specifically as the pair's own ends
   (`roundTrip given 'NoSuchOp' is no contract operation of WidgetAccess`), and it must be exactly
   **one** — a list where the single name belongs is a refusal, never its first element, because
   "no setup write" and "two setup writes" are different promises and the sheet has to say which
   one is enforced. What is deliberately NOT asked at authoring time is whether the setup write's
   request or response can *address* the write: the addressing harvest matches top-level property
   names at run time, and a name-level demand here would refuse legitimate authorings whose key
   arrives nested. A setup write that addresses nothing therefore fails at RUN time, loudly, as
   the pair's own unconstructibility already does. A durable promise the runner could not keep
   stays refusable at AUTHORING time, which is what lets this check need no per-project
   authoring. **A `roundTripValue:` is held here too** (ADR-059 amendment 2026-09-13, #1631): it
   is accepted only where a derived round-trip SENDS it — on an `instructive` row, as an unquoted
   whole number, in a field whose manifest type is a whole number (`sbyte`, `byte`, `short`,
   `ushort`, `int`, `uint`, `long`, `ulong`, nullable or not) and whose range carries the value
   (64-bit types to ±2^53−1, the largest integer both readers agree on), on a record the REQUEST
   of some durable row's `roundTrip` **read** carries — a durable row on any sheet of the Access.
   It is refused on any other fate
   (`Things.DispatchQuery.PageIndex states roundTripValue but its fate is 'selector'`), on a quoted
   or fractional value, on a field of another type, on a value its type cannot carry, on a record
   only a round-trip **write** or setup write carries (a write is composed with distinctive values
   and would never send it), and on a record no round-trip calls at all. Every stated value is
   named in the reviewer report. (Corrected with #841: this condition originally
   said "operations the seam does not have", contradicting the enforcement contract below
   and ADR-059's own words — the round-trip is built over the generated contract types and
   read back *through the RA contract*. The fates side of the sheet speaks contract
   vocabulary throughout; the seam vocabulary belongs to `operations`/`allow`.);
3. any seam operation is missing from `operations` or unclassified, or a listed one no longer
   exists, or names no `on:` target, or names an `on:` target the shape does not declare — `on:`
   is the only link between the effect classes and the shape, and without it the reviewer's
   "what can wipe data" question has no answer (#968);
4. any use case reaching this RA (per the model's sequences) has no `allow` entry, or an
   entry names a use case that no longer reaches it. `_`-prefixed entries are declared
   non-use-case entry points (`_maintenance`) and are exempt from model reachability;
   `_fixture` is **reserved** for the runner's fixture context and never declarable;
5. any `allow` op is not in `operations`;
6. the **shape section** does not hold. (The sheet-identity half of this condition moved to
   condition 0 when identity moved from the Access to the seam.) Since #968 the shape clause is
   what actually runs, condition by condition:
   - `shape:` is absent, or is not a mapping;
   - the kind's own section (`tables` / `collections` / `endpoints` / `files`, per the table
     above) is absent or empty, or the shape carries **another** kind's section;
   - an entry is not a mapping, has no naming key, or is declared twice;
   - an entry carries no members (`columns` / `fields` / `layout`) or lacks a required key
     (`partitionKey` for a collection, `method` for an endpoint) — the empty-schema hole;
   - a member is not a mapping, has no `name`, is declared twice, or (RelationalDB) has no
     `type`;
   - RelationalDB only: an unreadable `key:`, a composite key naming a column the table has not,
     two different primary keys on one table, a `constraints` entry that is not a placeable
     constraint string, or a foreign key referencing a table outside this shape.

(Condition 7 is the generated schema's — see "The generated schema" below.)

8. any `faults` row is unreadable or stale: the section is not a list, a row is not a mapping
   or lacks `op` / `identity` / `answers`, the `identity` does not read as `<domain>:<slug>`, the
   same (`op`, `identity`) pair is declared twice, the `op` is no contract operation of this RA,
   or an `answers` field is one the operation's response DTO does not carry (nested paths
   resolved through the manifest). Both stalenesses are the same class as condition 2's: a
   declared answer whose operation or field left the contract answers into nothing.
9. **the undeclared answer** (the SA's own red rule): the RA's `Service/` sources answer a fault
   identity — a filtered `catch … when (… Identity …)` naming it — that no `faults` row declares.
   That is an implementor deciding answerability alone, which is the one line in the seam ADR-059
   puts on the review surface. Under `/2` the comparison **unions the declared identities across
   every sheet of that Access** (#1091): the scan is per Access — `Service/` is one directory —
   while the declarations are now spread over the Access's sheets, so comparing one sheet at a
   time would turn correct code red the moment an Access owned two seams.
10. **the unanswered declaration** — the mirror of condition 9 (#1004): a `faults` row declares an
    identity answerable and no `Service/` source of that Access answers it, so the seam rethrows a
    fault the blessed design turns into result data. It is a finding **only once construction has
    landed** for that Access: from the Contract blessing to the Construction-stage landing every
    declared row is legitimately unanswered, and a red in that window would fail the check for the
    whole of Specification. "Landed" is read from the scaffolder's own marker — the create-once stubs
    it writes are `throw new NotImplementedException("Implement <Component>.<Op>.")` (ADR-027 §5), so
    while ANY stub is left under `Service/` this Access is still an implementor's work queue and the
    row stays the reviewer line it was. The read is per Access, not per operation, for condition 9's
    reason: attributing a stub to a contract operation would need C# body parsing, and a wrong
    attribution turns correct code red. **GENERATED sources are not read at all** (figaro#499): the
    stub marker only says anything about files a human is meant to fill in, and the scaffolder also
    emits files nobody may edit — for a **Utility**, which is contract-only and whose body is the
    iFX's, `Service/` receives exactly one `<auto-generated> … DO NOT EDIT` request-variant
    dispatcher and no stubs at all. That dispatcher throws no `NotImplementedException`, so before
    this it read as a landed body the instant it appeared, and every answerable-fault row on that
    component's sheets became a finding whose remedy could not be taken: there is no file the
    filtered catch could go in. A `Service/` holding only generated sources therefore reads as **not
    landed**, exactly as an empty one does.
11. **the answer-source walk** (#1620, measure P1 of relay R-260): over an Access that carries a
    `walk:` on any of its sheets, every contract operation variant has exactly one entry; every
    returned field of **that variant's own** response — the base result plus the arm that answers it,
    never a sibling arm's (#1626) — names exactly one source that exists; every write names one seam
    call that is not a read; every act names one call that one of the variant's writes makes. An Access with **no**
    walk is reported as NOT WALKED and is a finding only under `--require-source-walk`. The full list is
    in "The `walk:` section" above.
12. **the durable field's storage** (#1620, measure P2 of relay R-260): through the walk, every
    `durable` field's write reaches a seam call, a member of a shape entry that call acts on (the
    storage half) and a member of what the call passes (the seam row half) — by name, or as the fates
    row's `column:` / `member:` state it.

It also **reports** (info, for the Contract reviewer): every **danger-class** operation of the
sheet's kind (the table above), the shape entries it acts `on:`, and which use cases may invoke
it; every `transformed`/`instructive` fate
note; and every table that declares no primary key (legal, but the generated schema then states no
row identity for it). For the `faults:` section it reports every declared row (operation, identity,
the field it answers into and its note), every identity the `Service/` sources are seen to answer
and where, every declared identity the code does not answer yet (normal before construction lands),
and — for a sheet with no `faults:` section at all — the one line saying so, because "this seam
answers nothing, it only rethrows" is a design statement the reviewer should see stated rather than
infer from an absence. The declared-but-unanswered case is a REPORT while the Access is still
un-constructed and becomes condition 10's finding once its body is written (#1004).

## Tooling (#841)

`skills/sns-cli/bin/resource-protocol.mjs`, wired as two recipes:

- **`just resource-protocol-skeleton <project> [<seam>]`** — (re)generates the generated half for
  every seam the deployment view's slot table names (or one). **It refuses a seam whose slot is
  not ruled** (ADR-071 §2, #1246): the sheet's whole vocabulary is selected by the kind, so a
  sheet over a guess is a sheet to rewrite; the refusal names the slot and the remedy — the
  Software Architect's ruling, recorded on the slot — and writes nothing. Otherwise it merges into
  an existing sheet: authored VALUES (shape,
  fates, roundTrips, effects, `on` targets, allowlists, faults, notes and any extra keys) survive; row
  keys are regenerated; rows whose key left the model are dropped and named. The `shape:` block
  is carried through **verbatim, comments included** — it is wholly authored. Comments anywhere
  else do not survive regeneration: reviewer-facing prose belongs in `note:` values.
- **`just resource-protocol-check <project>`** — the gate above (`--check`), a `derived-check`
  member re-run on every model changeloop. Without sheets it reports each unsheeted **slot** as
  advisory and passes; `--require-all` (the Contract exit form) makes an unsheeted slot a failure —
  so an Access with two slots and one sheet is red (ADR-065 decision 9). The dossier renders an
  unreviewed sheet OPEN either way (ADR-051/054 pattern). `--require-source-walk [<Access|seam>,…]`
  makes an unwalked Access a failure — every sheet in the run, or the named ones (#1620):
  `just resource-protocol-check <project> --require-source-walk <Access>`.
- **`--skeleton --require-source-walk [<Access|seam>,…]`** adds the walk section, keys generated, to
  one sheet of each named Access that has none; a sheet already carrying `walk:` has its keys
  regenerated on every skeleton run. (The `just resource-protocol-skeleton` recipe forwards no flags:
  put `walk: []` on the sheet and run it.)
- **`just resource-protocol-schema <project> [<seam>]`** — the schema generator (#970, below).

Inputs: the ReadArchitecture model JSON (use cases and their chains), the RA's generated
`.methodcontract` manifest (the owned contract DTOs and fields — ReadArchitecture's flat dto
list omits DTOs reachable only through fields, e.g. a record's line items, so the manifest is
the fates universe; it is also exactly what the runner's derived round-trip builds against),
the seam declaration (from the landed C# when it exists — the code is the truth, #593/#798 —
else from the ```csharp fence in `02_Store-Seam-Interfaces.md`), and `deployment-view.yaml`.
Consequence for the resource-designer pass: the sheet skeleton is generated **after the
contracts are generated** from the const model.

## The generated schema (#970)

For a `RelationalDB` sheet the blessed `shape:` section is **the only source of the store's
schema**: `just resource-protocol-schema` emits
`docs/03_Technology/03_Deployment/schema/<Seam>.schema.sql` from it — `CREATE TABLE` per shape entry
in the shape's own order, column types in the sheet's own words, `NOT NULL` unless the column says
`nullable: true`, `PRIMARY KEY` from the columns' `key:` declarations, a `UNIQUE` per
`key: unique` column the `constraints:` list does not already spell out, every other constraint
passed through verbatim, and one `CREATE INDEX` per `INDEX [name] (col [ASC|DESC], …) [WHERE …]`
entry (unnamed, it is `<table>_<cols>_idx`). Identifiers are quoted, so a
column called `key` or `order` is the sheet author's business and not the generator's.

**A FILTERED UNIQUENESS IS AN INDEX, NOT A TABLE CONSTRAINT** (#1742). `UNIQUE (a, b) WHERE p`
becomes a standalone `CREATE UNIQUE INDEX … ON … (a, b) WHERE p` under the dialect's own guard —
unnamed, it is `<table>_<cols>_ux` — while a plain `UNIQUE (a, b)` stays a table constraint as it
always was. T-SQL accepts no filter on a table constraint (a filter "can't be applied to primary key
or unique constraints"), and no dialect here gives a `WHERE` inside `CREATE TABLE` any meaning, so
**the generator never writes one** and refuses a filtered entry it cannot read. The sheet needed no
new vocabulary for this: the spelling it already had is the one that is now rendered correctly.

**PARENTS BEFORE CHILDREN** (#1742). The `CREATE TABLE` statements are emitted in FOREIGN KEY
dependency order — a depth-first post-order over the sheet's own order — because DDL has no deferred
name resolution for a foreign-key target, so a table emitted before the table it references fails on
a fresh database. A shape already in a runnable order is emitted exactly as it stands; one that is
not moves only the parent, up to just before the child that named it. A **cycle** has no such order.
Breaking one needs `ALTER TABLE … ADD CONSTRAINT` after both tables exist, which SQLite cannot run at
all, so a cycle is **refused** by `[P6]` — naming the edges that close it — rather than emitted as a
script no order can deploy.

The file is written in the **dialect of the slot's product** (#1734), derived from the slot's
`product` and `driver` — never a sheet field. SQL Server / Azure SQL Database gets T-SQL:
`IF OBJECT_ID(…, N'U') IS NULL CREATE TABLE …`, `IF NOT EXISTS (SELECT 1 FROM sys.indexes …) CREATE
INDEX …` and `[bracketed]` identifiers. PostgreSQL and SQLite get `CREATE … IF NOT EXISTS` with
`"quoted"` identifiers. A product the generator has no dialect for is **refused** — `--schema` exits 2
and keeps the existing file, and `--check` reports a committed one as `[P7] not re-derivable` —
rather than emitting DDL the product cannot run.

Why it exists: without it the human blessed a table design at Contract and the driver author read it
as prose and re-typed it into a hand-written migration, with **nothing comparing the two** — a
blessed schema the code does not build, which is #798's drift class one level below the seam doc.
There is one source now, and **the hand-written migration path for relational Access components is
gone, not deprecated alongside** (CLAUDE.md's standing rule): see
`skills/csharp-access-relational-db/SKILL.md`.

`--schema` reads only the sheet and `deployment-view.yaml` — the shape is wholly authored, so the
model and the C# tree have nothing to say about it — and it refuses to emit from a shape that does
not pass the condition-6 checks above. `--check` then adds **condition 7**: a schema file that
exists must be what its sheet emits today (stale ⇒ red, with the regeneration command), and a
schema file for an RA the deployment view no longer names, or for one that generates none, is a
finding. A missing schema file is *not* a finding: a project adopts the generated schema when its
store driver does.

`DocumentDB` and `RestApi` generate nothing — a document store has no DDL to emit and a REST API no
schema at all — and their shape sections stay review-only (ADR-059 amendment 2026-08-23).

## Enforcement contract (spec runner)

1. **Effect gate.** The simulator base class (ADR-034 §7 `SimulatedResource`) loads the
   sheet for its seam. The runner exposes the active scenario's use-case id as ambient
   context. A seam call whose operation is not in the active use case's `allow` list fails
   the run immediately, naming the use case, the operation, and the sheet line. Scenarios
   with no use-case id (pure fixture setup) run under a runner-declared `_fixture` context
   that is exempt by design and never available to production-path code.
2. **Durable round-trip.** For every `durable` field, the runner derives one property from
   the `roundTrip` pair: construct the write-op's DTO with the field distinctively populated
   (generic builder over the generated contract types), invoke write then read at isolated
   wiring against the simulator, compare the field structurally. Where the row names an
   `observe:` coordinate the read side is harvested from THAT record and field instead, so a
   command/response-split seam round-trips across two records. Where it names a `given:`
   coordinate that operation is invoked FIRST, and the write is then addressed from its request
   and response, so an update-only write acts on a record that exists. The READ request is
   addressed to the record the write made, from the sheet's own `selector` and `instructive`
   rows — an instructive row's stated `roundTripValue:` is what that field is sent (#1631) — and
   every written value must reappear in what it answers (containment — see "The READ
   is addressed to the record the write made" below). No per-project authoring;
   the property list is exactly the sheet's durable rows. The same derived checks re-run at
   the Step-7 real-resource wiring (#446) — fidelity is the same sheet at two wirings.
   **A `given:` costs double at Step 7**: against a live third-party resource each such durable
   row is a CREATE and an UPDATE per run, not one write — worth knowing before a sheet adopts it
   on a metered or rate-limited API, and not a reason to refuse it.

### Built shape (#842) — recorded implementation choices

- **Selection**: `THEAGENT_SPEC_PROTOCOLS` names the protocol directory; every
  `*.protocol.yaml` there loads at run start (the `THEAGENT_SPEC_WIRING` env-var pattern —
  `just spec-verdict` exports it whenever the project's directory exists). Unset installs
  nothing; a missing directory, an unreadable sheet, or two sheets claiming one seam is a
  loud refusal — a run asked to enforce must never quietly enforce less. A loaded sheet
  arms only its own seam: every other simulator stays neutral (per-RA activation, #843).
- **Scenario declaration**: the spec author writes `UsesCase("SIxx.yy")` on the builder;
  exactly the When stimulus runs under the id. Given steps, queries and the derived
  round-trips' own traffic are setup/oracle traffic under `_fixture`. An undeclared
  scenario stays wholly at `_fixture` at RUN time — the runner never guesses — but it is a
  **spec-lint error** once a sheet exists for a seam that scenario's chain reaches (see
  "The declaration is required, not optional" below). `_fixture` is refused on both sides
  (sheet parser and builder).
- **Process-scoped scenarios declare per STEP** (#893): each step of the chain is one use
  case's stimulus, so the id sits on the step row —
  `Step("SI02.01", m => m.PlaceOrder(...), expected)` — and exactly that step's invocation
  runs under it, same AsyncLocal semantics as the SI scope, so each leg of an A-to-Z chain
  is checked against its own use case's allowlist and a violation is attributed to the
  offending leg's id. An undeclared step stays at `_fixture` at run time and is a spec-lint
  error under the same rule as a scenario; `_fixture` is refused on steps too.
- **Violations are recorded at the seam, never thrown**: an Access legitimately catches
  seam exceptions (retry, fault translation), so a thrown gate could be swallowed into a
  clean-looking envelope. The recorded findings fail the unit at its end
  (`SpecProtocolViolationException`, the unit's own failure chained as cause) — result
  class `assertion`, pinned so a chained `NotImplementedException` can never bless a
  violation into "red by design".
- **The derived round-trip observes the row's own DTO, or the record `observe:` names**:
  every instance of the fates row's DTO in the write request must reappear, field-equal per
  the model's comparison classes, in the read response — the shape `--check` condition 2
  guarantees constructible. When the row carries `observe: <Facet>.<Dto>.<Field>` the
  read-back is harvested from that record's instances and that field instead, and the
  comparison is the same order-insensitive match across the two records — CONTAINMENT since
  2026-09-13: each written instance needs a read-back value of its own, and read-back values
  nobody wrote are allowed (see "The READ is addressed to the record the write made") (ADR-059
  amendment 2026-08-30, #961). That is the ONLY thing the coordinate changes: a row naming
  only `write` and `read` behaves exactly as it did before the coordinate existed, and no
  sheet needed an edit for it — which is why the format stays `resource-protocol/2`, the
  same additive move the `faults:` section made inside `/1` (#999). Before it, a seam whose
  write is command-shaped and whose read answers a different record got **no round-trip at
  all** and was guarded by the effect allowlist alone. Rows whose vocabulary does not
  resolve — the observable's record and field included — or whose pair cannot carry the
  field at run time, are RED units naming the reason, never a silently shorter unit list.
  Derived units run at isolated wiring and are appended engine-side beside the trust-chain
  nodes.
- **A `given:` runs before the write, and addresses it** (ADR-059 amendment 2026-08-30, #1144):
  the named contract operation is invoked FIRST, addressed by nothing — it establishes the world
  rather than reaching into it — and a failure or a carried error envelope from it is a red unit
  naming that step, exactly as the write already is. The write's request is then composed with
  the setup write's request and response as top-level addressing sources, by property name: the
  same harvest that already addresses the read from the write. Two rules make it honest. **The
  field under observation is never taken from the setup write** — the write must carry its own
  distinctive value for it, or a write that ignores the field entirely would still see the setup's
  value come back from the read and pass green over exactly the #796 silence it exists to end
  (so a durable row on the ADDRESSING key itself wants no `given:`; that row's round-trip belongs
  to the create). And the **read is addressable from both**: the setup write's request and
  response are sources for it too, since a key minted by the create is what the update and the
  fetch both need, with the write's own request winning wherever both carry a name. Exactly ONE
  setup write is expressible; a chain is deliberately not, until a real seam asks for one.
  Like `observe:`, the coordinate is optional and additive — no existing sheet needed an edit —
  so the format **stays `resource-protocol/2`**, on the same reading that added the `faults:`
  section inside `/1` (#999). `/1` → `/2` was a breaking identity change (`resourceAccess:`
  dropped, so every sheet had to be rewritten); this is not one, and bumping would force an edit
  on every sheet in the repository without changing what a single one of them means.
- **The READ is addressed to the record the write made** (ADR-059 amendment 2026-09-13, #1623,
  figaro#684). *figaro run adoption, 2026-09-13, first run of derived units against real code.*
  Until then every unit had failed earlier, on a scaffold's `NotImplementedException`, so nobody
  had seen the read request: it was composed by the same distinctive-value builder as the write,
  and every filter on it that shared no NAME with a written field asked for records nobody wrote.
  The contract-correct answer was empty, and Figaro's units were red on every landed Access for
  that reason alone (Audit 8 of 8, Ledger 92 of 92, Erp 17). The read is now composed from the
  sheet's own fate rows — no new coordinate, no sheet edit:
  1. **A `selector` on the read** is null when its type accepts null (a `Nullable<T>` or a
     reference type annotated nullable — a filter that is not applied still answers the written
     record); else the written value by name, the top-level harvest above; else a harvest from
     the write and setup-write graphs, where a list `<X>s` takes every `<X>` and every element of
     a same-named list, and a single value is taken only when every same-named field agrees on
     one; else the unit is **red «unaddressable: `<Dto>.<Field>`»** — the real reason, never a
     "did not survive" that would blame the store. Null comes BEFORE the name match on purpose: a
     same-named write field may be one the store folds away (Business Central keeps a debtor's
     company inside its display name, so a search filtered by the written company answers
     nothing). The rows are looked up on the unit's own sheet first, then on the other sheets of
     the same Access (ADR-065 decision 11), on the composed type or its nearest base with a row.
  2. **An `instructive` whole number on the read** is composed as the row's `roundTripValue:` when
     it states one (see "A paged read states the value the unit sends" below, #1631), else as `100`
     (`ProtocolRoundTripCase.ReadInstruction`), never a distinctive value: a distinctive cap lies
     above the resource's own (Business Central's 20 000-entity page answered 413, which the
     sheet rightly calls a design fault), while 100 lies inside every cap in evidence and above
     the few records a unit's world holds. Other instructive types, and instructive fields of the
     write, keep their distinctive values.
  3. **A polymorphic read request** is composed as the variant whose `{Variant}_Result` reaches
     the observed record, first by name when several do; the write-side choice (the variant that
     reaches the WRITE row's record, else the first by name) stands only when no variant's result
     reaches it.
  4. **The builder reaches through abstract types** — a property's, a collection element's or the
     parameter's — into their concrete subtypes, so a row on `MarginLostCostBasis_Agreed` behind
     `CostBasis : MarginLostCostBasis`, or on `ListingAssignmentWrite_Listed` behind
     `List<ListingAssignmentWrite>`, composes the variant that carries it instead of none.
  5. **Containment, not a multiset**: every written instance must reappear; the read-back may
     carry more. A fan-out write stores one row per element of a list the builder fills with two,
     so a correct store answers the one written value twice. A store that DROPS a written value is
     red exactly as before — that is #796 — and no rule here changes what a unit observes on a
     written field; the rules change only which records the read asks for.
  6. **A write after a `given:`** takes the same name match and the same harvest from the setup
     write for its `selector` fields (`TaskIds` from the `TaskId` the setup minted), and keeps a
     distinctive value otherwise — never null, since a write with a null key may act on every
     record. A write with no `given:` is not addressed at all: it mints its own keys. A chain of
     writes is still not expressible.

  **Deliberately not decided here**: an `instructive` number that is an OFFSET rather than a cap
  (`LoadTasks_Open.PageIndex`, where `Skip(PageIndex * PageSize)` needs 0 while `PageSize` needs a
  positive value) — no single value serves both and the fate rows cannot tell them apart; it is
  put to the Software Architect on #1623, and such a read stays red until then. *(Decided the same
  day by #1631 — the next bullet.)*
- **A paged read states the value the unit sends** (ADR-059 amendment 2026-09-13, #1631 — reading 2,
  screened on figaro relay R-272). *figaro run adoption, 2026-09-13, first paged read in a derived
  round-trip.* Rule 2 above sends every `instructive` whole number of a read 100, so Figaro's
  `LoadTasks_Open` — `Skip(PageIndex * PageSize).Take(PageSize)` — skipped a hundred pages, and 46
  Access/Ledger units (44 from `RaiseTask`, 2 from `MarkTasksPickedUp`) stayed red on a correct
  Access; `LoadProjectionJournal` has the same pair. An `instructive` fate row now states the value:
  `{ field: PageIndex, fate: instructive, roundTripValue: 0 }`. The rules:
  1. **It is sent on the READ only**, in the member the row names — the composed type or its nearest
     base with a row, the unit's own sheet first, then the other sheets of the Access (rule 1's
     lookup). A write, a setup write included, keeps its distinctive values; `--check` refuses a
     value on a record only a write carries.
  2. **No stated value, no change**: the field is sent 100, exactly as rule 2 says. The page size of
     a paged read states nothing, or states 100 for the reader's sake.
  3. **Whole numbers only** — the one type rule 2 composes from a fate row, and the only one a
     measured case asks for. Any spelling `yaml-subset.mjs` reads as a whole number is one (`0`,
     `-1`, `0x10`); a quoted value is a string and refused by `--check`; beyond ±2^53−1 neither
     reader accepts it.
  4. **Refused loudly, never read as absent.** The runner's loader refuses `roundTripValue:` on a row
     that is not `instructive` and a value that is not a whole number (`<file>:<line>: field
     '<Dto>.<Field>' …`); a value the member cannot carry — a member that is no whole number, a
     number outside its type — is a **red unit** «roundTripValue `<n>` on `<Dto>.<Field>` cannot be
     sent: …», never a silently different value. `--check` condition 2 refuses all of it first, at
     authoring time, from the manifest's field type.
  5. **It changes which value the read is sent, and nothing a unit observes.** A wrong value is sent
     as stated: page 1 of a one-record world is empty, and the unit is red «written values to
     survive» — the sheet's promise, reviewed at Contract like the rest of it.

  Rejected: reading 1, a naming convention (`*Index`, `*Offset` → 0), guesses from names the format
  never defined; reading 3, preferring a read variant with no page, fixes Figaro by the luck of its
  model shape and does nothing for a read with one variant; reading 4 leaves Access/Ledger red.
  Additive, so the format stays `resource-protocol/2`, on the reading that added `observe:` and
  `given:`.
- **The runner reads past `walk:`** (#1620): section 6 is `--check`'s, and the loader skips it for
  the reason it skips `faults:` — a section the runner does not enforce must not stop the run that
  enforces the two it does. Before it, the loader refused every top-level key it did not know, so the
  first sheet to adopt the walk would have stopped every spec run in its project.
- **Nothing in the round-trip keys on `resourceKind`.** It is defined over RA CONTRACT operations
  and executed against the SIMULATOR, never over the seam and never against the real resource, so
  it works identically for a relational store and a REST API — POST-create, PATCH-update,
  GET-read is an ordinary REST shape and reads as the same three coordinates. That is why neither
  `observe:` nor `given:` has a per-kind spelling, and neither may acquire one.
- **The ADR-054 suite-strength passes run under the same selection** (#894): the strength
  `suite` verb installs from `THEAGENT_SPEC_PROTOCOLS` exactly like the host, so the effect
  gate arms in strength runs and a violation fails a unit there as anywhere — under a
  mutation verdict that failure is a KILL, deliberately: the sheet is reviewed spec, and a
  behaviour change it notices is noticed (same run semantics everywhere, stated not
  assumed). A `--sut app` slice appends the derived round-trips whose RA contract its
  selector matches — the per-land pass measures the suite WITH the units every normal run
  executes, closing the Part B blind spot where the #796 mutant class scored SURVIVED —
  and appended units count toward the slice pin. A row that resolves against nothing joins
  every app slice and fails naming the reason (unattributable, not invisible). A
  `--sut model` slice appends none, by decision: Part A measures the authored suite over
  reference-model semantics with no application graph and no simulators (that absence is
  its design, ADR-054), reference models do not wrap stores, and no model mutant can flip
  a unit that never touches the model — at that SUT a derived unit could only fail for
  machinery reasons, indicting neither suite nor model.

### The declaration is required, not optional (#925, SA ruling 2026-08-23)

**Once a sheet exists for a seam a spec unit's chain reaches, the declaration is a
`spec-lint` ERROR when it is missing** — Contract entry severity, spec-lint's standing under
ADR-033 §5. Strict from the first day it shipped: no advisory phase and no legacy/tolerant
mode. Instead of a switch for the one project that predated the rule, that project's
sheets were retrofitted first (#843), so the check was validated against real sheets on the
day it landed.

The runner's per-unit adoption above is what makes this checkable rather than a
contradiction of it: the runner never guesses an id, and the lint is what stops a unit from
staying silently unadopted. Without the declaration the unit's traffic runs wholly under
`_fixture`, the effect gate never sees it, and nothing else in the compiled surface can say
so — the silently-neutral shape ADR-059 exists to end.

The join is **per component / reached sheeted seam**, with one side condition:

1. the unit's entry operation belongs to a ResourceAccess with a sheet, or the model draws
   a chain from that operation to one — so a component whose seams are unsheeted is
   untouched (the per-RA activation of #843), and so is an Engine that reaches no store;
2. **and** the model draws that entry operation inside at least one use case. An operation
   the design gives no `SIxx.yy` has no id to declare, and demanding one would be a
   requirement nobody can satisfy.

A declared id the model does not draw that operation inside is its own finding: the gate
would judge the stimulus against the wrong allowlist, or against none, so a wrong id is
worse than an absent one — it reads as covered.

The class gates in **both partitions**, unlike the masking classes and like the
false-statement class: it is not about discharge (a hidden case discharges nothing) but
about a unit's own traffic, and a hidden scenario opts out of the gate exactly as silently
as a visible one. **Property rows are out of scope** — `UsesCase` is a scenario-builder
verb, so a property has no way to declare; where a property's target reaches a sheeted seam
the lint says so as a note rather than demanding the impossible.

Wiring: `spec-lint --protocols <protocol dir>`, passed by `just spec-lint` whenever the
project's directory exists (the `THEAGENT_SPEC_PROTOCOLS` shape). The run's header line
always names how many sheets it read, so a CLEAN cannot be mistaken for a class that never
ran.

## Ownership and gates

| Concern | Owner |
|---|---|
| Skeleton (generated half) | tooling, from the const Blueprint model + seam interface |
| Shape, fates, allowlists, answerable faults | Design-stage architect (resource-designer pass, ADR-048 §3) |
| The answer-source walk (sources, writes, acts; `column:`/`member:` on durable rows) | Design-stage architect — required per component where the conductor puts `--require-source-walk`, before its implementor round (relay R-260, #1620) |
| Review | human at **Contract** — SA or named domain-architect delegate (ADR-058) |
| Enforcement | spec runner + simulator, Specification → Acceptance; real wiring at Step 7 |
| Dossier | standing Contract evidence block, **one entry per sheet grouped under its owning Access** (ADR-065 O3): unreviewed/missing sheet renders OPEN (ADR-051/054 pattern) |

The sheet is **const after Contract** like the rest of the contract surface; a change re-enters
via the ADR-040 §7 routes and owes the Contract act on the sheet again (ADR-058: skip the
review, never the act).
