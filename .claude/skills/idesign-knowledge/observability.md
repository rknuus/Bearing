# Observability — Architecture-Aware Instrumentation

> **Two attribute namespaces operate side by side:**
> - **`idesign.*`** — covered in this file. Architecture-aware attributes that mirror the Method's taxonomy (`idesign.layer`, `idesign.component`, `idesign.volatility`, etc.). theagent2 owns this namespace.
> - **`gen_ai.*`** — OpenTelemetry's GenAI semantic conventions (`open-telemetry/semantic-conventions-genai`). The eventual interop target for LLM/agent/tool spans. Currently `Status: Development`; theagent2's runtime tracks the spec but doesn't emit OTLP yet (see ADR-010). The two namespaces are complementary, not competing — `gen_ai.*` describes the LLM machinery, `idesign.*` describes the architectural meaning of what the machinery is doing.

## Telemetry is an iFX LIBRARY, not a service — the default a project starts from

This is the shape of the telemetry component itself, decided before any of the instrumentation
detail below matters. It is a **default**, ruled by the Software Architect on 2026-09-09 and
recorded in ADR-074; a project that wants a different one changes it deliberately and says why.

**Telemetry is a LIBRARY utility** in the sense of `core-principles.md` *"Service or library?"*: C#
types called in-process, `IDisposable` scope handles included, with **no contract boundary**.
Nothing crosses a process, nothing serializes, nothing is versioned apart from its caller. So it
declares no facets, no operations and no DTOs, **no drawn sequence step calls it**, and its
implementation is the iFX's. Model it as
`AddComponent --component-type utility --utility-kind library`, name its C# surface in the
description, and stop there.

**What wraps what.** The project's **own C# types** wrap traces and metrics. `ILogger` is used
**directly** for logs — OpenTelemetry sits behind it as a *provider*, and `ILoggerProvider` is the
swap point. Not one uniform answer for all three pillars: the right seam for logs already exists in
the platform's own logging abstraction and did not need rebuilding, whereas traces and metrics get
project-owned types so the vendor SDK never reaches business code.

**Who calls it: nobody you write.** **No hand-written code calls traces, metrics or logs.** The iFX
and the generated plumbing do all three — the IoC instrumentation proxy spans every component call,
and a generated Manager entry body opens one `idesign.activity_step` scope per modeled box. This is
Method doctrine, not local taste: telemetry and logging are baked into the iFX, which is why the
next section can say *"if a developer must write tracing code, the iFX is incomplete"* and mean it
as a defect report rather than an aspiration.

**Why the shape matters, not just the wiring.** Asked as *"what should the telemetry component's
contract say about closing a span?"*, this has no answer: there is no observable rule, no close
operation, no query facet to read a span back, and no `Recorded` / `Emitted` result to design. The
question dissolves once the component is understood as a library — the caller holds a disposable
scope, `using` closes it, and no boundary is crossed anywhere in that sentence. If you find yourself
designing a telemetry contract, you have taken a wrong turn one step earlier; see ADR-074 §2 for the
general form of that turn.

**Where the BACKEND is ruled — and it is not here.** This file is background knowledge about the
technology; it is per-project of nothing and stamped by nobody, so it is the wrong place to learn
which backend *your* system exports to. That decision lives in the **deployment view's `hosting:`
block**, as a resource-less platform product with its own `ruled: { by, on, basis }` stamp — the
role (`telemetry-backend`), the product, its cost envelope, its operator, and what the system does
when it is unreachable (ADR-071 §3a, the Software Architect's ruling of 2026-09-09;
`process-specs/deployment-view-format.md`). It is not a slot: a slot stands on a resource, and a
telemetry exporter has no seam, no simulator and no protocol sheet.

Two things follow for a project's resource-designer pass. **Propose the backend in the same ruling
round as the store products**, with a cost line — a telemetry backend is billed per GB ingested and
the proxy above spans *every* IoC-resolved component call, which is the most expensive sentence on
this page. And **name the role, not the product, everywhere else**: outside the two deployment-view
files a design surface says `telemetry-backend`, the way it says a slot id rather than "the
PostgreSQL store".

## Transparent instrumentation, zero business-code changes

- Every interface resolved through IoC is automatically wrapped with an instrumentation proxy — same pattern used for testability swaps.
- No manual span creation in business code. If a developer must write tracing code, the iFX is incomplete.
- Proxy applies uniformly across `IManager`, `IEngine`, `IResourceAccess`.
- Instrumentation is iFX-owned, never component-developer-owned.

## Architecture-aware span naming

- Span names mirror the Method taxonomy: `{Subsystem}.{ComponentType}.{Interface}.{Operation}`.
  - `OrderProcessing.Manager.IOrderManager.SubmitOrder`
  - `OrderProcessing.Engine.IValidationEngine.ValidateLineItems`
  - `OrderProcessing.ResourceAccess.IOrderAccess.PersistOrder`
