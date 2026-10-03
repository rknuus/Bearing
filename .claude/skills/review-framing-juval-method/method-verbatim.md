# The Method's structure rules — verbatim, with chapter and line

**Source, and how to cite it.** *Righting Software* (Juval Löwy, Addison-Wesley 2019), through
this toolchain's per-chapter extractions at
`knowledge/sources/extractions/ch<N>-<topic>.md` in `theagent-unchained`; the book itself is at
`knowledge/sources/books/RightingSoftware.pdf`. Each extraction's head names the chapter and the
page range it covers. Quoted verbatim by the licence holder's ruling of 2026-09-09 (relay R-104,
letter «A»). **Proprietary — see the SKILL.md warning.**

Cite a line as:

> *Righting Software* ch3 (Structure), Design "Don'ts": «Engines never call each other»

The line numbers below are of the extraction file, so a reader can open the exact line. Where a
passage is the extraction's summary of the chapter rather than the book's own sentence, it is
marked **[extraction]** — cite it as the extraction, never as the book.

---

## 1. Classification — the five questions (ch3, lines 88–92)

> - **Who** interacts with the system → *Clients*
> - **What** is required of the system → *Managers*
> - **How** (business) the system performs business activities → *Engines*
> - **How** (resource) the system accesses *Resources* → *ResourceAccess*
> - **Where** the system state is → *Resources*

## 2. Naming (ch3, lines 76–82)

> - The **suffix** is always the service's type: `Manager`, `Engine`, or `Access` (for
>   *ResourceAccess*)

> - **Gerunds** (a noun created by tacking "ing" onto a verb) should be used as a prefix only with
>   *Engines*. Gerunds elsewhere signal functional decomposition

> - **Atomic business verbs** should not be used in a prefix — confine them to operation names in
>   resource access layer contracts

## 3. Is this Manager real? (ch3, lines 116–118)

The three responses to a change request, and what each says about the Manager:

> - **Expensive**: Your response to a change request is to fight it, fear its cost. The *Manager* is
>   too big — likely functional decomposition

> - **Expendable**: You shrug off a change request, thinking little of it. The *Manager* is
>   pass-through — a design flaw and distortion of the architecture

> - **Almost expendable**: The proposed change is contemplative, causing you to think through
>   specific ways of adapting. A well-designed *Manager* service should be almost expendable

## 4. Closed architecture, and the four sanctioned relaxations (ch3)

> In a **closed architecture**, you maximize the benefits of layers by disallowing calling up and
> sideways. A closed architecture opens a chink — allowing components in one layer to call those in
> the adjacent lower layer only. Closed architecture promotes decoupling by trading flexibility for
> encapsulation — a better trade.

> For real-life business systems, the best choice is always a closed architecture. *The Method*
> relaxes the rules to reduce complexity and overhead without compromising encapsulation or
> decoupling: (line 153)

The four relaxations, each in the source's own words — **a call that fits one of these is not a
finding**, and a reviewer who reports it has not read this section:

> **Calling Utilities.** There is no good location for *Utilities* among the layers of a closed
> architecture. *The Method* places *Utilities* in a vertical bar on the side, cutting across all
> layers — allowing any component to use any *Utility*.

> **Calling ResourceAccess by Business Logic.** Both *Managers* and *Engines* can call
> *ResourceAccess* services without violating the closed architecture. A *Manager* that uses no
> *Engines* must be able to access the underlying *Resources*.

> **Managers Calling Engines.** *Manager*-to-*Engine* calls are not truly sideways calls. *Engines*
> are really just an expression of the Strategy design pattern — implementing activities within the
> *Managers*' workflows. Think of *Engines* as residing in a different or orthogonal plane to the
> *Managers*.

> **Queued Manager-to-Manager.** A *Manager* can queue a call to another *Manager*. Technical
> explanation: the proxy deposits the message into a queue (a *Resource*), and the queue listener
> is effectively another *Client* calling down. No sideways call actually takes place. Semantic
> explanation: one use case triggers a latent, much-deferred execution of another use case — the
> two use cases are independent and decoupled on the timeline.

And what to do when a violation is found — the sentence that makes a finding useful rather than
punitive:

> When developers violate closed architecture (calling sideways, up, etc.), do not brush it aside.
> Nearly always, the discovery of such a transgression indicates some underlying need. You must
> address that need correctly — for example, queuing inter-*Manager* calls instead of calling
> sideways, or using Pub/Sub instead of calling up.

## 5. The Design "Don'ts" (ch3) — the citable list

The chapter's own framing: *"Treat any violation of these rules as a red flag and investigate
further."*

