---
name: csharp-access-rest-api
description: "C# ResourceAccess flavor for an external REST API (resourceKind = RestApi) — typed HttpClient via IHttpClientFactory, Polly resilience (retry / circuit-breaker / timeout), idempotency keys for writes, auth via a DelegatingHandler, wire DTOs kept distinct from contract DTOs, and the seam's fault table: a status is not an exception — 404/409 and allowlisted refusals are answers, 429/5xx are retried then rethrown, an unmapped 4xx is a bug. Loaded on top of csharp-access-conventions when the RA's resourceKind is RestApi."
---

# C# ResourceAccess — RestApi flavor

Load **csharp-access-conventions** first; this adds the REST-API specifics. The external API and its
contract are the **resource-designer's** input — read its design note.

## Library & DI
- **Typed `HttpClient` via `IHttpClientFactory`** (base URL + timeouts from config). Refit is optional
  for contract-first clients; the default is a hand-written typed client.
- **Never `new HttpClient()` per call** (socket exhaustion) — always the factory.

## Service skeleton
- The RA Service holds the typed client. Shared plumbing (client, auth handler, mapper) lives in the
  RA's main Service file (base skill).

## Wire ↔ DTO mapping
- External **wire DTOs are distinct from contract DTOs**; map at the boundary (explicit / **Mapperly**).
- Be tolerant of the wire schema (ignore unknown fields); never expose wire types across the contract.

## Filter (criteria → query)
- Criteria DTO → **query string / filter params**. Handle **pagination explicitly** (follow
  next-page / continuation tokens until complete or capped).

## Transaction / consistency
- **No transactions.** Use **idempotency keys** for writes (`Idempotency-Key` header). Retries are
  safe only for idempotent operations (GET/PUT/DELETE; a POST needs an idempotency key to be retried).

## Resilience
- **Polly**: jittered exponential **retry**, **circuit breaker**, **timeout** (and bulkhead where
  needed). Configure it in the `IHttpClientFactory` pipeline, not ad hoc per call.

## Auth
- A `DelegatingHandler` for token / OAuth, with refresh. Never log tokens or secrets.

## The seam's fault table (Table C of the fault tables)

Read **the resource seam** in the base skill first — four jobs: classify, retry, answer what is
answerable as data, rethrow what is not.

**This flavor differs structurally: a status code is not an exception.** `HttpClient` returns a
response for every status and throws only on transport failure — so do **not** call
`EnsureSuccessStatusCode()`, which would manufacture the exception this design does not want. You
classify over two inputs: the status, and the raised transport fault.

| Fault class | Examples | You do |
|---|---|---|
| `2xx` | | ordinary answer |
| `404` on a lookup | | **answer** — `Found = false` / an empty typed field. Rethrow only when the design says the identifier must exist (an invariant break the sheet declares) |
| `409` conflict, `412` precondition failed | | **answer** — `Applied = false` / "already exists", when the DTO carries it and the sheet declares it |
| A **documented business refusal** — typically `422`, or `400` carrying `application/problem+json` | "card declined", "account disabled" | **answer** — a typed verdict field. It must be a refusal the sheet **allowlists**, not any `4xx` you decide to read that way |
| `400` malformed, and any **unmapped** `4xx` | | **rethrow** — this system built a request the API refuses to parse: a bug. Form-and-shape validation ran at the edge, so it never legitimately arrives here |
| `401` / `403` after the auth handler's own refresh | | **rethrow** — a credential/deployment fault; nothing upstream can act on it as data |
| `429` | + `Retry-After` | **retry** honoring `Retry-After` within the budget, then **rethrow** |
| `5xx`, transport failure, DNS, TLS, connect/read timeout | | **retry** — only for an operation that is idempotent or carries an idempotency key — then **rethrow**; rethrow at once when it is not retry-safe |
| Circuit open | Polly `BrokenCircuitException` | **rethrow** — the remote is unreachable by the policy's own verdict |
| A body that does not deserialize to the declared wire schema | | **rethrow** — a contract-shape violation. Tolerating *unknown* fields is required; a missing declared field is not tolerable |

