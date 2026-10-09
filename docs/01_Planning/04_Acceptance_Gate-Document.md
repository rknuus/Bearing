# Bearing v2 — Acceptance Gate Document

> **Gate.** `acceptance` — *Acceptance.* A gate, not a stage (ADR-040 §6).
> **Freezes.** The verified system.
> **Reviewers.** Human, plus **ui-designer visual sampling** — the one judgment in the whole process
> with no mechanical oracle (ADR-037).
> **Content.** Acceptance criteria against the blessed flows; visual sampling; run-end reflection and
> archive.
> **Status.** Pre-Intent. The acceptance *criteria* depend on walkthroughs that do not exist yet, but
> the sources are unusually rich in **UI craft rules** — and craft is exactly what Acceptance judges.
> That material is captured here in full, because it is of no use to any earlier gate and would be
> lost otherwise.

**Citations.** Sources are cited inline by prefix and the source document's own heading number —
`wf §…` (`sources/ui-wireframes.md`, which carries most of this gate's material), `funnel §…`
(`sources/funnel.md`), `arch §…` (`sources/architecture.md`), `inv` (`sources/ui-inventory.md`, which
takes no section number). The index's Sources table is the legend.

---

## 1. Why so much of the UI sketch lands here

Everything in `ui-wireframes.md` §§7.9–7.11 and its nineteen cross-document guidelines describes
behaviour that is **only observable on the running system** and, in most cases, has **no automatable
oracle**: whether a focus ring reads as a focus ring, whether 200 ms feels sluggish, whether a
1024 px-wide window is genuinely usable. ADR-037 reserves exactly that class of judgment for the
ui-designer's visual sampling at this gate.

The rules below are therefore not decoration. They are **the sampling brief** — what the ui-designer
is to check, stated by the Software Architect in advance, so the sampling is a comparison against a
written intent rather than an aesthetic opinion.

---

## 2. Acceptance criteria — the flows

### 2.1 The primary flow: the daily hot path (`arch §1`)

The one flow the product exists for. Acceptance should walk it end to end, on real data, in one sitting.

| Step | Criterion |
|---|---|
| 1 | **Set the day's focus.** Open the app; land on **Focus** (BR-48); see the current week with its `(This week)` chip and today marked; select today; see every selectable grouped under its theme with its colour; select tags and routines; see the selected set in the sticky summary bar. *(Week is the smallest focus scope and the day is edited from within a period view — Intent BR-93, BR-40.)* |
| 2 | **Routine tasks appear.** Selecting a routine spawns its task on the Routines board — and the UI receives **one** envelope for the whole gesture, never the partial state between the focus write and the task write (`arch §5 Pivot 4`). |
| 3 | **Jump to execution.** `[ Open Execution → ]` lands on the most-recently-active tag board for the day, not on `All`; the funnel context header reads `● <Theme> › Goal: <objective> › #<tag>`. |
| 4 | **Work the board.** Drag a task between sections and between columns; the Eisenhower chip follows it out of Backlog; send it back to Backlog and it lands in its previously-set section. |
| 5 | **Capture an idea mid-execution** — the opportunistic step. Switch to Ideation, capture an idea with a tag, return; the Execution board is unchanged and the new tag is available in the task-creation picker. |
| 6 | **Capture tasks in a batch.** Stage several tasks across the three sections; close the dialog; reopen it and find the staged set restored; commit; every task is in Backlog in the section it was staged into. |
| 7 | **Check out the day.** The completed and in-progress lists match what actually happened; the notes auto-save; archiving the completed tasks and resetting the in-progress ones does what the checkboxes say; re-running the check-out updates the same day log rather than creating a second one. |
| 8 | **Review goals out of band.** Check in on a numeric progress measure and on a boolean one; the history renders in the right vocabulary for each type; the goal row's progress visual matches. |

### 2.2 Per-business-process acceptance criteria

**Owed.** One criterion set per blessed business process, derived from the **approved walkthroughs**
(ADR-040 §2) — the flow taken, the values entered, the outcomes the stakeholder confirmed on screen.
Those walkthroughs do not exist yet (Intent document G-07); the Intent document's §9 candidate dataset
is the likely seed. The Intent document's §5 proposes sixteen candidate processes; each will owe a
criterion set here.

### 2.3 The lifecycle flows worth their own criteria

| Flow | Criteria |
|---|---|
| **First run** | Fresh machine → the data folder is created at the OS-conventional path and git-initialized → the new-data-folder notification appears **before any app content** → `[ Continue ]` leads to onboarding → themes are pre-seeded and editable inline → Vision & Mission is offered and skippable → the app lands on **Focus** (BR-48). |
| **Data loss recovery** | Delete the data folder with the app closed → relaunch → the notification appears → `[ Quit ]` exits cleanly → restore a backup at the same path → relaunch → the restored data loads and **nothing was overwritten**. |
| **Broken symlink** | Point the data folder at an unmounted volume → relaunch → the same path as data-loss recovery. |
| **Goal close-out** | Check out a goal with mixed measure outcomes → the auto-inferred labels match the thresholds → an override sticks → the retro and per-measure notes are saved → the goal archives → carry-forward seeds a follow-up with only the Partial and Missed measures, progress reset, the `"Continue: "` objective, and a back-reference to the check-out. |
| **Archive round trip** | Archive an idea, a goal and a task by their three different triggers → each disappears from its active view and appears in its archive view with the right metadata → unarchive each → each returns to the position it would have occupied. |
| **Cascade** | Delete a theme, an idea, a routine and a column, each with and without cascade → the consequence statement matched what happened → no cascade left an orphan → no declined cascade destroyed anything → the column case rejected rather than detaching. |
| **Advisor** | Ask a question → thinking indicator → streaming cards → apply one, dismiss one, leave one pending → a revised suggestion for the same target supersedes the older card and only the new one carries buttons → a cross-tab apply commits silently and offers the jump in a toast → disconnect the network and the failure is inline with a working retry. |
| **Day rollover** | Leave the app open across local midnight → the current day advances → **the day focus in play becomes the new date's and is empty**, so the focused tags are gone and the boards they put in play are gone with them (BR-50, BR-51) → the visible period view re-marks today and an open day editor follows it → **no task was created, none archived, none moved** (BR-44) → the previous day's focus and its log are intact as history, reachable from the overviews → every relative-time chip re-evaluates. |

---

## 3. Non-functional acceptance criteria

Each of these is a claim the design makes about itself. Acceptance is where the claim is tested.

| # | Claim | How it is checked |
|---|---|---|
| A-01 | **Every state change is journaled, in two layers.** | After a session of work: `git log` has one commit per mutation, and `journal/{yyyy-mm}/{date}-ops.jsonl` has one line per mutation carrying `{op, args, ts, version_after, actor}`. The two agree. |
| A-02 | **The journal is replayable.** | `git checkout <sha>` of an arbitrary earlier commit yields a loadable, coherent state. |
| A-03 | **Each transaction is one commit and one journal line** — not several. | A multi-write use case (day check-out with N task mutations) produces exactly one commit. |
| A-04 | **Mutations are atomic under rapid fire.** | Drag tasks and toggle focus selections as fast as the UI allows; no commit is partial, no document is half-written, no version is skipped. |
| A-05 | **The backend is authoritative.** | Force a divergence; the UI rewrites to the backend's state (never the reverse), logs the detail, and **reports a state-mismatch error to the user**. |
| A-06 | **One envelope shape.** | Every mutation response carries `{ version, mutated, invariants_checked }`. |
| A-07 | **A saga emits one envelope.** | Setting the daily focus produces one client-visible update, not two. |
| A-08 | **The UI never polls.** | With the app idle, there is no read traffic. |
| A-09 | **Drafts survive a crash.** | Stage tasks, kill the process, relaunch: the staged set is restored. Same for day-log notes. |
| A-10 | **The scratch tier stays out of history.** | `.scratch/` never appears in `git log` or `git status`. |
| A-11 | **The app is fully functional offline.** | With no network, every surface works; only the advisor degrades, with its documented inline error. |
| A-12 | **Three platforms, three paths.** | The data folder resolves to the OS-conventional location on macOS, Linux and Windows. |
| A-13 | **Relocation by directory link works.** | Replace the data folder with a symlink (`ln -s`, `mklink /D`) to another location; the app follows it. |
| A-14 | **There is no in-app undo, and the docs say so.** | The delete confirmation states it and names the data folder; recovery via git works. |
| A-15 | **There are no user-facing settings.** | No settings icon, no settings dialog, no settings view, anywhere. |
| A-16 | **The data location and the version-control framing are discoverable.** | The About dialog shows the resolved path and says the folder is tracked in git. |

---

## 4. Visual sampling brief (ADR-037)

The ui-designer's checklist. Every row is a rule the Software Architect wrote down in advance.

### 4.1 Accessibility and perception

| # | Rule |
|---|---|
| VS-01 | **Colour is never the only signal.** Theme colour always pairs with a name, label or chip text. Check every surface where colour carries meaning: theme cards, idea chips, goal section headers, focus selectables, board chips, task priority chips, routine names, coverage strips. |
| VS-02 | **Every interactive control has a ≥ 44 × 44 px hit target**, including inline glyphs whose *visible* size is far smaller — `⋮⋮` drag handles (~12 px visible), `▸`/`▾` fold chevrons, `[×]` chip removals, advisor card actions, colour-picker swatches. Densely-packed surfaces named as needing explicit attention: KR rows in the Goal editor, advisor cards, the Themes-tab routine sub-list. Expanded hit boxes may overlap visually-adjacent elements as long as they do not conflict semantically. |
| VS-03 | **Every focusable element has a visible focus ring**: 2 px solid outline at 2 px offset (a ~4 px ring), high contrast against its surface, border-radius matched to the element, **`:focus-visible` only** — mouse clicks do not trigger it. The ring is **distinct from hover and active**. Where the glyph is smaller than the hit target, **the ring matches the hit-target box, not the glyph**. |
| VS-04 | **Status badges always carry text, never only a glyph** — `✓ Applied`, `✕ Dismissed`, `↻ Superseded`, `[paused]`, archived markers. |
| VS-05 | **`prefers-reduced-motion` is honoured.** Fold/unfold, panel slide-in, dropdown open, toast slide-in and card entrance all drop to 0 ms. **Functional non-motion stays** — focus rings, hover colour, press feedback are state feedback, not motion. The advisor's cards still arrive one by one (that is real network timing), just without the slide-in. |
| VS-06 | **Locale, colour scheme and reduced motion come from the OS**, with no in-app override. Verify on a dark-mode system and a reduced-motion system. |

### 4.2 Motion

| # | Rule |
|---|---|
| VS-07 | **Micro-interactions sit in 150–300 ms.** Slower reads as sluggish; faster reads as jittery. Colour/background transitions up to 200 ms; larger panel entrance/exit (the advisor sliding in) up to 300 ms. |
| VS-08 | **Animate `transform` and `opacity` only.** No animated `width`/`height`/`top`/`left`. |
| VS-09 | **Async content reserves its eventual space.** Skeletons in the shape of the expected content — theme cards, idea rows, Kanban columns. **Layout never jumps when data arrives.** Skeletons are brief, low-contrast, non-interactive. |
| VS-10 | **The advisor's thinking slot reserves the indicator's height**; when content streams in, the slot grows **downward** and does not shift previous turns up. |

### 4.3 Focus behaviour

| # | Rule |
|---|---|
| VS-11 | **Focus is returned** after any transient surface closes — to the element that opened it. |
| VS-12 | **Focus is positioned meaningfully** when a surface opens, per the landing table below. |
| VS-13 | **Focus persists across non-destructive view changes** — focus-scope switches, card expand/collapse, section and column folding never reset it. |
| VS-14 | **Modal dialogs trap Tab** (Shift-Tab cycles backward); the user cannot Tab out to the underlying content. **The advisor panel is the explicit exception** — it is non-modal, Tab flows between it and the view, and its internal order is context strip → focus chips → conversation history → card buttons → chat input → Send. |
| VS-15 | **Tab order follows visual order**, top-to-bottom and left-to-right, ending with the secondary then the primary button. Never columns-first. Concrete orders are specified for the editor dialogs, the delete confirmation, both check-outs, the batch task creation (including per-row `⋮⋮` then `[×]`), and the suggestion-card area. |
| VS-16 | **Esc is the safe-cancel action on every dialog, modal and panel** — dismisses without committing, returns focus to the trigger. The only documented exception is the data-path dialog, which has no Esc route because the app cannot function without a decision (⚠ and which contradicts the new-data-folder dialog's own "Esc closes via `[ × ]`, treated as Continue" — **QA-01**). |

**Focus-landing table** (`wf §7.10`) — reproduced in full, since it *is* the criterion:

| Transition | Focus lands on |
|---|---|
| App open / first launch | Focus's first interactive element (BR-48); on first run, onboarding's |
| Tab switch (click or `⌘1`–`⌘5`) | The tab's `[ + … ]` button when present, else the first interactive element in the content area |
| Open an editor dialog (Theme / Routine / Idea / Goal / Task / V&M) | The first text input (`Name *` / `Title *`) |
| Open progress check-in (numeric) | The numeric value field |
| Open progress check-in (boolean) | The currently-set radio (`Not done` if never set) |
| Open Goal check-out | The outcome radio, pre-selected to the auto-inferred value |
| Open Day check-out | The day-notes textarea |
| Open Task creation | `Title *` |
| Open a delete confirmation | **`[ Cancel ]`** — the safe action. **Enter does not delete.** |
| Open the advisor panel | The chat input |
| Close any dialog or panel | The element that opened it |
| `[ Show archived <type>… ]` | `[ ← Back to active … ]`; the next Tab reaches the filter input |
| `[ ← Back to active … ]` | The `[ Show archived <type>… ]` button — closing the loop |
| Focus-scope switch (Week ↔ Month ↔ Year) — *source says Day ↔ Week ↔ Month ↔ Year; Day dropped per Intent BR-93* | The cell for the currently-visible day, else today |
| Open the day focus editor from a period cell | The first selectable of the first theme group |
| Close the day focus editor | The period cell it was opened from |
| Period-navigator step | Stays on the navigator buttons, so stepping continues |
| Card fold / unfold | Stays on the chevron |
| Ideation sidebar entry click | The first idea card in the filtered pane — Tab continues **into** content, not back into the sidebar |
| Suggestion `[ Apply ]` or `[ Dismiss ]` | The next pending card's primary action; if none, the chat input |
| `[ Apply all ]` / `[ Dismiss all ]` | The chat input |
| `[ Promote to Goal → ]` | After the handover: the Goal editor's `Theme *` dropdown |
| A cross-tab apply | Focus stays on the conversation; clicking the toast's jump moves it to that tab's first interactive element |
| A toast appearing | **Does not steal focus.** Its buttons are reachable by the next Tab. |

### 4.4 Keyboard

| # | Rule |
|---|---|
| VS-17 | The full keymap of `wf §7.4` works and matches the dialog that documents it: `⌘1`–`⌘5` tabs · `⌘N` context-aware create · `⌘E` edit · `⌘⌫` delete · `⌘K` quick search · `?` help · `⌘⇧→/←` move a task between columns · `⌘⇧↑/↓` reorder within a section or column · `1`/`2`/`3` set the Eisenhower section · `[`/`]` fold/unfold · in task creation `⌘1`/`⌘2`/`⌘3` stage, `⌘↩` done, `Esc` close (drafts persist) · in Focus `W`/`M`/`Y` switch scope (source also lists `D`; dropped with the day view, Intent BR-93), `⌘⇧T` jump to the current period, `←`/`→` step · `⌘⇧A` toggle the advisor, `⌘⇧↩` apply all, `⌘⇧⌫` dismiss all · `⌘⇧↑/↓` reorder a theme card. |
| VS-18 | **`?` opens the shortcuts dialog**, and it shows both the Mac and the non-Mac binding. |
| VS-19 | **Keyboard reorder is everywhere drag is** — `⌘⇧↑`/`⌘⇧↓` on a focused row for themes, routines, ideas, goals, progress measures and staged tasks. |
| VS-20 | **Combobox affordances are standard** in the tag picker: `↑`/`↓` walks, `Enter` picks, `Esc` closes without committing. |

### 4.5 Layout and window

| # | Rule |
|---|---|
| VS-21 | **The window cannot be resized below 1024 × 640** — the OS window manager itself refuses. |
| VS-22 | **At the floor, every surface still renders horizontally.** Nothing stacks, nothing collapses: the tab bar stays horizontal and never becomes a menu; the Ideation sidebar never collapses; Focus Week keeps 7 cards in one row; Focus Month keeps a 7-column grid; Focus Year keeps 12 × 31 on one screen without pagination; Execution keeps four columns and introduces **horizontal scroll** only when custom columns exceed the width. |
| VS-23 | **At very wide widths, nothing stretches badly.** Dialogs cap at ~720/840 px and centre; the tab bar is left-justified after the brand with no pill growth; Kanban columns keep a comfortable width and leave whitespace to the right; the Ideation sidebar stays ~180 px; only the Focus grids scale up. |
| VS-24 | **The advisor's divider respects both min-widths** (~500 px content, ~400 px advisor) and cannot be dragged past either; below ~1000 px window width, opening the advisor auto-closes the Boards strip's secondary chips. |
| VS-25 | **No surface reorders or hides controls by width.** The same controls are in the same places at every supported width — no "hide on narrow", no "promote on wide". |

### 4.6 Convention consistency

| # | Rule |
|---|---|
| VS-26 | **Glyph vocabulary is used consistently** per the reference table: `●` theme colour · `◆` Eisenhower section (a fixed palette, **never** the theme colour) · `▾`/`▸` fold · `⋮⋮` drag · `⋯` overflow (only column headers and task cards) · `[ × ]` dialog close vs. `[×]` inline remove (distinguished by spacing) · `⚠` destructive, always with a label · `✓` positive, always with text · `✕`/`✗` negative, always with text · `↻` superseded · `→` direction · **`›` chain** vs. **`·` set** · `←` back · `↥`/`↧` to-top/to-bottom. |
| VS-27 | **`›` and `·` are not interchangeable.** `● Career › Goal: Ship Bearing v2 › #bearing-v2` is a lineage; `Routines · ● Gym · ● Meditation` is a set. Check the Routines and `All` board headers specifically. |
| VS-28 | **Tab-header button order is identical on all five tabs:** `[ Show archived … ]` · view-mode controls · `[ ✦ Advisor ]` · `[ + … ]`. Advisor immediately before create; create always rightmost. |
| VS-29 | **Abbreviations only where width forces them** — `Imp. & Urgent` in a column header is fine; never in prose or a button label. |
| VS-30 | **Sub-section headings inside cards are small-caps short labels** (`ROUTINES`, `TAGS`); theme-group dividers are sentence case with a rule line (`─── ● Health ──────`). Two visual languages, kept apart deliberately. |
| VS-31 | **Date formats are surface-dependent:** active surfaces are relative up to 7 days and absolute thereafter (`edited 2h ago`, `edited yesterday`, `edited 5 days ago`, `Apr 30 · 4 / 12 (33%)`); archived surfaces are absolute ISO-ish (`archived 2024-08-15`); calendar headers are locale-appropriate (`Mon, May 11 2026`). Distance is the point on archived surfaces, recency on active ones. |
| VS-32 | **Destructive actions are visually marked everywhere** — red text or outline, `⚠`-prefixed — and in editor dialogs they additionally sit in a **Danger zone** frame, separated from Save. List rows omit the frame (nothing to separate from, and per-row frames would saturate the page) but keep the styling. |
| VS-33 | **Archive is never in the Danger zone.** `[ Archive idea ]` sits outside it, because archive is reversible — a state change, not destruction. |
| VS-34 | **One dialog serves create and edit**, with the title and primary-button label swapping contextually. |
| VS-35 | **Empty states have one shape everywhere:** short heading naming what is missing → one orientation paragraph explaining the concept and its place in the funnel → one or two next-action buttons. **Buttons only for affordances with no other home** — tab navigation goes in prose, and a create action that already exists in the header is named in the paragraph instead of duplicated. `[ Pre-seed defaults ]` on Themes is the one unique affordance. Empty states never block the rest of the app. |
| VS-36 | **Empty Backlog sections stay visible, folded, with `(0)`** — never disappear. Counts render everywhere even at zero, so the structure stays legible. |
| VS-37 | **Toasts** live bottom-right, do not steal focus, auto-dismiss after ~3 s for success, stay until clicked or actioned for errors, stack to a maximum of 3 (newest on top, a 4th displacing the oldest), and keep per-toast timers and actions. |
| VS-38 | **Errors live near their source** — inline next to the field, card or button that produced them. Toasts are only for transient acknowledgment. |
| VS-39 | **Write-triggering buttons disable with a pending indicator** while in flight; **Cancel-equivalents stay active** so the user can abort. |
| VS-40 | **Theme colour propagates consistently** to goals, routines, ideas, focus chips, board chips and task priority chips — and the colour dot is leftmost on every row, so scanning by colour works. |

---

## 5. Scope boundaries — what Acceptance must *not* test

Recorded so that an absent feature reads as a decision, not a defect.

| Out of scope for v1 | Source |
|---|---|
| Multi-select and bulk operations of any kind (the advisor's per-response Apply all is the only deliberate "bulk" surface) | `wf §7.11` |
| Auto-archive of anything — goals do not archive when their horizon passes, tasks do not archive after N days in Done | `wf §7.8` |
| Cascade-on-archive | `wf §7.8` |
| A mobile layout, a tablet target, a vertical reflow, or any breakpoint behaviour | `wf §7.9` |
| A Settings view, a settings icon, or any in-app preference | `wf §7.2` |
| Backup/restore UI, import/export between tools, in-app folder picking, in-app "use a different folder" | `wf §7.2`, `wf §7.7` |
| Routine skip-on-holiday rules, streak goals, reminders, notifications | `funnel §Routines` |
| Nested goals (parent/child OKRs) and progress roll-up across them | `funnel §3` |
| Labels on ideas; boolean search operators anywhere | `wf §3.1`, `wf §7.8` |
| A fourth Eisenhower quadrant | `funnel §5` |
| Filters on the Goals tab | `wf §4.1` |
| Advisor-initiated idea creation, focus setting, archiving, or routine pause/resume | `wf §7.5` |
| A `create_idea` / `set_focus_today` / `archive_*` / `set_routine_active` suggestion type | `wf §7.5` |
| A persistent breadcrumb bar | `wf §1` |
| Multi-user, sync, accounts, sharing, authentication | `arch §1` |
| A "create new tag" path in the task-creation picker | `wf §6.2` |

---

## 6. Acceptance mechanics still owed

| # | Owed |
|---|---|
| AC-01 | **The acceptance criteria themselves**, per blessed business process, derived from the approved walkthroughs. Blocked on Intent G-07. |
| AC-02 | **Who performs acceptance.** The user, the stakeholder and the Software Architect are the same person. Acceptance as a distinct act therefore needs a deliberate shape — a ruling, not an assumption (**QA-02**). |
| AC-03 | **Who performs the visual sampling**, and against what — this document is the brief, but the sampler is an agent whose dispatch is the conducting side's business. |
| AC-04 | **How the advisor's output quality is judged.** It has no mechanical oracle: a suggestion can be schema-valid, applied successfully, and still bad advice. The product's single most visible surface is the one Acceptance cannot assert on. A sampling protocol is owed (**QA-03**). |
| AC-05 | **Client-tier E2E** — the OTel trace of every run diffed against the model's sequences, with derived display assertions (ADR-037). Depends on the UI anchors from the Specification stage. |
| AC-06 | **The acceptance partition** of the spec layer (`acceptance-partition`, `client-e2e` checks). |
| AC-07 | **Run-end duties** — reflection and archive (ADR-001/005). |

---

## 7. Open questions — Acceptance tier

| # | Question | Blocks |
|---|---|---|
| QA-01 | **Does the data-path dialog respond to Esc or not?** Guideline #17 names it as the one dialog with no Esc route; `wf §7.7` says Esc closes it via `[ × ]`, treated as Continue. | VS-16, the bootstrap flow |
| QA-02 | **What shape does acceptance take when the stakeholder, the user and the Software Architect are one person?** A separate sitting, a delegate, a written checklist run cold? | AC-02, the gate's conduct |
| QA-03 | **How is advisor output quality judged at acceptance**, given that it has no mechanical oracle? | AC-04, the visual sampling brief |
| QA-04 | **Which platforms must pass acceptance?** Three data-folder conventions are specified; whether all three must be exercised, or one plus a smoke test, is unstated. | A-12, the acceptance environment |
| QA-05 | **Is there an acceptance criterion for the journal's human usefulness** — can the user actually answer "what did I change last Tuesday and why" from git plus the op-log? The two-layer journal is justified by exactly that question, so it is worth testing rather than assuming. | A-01, A-02 |

---

## 8. Inputs this gate is waiting on

- **From Intent:** the approved walkthroughs with their example data (the acceptance criteria's source
  of truth), and the blessed business processes they walk.
- **From Blueprint:** the model's sequences, which the client-tier E2E trace is diffed against, and
  the saga contract whose "one envelope, never partial state" property A-07 asserts.
- **From Contract:** the UI anchors the E2E tests locate controls by; the acceptance partition of the
  spec layer; the blessed resource protocol sheets whose effect allowlists the runtime enforces; and
  the deployment decisions that determine which platforms and which advisor product are under test.
