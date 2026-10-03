---
name: csharp-access-document-db
description: "C# ResourceAccess flavor for a document database (resourceKind = DocumentDB) — native driver (MongoDB.Driver / Cosmos SDK, not EF Core), aggregate-per-document with a deliberate partition key, single-document atomicity, RU/throttling-aware resilience, documents kept distinct from contract DTOs, and the seam's fault table: throttling and connectivity are retried then rethrown, an etag miss is an answer, a shape defect is a bug. Loaded on top of csharp-access-conventions when the RA's resourceKind is DocumentDB."
---

# C# ResourceAccess — DocumentDB flavor

Load **csharp-access-conventions** first; this adds the document-DB specifics. The concrete store
(MongoDB / Azure Cosmos DB / DynamoDB-as-document) and the document model are the **resource-designer's**
decisions — read its design note.

## Library & DI
- **Native driver by default** (`MongoDB.Driver`, the Cosmos SDK) — **not** EF Core, whose document
  support is leaky and imposes relational-ish modeling.
- Register the client as a **singleton**; resolve the collection/container handle from it.

## Service skeleton
- The RA Service holds the collection/container handle (`IMongoCollection<TDoc>` / Cosmos `Container`).
  Shared plumbing lives in the RA's main Service file (base skill).

## Document modeling (the document-specific part)
- **Aggregate-per-document**: one document is one consistency boundary. **Denormalize**; embed over
  reference. **No joins** — denormalize or issue multiple queries.
- The **partition / shard key** is chosen deliberately by the resource-designer; honor it in every
  read/write (cross-partition queries are expensive).

## Document ↔ DTO mapping
- Stored documents are POCOs **distinct from contract DTOs**. Keep storage concerns — `_id`,
  partition key, `_etag` — **out of the DTO**. Map at the boundary (explicit / **Mapperly**).

## Filter (criteria → query)
- Criteria DTO → a document query: a Mongo filter-builder / LINQ, or Cosmos SQL. Keep it
  **index-aware** and within a single partition where possible.

## Transaction / consistency
- Prefer **single-document atomicity** (aggregate = one document). **Avoid multi-document
  transactions by design** (limited / costly). Use tunable consistency where the store offers it
  (Cosmos strong → eventual). Make writes idempotent for safe retries.

## Resilience
- Use the SDK's retry policies; handle **throttling / RU limits** (Cosmos `429` → exponential backoff,
  honor `Retry-After`). Budget RU per operation.

## Auth
- Connection string / managed identity / keys via secret store; never hardcode or log.

## The seam's fault table (Table B of the fault tables)

Read **the resource seam** in the base skill first — four jobs: classify, retry, answer what is
answerable as data, rethrow what is not. This is the document-store instantiation; your project's
Resource Protocol Sheet declares which of the answerable rows this component actually uses.

| Fault class | Raw examples | You do |
|---|---|---|
| Throttling / RU exhaustion | Cosmos `429` (+ `Retry-After`), Mongo `16500` | **retry** honoring `Retry-After` within the budget, then **rethrow** |
| Transient connectivity — primary step-down, election, socket failure | `MongoConnectionException`, `NotWritablePrimary`, a retryable-write label | **retry** (let the driver's retryable-writes spend the first attempts), then **rethrow** |
| Request timeout | SDK timeout | **retry only if the operation is idempotent**; otherwise **rethrow at once** — unknown is not failed |
| ETag / precondition mismatch, `WriteConflict` | Cosmos `412`, Mongo `WriteConflict` | **answer** — `Applied = false` (+ the current version), when the DTO carries it and the sheet declares it |
| Duplicate key **on the dedup marker** | Mongo `11000`, Cosmos `409` on create | **answer** — the **original stored outcome**, not a generic OK |
| Duplicate key **elsewhere**; document-schema validation failure | Mongo `121` | **rethrow** — the document the code built is not the document the design declared |
| Request too large; cross-partition query rejected; missing or wrong partition key | Cosmos `413`, `400` | **rethrow** — a shape defect against a partition key the resource-designer chose deliberately; no retry and no field fixes it |
| Not-found on read; an empty query | — nothing raised (or a null document) | **not a fault** — ordinary result data |

**Single-document atomicity is what keeps the answerable column short.** An aggregate-per-document
design lets the store compute and *return* its verdict instead of raising one, and avoiding
multi-document transactions means there is no distributed-transaction fault class to classify at all.

**No SDK exception ever crosses the contract** — automatic here too: an answer is a business field,
and a rethrow carries the seam's product-free fault identity, which the boundary net turns into
`UNEXPECTED` + a correlation id.

## Testing
- **Testcontainers** (Mongo) or the **Cosmos emulator**. Assert query + mapping, the conflict (etag)
  path, and the throttling path.

## Worked operation (sketch)
```csharp
// Upsert with optimistic concurrency (etag) — single-document atomicity
async Task<Response<SaveProfile_Result>> Save(SaveProfile cmd)
{
    var doc = _map.ToDoc(cmd.Profile);              // DTO -> document (sets partition key)
    var replaced = await _col.ReplaceOneAsync(d => d.Id == doc.Id && d.ETag == doc.ETag, doc);
    // No match on the etag predicate = the write did not take effect. Nothing raised, nothing
    // caught: the answer is a field the contract already asks for.
    return ResponseBuilder.Build(new SaveProfile_Result
    {
        Id = doc.Id,
        Applied = replaced.ModifiedCount == 1,
        CurrentVersion = replaced.ModifiedCount == 1 ? doc.ETag : await CurrentETag(doc.Id),
    });
}
```

## Smells (stop and fix)
- Reaching for EF Core / treating the store like a relational DB (joins, normalization).
- Cross-document transactions; partition key chosen as an afterthought.
- Leaking `_id` / `_etag` / partition key into contract DTOs.
- Ignoring `429` throttling (no backoff), or answering an exhausted `429` with a code instead of
  rethrowing — a store that did not answer did not answer.
- A not-found read or an unmatched conditional replace turned into a failed envelope → both are
  answers; give them a field.
- Catching a `MongoWriteException` / `CosmosException` to translate it → the seam already folded the
  raw code onto its product-free identity; classify on that, and only for a fault the sheet declares
  answerable.
