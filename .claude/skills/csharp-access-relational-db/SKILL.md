---
name: csharp-access-relational-db
description: "C# ResourceAccess flavor for a relational database (resourceKind = RelationalDB) — EF Core by default, parameterized LINQ criteria→query, one unit-of-work per operation, optimistic concurrency, store-entities kept distinct from contract DTOs, and the seam's fault table: contention and connectivity are retried then rethrown, a concurrency miss is an answer, a constraint violation is a bug. Loaded on top of csharp-access-conventions when the RA's resourceKind is RelationalDB."
---

# C# ResourceAccess — RelationalDB flavor

Load **csharp-access-conventions** first; this adds the relational-DB specifics. The concrete engine
(PostgreSQL / SQL Server / …) is the **deployment view's** decision, read off the SLOT you are
building (`resourceKind` / `product` — ADR-065): an Access may stand on several resources, and this
skill governs the relational one(s) among them. The seam's answerable-fault table below is this
slot's; a sibling slot of another kind answers to its own flavor skill's table, per seam.

## The schema is generated — you do not write one

The tables, columns, types, keys, constraints and indexes of this store are the `shape:` section of
its **Resource Protocol Sheet** (`docs/03_Technology/03_Deployment/protocol/<Seam>.protocol.yaml`
— keyed by the SEAM since ADR-065, not by the Access) — designed by an LLM, blessed by a human at
Contract, and compiled to `docs/03_Technology/03_Deployment/schema/<Seam>.schema.sql` by
`just resource-protocol-schema`.

- **Use that file.** Execute it when the store opens (idempotent — every statement is
  `IF NOT EXISTS`), or ship it as the migration. Reference it; never copy its text into a `.cs`
  file, and never keep a second copy of a table definition anywhere.
- **Do not hand-write migrations, `EnsureCreated` DDL strings, EF Core `Migrations/` classes, or
  `modelBuilder` schema configuration for this store.** There is one source and it is the sheet. A
  schema you type yourself is a blessed design the database does not have — the failure this
  replaces.
- **A schema problem is a sheet problem.** Wrong type, missing column, missing constraint: change
  the `shape:` section, run `just resource-protocol-schema`, and say so — the sheet is const after
  Contract and a change to it owes the Contract act again (ADR-058). Surfacing it is your job;
  deciding it is not.
- `just resource-protocol-check` fails when the committed schema file is not what the sheet emits,
  so a local edit to either one is red, not quiet.

## Library & DI
- **EF Core is the default** ORM (productivity, LINQ mapping — not its migrations, see above).
  **Dapper only** for proven perf-critical paths — not the default, and never both for the same RA
  without reason.
- Register the `DbContext` **scoped**; connection string from config / secret store.

## Service skeleton
- The RA Service holds a `DbContext` (injected). Map the entities onto the **generated schema**
  above — table and column names come from it, and nothing in code redefines them. Shared plumbing
  (the context, the mapper) lives in the RA's main Service file (base skill).

## Entity ↔ DTO mapping
- EF entities are **POCOs distinct from contract DTOs**. Map at the boundary (explicit / **Mapperly**).
- **Never return an EF entity** across the contract, and never enable lazy-loading past the boundary.
- Prefer projecting straight to the DTO in the query (`.Select(...)`) to avoid over-fetch.

