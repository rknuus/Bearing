# The Deployment View format (`deployment-view/3`)

**Status:** the specification ADR-048 §1 promised and never had. From 2026-07-30 (ADR-048) until
2026-08-28 the deployment view was a shipped, tool-read artifact with **no format spec at all** —
its shape was defined by whatever each reader happened to destructure, and ADR-048 §1's forward
reference to "§5" for the schema was dangling (§5 is about simulators versus testcontainers).
Written with #1087, under **ADR-065**, which is what made the format `deployment-view/2`.
**`/3` (2026-09-05, #1245, under [ADR-071](../decisions/071-deployment-decisions-are-ruled-before-the-sheets.md))**
adds what `/2` never had: a **ruling**. Every slot and the hosting operational concept carry
`ruled: { by, on, basis }`, the `hosting:` block is required, and a Utility that stands on a
resource declares slots under `utilities:` exactly as an Access does under `accesses:`.
**Amended 2026-09-09 (#1401, ADR-071's amendment):** the `hosting:` block may declare
**resource-less platform products** — a telemetry backend above all — each with its own ruling
stamp. An additive optional key, so `/3` stays `/3` and no file needs migrating.

Consumed by `deployment-view-check.mjs` (the yaml↔markdown agreement gate),
`resource-protocol.mjs` (all three verbs loop over it), `slot-wiring.mjs` (which GENERATES the
production and spec compositions from it — see "What is generated from the slot table" below),
`construction-entry-check.mjs`, `dossier-build.mjs`, and `workspace materialize` (flavor-skill selection
per implementor packet).

## Purpose

The deployment view is where the concrete **technology binding** lives: which product realizes
each resource, reached through which seam, with which fault vocabulary. It is deliberately **not**
the architecture model — the `.method` model stays product-free (ADR-048 §1), because the concrete
product is exactly the volatility a ResourceAccess exists to encapsulate.

It is also, since `/3`, where those decisions are **ruled**. The architect's resource-designer pass
*proposes* kind, product and hosting; the Software Architect (or the ADR-058 delegate) *rules*; the
stamp on the artefact is the record. A slot without a stamp is UNRULED — not malformed, but a decision
still owed — and `deployment-view-check` is red over it until the ruling exists. Nobody adds a stamp
to make a check green: the remedy is the ruling.

It is a **pair** of files that state the same facts in two forms:

| File | Role |
|---|---|
| `docs/03_Technology/03_Deployment/01_Deployment-View.md` | the narrative and the authority on **why** — why PostgreSQL for the contended bill-bearing store, why SQLite for the local ones. No schema can hold that. |
| `docs/03_Technology/03_Deployment/deployment-view.yaml` | the same facts in the form a program can act on. |

`deployment-view-check` exists so the two cannot drift. It does not treat the yaml as superseding
the prose: it asserts that the facts both state agree, and everything else the markdown says is
its own business.

## What changed in `/3` — the ruling, the hosting concept, Utility slots (ADR-071)

`/2` was PRODUCED and never RULED. The pass picked a product, this format checked its shape, the
check held yaml and markdown together, and no human was asked whether PostgreSQL was the right
product or where the system would run — Figaro reached Blueprint with six protocol sheets over an
unruled product, no row for its StorageUtility, and a hosting question (OC-07) with "no decision and
no owner" that no gate could ask for. `/3` adds three things:

1. **`ruled: { by, on, basis }` on every slot** — kind and product are the Software Architect's
   ruling. `basis` is the verbatim ledger answer (`QA-###`) or the session ruling it rests on, in the
   ADR-060 §3 `authority`/`basis` manner. All three keys required; `on` is a `YYYY-MM-DD` date.
2. **A required top-level `hosting:` block** — the hosting *operational concept* in the DDC sense: a
   deployment decision recorded with the architecture and never in the model (ADR-048 §1). Five
   one-line facts and its own stamp: `topology` (one binary / per subsystem / per component — the
   subsystem boundaries are the units of that later choice), `target` (the class: a laptop, an app
   service, a container host, a cluster), `costEnvelope` (one line, the Software Architect's bound —
   it prices every product choice below it), `partialDeployment` (whether a site may run a subset of
   the business processes), `operator`. "Which server, which cluster, which backup schedule" stay
   out: this is a design-level decision, not the operations runbook. The §5 section a project's
   `01_Deployment-View.md` has carried since the Software Architect's ruling on #488 is the shape,
   and under `/3` it is a block in the yaml rather than a one-off section in prose.
3. **A `utilities:` list beside `accesses:`** — a Utility that stands on a resource (a storage
   utility over the file system, Blob or S3) declares slots with the **same entry**, keyed by
   `utility:` instead of `resourceAccess:`. Its seam owes a sheet under ADR-065 decision 4 unchanged;
   its projects live under `Component/Utility/<Stem>/`. The Utility bar of IDesign is untouched — the
   Utility still appears on no drawn sequence leg — which is exactly why its resource surface needs
   the row: an undrawn encapsulator is invisible to every chain-level check.

**No dual grammar, again.** A `/2` document is a loud refusal naming the migration. The migration
ADDS: the stamps (an unruled slot stays unruled — the check stays red until the Software Architect
rules, which is the mechanism working, not a migration defect), the `hosting:` block, and
`utilities:` where one applies. `hosting:` sits before `accesses:` by convention.

## What changed in `/2` — the slot table (ADR-065)

`deployment-view/1` gave each ResourceAccess **one** `resource`, `resourceKind`, `product` and
`seam`. That singularity was never a decision; it was an assumption, and it is wrong as IDesign —
one ResourceAccess isolates the system from the volatility of interacting with *one or multiple*
sets of like resources. On the figaro run it produced a real hole (issue #1069): `ErpAccess`
stands on a relational store the system owns *and* on the customer's Business Central over an API,
only one could be named, and the most consequential external surface in the system ended up the
one with no reviewable call allowlist.

In `/2` each Access declares a list of named **slots**. One slot is one resource in one role.

**There is no dual grammar.** `deployment-view/1` is not read by anything after the migration
(ADR-065 decision 10, and the repository's standing "delete the loser" rule). A `/1` file is a
loud refusal naming the migration, never a silently-accepted legacy shape.

## Shape (by example — illustrative)

```yaml
format: deployment-view/3
system: Figaro                    # the system name; see "The `system:` field" below

hosting:                          # the hosting operational concept (ADR-071 §3) — five facts, one stamp
  topology: "one binary, one process"
  target: "one small app service"
  costEnvelope: "no dedicated database server in V1"
  partialDeployment: "yes — a site may run a subset of the business processes (OC-12)"
  operator: "the customer's IT, with the vendor on call"
  ruled: { by: "Software Architect", on: 2026-09-12, basis: "QA-061: «one process on one host, no managed database in V1»" }
  platforms:                      # resource-less platform products (#1401) — optional; see below
    - platform: telemetry-backend # THE ROLE. The identity, the way a slot's name is a slot's.
      purpose: "where the instrumentation proxy exports traces, metrics and logs"
      product: "Grafana Tempo (self-hosted beside the app service)"
      costEnvelope: "under 20 EUR a month at V1 span volume; self-hosted rather than per-GB billed"
      operator: "the customer's IT, with the vendor on call"
      whenUnavailable: "the system runs on — spans are dropped at the collector, nothing blocks"
      ruled: { by: "Software Architect", on: 2026-09-12, basis: "QA-063: «self-host it; I am not paying per gigabyte for proxy spans»" }

accesses:
  - resourceAccess: ErpAccess
    volatility: "how the logical ERP is reached"     # one line; see O1 in ADR-065
    slots:
      - slot: erp-extension-store                    # THE IDENTITY. Unique within the system.
        resource: ErpExtensionStore
        seam: IErpExtensionStore                     # the TYPE. May repeat across slots.
        resourceKind: RelationalDB
        product: PostgreSQL
        driver: Npgsql.EntityFrameworkCore.PostgreSQL
        driverType: ErpExtensionStorePostgres        # explicit; never resolved by scanning
        driverProject: Component/Access/Erp/Store.Postgres   # where that driver lives
        flavorSkill: csharp-access-relational-db
        configKey: erp-extension-store               # the KEY. Never a value.
        retry:                                       # generated onto the slot carrier; the
          maxAttempts: 3                             # Access reads it, nobody restates it
          shape: exponential-jitter
          baseDelayMs: 50
          maxDelayMs: 1000
        ruled: { by: "Software Architect", on: 2026-09-12, basis: "QA-062: «relational, PostgreSQL — the ledger's set queries and UNIQUE-constraint idempotency»" }

      - slot: business-central
        resource: BusinessCentral
        seam: IBusinessCentralApi
        resourceKind: RestApi
        product: "Dynamics 365 Business Central"
        driver: Microsoft.Extensions.Http
        driverType: BusinessCentralHttpClient
        driverProject: Component/Access/Erp/Store.BusinessCentral
        flavorSkill: csharp-access-rest-api
        configKey: business-central
        retry: { maxAttempts: 3, shape: exponential-jitter, baseDelayMs: 50, maxDelayMs: 1000 }
        ruled: { by: "Software Architect", on: 2026-09-12, basis: "QA-014: the customer's Business Central is a given, reached over OData" }

  - resourceAccess: CatalogAccess
    volatility: "how the menu and stock are stored"
    slots:                                            # the singular case is the N=1 case
      - slot: catalog-store
        resource: CatalogStore
        seam: ICatalogStore
        resourceKind: RelationalDB
        product: SQLite
        driver: Microsoft.Data.Sqlite
        driverType: CatalogStoreSqlite
        driverProject: Component/Access/Catalog/Store.Sqlite
        flavorSkill: csharp-access-relational-db
        configKey: catalog-store
        retry: { maxAttempts: 3, shape: fixed-short, baseDelayMs: 50, maxDelayMs: 1000 }
        ruled: { by: "Software Architect", on: 2026-09-12, basis: "QA-062" }

utilities:                                          # a Utility that stands on a resource (ADR-071 §4)
  - utility: StorageUtility
    volatility: "where opaque image bytes are kept"
    slots:
      - slot: image-blobs
        resource: ImageBlobs
        seam: IImageBlobs
        resourceKind: File
        product: "Azure Blob Storage"
        driver: Azure.Storage.Blobs
        driverType: ImageBlobsAzure
        driverProject: Component/Utility/Storage/Store.Azure
        flavorSkill: csharp-access-rest-api
        configKey: image-blobs
        retry: { maxAttempts: 3, shape: exponential-jitter, baseDelayMs: 50, maxDelayMs: 1000 }
        ruled: { by: "Software Architect", on: 2026-09-12, basis: "QA-063: «Blob in V1; the seam keeps the file system and S3 open»" }
```

## Keys

### Document

| key | required | what it names |
|---|---|---|
| `format` | yes | exactly `deployment-view/3`. |
| `system` | yes | the system name. See below. |
| `hosting` | yes | the hosting operational concept — see "Hosting block" below. Since 2026-09-09 it may also carry `platforms:`, the resource-less platform products. |
| `accesses` | yes | a list of Access entries; may be empty only when `utilities` is not. |
| `utilities` | no | a list of Utility entries, for Utilities that stand on a resource (ADR-071 §4). Same shape as an Access entry, keyed by `utility:`. |

### Hosting block

| key | required | what it names |
|---|---|---|
| `topology` | yes | the shape: one binary / one process per subsystem / one container per component. The subsystem boundaries are the units of that later choice; the model stays hosting-free (ADR-048 §1). |
| `target` | yes | the target **class** — a laptop, an app service, a container host, a cluster. Not the server. |
| `costEnvelope` | yes | one line, the Software Architect's bound. It is what prices the product choices in the slot table; a product proposal that cannot be wrong about cost was not about cost. |
| `partialDeployment` | yes | whether a site may legitimately run a subset of the business processes (Figaro's OC-12 — module-wise rollout is a topology constraint, not a config one). |
| `operator` | yes | who runs it. Recorded, not decided, by the process. |
| `ruled` | yes | the stamp — see "Ruling stamp" below. |
| `platforms` | no | the resource-less platform products — see the next section. A list; absent means the system declares none. |

Every value except `platforms` is one line of text. "Which server, which cluster, which backup
schedule" belong to the operations runbook, not here.

### Platform entry — a resource-less platform product (`hosting.platforms`, ADR-071 amendment, #1401)

A product the system depends on that stands behind **no seam, no slot and no simulator**: a
telemetry backend above all, and its siblings — a secret store, an identity provider, a broker the
iFX owns. It has everything ADR-071's ruling round exists for (a product, a cost envelope, an
operator) and, until this amendment, nowhere at all to be written down.

Why here, and not one of the three places that already existed. **The model** may not name it —
ADR-048 §1 keeps the model product-free, correctly. **The slot table** may not hold it — a slot
stands on a *resource* (ADR-071 §4, untouched), and a telemetry exporter has no seam interface, no
simulator, no round-trip property and no protocol sheet worth writing; its slot entry would be
four-fifths empty. **A document of its own** could only diverge from this one (#861), and hosting is
what prices it, so it belongs beside the product rows it is judged against.

The cost line is the sharp end and is why this is not paperwork. A telemetry backend is billed per
GB ingested, and the instrumentation proxy spans **every** IoC-resolved component call
(`idesign-knowledge/observability.md`) — precisely the "sound functional argument with no cost line"
that ADR-071 §2 was written to refuse.

| key | required | what it names |
|---|---|---|
| `platform` | yes | the **role** the product plays — `telemetry-backend`, `secret-store`. Lower-kebab-case, unique within the system. THE IDENTITY, the way a slot's name is a slot's: the product may change, the role is what was ruled. |
| `purpose` | yes | one line: what the system uses it for. Reviewer-facing, the way an Access's `volatility:` line is — it is what tells a Contract reviewer whether the dependency is one thing or a catch-all. |
| `product` | yes | the concrete product. Free text; quote it when it contains spaces. |
| `costEnvelope` | yes | one line, the bound this choice was ruled inside. It may point at the block's own envelope ("inside the hosting envelope, no separate bill") rather than restate a number — what it may not do is be absent. |
| `operator` | yes | who runs it, who pays the bill, who is paged when it is down. Recorded, not decided, by the process. |
| `whenUnavailable` | yes | the availability posture, in the one form a reviewer can act on: what the system does when this product cannot be reached. "The system runs on, spans are dropped" and "every request fails closed" are different designs, and which one it is should not have to be inferred. |
| `ruled` | yes | its **own** ruling stamp — see "Ruling stamp" above. Not the block's: a backend chosen in November on a November basis cannot be covered by a stamp saying the topology was ruled in September, and re-stamping the block to cover it would falsely claim topology, target and cost were re-ruled that day. |

**The key is optional, and that is deliberate.** A system that depends on no resource-less platform
product declares none, and a `/3` file written before this amendment stays valid — this is an
additive key, never a second grammar, so no version bump and no migration. Whether a *particular*
project owes a telemetry row is that project's question, asked in its own resource-designer pass,
not something this format can know.

**A platform product is a RULED product**, so it joins the slots in the pool the `#1353` drift sweep
judges design surfaces against (see "The slot, not the product" below). Outside the two deployment-view
files a design surface still names the **role**, never the product.

### Ruling stamp (`ruled:`)

| key | required | what it names |
|---|---|---|
| `by` | yes | who ruled — the Software Architect, or the domain-architect delegate an ADR-058 brief names. |
| `on` | yes | the date, `YYYY-MM-DD`. |
| `basis` | yes | what the ruling rests on: the verbatim ledger answer (`QA-###` — quote it) or the session ruling, in the ADR-060 §3 manner. Never "see markdown". |

A missing or incomplete stamp makes the slot (or the hosting block) **unruled**. The shared reader
reports that separately from a structural problem, so each tool says what it means for it:
`deployment-view-check` goes red; `resource-protocol-skeleton` refuses to author a sheet for the slot
(#1246); `slot-wiring` wires nothing for it; `construction-entry-check` reports it as **[S8]**.

### Access entry

| key | required | what it names |
|---|---|---|
| `resourceAccess` | yes | the ResourceAccess component's name, exactly as the `.method` model spells it. Declared once — a second entry for the same Access is a failure, not a merge. A Utility entry carries `utility:` in its place, with the Utility component's name. |
| `slots` | yes | a non-empty list of slot entries. |
| `volatility` | see O1 | one line naming the single volatility this Access's slots jointly encapsulate. Reviewer-facing; it is what a Contract reviewer reads to judge whether the Access is one thing or a catch-all. **Whether this key is required is ADR-065's open question O1** and is the Software Architect's to rule. |

### Slot entry

One slot is **one resource in one role**. Multiplicity of a single role — three shards, three
tenants of one logical store — is **one** slot with the instance chosen by key at call time, never
three slots (ADR-065 decision 3: three slots there would mean three constructor fields of
identical type, and using the second where the first belongs would compile and pass every check).

| key | required | what it names |
|---|---|---|
| `slot` | yes | the slot's name — **the unit of identity for all wiring**. Lower-kebab-case, unique across the whole system, not just within the Access. Neither the seam nor the resource can serve this purpose: a seam interface is a type and may repeat across slots, and a resource may be reached in more than one role. |
| `resource` | yes | the Resource this slot stands on, at the model's category level. |
| `seam` | yes | the substitutable seam interface (ADR-048 §3) this slot is reached through. A **type**, so it may legitimately appear on several slots. It is also the key of the Resource Protocol Sheet (ADR-065 decision 4). |
| `resourceKind` | yes | the technology family — `RelationalDB`, `DocumentDB`, `RestApi`, `File`. It selects the protocol sheet's shape vocabulary, effect classes and danger classes (`resource-protocol-format.md`), so it is per slot and **not** per Access: one Access may span two kinds. |
| `product` | yes | the concrete product. Free text; quote it when it contains spaces. |
| `flavorSkill` | yes | the construction skill an implementor building this slot's driver loads — `csharp-access-relational-db`, `csharp-access-document-db`, `csharp-access-rest-api`. Per slot, so a mixed-kind Access yields one packet per slot rather than one packet carrying two flavors (ADR-065; #1099). |
| `driver` | yes | the driver package the concrete driver is built on. `slot-wiring-check` reports (`[W4]`) a project that declares the `driverType` and references no such package: a driver built on a different provider than the reviewed one is a Contract decision quietly undone. |
| `driverType` | yes | the concrete driver type this slot's generated factory calls. Stated explicitly and never resolved by scanning, so the generated wiring names a type rather than guessing one (ADR-065 decisions 5 and 8). The driver itself is `internal` to its assembly (decision 6). |
| `driverProject` | yes | the driver's own project directory, C#-tree-relative — e.g. `Component/Access/Catalog/Store.Sqlite`. It is where the slot's generated factory is emitted and the only place the checks look for the driver. Stated for the same reason `driverType` is: a scanned answer is a guess, and its namespace follows the ADR-022 layout (`<System>.Access.Catalog.Store.Sqlite`). |
| `configKey` | yes | the **key** under which this slot's settings are resolved at the composition root. **Never a value.** No connection string, no endpoint, no credential ever appears in this file — a Contract reviewer sees which key a slot resolves and nothing that belongs in a vault (ADR-065 decision 7). |
| `ruled` | yes | the ruling stamp — kind and product are the Software Architect's decision (ADR-071 §1). See "Ruling stamp" above. |
| `retry` | yes | the bounded transient-retry policy at this slot: `maxAttempts`, `shape`, `baseDelayMs`, `maxDelayMs`, **all four required**. The ceiling is uniform per ADR-048 §2; the backoff profile is per product. Generated onto the slot carrier as `<Slot>Retry`, which the Access reads — so it is stated here and nowhere else. |

### Where the product's raw fault codes are *not* (#1103)

`deployment-view/2` carried `transientCodes:` and `permanentCodes:` until 2026-08-28 and they are
**gone**. They were a lossy second copy of two columns of the project's **product fault taxonomy**
(`03_Product-Fault-Taxonomy.md`), which states, per code: the code, its product name, its class, the
taxonomy identity it folds to, transient or permanent, the backoff, and the surface code it becomes.
That document is the reviewed original; the two lists were read by no code, and had already drifted
in shape from what they duplicated — one naming `SQLITE_BUSY` where the taxonomy keys on the numeric
primary code, the other naming class globs where the taxonomy enumerates codes. Two originals can
only diverge, and this repository deletes the loser.

`retry` stays because this file **is** its original: the taxonomy names the backoff *profile* per
product and points here for the figures.

### The `system:` field

`system:` is the system's name and must agree with the `.method` model's `projectName` — this
file is a statement about the model's components, so the model is its authority. Its sibling
`si-binding.yaml` is a statement about the drawn business design, so `seqmap complete` compares
*its* `system:` against the `.bpd` sources' system pool instead. The two keys look alike and are
not the same field: two sibling files spelling the system name differently can be the correct
state of a repository, and aligning them turns one of the two checks red whichever way you align
them. Both comparisons ignore case, so a `Figaro`/`figaro` split across that divide is never a
finding, and `resource-protocol --check` reports a real disagreement as a `[P0]` finding among
the others rather than exiting on it (#1065).

## The markdown's binding table

`01_Deployment-View.md` carries a binding table that `deployment-view-check` reads. Since `/2` it
has **one row per slot**, not one per Access, and it names the slot; a Utility's slot is a row like
any other, its first cell naming the Utility:

```markdown
| ResourceAccess | Slot | Resource | `resourceKind` | Product | Driver / provider | Seam |
|---|---|---|---|---|---|---|
| `ErpAccess` | `erp-extension-store` | `ErpExtensionStore` | RelationalDB | **PostgreSQL** | Npgsql + EF Core | `IErpExtensionStore` |
| `ErpAccess` | `business-central` | `BusinessCentral` | RestApi | **Dynamics 365 Business Central** | typed HttpClient | `IBusinessCentralApi` |
```

An Access that stands on several resources is therefore a visibly multi-row review item, which is
the point: the reviewer should not have to notice it.

The markdown also carries a **"Hosting" section** (a heading containing the word) that states the
five hosting facts verbatim — the yaml is the form a program acts on, the section is where the
reasoning lives. `deployment-view-check` requires the section and each fact's verbatim presence.

Each declared **platform product** is stated there too: its role, and its `product`, `costEnvelope`
and `operator` verbatim. Those three are what a reviewer weighs, so those are what must agree;
`purpose` and `whenUnavailable` are prose the section is free to phrase as prose.

## `deployment-view-check` — what must agree

Exit 0 agree and ruled · 1 disagree or unruled · 2 usage. It fails when:

1. the yaml is not `format: deployment-view/3`, or neither `accesses` nor `utilities` names an entry;
2. an Access or Utility entry has no `slots`, or an empty list, or is declared twice;
3. a slot lacks a required key, or a `slot` name is used twice **anywhere in the system**;
4. the markdown has no recognizable binding-table rows — the check cannot verify agreement, which
   is itself a failure and not a pass;
5. a slot in the yaml has no markdown row, or a markdown row has no yaml slot — a slot the
   markdown forgot is unreviewed, and a slot only the markdown has is one nothing can provision a
   flavor skill for;
6. a matched pair disagrees on `resource`, `resourceKind`, `product` or `seam`;
7. `hosting` is absent or short a fact, the markdown has no Hosting section, or a hosting fact is not
   stated verbatim in the markdown;
8. a slot or the hosting block is **unruled** — no complete `ruled:` stamp (ADR-071). Reported as
   `UNRULED — …`, with the remedy named as the Software Architect's ruling, never a stamp;
9. a **design surface names a product no slot is ruled on** (#1353) — see the next section;
10. a declared **platform product** is short a key, is declared twice for one role, is not mirrored
    in the markdown's Hosting section, or is **unruled** (#1401). An absent `platforms:` key is not
    a failure — a system may depend on no resource-less platform product, and this format cannot
    know whether a particular one does.

Sheet-side conditions — every slot's seam resolves to exactly one protocol sheet, and every sheet's
seam belongs to some slot — belong to `resource-protocol --check` and are specified in
`resource-protocol-format.md`, not here.

## The slot, not the product — what every OTHER document says (#1353)

**Outside `deployment-view.yaml` and `01_Deployment-View.md`, a design surface names a store by its
slot id or its seam interface, never by product.** `IErpExtensionStore`, `erp-extension-store` — not
"the PostgreSQL store". A fact that really is product-bound, such as a column-type vocabulary or a
fault taxonomy, says *"per the ruled product of slot `erp-extension-store`"* and follows the ruling
rather than restating it.

The reason is not tidiness. ADR-048 §1 makes this view the one place a product is named — *"the
MODEL stays product-free — it says a store, never Azure SQL"* — and a name copied out of it is a
COPY OF A DECISION, which is stale the moment the decision moves. When the Software Architect moved
Figaro's four stores from PostgreSQL to Azure SQL Database (relay R-032, 2026-09-07) the view
changed and the copies did not: four section headings in the store-seam interfaces, a comment in
`si-binding.yaml`, two notes in a blessed gate record. Nothing went red, and he found the stale
heading himself the same evening. His words: *"Always think about whether there is a process issue,
a process we can improve. So, this won't happen again in the future."*

`deployment-view-check` sweeps for the copies, over `docs/03_Technology`, `docs/04_Gates` and every
`*.method` directory of the project (`--sweep <dir>` to aim it elsewhere, `--no-sweep` to skip). It
judges each mention against the RULED products:

- a product **no slot is ruled on** is **RED** — stale text, telling its reader something untrue:
  `02_Store-Seam-Interfaces.md:34 names PostgreSQL; slot erp-extension-store is ruled Azure SQL
  Database (relay R-032)`;
- **the ruled product**, named outside the two deployment-view files, is a **NOTE** — true today,
  untrue the day he rules again. The remedy is to cite the slot, not to update the copy;
- anything in a **dated record** (`docs/01_Planning/**`, `docs/04_Gates/**`) is a **NOTE**: a gate
  record says what was true when it was blessed. Annotate it; never rewrite history to make a check
  green.

One deliberate escape, because some documents name a superseded product ON PURPOSE — a
protocol-sheet header that DECLARES the migration, a decision record explaining what was moved away
from. A line carrying `product-ok: <why>` is a NOTE with its reason. Use it to say "this mention is
the point"; a check with no such escape teaches its readers to delete true sentences.

So when a slot's `product:` changes here, the check is RED until the copies are gone. That is the
whole point of it: today, nothing went red.

## What is generated from the slot table

Slot wiring is **generated, never written** (ADR-065 decision 5): it is mechanical, carries no
business content, and a mistake in it is silent *and* catastrophic — the right type bound to the
wrong instance. That is the combination this repository already generates rather than hand-writes,
the same argument ADR-061 makes for the Manager use-case entry bodies. `just slot-wiring` emits
three shapes and `just slot-wiring-check` fails while a committed one is not what the slot table
emits today.

| Emitted | What it is |
|---|---|
| `Component/<Tier>/<Stem>/Resource/<Owner>Slots.cs` | the **slot carrier**: one `required init` property per slot, named by the SLOT and typed by its seam. The Access takes this one object and reads `slots.InvoiceBlobs` — it never receives two same-typed parameters it could transpose, and its body names a slot rather than a position. `required` is what makes adding, removing or renaming a slot a compile error at every construction site instead of a silent rewiring. |
| `Composition/<System>ProductionSlots.cs` | the **production composition**: per slot, take its settings by its configuration KEY, call the driver type's `Create`, bind the result at this slot's name. It names a slot and a type, never a value. |
| `Spec/<System>.Spec.Composition/<System>SpecSlots.cs` | the **spec composition**: the same slot names, the same count and the same shape, with a simulator where the driver stands. The Access is handed its slots and never learns which world it is in. |
| `<driverProject>/<Slot>Slot.cs` | the slot's **public factory**, the one way anything may build that slot's driver. The concrete driver is `internal` to its own assembly (ADR-065 decision 6), so the Access's `Service` assembly cannot name it, let alone `new` it — the language enforces what a review otherwise has to, and `[W5]` reports a driver that is public. |
| `iFX/Contract/IResourceSettings.cs`, `IResourceSettingsSource.cs` | the **settings abstraction** — the only thing the generated composition knows about configuration. Generated for the same reason as the rest: it has to be identical in every project, and an interface each project writes for itself is an interface that drifts. |
| `iFX/Contract/ISlotCredentials.cs`, `ISlotCredentialsSource.cs` | the **credential port** (ADR-065 decision 8 as amended, #1727) — one per slot, handed to the driver beside its settings. The driver asks it for the secret on **every** call (`ApiKey`, `ConnectionString`, `Bearer`, each answering the string that goes on the wire) and holds nothing between calls, so a rotated secret takes effect at once. Generated beside the settings abstraction for the same reason. |

### The driver's half of the seam

The generator decides *which* factory runs for *which* slot and never how a driver is built — it
cannot know that a PostgreSQL driver needs a connection string while a BusinessCentral driver needs
a base URL, a tenant and client credentials. The convention that closes the gap (ADR-065 decision 8,
as amended by #1727) is one signature:

```csharp
public static <Seam> Create(IResourceSettings settings, ISlotCredentials credentials)
```

Inside it each driver binds and validates its own typed settings, so a missing or malformed value
fails **during `Create`** — at application startup, with a message naming the slot and the key —
rather than at the first call. `IResourceSettings.Require` carries that message, written once, so
every project's startup failure reads the same. The settings carry the **name** a secret is filed
under, never the secret; the driver asks the credential port for it on each request.

**One exception, read off the slot table alone: the component that PROVIDES credentials does not
RECEIVE them.** The slots under `utilities: - utility: SecretsUtility` keep
`public static <Seam> Create(IResourceSettings settings)`, and that component's production factory
takes settings alone. That is what makes the production composition acyclic by construction: the
provider's slots from settings, the provider over them, the credential source over the provider,
every other slot from settings **and** that source. The spec composition is unchanged — it binds
simulators and never calls a slot factory.

The return type is the **seam**, not the driver: the composition hands the result to a carrier
property typed by the seam, and a driver that returned itself would make every consumer name a
concrete type the rest of the system must not know. `slot-wiring-check` reports both halves as
`[W3]` — a landed driver with no `Create`, and a `Create` returning the wrong type.

Two consequences worth stating, because both are things a reader will otherwise wonder about:

- **The generated files carry their own DO-NOT-EDIT marker, not the scaffolder's.** They are
  generated from this file and not from the `.method` model, so the scaffolder's
  `<auto-generated> Generated by theagent2 from <project>.method@<rev>` header would be a false
  provenance stamp that `provenance-check` would then enforce — and the scaffolder's orphan scan
  claims every marked `.cs` under the tree it emits into, which would make each of these a reported
  orphan of a generator that never produced them.
- **A driver the slot table names and Step 7 has not built yet is a report, not a failure.** Between
  Contract and construction that is the normal state of a project: the production composition names
  the design and compiles when its drivers do. `slot-wiring-check` counts them and names each one.

## Ownership and gates

| Concern | Owner |
|---|---|
| The slot table and the narrative | Design-stage architect, in the ADR-048 §3 resource-designer pass — as a **proposal** |
| The ruling (kind, product, hosting) | the Software Architect, at the START of that pass, before any sheet is authored (ADR-071 §2); stamped here |
| Review | human at **Contract**, alongside the protocol sheets (ADR-059); the record's `deployment_decisions` block is the evidence the rulings were made (#1247) |
| Consumers | `resource-protocol` (all verbs), `workspace materialize`, `construction-entry-check`, the Contract dossier, and — under ADR-065 Phase 2 — the generated production and spec compositions |

The deployment view is const after Contract like the rest of the contract surface; a change
re-enters via the ADR-040 §7 routes.

## Governing decisions

- **ADR-048** §1 — the binding is a deployment view, not the architecture model; `resourceKind`
  moves here; §2 — retry placement and the per-product backoff profile; §3 — the resource-designer
  pass that authors this file.
- **ADR-065** — a ResourceAccess stands on named resource **slots**; sheets are keyed by seam; all
  slot wiring is generated; no component reads configuration. This is what makes the format `/2`.
- **ADR-059** — the Resource Protocol Sheet, keyed by the seam a slot names.
- **ADR-071 (amendment, 2026-09-09; #1401)** — the hosting block takes a resource-less platform
  product, with the same ruling stamp: a telemetry backend has a product, a cost envelope and an
  operator, and had no artefact anywhere in the process to be ruled on.
- **ADR-071** — deployment decisions are ruled before the sheets: the `ruled:` stamp, the `hosting:`
  block, Utility slots. This is what makes the format `/3`.