> - **Clients do not call multiple Managers in the same use case** — implies tight coupling and
>   functional decomposition. *Clients* can call multiple *Managers* but not in the same use case
> - **Clients do not call Engines** — *Engines* are internal implementation details; calls from
>   *Clients* to *Engines* are the hallmark of functional decomposition
> - **Managers do not queue calls to more than one Manager** — if two or more *Managers* need to
>   respond, use Pub/Sub instead
> - **Engines do not receive queued calls** — *Engines* exist to execute a volatile activity for a
>   *Manager*; performing an activity disconnected from any use case makes no business sense
> - **ResourceAccess services do not receive queued calls** — same reasoning; accessing a
>   *Resource* independently from anything else makes no business sense
> - **Clients do not publish events** — events represent changes to system state, which *Clients*
>   have no need to track or knowledge of
> - **Engines do not publish events** — publishing an event requires noticing a change in the
>   system, which is the *Manager*'s context
> - **ResourceAccess services do not publish events** — they have no way of knowing the
>   significance of the *Resource* state to the system
> - **Resources do not publish events** — if the *Resource* needs to publish events, it is often
>   functional decomposition; business logic should reside in *Managers*
> - **Engines, ResourceAccess, and Resources do not subscribe to events** — processing an event is
>   the start of a use case, so it must be done in a *Client* or a *Manager*
> - **Engines never call each other** — violates closed architecture and volatility-based
>   decomposition; each *Engine* should have encapsulated everything about its activity
> - **ResourceAccess services never call each other** — if an atomic business verb requires multiple
>   *Resources*, a single *ResourceAccess* service should perform the join

## 6. Symmetry (ch3)

> All good architectures are symmetric. The symmetry in software systems manifests in repeated call
> patterns across use cases. Its absence is a cause for concern:
> - If a *Manager* implements four use cases, three of which publish an event and the fourth does
>   not — that break of symmetry is a design smell
> - Symmetry can also be broken by the presence of something: if a *Manager* implements four use
>   cases, only one of which queues a call to another *Manager*, that asymmetry is also a smell
> - You should generally see the same call patterns across *Managers*

## 7. Decomposition — why functional decomposition is the failure mode (ch2)

> Functional decomposition has a place — it is a decent requirements discovery technique. It helps
> architects or product managers discover hidden or implied areas of functionality, arranging
> requirements in a tree-like manner and identifying redundancies. Extending functional
> decomposition into a design, however, is deadly. There should never be direct mapping between
> requirements and design. (line 65)

> A crucial flaw of both functional and domain decomposition is testing. The coupling and
> complexity are so high that the only kind of testing developers can do is unit testing, which is
> borderline useless for verifying a system. In any complex system, defects are not in individual
> units but in the interactions between units. … Functional decomposition makes the entire system
> untestable, and untestable systems are always rife with defects. (line 74)

> Volatility is often not self-evident — no customer will present requirements as "This could
> change, we will change that one later." The outside world always presents requirements in terms
> of functionality. Volatility-based decomposition takes longer than functional decomposition
> because you must analyze the requirements to recognize areas of volatility. (line 95)

## 8. Composition — the law that catches a feature-shaped component (ch4)

> The solution to the dissonance of resenting change is a directive so simple it has eluded almost
> everyone for their entire career: *never design against the requirements*. Any attempt at
> designing against the requirements will always guarantee pain. (line 17)

> Putting together the observations of this chapter with those of the previous two chapters yields
> a fundamental system design rule: *Features are always and everywhere aspects of integration, not
> implementation*. This is a universal design rule governing the design and implementation of all
> systems, not just software. (line 53)

> The core use cases will hardly ever be presented explicitly in the requirements document. …
> A core use case will almost always be some kind of abstraction of other use cases and may require
> a new term or name. … The whole point of requirements analysis is to recognize the core use cases
> and the areas of volatility. (line 29)

> Most software systems are implemented using functional decomposition, which maximizes the effects
> of change. If the design is based on features, the change is never in one place — it is spread
> across multiple components and aspects of the system. (line 60)

**This is the sharpest test you have for a phantom or a feature-shaped box**: if a component's
name is what the system *does for a user*, and a use case runs through it end to end, it is a
feature with a box around it, and the source says there is no such box.

---

## Reading notes for a reviewer (this toolchain's words, NOT the source's)

- **The relaxations in §4 are the most common false finding.** Manager → Engine, Manager → Access,
  Engine → Access, anyone → Utility, and a *queued* Manager → Manager are all legal. Check §4
  before writing a layering finding, every time.
- **`lifecycle: future` is not a phantom.** A component the design needs and this cycle does not
  build is a declared deferral in this toolchain's model, and the gate reports it as one. A
  component with **no volatility to own** is the phantom; a component with one, deferred, is a
  decision. Do not conflate them, and check the model's lifecycle field before you write the word
  phantom.
- **A Resource is never a sequence step's callee here**, and the model's own checks enforce it
  (ADR-036). Do not spend a finding on it unless a check is dark.
- **The component-count bands live in `idesign-knowledge/practitioner-rules.md`** (this toolchain's
  curation of alumni statements). They are norms. See the SKILL's warning about arithmetic.