## Filter (criteria → query)
- Compose `IQueryable.Where(...)` from the criteria DTO's set fields; EF **parameterizes
  automatically** — no manual escaping (drop SPVS's `EscapeSqlString`).
- Translate the whole criteria object once; keep it index-friendly.

## Transaction / consistency
- **One unit-of-work per RA operation** (`SaveChanges`/`SaveChangesAsync` per op).
- Optimistic concurrency via a `rowversion` / concurrency token.
- **The driver makes one attempt per call; the Access's seam wrapper owns the retry budget**
  (ADR-048 §2 — one budget per slot, the generated `SlotRetry`). So the driver runs EF with a
  **non-retrying execution strategy** — `ExecutionStrategy(d => new NonRetryingExecutionStrategy(d))`,
  set explicitly so no provider default retries — and only classifies the raw fault for the wrapper.
  **Never `EnableRetryOnFailure` under a wrapper that owns the budget**: that is layered retry, N×M
  hits on a store that is already failing (base skill, precondition 1). `EnableRetryOnFailure` applies
  only where no wrapper owns a budget, and then nothing above the driver may retry.

## Resilience
- Connection resiliency and deadlock retry are the seam wrapper's budget, not the execution
  strategy's (above). Keep operations short and idempotent where possible.

## Auth
- Connection credentials via managed identity / secret store; never hardcode or log them.

## The seam's fault table (Table A of the fault tables)

Read **the resource seam** in the base skill first — four jobs: classify, retry, answer what is
answerable as data, rethrow what is not. This is the relational instantiation. Raw codes are the ones
a project's product fault taxonomy pins to the PostgreSQL error-code appendix and the SQLite
result-code list (ADR-048 §3: pinned, never guessed); your project's Resource Protocol Sheet may name
more.

| Fault class | Raw examples | You do |
|---|---|---|
| Transient contention — deadlock, serialization failure, database busy | PG `40P01`, `40001`; SQLite `SQLITE_BUSY (5)`, `SQLITE_LOCKED (6)` | **retry** within the budget, then **rethrow** |
| Transient connectivity — connection dropped, cannot open | PG class `08*`; SQLite `SQLITE_IOERR (10)`, `SQLITE_CANTOPEN (14)` | **retry** within the budget, then **rethrow** |
| Command timeout | provider timeout | **retry only if the operation is idempotent**; otherwise **rethrow at once** — a timeout is an unknown outcome, not a failure |
| Optimistic-concurrency miss | `DbUpdateConcurrencyException`; a version-CAS updating 0 rows | **answer** — `Applied = false` (+ the current version), when the DTO carries it and the sheet declares it. Never retried here: re-reading and re-deciding is orchestration |
| Unique violation **on a dedup marker** | PG `23505` / SQLite `2067` on the idempotency key | **answer** — the **original stored outcome**, not a generic OK |
| Unique / FK / NOT NULL / CHECK violation **anywhere else** | PG `23503`, `23502`, `23514`; SQLite `787`, `1299`, `275` | **rethrow**, never retry — the constraint is the invariant the design declared, so a write that breaks it is a bug in the writer |
| Syntax error, missing column or table, type mismatch | PG class `42*` | **rethrow** — the schema is generated from the protocol sheet; code disagreeing with it is a defect |
| Permission denied, authentication failure | PG class `28*` | **rethrow** — a deployment fault; nothing upstream can act on it as data |
| Empty read, `0` rows affected | — nothing raised | **not a fault** — ordinary result data |

**Backoff and N are the sheet's, not yours:** N uniform across the project, backoff per product
(SQLite short fixed + `busy_timeout`; PostgreSQL exponential + jitter). If this component retries,
nothing above it may.

**No provider exception ever crosses the contract** — but that is now automatic: an answer is a
business field, and a rethrow carries the seam's product-free fault identity, which the boundary net
turns into `UNEXPECTED` + a correlation id. Do not catch a `SqlException`/`SqliteException` to
translate it; the seam's bound implementation already folded the raw code onto the identity.

## Testing
- SQLite-in-memory for fast logic tests, or **Testcontainers** (real Postgres/SQL Server) for
  query-fidelity tests. Assert query correctness, mapping, and the concurrency-conflict path.

## Worked operation (sketch)
```csharp
// Filter: criteria → parameterized LINQ → DTO projection
async Task<Response<FindCustomers_Result>> Find(FindByName criteria)
{
    var q = _db.Customers.AsNoTracking().Where(c => c.TenantId == criteria.TenantId);
    if (!string.IsNullOrEmpty(criteria.Name)) q = q.Where(c => c.Name == criteria.Name);
    var dtos = await q.Select(c => new CustomerDto { Id = c.Id, Name = c.Name }).ToListAsync();
    // An empty list is the answer to "who matches?" — not a fault, not an error code.
    return ResponseBuilder.Build(new FindCustomers_Result { Customers = dtos });
}
```

## Smells (stop and fix)
- **A table definition written by hand** — a DDL string, a migration class, `modelBuilder` schema
  configuration. The schema is generated from the protocol sheet; a second copy is the drift this
  design exists to end.
- Returning EF entities / lazy-loading across the boundary.
- Hand-built SQL strings or manual escaping.
- N+1 queries (project + include deliberately).
- Business logic in the RA (belongs in an Engine/Manager).
- An empty read or a 0-row update turned into a failed envelope → both are answers; give them a field.
- Retrying a constraint violation, or answering one with a code → it is a bug; rethrow it.
- Catching a provider `SqlException`/`SqliteException` to translate it → the seam already folded the
  raw code onto its product-free identity; classify on that.