**Pagination that stops early is not a shorter answer.** A page that fails mid-walk is a failure to
answer the query: rethrow rather than return a truncated collection — unless the contract carries an
explicit "more remain" field, which makes truncation a designed answer.

**Read `application/problem+json`** for the *allowlisted refusal* rows — it is where a well-behaved
API states which functional condition it means, and the sheet maps that condition to your verdict
field. It is not a licence to forward the remote's error text: nothing product-specific crosses your
contract, and the raw body belongs on the span.

**An LLM provider API is this flavor** — when the design put the inference call in a ResourceAccess
at all (a per-design choice, SA ruling 2026-08-24: an RA when its answers carry business meaning —
business verbs, provider/model/prompt volatility encapsulated here; a Utility when it is
tier-neutral plumbing, e.g. embeddings for generic search — see the base skill's "External
inference" section). The inference-specific rows on top of the table above:

| Fault class | Seam does |
|---|---|
| `429`, `5xx`, transport failure, timeout | **retry** within the budget (honor `Retry-After`), then **rethrow** — the standard rows above, unchanged |
| A **documented provider refusal** (safety / content policy) | **answer** — a typed verdict field, when the sheet declares it (the allowlisted-refusal rule) |
| Output **unparseable after the seam's bounded repair** (re-prompt / format retry — fault retry, yours) | **answer** — "no usable output" as a typed field, when the sheet declares it |
| Auth failure, quota / billing exhaustion | **rethrow** — a deployment/operations fault |

Asking **differently** because of what came back — fallback prompt, wider context — is
answer-driven retry: business logic above you, never this seam's (the base skill's retry-nature
rule).

## Testing
- Mock `HttpMessageHandler` / **WireMock**. Assert request shape (URL, headers, body), response
  mapping, the resilience behavior (retry/circuit-breaker), and error-status mapping.

## Worked operation (sketch)
```csharp
// GET-by-criteria with pagination; POST with idempotency key
async Task<Response<Search_Result>> Search(SearchByName criteria)
{
    var items = new List<ItemDto>(); string? next = $"/items?name={Uri.EscapeDataString(criteria.Name)}";
    while (next is not null) {
        using var res = await _http.GetAsync(next);          // resilience pipeline already spent its budget
        if (res.StatusCode == HttpStatusCode.NotFound)       // "nobody by that name" is an answer
            return ResponseBuilder.Build(new Search_Result { Items = [] });
        if (!res.IsSuccessStatusCode)                        // unmapped: a failure to answer, not our lane
            throw new RemoteApiFault(res.StatusCode);        // the seam's own fault type, declared beside
                                                             // the seam interface; the boundary net logs it
        var page = await res.Content.ReadFromJsonAsync<WirePage>();
        items.AddRange(page!.Items.Select(_map.ToDto)); next = page.NextLink;
    }
    return ResponseBuilder.Build(new Search_Result { Items = items });
}
```

## Smells (stop and fix)
- `new HttpClient()` per call; no timeout / circuit-breaker.
- Retrying a non-idempotent `POST` without an idempotency key.
- Leaking wire DTOs across the contract.
- Swallowing a `4xx` as success; ignoring `Retry-After`.
- `EnsureSuccessStatusCode()` → it manufactures an exception for statuses you must classify yourself.
- Reading any `4xx` as a business refusal → only the statuses/conditions the protocol sheet allowlists
  are answers; the rest are bugs and rethrow.
- Answering an exhausted `429`/`5xx` with a code instead of rethrowing → an API that did not answer
  did not answer.
- Forwarding the remote's status, error code or message text onto a contract DTO → nothing
  product-specific crosses the contract; the raw body belongs on the span.
- Returning a partly-walked page set as if it were the whole answer.