- Trace tree mirrors the call chain — and, through the sequence-step join key (see *Sequence-step conformance*), the modeled use-case sequence at **component-call** granularity. Mismatches reveal decomposition problems — sideways calls, skipped layers, circular dependencies become visible in the graph.
- OpenTelemetry semantic conventions + architecture-specific attributes:
  - `idesign.layer`: `manager | engine | resource_access | client`
  - `idesign.component`: PascalCase component name
  - `idesign.interface`: interface invoked
  - `idesign.operation`: specific operation
  - `idesign.volatility`: encapsulated volatility
  - `idesign.use_case`: use case being executed
  - `idesign.activity_step`: the modeled sequence step this span realizes — sequence-step id `SQxx.yy.zz.NN` (`design-artifact-conventions`). The join key between a span and the step it realizes (see *Sequence-step conformance*); carried by the scope a generated Manager entry body opens per box, and optional on proxy spans, which the differ joins through the call chain `CCxx.yy` / the operation identity anyway.
  - `idesign.subsystem`: subsystem
  - Error classification: `error.type` (`validation | infrastructure | upstream | data | logic`), `error.retry_eligible`, `error.blast_radius` (`operation | use_case | subsystem | system`).

## Sequence-step conformance — the trace is read against the modeled sequence

The proxy spans above make the trace mirror the **call chain**; ADR-031 §§1–3 make that readable against the design. Every modeled step of a Manager use case carries the stable id `SQxx.yy.zz.NN` (`design-artifact-conventions`). Most are **component calls** (Manager → Engine / ResourceAccess), spanned by the IoC proxy already described and joined to their step through the call chain `CCxx.yy` / the operation identity; a step may also be an **internal-step box** — the Manager's own work, no callee (ADR-061 decision 13) — which only the generated entry body's own scope reports.

**There are two span sources, and neither is hand-written.** The IoC proxy spans every component call. Since ADR-061 a Manager's use-case entry body is *generated* from the modeled sequence, and its generated plumbing opens one `idesign.activity_step` scope per modeled box — internal-step boxes included — through a single iFX primitive. Nothing instruments a private helper *below* a box, and there is no attribute, aspect or weaver to reach one. **Write no span code at all**: in a generated body the scope is already there, and in a hand-written one there is nothing to write.

- **The check that consumes it.** A call recorder (a SoEx `ServiceInterceptors` addition — it touches no component-author code) records a run's real call order, and a differ scores it against the sequence's **declared paths**: a run is green only if its calls complete a path the design draws, and a declared branch nobody ever walked fails. This is `seqcheck trace`; the static twin over the source is IDESIGN031 (ADR-026).
- **Granularity is the component call, not the activity-diagram box — say so with every number.** A Manager that performs every modeled call but mis-orders or omits work *inside* a private helper is not caught here; the spec layer's outcome assertion is what catches that. An internal-step box is declarable, observable (its span exists) and behaviourally covered, but **not gated** until the differ ingests those spans (#986). ADR-031 requires any coverage figure derived from the recorder to state this limit.
- **Out of the model means out of the trace too.** `contract-smells.md` collapses internal steps into private helpers; a helper that no modeled box names leaves the contract surface *and* the trace. If a step needs to be visible, it belongs in the model: as a component call — an Engine call — or, when it is the Manager's own work, as an **internal-step box** (ADR-061 decision 13), which the generated entry body spans. Visible is not yet gated, though: see the granularity bullet above.
- **Not a licence to fatten Managers.** Private orchestration helpers in a Manager are the *"Excessive trace depth = Manager fat"* signal (below): genuine logic belongs in an Engine, where it is a modeled, spanned, checked call.
- **Scope: Managers only (ADR-031).** Sequences mirror **Manager orchestration** logic — `SQxx.yy.zz.NN` steps *are* Manager steps. Engines, ResourceAccess, Utility, and the Client keep their component-level spans (*Layer-specific focus* below) but are not held to sequence reconstruction. Their internals are a different beast (computation, I/O, UI); how — or whether — to instrument them is deliberately left open.

## Layer-specific focus

- **Managers**: orchestration spans capturing use-case correlation, downstream invocations, fan-out/aggregation, queued Manager-to-Manager.
- **Engines**: logic spans — branch taken, computational cost, I/O shapes. Lightweight, fast.
- **ResourceAccess**: data spans — query vs. command classification, result-set sizes, retry counts, storage-specific metrics. Carry `db.system`, `db.operation`, `db.statement`.
- **Clients**: user-interaction spans — request initiation, frontend↔backend correlation via W3C `traceparent`, user-action context.

## Three pillars — correlated

- **Traces**: distributed call chains via W3C `traceparent`. Visualize full use-case flow across subsystem boundaries.
- **Metrics**: operation latency histograms, error counters, throughput gauges, saturation/utilization/availability. Tag with `idesign.layer` and `idesign.component`.
- **Logs**: structured JSON with `trace_id` / `span_id`. iFX injects trace context automatically; no manual ID plumbing.
- Workflow: alert on metric anomaly → find the trace → read the logs for that span.

## Cross-subsystem tracing

- W3C `traceparent` propagates through HTTP headers, message headers (AMQP, Kafka), queue metadata.
- Manager-to-Manager queued: traceparent in the message envelope → consumer creates a child span linked to the producer.
- Pub/Sub events: subscribers create **linked** spans (not child) to preserve independent trace trees while keeping causal connection.
- Each subsystem Host exports independently — no single point of telemetry failure.
- Stitched at the collector by shared `trace_id`.

## Verbosity

- **Dev**: all spans, verbose attributes (incl. I/O shapes), no sampling.
- **Staging**: essential spans/attrs, head-based sampling (e.g. 10%).
- **Production**: trace-id-based consistent sampling, error-biased (always capture errors in full).
- Controlled by `OTEL_VERBOSITY=dev|staging|prod`. iFX configures providers at startup.
- Verbosity controls *what is exported*, not *what is instrumented* — all components always instrumented.

## Collector

- OTLP standard: gRPC port 4317, HTTP/protobuf port 4318.
- **Dev**: Jaeger all-in-one + Prometheus + Loki via docker-compose.
- **Staging/Prod**: Tempo / Jaeger / vendor (Datadog, Honeycomb) for traces; Mimir / Prometheus for metrics; Loki / vendor for logs.
- Collector is a local relay; decouples application telemetry from backend choice.
- **Which backend, for THIS project, is a ruled decision** — the deployment view's `hosting:`
  block, as a resource-less platform product with a product, a cost envelope and an operator
  (ADR-071 §3a). The list above is what exists, not what was chosen.

## Frontend

- Browser: `WebTracerProvider` with `FetchInstrumentation` and `XMLHttpRequestInstrumentation`. W3C `traceparent` on every API call.
- CORS-free dev export: Vite/nginx proxy or API gateway forwards `/v1/traces` to collector.
- User-interaction spans bridge to backend API spans — button click is the parent of the resulting HTTP request.
- Frontend spans carry `idesign.layer: client` and `idesign.component`.

## Observability validates architecture

Like "Testability validates architecture" — observability is a litmus test for decomposition quality.

- Traces not mirroring expected call chains (`Client → Manager → Engine → ResourceAccess`) reveal structural violations.
- Circular traces = sideways calls (Engine↔Engine), upward calls (RA→Manager), or layer skipping (Client→Engine).
- Missing spans = uninstrumented components → iFX gap.
- Missing **component-call** span for a modeled step = a step the use case never performed (or a call the sequence never drew) → the trace no longer matches any declared path. `seqcheck trace` and IDESIGN031 both fail on it.
- Excessive trace depth = Manager fat or insufficient Engine factoring.
- Unexpected fan-out = hidden dependencies; intermediate Engine likely missing.
- If you can't observe a use case end-to-end without modifying business code, the iFX is incomplete.

## iFX observability requirements

- `ActivitySource` / Tracer registration per component, named by taxonomy.
- Proxy interception that creates spans automatically.
- Span context propagation through IoC chain — active span flows transparently.
- Verbosity configuration controlling sampling, attribute richness, export destinations.
- Metric registration helpers (counters, histograms, gauges) named by component/operation.
- Reuses the same IoC infra as the test harness — proxy interception for instrumentation is architecturally identical to proxy interception for mocking.

## Ambient context propagation

- Cross-cutting state (caller, tenant, trace/correlation ID, worktree scope, locale, feature flags) flows via iFX-owned ambient context. Never as explicit DTO params.
- Implementations: `AsyncLocal<T>` (.NET), `AsyncLocalStorage` (Node), continuation-local-storage, request-scoped DI container.
- Set once at the entry boundary (`Client → Manager`), read transparently downstream. Same IoC interception that wraps for instrumentation reads context to attach `idesign.tenant`, `idesign.caller`, `idesign.worktree` to every span.
- W3C `traceparent` is a special case — set by the instrumentation layer, carried across HTTP/message envelopes/pub-sub metadata, restored on the consumer side without any component author writing plumbing.
- Ambient context is what makes transparent instrumentation possible; without it every component would need a span/tenant/correlation parameter.

## Client-context variation

- Same use case, same call chain, different client context → different output. Orchestration does not branch; iFX resolves client-appropriate impls via ambient context + IoC.
- iPhone vs Android invoke `IOrderManager.SubmitOrder` with identical payloads. Manager orchestration is identical. iFX resolves a device-appropriate `IOrderFormattingEngine` via factory hint from ambient context.
- Telemetry emits `idesign.client`, `idesign.device`, `idesign.tenant`, `idesign.locale` on every span. Trace tree is structurally identical; only leaf-span bindings differ.
- Structurally different trace trees for different clients = volatility leaked into orchestration. Refactor the branching out of the Manager.
