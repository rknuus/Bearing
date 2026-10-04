# Bearing — UI Wireframes

ASCII wireframes for every surface listed in [`ui-inventory.md`](./ui-inventory.md). The shell, layout grammar, and Eisenhower-sectioned Kanban are inspired by the current `tmp/Bearing` UI; tab labels and the addition of routines/ideation follow the [funnel concept](./funnel.md).

Each wireframe is followed by short design notes covering hierarchy, focus, accessibility, and reuse decisions.

Conventions:

- `[ Label ]` — button. `[Active*]` — currently active. `(•)` / `( )` — radio. `☑` / `☐` — checkbox.
- `●` — color dot (theme color). `▸` / `▾` — disclosure / dropdown.
- `[⋯]` — overflow menu. `[ × ]` — close. `*` denotes a required field.

---

## 1. App shell

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  Bearing │  Themes › Ideation › Goals › Focus* › Execution           [ ? ]   │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│                          (active tab content)                                │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

Notes:

- **Chevron connectors (`›`) between tabs** carry the funnel's left-to-right direction. All tab labels are equal weight — no muting — so every tab stays equally readable and accessible. The active tab is distinguished by underline + bold (here marked `*`), which is orthogonal to the chevrons. This realizes UX principle #2 from `funnel.md`.
- **Help (?) lives in the shell chrome**, not as a tab — it's settings-adjacent and shouldn't compete with the funnel. There is no settings icon (Bearing has no user-facing settings; see § 7.2).
- **No persistent breadcrumb bar.** Tabs already answer "where am I"; funnel lineage (Theme › Goal › Tag) is surfaced inline only on the surfaces where it carries weight — Execution board header, Focus summary chips, and child-entity dialog titles. See cross-document guideline #6.
- **Tab targets ≥ 44×44px** for touch. Active state uses both color AND underline so colorblind users aren't disadvantaged (`color is not the only indicator`).
- **`⌘1…⌘5` keyboard shortcuts** map to the five tabs in order — discoverable via the Help dialog.

---

## 2. Themes tab

### 2.1 Themes view

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│  Themes                                            [ ✦ Advisor ]   [ + Theme ]   │
├──────────────────────────────────────────────────────────────────────────────────┤
│  ▸ Vision & Mission                                                     [ Edit ] │
├──────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  ⋮⋮  ▾ ●  Health                 2 goals · 3 routines   [ Edit ]  [ ⚠ Delete ]    │
│  ┌────────────────────────────────────────────────────────────────────────────┐ │
│  │  ROUTINES                                                  [ + Routine ]   │ │
│  │  ┌────────────────────────────────────────────────────────────────────┐    │ │
│  │  │ ⋮⋮ ● Gym                3×/week · M·W·F      [ Edit ]  [ ⚠ Delete ] │    │ │
│  │  └────────────────────────────────────────────────────────────────────┘    │ │
│  │  ┌────────────────────────────────────────────────────────────────────┐    │ │
│  │  │ ⋮⋮ ● Meditation         daily                [ Edit ]  [ ⚠ Delete ] │    │ │
│  │  └────────────────────────────────────────────────────────────────────┘    │ │
│  │  ┌────────────────────────────────────────────────────────────────────┐    │ │
│  │  │ ⋮⋮ ● Sleep before 23:00 daily      [paused]  [ Edit ]  [ ⚠ Delete ] │    │ │
│  │  └────────────────────────────────────────────────────────────────────┘    │ │
│  └────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                  │
│  ⋮⋮  ▾ ●  Career                 1 goal · 0 routines    [ Edit ]  [ ⚠ Delete ]    │
│  ┌────────────────────────────────────────────────────────────────────────────┐ │
│  │  ROUTINES                                                  [ + Routine ]   │ │
│  │   (no routines yet — add one to set a daily/weekly cadence)                │ │
│  └────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                  │
│  ⋮⋮  ▸ ●  Learning               0 goals · 1 routine    [ Edit ]  [ ⚠ Delete ]    │
│  ⋮⋮  ▸ ●  Relationships          0 goals · 0 routines   [ Edit ]  [ ⚠ Delete ]    │
│  ⋮⋮  ▸ ●  Personal               0 goals · 2 routines   [ Edit ]  [ ⚠ Delete ]    │
│                                                                                  │
└──────────────────────────────────────────────────────────────────────────────────┘
```

**Vision & Mission section** — collapsible header above the theme cards. Three states:

```
Collapsed (set):
├──────────────────────────────────────────────────────────────────────────────────┤
│  ▸ Vision & Mission                                                     [ Edit ] │
├──────────────────────────────────────────────────────────────────────────────────┤

Expanded (set):
├──────────────────────────────────────────────────────────────────────────────────┤
│  ▾ Vision & Mission                                                     [ Edit ] │
│                                                                                  │
│   Vision                                                                         │
│    A focused, generous engineer who ships things he's proud of, while            │
│    staying healthy and present with the people he loves.                         │
│                                                                                  │
│   Mission                                                                        │
│    Build durable tools and the discipline to use them daily.                     │
│                                                                                  │
├──────────────────────────────────────────────────────────────────────────────────┤

Empty (never set):
├──────────────────────────────────────────────────────────────────────────────────┤
│  ▸ Vision & Mission   (not set)                                          [ Set… ]│
├──────────────────────────────────────────────────────────────────────────────────┤
```

Notes:

- **Vision & Mission is a collapsible header** at the top of the Themes view — *above* the theme cards but inside the tab. Sits where it conceptually belongs: one rung higher than themes in the funnel.
- **Default state: collapsed when set, expanded when never set.** A never-set V&M expands on first arrival as a one-time nudge for new users; users who don't care can collapse it and never see it again. Once set, it collapses by default — V&M is low-volatility, so the row stays out of the way.
- **`[ Edit ]` / `[ Set… ]` opens § 2.5** (Vision & Mission editor dialog). Both fields editable in one dialog. Either field can be left empty — V&M is fully optional.
- **No inline editing.** Vision and Mission are prose; mixing a Markdown textarea with the surrounding theme cards would clutter the tab. Dialog handles all editing.
- **Empty-state copy stays neutral** — "(not set)" not "Define your purpose!" — so the user isn't shamed for skipping a feature they don't care about.
- **Not gated, not required.** No goal-creation flow, no Themes-tab function, no advisor capability depends on V&M being filled. It's an enhancer, not a prerequisite.

- **Each theme card embeds only Routines, not Goals.** Goals are visible on the Goals tab (their canonical home, where they're already grouped by theme). Embedding goals here would duplicate content from the Goals tab, force time-based filtering to prevent accumulation, and confuse the funnel ("one canonical home per entity"). The counter (`2 goals · 3 routines`) still surfaces the goal count so the theme card has a vital sign without listing each goal. To see goals under a theme, switch to the Goals tab — its rule-line section headers already group by theme.
- **Routines are the only embedded sub-entity** because the Themes tab is their only canonical home. This is the funnel's one deliberate "downstream embedding" exception, justified by routines having no other home.
- **Upstream context (theme chips) on entities elsewhere** does the symmetric work — Ideas, Goals, and Tasks always carry a theme chip or color that says "this belongs to <theme>." The principle is now consistent: each tab owns its primary entity; child tabs reference parent context; parent tabs don't embed children (except routines, the one exception).
- **Every row has explicit `[ Edit ]` and `[ ⚠ Delete ]` buttons** — themes and routines alike. The buttons are right-aligned so scanning the left side stays unobstructed.
- **Edit opens the entity-specific editor dialog** (Theme / Routine); Delete opens the shared delete-confirmation dialog (§ 2.4).
- **Routine cards are individually bordered** and reorderable per guideline #19 (drag the `⋮⋮` handle on the leftmost edge, or `⌘⇧↑` / `⌘⇧↓` on a focused row).
- **Routine cards show the schedule summary inline** (`3×/week · M·W·F`) so opening the editor is rarely necessary. Pause/resume is handled by the **Active** toggle inside the Routine editor; the `[paused]` chip remains as an inline status indicator.
- **Themes are reorderable** per guideline #19. No editor round-trip is needed for reordering.
- **Themes can be collapsed** (`▸`) for a high-density overview. Expanded state is the default for themes the user just created or edited.
- **Color dot is leftmost on every row** so scanning by theme color works at a glance (paired with the theme name per guideline #1).
- **Empty-state copy** follows guideline #5 — e.g. *"(no routines yet — add one to set a daily/weekly cadence)"*.

### 2.2 Theme editor dialog

```
┌─ Edit Theme ─────────────────────────────────────────────────[ × ]┐
│                                                                    │
│  Name *                                                            │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │ Health                                                        │ │
│  └──────────────────────────────────────────────────────────────┘ │
│                                                                    │
│  Color *                                                           │
│   ●  ●  ●  ●  ●  ●  ●  ●  ●  ●  ●  ●                              │
│   ▲                                                                │
│   Selected: #2BB673 (Health green)                                 │
│                                                                    │
│  ┌─ Danger zone ──────────────────────────────────────────────┐   │
│  │  [ ⚠ Delete theme ]  ← also detaches its goals and routines  │ │
│  └────────────────────────────────────────────────────────────┘   │
│                                                                    │
│                                       [ Cancel ]   [ Save ]        │
└────────────────────────────────────────────────────────────────────┘
```

Notes:

- **Inline color picker** — no nested dialog. Selected swatch is marked with a caret + hex/name caption for accessibility (color is not the only signal).
- **Reorder is not in this dialog** — themes are repositioned on the Themes view itself per guideline #19. Putting reorder here would force open-edit-save round-trips for an inherently visual task.
- **Delete sits in a "Danger zone" group** at the bottom, separated from the primary Save action — this avoids accidental deletion.
- **Save is the rightmost / primary** button; Cancel is secondary on the left of it. Both sit at the bottom-right (standard desktop convention).
- **Required fields marked with `*`** — name and color are non-optional.

### 2.3 Routine editor dialog

```
┌─ Edit Routine ───────────────────────────────────────────────[ × ]┐
│                                                                    │
│  Name *                                                            │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │ Gym                                                           │ │
│  └──────────────────────────────────────────────────────────────┘ │
│                                                                    │
│  Theme *                                                           │
│  ┌──────────────┐ ▾                                                │
│  │ ● Health     │   (color inherits from the selected theme)       │
│  └──────────────┘                                                  │
│                                                                    │
│  Recurrence *                                                      │
│   ( ) Daily      (•) Weekly      ( ) Monthly      ( ) Custom       │
│                                                                    │
│  Frequency *                                                       │
│   ┌────┐  times per week                                           │
│   │ 3  │                                                           │
│   └────┘                                                           │
│                                                                    │
│  Preferred days  (optional, soft hint)                             │
│   [ M ]  [ T ]  [ W ]  [ T ]  [ F ]  [ S ]  [ S ]                  │
│     ●             ●             ●                                  │
│                                                                    │
│  ☑  Active     (uncheck to pause without deleting)                 │
│                                                                    │
│  ┌─ Danger zone ──────────────────────────────────────────────┐   │
│  │  [ ⚠ Delete routine ]                                       │   │
│  └────────────────────────────────────────────────────────────┘   │
│                                                                    │
│                                       [ Cancel ]   [ Save ]        │
└────────────────────────────────────────────────────────────────────┘
```

Notes:

- **Theme is required and pre-filled** when opened from the Themes tab; changeable so the same editor works from the Focus and Execution entry points.
- **Frequency unit auto-adapts** to the recurrence pattern ("times per week" follows Weekly; "times per day" for Daily, etc.). Reduces cognitive load.
- **Preferred days are a soft hint**, explicitly labeled as such — they don't bind execution, they just nudge the daily focus.
- **Active toggle replaces a separate Pause action** — one fewer state to mentally track.
- **One dialog covers New / Edit Routine** per guideline #7.

### 2.4 Delete confirmation dialog (shared pattern)

The same pattern is reused for **Delete theme**, **Delete routine**, **Delete idea**, **Delete goal**, **Delete task**, and **Delete column**.

```
┌─ Delete <entity>? ───────────────────────────────────────────[ × ]┐
│                                                                    │
│   ⚠  Delete "<name>"?                                              │
│                                                                    │
│   <Per-entity consequence statement>                               │
│   There is no in-app undo. The data folder is under version        │
│   control: <data folder>                                           │
│                                                                    │
│   ┌─ Danger zone ─────────────────────────────────────────────┐   │
│   │  ☐  Also <cascade option>          ← only when applicable │   │
│   └───────────────────────────────────────────────────────────┘   │
│                                                                    │
│                                       [ Cancel ]   [ ⚠ Delete ]      │
└────────────────────────────────────────────────────────────────────┘
```

Cascade follows **downstream ownership** in the funnel — an entity offers a cascade only where deletion would otherwise orphan data it directly owns. Goal is the deliberate non-cascade case: it owns its KRs and check-ins (which go automatically), and everything else it touches (linked ideas, their boards, tasks) belongs to the upstream Idea, not the Goal.

Per-entity consequence and cascade copy:

| Entity   | Always removes                                          | Consequence statement                                                                                              | Cascade option (danger zone)                                          |
|----------|---------------------------------------------------------|--------------------------------------------------------------------------------------------------------------------|------------------------------------------------------------------------|
| Theme    | the theme; clears `theme_id` on tagged ideas            | Goals and routines under this theme will be removed (or detached if you don't cascade).                            | ☐ Also delete its goals, routines, and the tasks on their boards       |
| Idea     | the idea + its tag; clears the link from any goal       | Goals that link this idea will keep existing — they just lose the link.                                            | ☐ Also delete the board and all its tasks                              |
| Goal     | the goal + its KRs + check-in history; clears any Focus selections referencing it | Tasks and boards under the linked ideas remain — they belong to the ideas, which are independent of this goal. | (none — the goal owns no downstream data; everything else is a link) |
| Routine  | the routine record                                      | Future occurrences stop spawning. Already-spawned tasks on the Routines board remain unless cascaded.               | ☐ Also delete already-spawned tasks on the Routines board               |
| Task     | the task                                                | The task is removed.                                                                                                | (none)                                                                 |
| Column   | the column from its board                               | If the column has tasks, deletion is rejected unless you cascade. Empty columns delete cleanly.                     | ☐ Also delete all tasks in this column                                 |

Notes:

- **Destructive action is on the right but not auto-focused** — Cancel is the default focus target; Enter does *not* delete. Esc closes.
- **Cascade options live in a Danger zone frame** so they're visually separated from the safe Cancel control and impossible to confuse with form scaffolding.
- **Cascade options are off by default** — the safer outcome is the default.
- **Goal's "no cascade" is intentional and explained inline** — the consequence statement tells the user that boards and tasks under the linked ideas are not affected, so they're not left wondering whether the box is missing.
- **Plain language consequence**, not just a generic "are you sure?"
- **Column is the one case where `cascade=false` *rejects* rather than detaches** — every other entity has a clean detach state (orphaned tag, cleared link, etc.), but `task.column` is required, so a non-cascading column delete with tasks has no safe fallback. The dialog surfaces the reject as a hard error with the cascade prompt highlighted; the user either cascades or cancels.

### 2.5 Vision & Mission editor dialog

Opened from the collapsible Vision & Mission header on the Themes view (§ 2.1) and from the optional Vision & Mission step during onboarding (§ 7.1). Edits both fields in one dialog; either may be left empty.

```
┌─ Vision & Mission ───────────────────────────────────────────[ × ]┐
│                                                                    │
│  Vision   (optional — who you're trying to become)                 │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │ A focused, generous engineer who ships things he's proud of,  │ │
│  │ while staying healthy and present with the people he loves.   │ │
│  │                                                                │ │
│  │ (Markdown supported)                                           │ │
│  └──────────────────────────────────────────────────────────────┘ │
│                                                                    │
│  Mission   (optional — what you're here to do)                     │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │ Build durable tools and the discipline to use them daily.     │ │
│  │                                                                │ │
│  │ (Markdown supported)                                           │ │
│  └──────────────────────────────────────────────────────────────┘ │
│                                                                    │
│  Both fields are optional. Leave either blank if you don't want    │
│  to articulate it — Bearing doesn't require Vision or Mission to   │
│  function.                                                         │
│                                                                    │
│                                       [ Cancel ]   [ Save ]        │
└────────────────────────────────────────────────────────────────────┘
```

Notes:

- **Both fields are optional** — explicit in the inline help and in the body copy. Saving with both empty is allowed; the Themes view simply renders the empty state.
- **Tall textareas, Markdown** — V&M is reflective prose, not structured data. Markdown supported the same way it is on Idea notes.
- **No dedicated delete or clear control.** Resetting is exactly "select all → delete → Save" in the relevant textarea(s). A separate `[ Clear ]` button would add chrome for a gesture that's already trivial via the textarea itself.
- **No required-field markers** — neither field is starred since both are optional.
- **Body copy reassures.** The line about "Bearing doesn't require V&M to function" is intentional — keeps the user from feeling they've failed at planning if they don't fill it in. Empty V&M is a fully-valid app state.

---

## 3. Ideation tab

### 3.1 Ideation view

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│  Ideation  [ Show archived ideas… ]   [ Filter: type to search… ]   Sort: [ Manual ▾ ] │
│                                                              [ ✦ Advisor ]  [ + Idea ] │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ Themes        │  ─── ● Career ──────                                                   │
│  All (47)     │  ┌──────────────────────────────────────────────────────────────────┐ │
│  ● Career (5) │  │ ⋮⋮ ▸ Build Bearing v2  #bearing-v2  → goal    [ Edit ] [ ⚠ Delete ] │ │
│  ● Health (8) │  └──────────────────────────────────────────────────────────────────┘ │
│  ● Learning(4)│  ┌──────────────────────────────────────────────────────────────────┐ │
│  ● Personal   │  │ ⋮⋮ ▸ Migrate to Tauri  #tauri        —         [ Edit ] [ ⚠ Delete ] │ │
│   (12)        │  └──────────────────────────────────────────────────────────────────┘ │
│  Untagged(18) │                                                                        │
│               │  ─── ● Health ──────                                                   │
│ ─────────     │  ┌──────────────────────────────────────────────────────────────────┐ │
│ Goal-linked   │  │ ⋮⋮ ▾ Run a 10k         #10k          → goal    [ Edit ] [ ⚠ Delete ] │ │
│  (12)         │  │                                                                    │ │
│ Unlinked (35) │  │      Couch-to-10k over 12 weeks. Plan: 3 runs/week, one long     │ │
│               │  │      run on Sunday, race-pace test in week 8. Race day Jun 14.   │ │
│               │  │      (Markdown · auto-saves)                                       │ │
│               │  │                                                                    │ │
│               │  │                                              [→ Promote to Goal ] │ │
│               │  └──────────────────────────────────────────────────────────────────┘ │
│               │  ┌──────────────────────────────────────────────────────────────────┐ │
│               │  │ ⋮⋮ ▸ Try cold plunges  #cold         —         [ Edit ] [ ⚠ Delete ] │ │
│               │  └──────────────────────────────────────────────────────────────────┘ │
│               │                                                                        │
│               │  ─── ● Learning ──────                                                 │
│               │  ┌──────────────────────────────────────────────────────────────────┐ │
│               │  │ ⋮⋮ ▸ Learn Korean (A2) #korean       —         [ Edit ] [ ⚠ Delete ] │ │
│               │  └──────────────────────────────────────────────────────────────────┘ │
│               │                                                                        │
│               │  ─── Untagged ──────                                                   │
│               │  ┌──────────────────────────────────────────────────────────────────┐ │
│               │  │ ⋮⋮ ▸ Renovate kitchen  #kitchen      —         [ Edit ] [ ⚠ Delete ] │ │
│               │  └──────────────────────────────────────────────────────────────────┘ │
└───────────────┴────────────────────────────────────────────────────────────────────────┘
```

Notes:

- **Two-pane layout**: left sidebar (browse) + right list (content). Sidebar lists themes with counts, plus separators for `Goal-linked / Unlinked` structural filters. The sidebar is **single-select** — click `Health` → main list filters to Health ideas; click `All` to reset. No multi-select, no boolean operators; filter logic stays trivial.
- **Top filter input** (text search) matches title + notes. ANDs with the selected sidebar entry when both are set (e.g., "Health ideas whose text matches *running*"). Two simple rules, predictable behaviour.
- **No `labels[]` field on the Idea entity.** Tag is the only metadata that touches ideas in the funnel; cross-theme grouping by user-defined labels was considered and intentionally not added. To find related ideas across themes, use text search or ask the advisor ("show me my AI-related ideas") — the advisor can read titles and notes and propose a list. This keeps the model simple (one organisational concept, the theme) without sacrificing the find-related use case.
- **No standalone "Recent" section.** Recency is served by the Sort dropdown (`Recently edited`). A separate Recent section was considered and dropped because it duplicates rows (a recent idea would appear in both Recent and its theme section), forcing the user to mentally resolve "this is the same idea twice." The sort dropdown handles the recency intent without duplication and preserves theme grouping as the spine.
- **Idea cards have a single outer border** — no nested textarea border when expanded. Expanded notes flow as plain text inside the card. Reorderable per guideline #19 (drag handle always visible, whether the card is collapsed or expanded).
- **`Sort: [ Manual ▾ ]` dropdown** in the header. Options: **Manual** (canonical user order — default) · **Recently added** · **Recently edited** · **Alphabetical**. Non-manual sorts are read-only views; switching back to Manual restores the user's canonical order. Detailed behavior:

  | Question | Answer |
  |---|---|
  | Does the sort selection persist across app sessions? | **Yes.** Stored alongside other tab-level preferences; reopening the app restores the last-used sort. Per-tab — Ideation's sort is independent from any future sort dropdowns on other tabs. |
  | Does the active-view sort apply inside the archive view? | **No.** The archive view (`[ Show archived ideas… ]`) has its own independent sort, defaulted to *archived-date descending* (most recently archived first) — almost always what the user wants when looking back. Switching the active view's sort does not affect the archive view's, and vice versa. |
  | What happens to scroll position when the sort changes? | **Anchor-based preservation.** The currently-focused (or, if none, the top-most-visible) idea card stays visible after the reflow. If that card no longer exists in the new ordering (e.g., filtered out by a sidebar entry), scroll resets to the top. Reset-to-top on first load is also fine; preservation matters mid-session. |
  | Can the user drag-reorder ideas while a non-Manual sort is active? | **No.** The `⋮⋮` drag handle is disabled (grayed) when sort ≠ Manual. Attempting to drag shows an inline hint: *"Switch sort to Manual to reorder."* This prevents the surprising "I dragged but nothing happened" outcome of letting drag-and-drop fight a derived sort. |
  | Where does a newly created idea appear? | **In Manual order**: appended at the bottom of its theme section. In any other sort, it appears according to that sort's rule (e.g., top of section when `Recently added`). The underlying Manual order is updated regardless of the current view sort. |
  | Does each sidebar entry remember its own sort? | **No.** One sort per tab, applied to whichever sidebar entry is currently selected. Tracking per-entry sort would be over-engineered for personal scale. |
- **`[ Show archived ideas… ]`** in the header replaces the main list with the archived-ideas view (see § 7.8 for the archive view pattern). Tab-level button, not row-level.
- **Theme rule headers** use the same `── ● Theme ──` style as the rest of the app, with theme-color dots. **Untagged** is a permanent section because ideas can legitimately be theme-less per the funnel.
- **Per-row `[ Edit ]` and `[ ⚠ Delete ]` buttons** — same Edit / Delete actions used across the app, full labels (no abbreviation). Destructive styling per guideline #9; Delete opens § 2.4.
- **Collapsed row (`▸`)** shows title, tag chip, goal-link indicator, action buttons. Max scan density.
- **Expanded row (`▾`)** drops in a live, auto-saving inline notes block — read and edit in place, no modal. Markdown supported. Only one row is expanded at a time by default; clicking another `▸` collapses the previous.
- **`[ Edit ]` dialog (§ 3.2) is reserved for structural changes** — title, theme, tag rename. Notes themselves never need the dialog.
- **`[→ Promote to Goal ]` appears on the expanded card**, not on every collapsed row, since it's contextual to the idea you're focused on.
- **`→ goal` chip** (or `→ N goals` for the rare multi-link case) signals "this idea has been committed via at least one goal." The arrow conveys the directionality — the idea points to a goal that consumes it. A `—` in the same slot means unlinked. Useful at-a-glance signal for "small idea ready to be archived" vs. "still pure ideation."
- **Clicking the `→ goal` chip:** single-link case (`→ goal`) navigates straight to the Goals tab and scrolls to the linked goal. Multi-link case (`→ N goals`) opens a small popover listing all linked goals (each clickable to navigate). Hovering the chip shows the same list as a tooltip without committing to navigation. Keyboard equivalent: focus the chip and `Enter` (single-link navigates, multi-link opens the popover with Tab cycling between goals).
- **Single `[ + Idea ]`** in the tab header creates an idea with the currently-selected theme pre-filled (if a theme sidebar entry is selected; otherwise unaffiliated). No per-section `+ Idea` button (extra chrome inside the list).
- **Advisor integration**: `find related` is the canonical advisor query for grouping intent the label-less model doesn't address structurally. The advisor reads titles + notes + tags and proposes a list of ideas with a `[ Apply → Open this set ]` action that filters the main view temporarily.

### 3.2 Idea editor dialog

```
┌─ Edit Idea ──────────────────────────────────────────────────[ × ]┐
│                                                                    │
│  Title *                                                           │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │ Build Bearing v2                                              │ │
│  └──────────────────────────────────────────────────────────────┘ │
│                                                                    │
│  Theme  (optional — assigning gives color & grouping)              │
│  ┌──────────────┐ ▾                                                │
│  │ ● Career     │                                                  │
│  └──────────────┘                                                  │
│                                                                    │
│  Tag *                                                             │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │ bearing-v2                                                    │ │
│  └──────────────────────────────────────────────────────────────┘ │
│  Each idea maps 1:1 to a tag. The tag becomes its Kanban board.    │
│                                                                    │
│  Detailed thoughts                                                 │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │ Rewrite the planning funnel with 5 tabs:                      │ │
│  │   Themes → Ideation → Goals → Focus → Execution               │ │
│  │ Routines live under themes. Eisenhower sorting is preserved.  │ │
│  │                                                                │ │
│  │ (Markdown supported)                                           │ │
│  └──────────────────────────────────────────────────────────────┘ │
│                                                                    │
│  [ Archive idea ]    ← parks the idea (hidden from default Ideation │
│                        view; recoverable via Show archived ideas…) │
│                                                                    │
│  ┌─ Danger zone ──────────────────────────────────────────────┐   │
│  │  [ ⚠ Delete idea ]                                          │   │
│  └────────────────────────────────────────────────────────────┘   │
│                                                                    │
│   [ Promote to Goal → ]                  [ Cancel ]   [ Save ]     │
└────────────────────────────────────────────────────────────────────┘
```

#### Tag-field UX

The Tag field has special handling because the tag is structural (it identifies the idea's Kanban board) and must be unique across all ideas. The user types a desired tag; the field normalizes it for display and validates on blur and on Save.

**Normalization rule:** lowercase, spaces replaced with hyphens, non-alphanumeric characters (other than hyphen and underscore) stripped. Shown as a "Will be saved as:" preview below the input while the user types if normalization changes the input.

**Validation rules:** tag must be (a) non-empty, (b) unique across all ideas (active and archived), (c) not the reserved string `routine`.

Four states the field can render:

```
Normal — input is non-empty, unique, valid:
│  Tag *                                                             │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │ bearing-v2                                                    │ │
│  └──────────────────────────────────────────────────────────────┘ │
│  Each idea maps 1:1 to a tag. The tag becomes its Kanban board.    │

Normalization preview — input was typed with spaces or caps:
│  Tag *                                                             │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │ Bearing v2                                                    │ │
│  └──────────────────────────────────────────────────────────────┘ │
│  Will be saved as:  bearing-v2                                     │
│  Each idea maps 1:1 to a tag. The tag becomes its Kanban board.    │

Collision — normalized form matches another idea's tag:
│  Tag *                                                             │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │ bearing-v2                                                    │ │
│  └──────────────────────────────────────────────────────────────┘ │
│  ⚠ This tag is already used by "Build Bearing v2".                │
│    Pick a different tag — each idea owns a unique tag.             │

Reserved — normalized form is "routine":
│  Tag *                                                             │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │ Routine                                                       │ │
│  └──────────────────────────────────────────────────────────────┘ │
│  ⚠ "routine" is reserved — it identifies the Routines board.       │
│    Try something more specific like "morning-routine".             │
```

Notes on the Tag field:

- **Save is disabled** while the field is in `Collision` or `Reserved` state. (Empty also blocks save — it's a required field.)
- **Validation runs on blur and on Save attempt**, not on every keystroke. The user finishes typing without being scolded mid-word.
- **The "Will be saved as:" preview is informational, not a warning.** It appears only when normalization changes the input — if the user types `bearing-v2` directly, no preview is shown.
- **Collision check covers both active and archived ideas.** An archived idea still owns its tag; you can't claim it without unarchiving and renaming the archived one first. The error names the colliding idea so the user can decide whether to unarchive-and-pick-a-new-tag or just choose a different tag now.
- **Tag rename:** when an existing idea's tag is renamed (changing the field on an idea that already has one), the underlying board re-keys to the new tag — task tags update, the Boards strip chip updates, anything referencing the tag (e.g., a goal's `linked_idea_ids` chain that resolves via tag) follows automatically. The funnel doc covers this in the linking rules; the editor doesn't need to warn unless rename creates a new collision.
- **No autocomplete dropdown on this field.** Autocomplete suggests *picking* an existing value; here every valid value is *new*. The user creates; the validator warns. The companion picker that *consumes* existing tags lives in the Task creation dialog (§ 6.2) and on the Theme dropdown for ideas — see those surfaces.

Notes:

- **Tag is required and validated** — uniqueness + reserved-name + normalization detailed above. It's the linking key downstream.
- **Promote to Goal** is a tertiary action at the bottom-left, distinguished from Save/Cancel — it closes this dialog and opens the Goal editor pre-filled.
- **Detailed thoughts is a tall textarea** with Markdown — fits user need to write rich notes per idea.
- **Theme is optional** to support raw, unsorted brainstorming; assigning later is one click.
- **`[ Archive idea ]`** is the canonical "park this idea" gesture — a single click moves the idea out of the active Ideation view without deleting it. Lives *outside* the Danger zone because archive is reversible (recoverable via `[ Show archived ideas… ]` on § 3.1) — it's a state change, not destruction. Delete remains the destructive option in the Danger zone for irreversible removal.

---

## 4. Goals tab

### 4.1 Goals view

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│  Goals  [ Show archived goals… ]                       [ ✦ Advisor ]  [ + Goal ] │
├──────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  ─── ● Health ─────────────────────────────────────                              │
│                                                                                  │
│  ┌────────────────────────────────────────────────────────────────────────────┐ │
│  │ ⋮⋮ ▸ Run a 10k by Jun 2026          Q2 2026   [ Edit ] [ Check out ] [⚠]    │ │
│  │     Linked: #10k                                                            │ │
│  │     KR1  Run 5k under 28 min            ●●●○   73%          [ Check-in ]    │ │
│  │     KR2  Complete 12-week training plan ●●○○   50%          [ Check-in ]    │ │
│  │     KR3  Average 25 km/week running     ●●●●  100% ✓        [ Check-in ]    │ │
│  │     KR4  Sub-60-min 10k race day        ○ Not done           [ Check-in ]    │ │
│  └────────────────────────────────────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────────────────────────────────────┐ │
│  │ ⋮⋮ ▸ Reduce body fat to 15%         Q2 2026   [ Edit ] [ Check out ] [⚠]    │ │
│  │     Linked: (theme-only — no idea)                                          │ │
│  │     KR1  ...                                                                 │ │
│  └────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                  │
│  ─── ● Career ─────────────────────────────────────                              │
│                                                                                  │
│  ┌────────────────────────────────────────────────────────────────────────────┐ │
│  │ ⋮⋮ ▸ Ship Bearing v2 by Q3 2026     Q3 2026   [ Edit ] [ Check out ] [⚠]    │ │
│  │     Linked: #bearing-v2                                                     │ │
│  │     KR1  ...                                                                 │ │
│  └────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                  │
└──────────────────────────────────────────────────────────────────────────────────┘
```

Notes:

- **Goals grouped under their theme**, with a colored rule line that doubles as a section header. Mirrors the Themes/Ideation grouping pattern so the user keeps the same mental map.
- **Goal rows are individually bordered cards**, reorderable within each theme section per guideline #19 (manual priority ordering).
- **Per-row buttons**: `[ Edit ]` opens the Goal editor (§ 4.2). `[ Check out ]` opens the Goal check-out dialog (§ 4.4) — the deliberate end-of-cycle gesture (outcome + retro + archive). `[ ⚠ Delete ]` opens the shared delete confirmation (§ 2.4) for goals you want to remove without going through check-out (e.g., abandoned mid-flight without reflection).
- **`[ Show archived goals… ]`** in the tab header opens the archived-goals view (per § 7.6 archive view pattern). Tab-content replacement, not modal.
- **No filters in v1** — theme grouping is provided by the section headers; time-horizon filters were dropped because they overlapped. If filtering is needed later, add a single `Current ▾ / All` scope toggle next to `[ + Goal ]`; do not reintroduce dual axes.
- **Per-KR progress visual depends on KR type:**
  - **Numeric KRs** use a 4-dot ramp (`●●●○`) plus the numeric percentage (e.g. `73%`) — works in plain text, doesn't depend on color, and a `✓` marker appears on KRs at 100%.
  - **Boolean KRs** render as `○ Not done` or `✓ Done` — no dot ramp (a binary isn't progressive), no percentage. The same visual vocabulary (`○` empty, `✓` filled) carries the at-a-glance "did it happen" signal without misrepresenting progress.
- **Linked tag chip** (`#10k`) is clickable and jumps to the Execution board.
- **"theme-only — no idea"** is rendered explicitly, not hidden — this state is legitimate (per the funnel concept) and should look intentional.

### 4.2 Goal editor dialog

```
┌─ Edit Goal ──────────────────────────────────────────────────[ × ]┐
│                                                                    │
│  Theme *                                                           │
│  ┌──────────────┐ ▾                                                │
│  │ ● Health     │                                                  │
│  └──────────────┘                                                  │
│                                                                    │
│  Objective *                                                       │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │ Run a 10k by Jun 2026                                         │ │
│  └──────────────────────────────────────────────────────────────┘ │
│                                                                    │
│  Time horizon *                                                    │
│   Quarter ▾    Q2 2026 ▾                                           │
│                                                                    │
│  Linked ideas  (typically 1; may be 0)                             │
│  ┌────────────────────────────────────────────────────────────┐   │
│  │  #10k  [×]                                                  │   │
│  │  [ + Link idea… ]                                           │   │
│  └────────────────────────────────────────────────────────────┘   │
│                                                                    │
│  Key results *                                          [ + KR ]   │
│  ┌────────────────────────────────────────────────────────────┐   │
│  │  ⋮⋮ 1.  Run 5k under 28 min                            [×]  │   │
│  │        Numeric ▾   Target: 28   Unit: min   Direction: ↓    │   │
│  │  ⋮⋮ 2.  Complete 12-week training plan                 [×]  │   │
│  │        Numeric ▾   Target: 12   Unit: weeks Direction: ↑    │   │
│  │  ⋮⋮ 3.  Average 25 km/week running                     [×]  │   │
│  │  ⋮⋮ 4.  Sub-60-min 10k race day                        [×]  │   │
│  │        Boolean ▾   Done: no                                 │   │
│  └────────────────────────────────────────────────────────────┘   │
│                                                                    │
│  ┌─ Danger zone ──────────────────────────────────────────────┐   │
│  │  [ ⚠ Delete goal ]                                          │   │
│  └────────────────────────────────────────────────────────────┘   │
│                                                                    │
│                                       [ Cancel ]   [ Save ]        │
└────────────────────────────────────────────────────────────────────┘
```

Notes:

- **KRs support both numeric and boolean types** — direction (↑ grow / ↓ shrink) avoids ambiguity for "lower is better" KRs.
- **KRs are reorderable** per guideline #19. The numeric prefixes (`1.`/`2.`/`3.`/`4.`) are *display-only* — they reflect current position, not stored IDs, and auto-renumber on drop. KR check-in history stays attached to the underlying KR via its real ID, not its position number, so reordering never severs history.
- **Linked ideas is a chip-list** — `[×]` removes a link; `[+ Link idea…]` opens an inline picker. The picker shape matches the Task creation Tag picker (§ 6.2): theme-color dot + tag + idea title per row, type-ahead filter on both tag and title, single-select per pick (the user clicks `[+ Link idea…]` once per link if linking multiple ideas to one goal). Filter defaults to ideas matching the goal's selected theme (matches first); ideas from other themes appear below a divider so cross-theme links are reachable but not pushed.
- **Pre-filled when reached via "Promote to Goal" from Ideation** — theme inherited from the idea, the idea auto-linked, objective derived from the idea title (editable).
- **Time horizon defaults to current quarter** to avoid an empty required field.

### 4.3 KR check-in dialog

The dialog renders one of two variants depending on the KR's type.

#### Numeric KR variant

```
┌─ KR Check-in ────────────────────────────────────────────────[ × ]┐
│                                                                    │
│   Goal:  Run a 10k by Jun 2026                                     │
│   KR:    Complete 12-week training plan         Numeric            │
│                                                                    │
│   Progress                                                         │
│    0 ─────────●────────── 12       6 / 12 weeks  (50%)             │
│                                                                    │
│   Numeric value           Unit                                     │
│   ┌────────┐              weeks                                    │
│   │   6    │                                                       │
│   └────────┘                                                       │
│                                                                    │
│   Note  (optional)                                                 │
│   ┌──────────────────────────────────────────────────────────┐    │
│   │ Halfway through. Pace is steady; long runs feel easier.  │    │
│   │                                                            │    │
│   └──────────────────────────────────────────────────────────┘    │
│                                                                    │
│   ─── History ─────────────────────────────────────────────────    │
│   Apr 30  4 / 12 (33%)  — "First long run done"                    │
│   Apr 16  2 / 12 (17%)                                             │
│                                                                    │
│                                       [ Cancel ]   [ Save ]        │
└────────────────────────────────────────────────────────────────────┘
```

#### Boolean KR variant

For binary KRs ("did this happen, yes or no?") the slider is replaced with a two-option toggle. No percentage, no numeric input — the entity is binary, the UI is binary.

```
┌─ KR Check-in ────────────────────────────────────────────────[ × ]┐
│                                                                    │
│   Goal:  Run a 10k by Jun 2026                                     │
│   KR:    Sub-60-min 10k race day                Boolean            │
│                                                                    │
│   Status                                                           │
│    ( ) Not done    (•) Done                                        │
│                                                                    │
│   Note  (optional)                                                 │
│   ┌──────────────────────────────────────────────────────────┐    │
│   │ Finished at 58:42 — sub-60 hit on race day.              │    │
│   │                                                            │    │
│   └──────────────────────────────────────────────────────────┘    │
│                                                                    │
│   ─── History ─────────────────────────────────────────────────    │
│   Jun 14  ✓ Done    — "Finished at 58:42 — sub-60 hit on race day."│
│   May 28  ○ Not done                                                │
│                                                                    │
│                                       [ Cancel ]   [ Save ]        │
└────────────────────────────────────────────────────────────────────┘
```

Notes:

- **Type chip** (`Numeric` / `Boolean`) appears next to the KR title so the user sees up front which variant they're looking at — never a surprise.
- **Numeric variant**: slider + numeric input are bound — accessibility-friendly, both keyboard reachable.
- **Boolean variant**: just two radio options. Toggling between `Not done` and `Done` is the entire state space — no slider, no numeric field, no percentage. Each toggle change + Save is its own history entry, so a KR that flipped to Done and then needed reverting is reflected accurately in the trend.
- **History is read-only** at the bottom so the user can see drift trend before logging the next data point. Numeric history shows value/percentage; boolean history shows `✓ Done` / `○ Not done`.
- **Single-KR scope** — one dialog per check-in keeps the input focused; multi-KR check-in via repeated invocation is fine.
- **The variant is determined by the KR's `kr_type` field** set in the Goal editor (§ 4.2) — the check-in dialog can't change the type, it only records progress according to it.

### 4.4 Goal check-out dialog

Inspired by Perdoo's OKR close-out flow. A deliberate end-of-cycle gesture: rate the outcome, capture per-KR status, write a brief retrospective, archive — and optionally seed a follow-up goal. Triggered by the `[ Check out ]` button on each goal row in the Goals view (§ 4.1). Available any time, not gated on time-horizon-pass.

```
┌─ Check out goal:  "Run a 10k by Jun 2026" ─────────────────────[ × ]┐
│                                                                      │
│  Overall outcome *                                                   │
│   ( ) Achieved           — all key results hit                       │
│   (•) Partially achieved — some hit, some didn't                     │
│   ( ) Missed             — most/all KRs short of target              │
│   ( ) Abandoned          — deprioritized, not pursued                │
│                                                                      │
│  Per-KR status   (labels auto-inferred from progress;                │
│                   click a chip to override)                          │
│                                                                      │
│   KR1  Run 5k under 28 min                ●●●● 100%   ✓ Hit          │
│        ┌────────────────────────────────────────────────────────┐   │
│        │ Hit 27:30 in week 10. (note · optional · Markdown)      │   │
│        └────────────────────────────────────────────────────────┘   │
│                                                                      │
│   KR2  Complete 12-week training plan     ●●●○  73%   ⚠ Partial      │
│        ┌────────────────────────────────────────────────────────┐   │
│        │ Missed two weeks in March due to flu.                   │   │
│        └────────────────────────────────────────────────────────┘   │
│                                                                      │
│   KR3  Average 25 km/week running         ●●●● 100%   ✓ Hit          │
│        (no note)                                                     │
│                                                                      │
│   KR4  Sub-60-min 10k race day            ○ Not done  ✗ Missed       │
│        ┌────────────────────────────────────────────────────────┐   │
│        │ Rainy race day, finished at 62 min. Try again Q4.       │   │
│        └────────────────────────────────────────────────────────┘   │
│                                                                      │
│  Retrospective   (optional)                                          │
│   What worked?                                                       │
│   ┌────────────────────────────────────────────────────────────┐    │
│   │ Consistent weekly runs. Early-morning long runs helped.     │    │
│   └────────────────────────────────────────────────────────────┘    │
│                                                                      │
│   What didn't?                                                       │
│   ┌────────────────────────────────────────────────────────────┐    │
│   │ Race-day pacing strategy needed adjustment for weather.     │    │
│   └────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  Closing actions                                                     │
│  ☑  Archive this goal                                                │
│  ☐  Create a follow-up goal pre-filled with missed/partial KRs       │
│                                                                      │
│                                  [ Cancel ]   [ Check out goal ]     │
└──────────────────────────────────────────────────────────────────────┘
```

Notes:

- **Outcome is required** — the four-option radio captures the qualitative judgment that a quantitative KR ladder alone can't (e.g., partially-hit KRs but the goal was still meaningful, or all-KRs-hit but the goal felt hollow).
- **Per-KR labels auto-inferred** from KR type and progress:
  - **Numeric KRs**: `≥100% = ✓ Hit`, `50–99% = ⚠ Partial`, `<50% = ✗ Missed`.
  - **Boolean KRs**: `Done = ✓ Hit`, `Not done = ✗ Missed`. **No `⚠ Partial`** — a boolean has no intermediate state, so the auto-infer never emits Partial for boolean KRs.
  - The user can **override any auto-inferred label** by clicking the chip (`✓ Hit` ↔ `⚠ Partial` ↔ `✗ Missed`) when the metric tells a misleading story — e.g., a numeric KR hit 100% but the underlying spirit wasn't met, or a boolean KR was achieved by accident rather than design. Boolean KRs can also be manually labeled `⚠ Partial` via override (the rule only constrains *auto-infer*, not the user's final judgment).
- **Per-KR notes** are individually optional. The textarea appears under each KR row, collapsed if empty; click to expand.
- **What-worked / What-didn't** retro fields are the Perdoo-style structured reflection. Both optional. Saved as part of the goal's check-out record.
- **Archive checkbox default *on*.** Check-out is a closing gesture; rarely does the user want the goal to stay active afterward.
- **Carry-forward checkbox default *off*.** When checked, Save creates a new draft goal in the Goal editor (§ 4.2) pre-filled with:
  - **Theme**: inherited from the checked-out goal.
  - **Linked ideas**: inherited verbatim.
  - **Time horizon**: next quarter relative to the checked-out goal's horizon (e.g. Q2 → Q3).
  - **Objective**: copied from the checked-out goal with a prefix "Continue: " — editable, often rewritten.
  - **Key results**: copied **only those labeled ⚠ Partial or ✗ Missed** (Hit KRs are excluded — they're achieved). Numeric KRs reset progress to 0; boolean KRs reset to `Not done`. KR notes from the check-out are dropped (those were retrospective; the new goal starts fresh).
  - **Linked carry-forward record**: the new goal's metadata stores a back-reference to the originating goal's `GoalCheckout` ID, so future reflection can trace the iteration chain.
  The Goal editor opens with these pre-fills; the user reviews and clicks `[ Save ]` to commit, or `[ Cancel ]` to abandon the carry-forward (the original check-out still completes regardless).
- **Saves a `GoalCheckout` entity** attached to the goal: outcome, per-KR statuses + notes, what-worked/didn't fields, timestamp. The check-out record stays with the goal in its archived form, so future reflection ("how did Q2 goals go?") works without rummaging.
- **Cancel preserves no state.** Unlike Idea notes which auto-save inline, the check-out dialog is an explicit ceremony — partial completion is discarded on Cancel. The intent: check-out is a single deliberate sitting, not a draft.

---

## 5. Focus tab

### 5.1 Focus view

The Focus tab has four view modes, switched via tabs at the top:

- **Day** *(editable)* — pick today's tags and routines. The only mode that writes focus state.
- **Week / Month / Year** *(read-only overviews)* — see what was focused over the period. Click any day in these views to drill back into Day mode for that date.

Daily focus is always *per-day*; the larger views aggregate, never replace, that grain.

#### 5.1.a Day mode

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  Focus  [ Day* ] [ Week ] [ Month ] [ Year ]                  [ ✦ Advisor ]  │
├──────────────────────────────────────────────────────────────────────────────┤
│              ‹  Mon, May 11 2026 (Today)  ›        [ Today ]                 │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Pick what gets attention today. Tags activate boards;                       │
│  routines spawn tasks on the Routines board.                                  │
│                                                                              │
│  ─── ● Health ─────────────────────────────────────────────────────────────  │
│   TAGS                              ROUTINES                                 │
│   ┌─────────────┐                   ┌──────────────────────────────┐        │
│   │ ☐  10k      │                   │ ☑  Gym  (3×/week, M·W·F)     │        │
│   └─────────────┘                   │ ☑  Meditation  (daily)       │        │
│                                     │ ☐  Sleep before 23:00        │        │
│                                     │ [ + Routine ]        │        │
│                                     └──────────────────────────────┘        │
│                                                                              │
│  ─── ● Career ─────────────────────────────────────────────────────────────  │
│   TAGS                              ROUTINES                                 │
│   ┌─────────────┐                   ┌──────────────────────────────┐        │
│   │ ☑ bearing-v2│                   │ (no routines)                │        │
│   └─────────────┘                   │ [ + Routine ]        │        │
│                                     └──────────────────────────────┘        │
│                                                                              │
│  ─── ● Learning ───────────────────────────────────────────────────────────  │
│   TAGS                              ROUTINES                                 │
│   ┌─────────────┐                   ┌──────────────────────────────┐        │
│   │ ☐  korean   │                   │ ☐  Anki review (daily)       │        │
│   └─────────────┘                   │ [ + Routine ]        │        │
│                                     └──────────────────────────────┘        │
│                                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│  TODAY:  ● bearing-v2   ● Gym   ● Meditation     [ Check out day ]  [ Open Execution → ] │
└──────────────────────────────────────────────────────────────────────────────┘
```

When the visible day isn't today, the navigator shows a relative chip and the jump button still reads `[ Today ]`:

```
│              ‹  Wed, May 6 2026 (5 days ago)  ›        [ Today ]             │
│              ‹  Wed, May 13 2026 (in 2 days)  ›        [ Today ]             │
```

#### 5.1.b Week mode  *(read-only)*

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  Focus  [ Day ] [ Week* ] [ Month ] [ Year ]                  [ ✦ Advisor ]  │
├──────────────────────────────────────────────────────────────────────────────┤
│           ‹  Week of May 11–17 2026 (This week)  ›    [ This week ]          │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   Mon 11        Tue 12        Wed 13        Thu 14        Fri 15  ...        │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐           │
│  │ today*   │ │          │ │          │ │          │ │          │           │
│  │ ●bearing │ │ ●bearing │ │ ●korean  │ │ ●bearing │ │ —        │           │
│  │ ●Gym     │ │          │ │ ●Med     │ │ ●Gym     │ │          │           │
│  │ ●Med     │ │ ●Med     │ │          │ │          │ │          │           │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘           │
│                                                                              │
│  Coverage:  ●Career 3/7   ●Health 4/7   ●Learning 1/7   none 1/7             │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

Each day card lists the tags and routines focused that day, theme-colored. Today is marked. Clicking a card → drills into Day mode for that date. The relative chip in the navigator updates: `(This week)` / `(Last week)` / `(Next week)` / `(3 weeks ago)`.

#### 5.1.c Month mode  *(read-only)*

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  Focus  [ Day ] [ Week ] [ Month* ] [ Year ]                  [ ✦ Advisor ]  │
├──────────────────────────────────────────────────────────────────────────────┤
│                ‹  May 2026 (This month)  ›        [ This month ]             │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│    Mon  Tue  Wed  Thu  Fri  Sat  Sun                                         │
│   ┌────┬────┬────┬────┬────┬────┬────┐                                       │
│   │    │    │    │  1 │  2 │  3 │  4 │                                       │
│   │    │    │    │ ●● │ ●  │  — │  — │                                       │
│   ├────┼────┼────┼────┼────┼────┼────┤                                       │
│   │  5 │  6 │  7 │  8 │  9 │ 10 │ 11*│   ← * = today                         │
│   │ ●● │ ●  │ ●●●│ ●● │ ●  │ ●  │ ●●●│                                       │
│   ├────┼────┼────┼────┼────┼────┼────┤                                       │
│   │ 12 │ 13 │ 14 │ 15 │ 16 │ 17 │ 18 │                                       │
│   │    │    │    │    │    │    │    │                                       │
│   ├────┼────┼────┼────┼────┼────┼────┤                                       │
│   │ 19 │ ...                                                                  │
│   └────┴── ...                                                                │
│                                                                              │
│  Coverage:  ●Career 12   ●Health 18   ●Learning 4   none 7                   │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

Calendar grid. Each cell shows the day number and a stack of small theme-colored dots (one per theme focused that day). Click any cell → drills into Day mode for that date. Relative chip: `(This month)` / `(Last month)` / `(Next month)` / specific name.

#### 5.1.d Year mode  *(read-only)*

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  Focus  [ Day ] [ Week ] [ Month ] [ Year* ]                  [ ✦ Advisor ]  │
├──────────────────────────────────────────────────────────────────────────────┤
│                  ‹  2026 (This year)  ›       [ This year ]                  │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│        1  2  3  4  5  6  7  8  9 10 11 12 13 14 15 …  29 30 31               │
│   Jan  ●  ●  ●  —  ●  ●  ●  ●  ●  ●  ●  ●  ●  ●  ● …                        │
│   Feb  ●  ●  ●  ●  —  —  ●  ●  ●  ●  ●  ●  ●  ●  ● …  ··                    │
│   Mar  ●  ●  ●  ●  ●  ●  ●  ●  ●  ●  ●  ●  ●  ●  ● …                        │
│   Apr  ●  ●  ●  ●  ●  ●  ●  ●  ●  ●  ●  ●  ●  ●  ● …          ··            │
│   May  ●  ●  ●  ●  ●  ●  ●  ●  ●  ●  ●* ─  ─  ─  ─ …                        │
│   Jun  ─  ─  ─  ─  ─  ─  ─  ─  ─  ─  ─  ─  ─  ─  ─ …                        │
│   …                                                                          │
│   Dec  ─  ─  ─  ─  ─  ─  ─  ─  ─  ─  ─  ─  ─  ─  ─ …                        │
│                                                                              │
│   * = today    ● = focused (mixed-color blend or rotated)    ─ = unfocused   │
│                                                                              │
│  Coverage:  ●Career 89   ●Health 124   ●Learning 31   none 38   blank 9     │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

Twelve-month × thirty-one-day grid — same shape as `tmp/Bearing`'s mid-term calendar view, repurposed as the year overview here. Each cell is one day; color encodes focus theme(s). Click a cell → drills into Day mode for that date. Relative chip: `(This year)` / `(Last year)` / `(Next year)` / `(2024)`.

Notes (across all four modes):

- **Editing is single-grain.** Only Day mode writes focus state. The larger views are intentionally read-only summaries — you can always click into a day to edit. This keeps "where can I change my plan?" unambiguous.
- **Mode tabs at top of the view** (not the app shell) — they're a Focus-internal scope choice, not a navigation level.
- **Three labels at every scale:**
  1. **Absolute** in the navigator title (`Mon, May 11 2026` / `Week of May 11–17 2026` / `May 2026` / `2026`).
  2. **Relative chip** appended in parentheses (`(Today)` / `(This week)` / `(Last month)` / `(in 2 days)` / `(3 weeks ago)`).
  3. **Jump-back button** matching the active mode (`[ Today ]` / `[ This week ]` / `[ This month ]` / `[ This year ]`).
  This way the user always knows the absolute period AND how far they've stepped from "now."
- **Today is always marked** in Week/Month/Year views with a `*` glyph or visual emphasis on the cell, so it's findable without re-orienting.
- **Coverage strip** at the bottom of every overview mode summarizes theme balance for the visible period. This is the closest the Focus tab gets to analytics — it's the one place where balance feedback (per the funnel discussion on Themes) actually pays off.
- **Theme-grouped two-column layout** (Tags | Routines) in Day mode makes the funnel link visible at the point of choice — UX principle #5 from `funnel.md`.
- **Sticky summary bar** at the bottom of Day mode shows the assembled focus and jumps to Execution. Not shown in Week/Month/Year (they're not action surfaces).
- **`[+ Add new routine]` per theme group** in Day mode opens the same Routine editor dialog with theme pre-filled.
- **Empty states are non-blocking** ("(no routines)") — they invite the next action but don't shame the user.
- **Color dot before every selectable** keeps theme provenance visible (per guideline #1).
- **Keyboard:** `D` / `W` / `M` / `Y` switch modes when the Focus tab has focus. `←` / `→` step the visible period at the active grain. `⌘⇧T` jumps to the current period (today / this week / etc.).

---

## 6. Execution tab

### 6.1 Execution view

```
┌────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│  Execution  [ Show archived tasks… ]                       [ Check out day ]   [ ✦ Advisor ]          │
├────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│  Boards:  [ All ]  [● bearing-v2*]  [Routines]                                             [ + Task ]  │
├────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│  ● Career › Goal: Ship Bearing v2 by Q3 2026 › #bearing-v2                                             │
├────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                                        │
│  ┌── ⋮⋮ ▾ Backlog (5) [⋯] ─────┐ ┌── ⋮⋮ ▾ To do (4) [⋯] ─┐ ┌── ⋮⋮ ▾ In progress (1) [⋯]┐ ┌── ⋮⋮ ▾ Done (1) [⋯] ┐│
│  │┌── ▾ ◆ Imp. & Urgent (2)──┐│ │┌──────────────────────┐│ │┌────────────────────────┐│ │┌──────────────────┐││
│  ││┌────────────────────────┐││ ││ ◆ Wireframes doc [⋯] ││ ││ ◆ Themes view    [⋯]   ││ ││ ◆ IA sketch  [⋯] │││
│  │││ Spec funnel       [⋯]  │││ │└──────────────────────┘│ │└────────────────────────┘│ │└──────────────────┘││
│  ││└────────────────────────┘││ │┌──────────────────────┐│ │                          │ │                    ││
│  ││┌────────────────────────┐││ ││ ◆ Color tokens   [⋯] ││ │                          │ │                    ││
│  │││ Migration plan    [⋯]  │││ │└──────────────────────┘│ │                          │ │                    ││
│  ││└────────────────────────┘││ │┌──────────────────────┐│ │                          │ │                    ││
│  │└──────────────────────────┘│ ││ ◆ Logo work      [⋯] ││ │                          │ │                    ││
│  │┌── ▾ ◆ Not Imp. & Urg. (1)┐│ │└──────────────────────┘│ │                          │ │                    ││
│  ││┌────────────────────────┐││ │┌──────────────────────┐│ │                          │ │                    ││
│  │││ Triage stale issues[⋯] │││ ││ ◆ Onboarding flow[⋯] ││ │                          │ │                    ││
│  ││└────────────────────────┘││ │└──────────────────────┘│ │                          │ │                    ││
│  │└──────────────────────────┘│ │                        │ │                          │ │                    ││
│  │┌── ▸ ◆ Imp. & Not Urg. (2)┐│ │                        │ │                          │ │                    ││
│  │└──────────────────────────┘│ │                        │ │                          │ │                    ││
│  └────────────────────────────┘ └────────────────────────┘ └──────────────────────────┘ └────────────────────┘│
│                                                                                                        │
└────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

Glyph legend in the wireframe above:

- `⋮⋮` — column drag handle (reorder columns).
- `▾` / `▸` — fold state (expanded / collapsed) on column headers and on Backlog section headers.
- `(N)` — task count on column headers and section headers.
- `[⋯]` — overflow menu button (different sets per column header vs. task — see below).
- `◆` — section icon, rendered in the section's accent color (each Eisenhower section has its own color; `tmp/Bearing` style).

#### Eisenhower priority lives in Backlog, not "To do"

Three sections — **no Q4**:

1. **Important & Urgent**
2. **Not Important & Urgent**
3. **Important & Not Urgent**

The omitted "Not Important & Not Urgent" quadrant is a forcing function: if a task is neither important nor urgent, it shouldn't be on the board. The omission keeps the Backlog honest.

Section ordering matches "urgency first, then importance" — both urgent buckets above the non-urgent bucket. Sections fold/unfold independently via `▾` / `▸`. Task counts are shown per section.

Tasks in **To do**, **In progress**, and **Done** columns are flat — priority becomes metadata once a task leaves Backlog (it has already been triaged). A small priority chip on the task card can still surface the priority for at-a-glance context (not shown in the compact wireframe above).

#### Collapsed column

When a column is collapsed (`▸`), it shrinks to a narrow vertical strip showing the column name and count, like `tmp/Bearing`'s pattern. Click anywhere on the strip to re-expand.

```
┌── ⋮⋮ ▸ ──┐
│   D      │
│   o      │
│   n      │
│   e      │
│  (1)     │
└──────────┘
```

#### Column overflow menu (`[⋯]` on the column header)

```
┌──────────────────────────────┐
│  Rename column               │
│  ──────────────────────────  │
│  Insert column before        │
│  Insert column after         │
│  ──────────────────────────  │
│  Archive all tasks           │
│  ──────────────────────────  │
│  ⚠ Delete column             │
└──────────────────────────────┘
```

#### Task context menu (right-click or `[⋯]` on a task)

The menu is **state-aware** — it has two variants depending on whether the task is in Backlog or in motion (To do / In progress / Done).

**Backlog task** — full priority controls available:

```
┌──────────────────────────────────────────┐
│  Edit task…                              │
│  ──────────────────────────────────────  │
│  Move to top of section          ⌘⇧↥    │
│  Move to bottom of section       ⌘⇧↧    │
│  Move to top of column                   │
│  Move to bottom of column                │
│  ──────────────────────────────────────  │
│  Move to →   To do                       │
│              In progress                 │
│              Done                        │
│  ──────────────────────────────────────  │
│  Change priority →   Important & Urgent  │
│                      Not Imp. & Urgent   │
│                      Imp. & Not Urgent   │
│  ──────────────────────────────────────  │
│  ⚠ Delete task                           │
└──────────────────────────────────────────┘
```

**Task in To do / In progress / Done** — section moves and priority changes are gone:

```
┌──────────────────────────────────────────┐
│  Edit task…                              │
│  ──────────────────────────────────────  │
│  Move to top of column                   │
│  Move to bottom of column                │
│  ──────────────────────────────────────  │
│  Move to →   Backlog                     │
│              To do                       │
│              In progress                 │
│              Done                        │
│  ──────────────────────────────────────  │
│  ⚠ Delete task                           │
└──────────────────────────────────────────┘
```

**Why the menu shrinks:**

- **Section-related moves are Backlog-only** because sections only exist in Backlog. Showing those entries elsewhere would either be no-ops or pre-setting state for a future move — both bad UX.
- **Change-priority is Backlog-only** because once a task is in motion, priority is no longer so relevant — the triage decision has already been made. To re-triage, send the task back to Backlog (`Move to → Backlog`); its prior priority is preserved as metadata, and you can change it from there.
- **`Move to → Backlog`** therefore acts as the "send back for re-triage" action. The task lands in Backlog under its previously stored priority section.

Notes:

- **Board switcher at the top** — the strip is structurally just **All + per-tag boards**. The model has exactly two kinds of board:

  - **`All`** — always present, leftmost. Synthetic aggregate of every task across every tag.
  - **Per-tag boards** — one board per tag that currently has tasks or is selected in today's Focus. The tag string is the board's identity.

  The values `routine` and `untagged` are **reserved tag strings** that show up as per-tag boards under the same rule as any other tag, just under specific conditions:

  | Tag             | Board chip appears when…                                                                  |
  |-----------------|---------------------------------------------------------------------------------------------|
  | `<any idea-tag>` | The tag is selected in today's Focus (per § 5.1.a).                                       |
  | `routine`       | Today has at least one selected routine spawning tasks, **or** there are in-flight routine-tagged tasks carried over from previous days. |
  | `untagged`      | At least one orphan task exists (tag freed by idea-deletion-without-cascade, per § 2.4). |

  This is one consistent rule — "show the board for a tag when there's something to show" — applied to a fixed-content tag list (idea tags) and two reserved tag strings (`routine`, `untagged`). Active board has the asterisk and full color saturation; inactive boards are dimmed but still visible.
- **Default landing view** is **All** — *unless* the day has a Focus selection (one or more tags selected in § 5.1.a). With a Focus set, Execution opens on the most-recently-active tag board for that day, so the user lands on what they planned to focus on. Switching back to All is one click on its chip.
- **All board specifics:**
  - Every task card shows a small **tag chip** (`#bearing-v2`, `#korean`, `#routine`, `Untagged`) so the user can see source at a glance.
  - Backlog priority sections still apply — Eisenhower is tag-agnostic.
  - `[ + Task ]` from All opens § 6.2 with the Tag dropdown defaulted to "(pick one)" (no implicit board context).
  - Drag between Backlog sections still re-prioritizes tasks regardless of source.
- **`routine`-tagged task lifetime:** completed routine tasks are kept indefinitely in their last-known column (Done by default) — no auto-archive. The `routine` board chip simply hides on days where the board would be empty *and* nothing is in flight; it reappears on the next day a routine is due. History is reachable on whichever future day the chip is present. Same rule applies to `untagged` — its chip hides when there are zero orphan tasks.
- **Funnel context header above the board** (Theme › Goal › Tag) makes lineage explicit, as called out in `funnel.md`. Display-only — the segments are not navigation links; the user moves between layers via tabs. For the reserved tags it adapts: the `routine` board's header reads `Routines · ● Gym · ● Meditation · …` (active routines listed, theme-colored) using `·` as the set separator (per § 7.11's glyph rules); the `untagged` board's header reads `Untagged tasks` since these tasks have no upstream chain. For the All board, the header is `All  ·  every task across every source`.
- **Priority sections live in Backlog**, not "To do" — diverging from `tmp/Bearing`. Rationale: Eisenhower priority is a *triage* decision, and triage happens at intake. Once a task moves into "To do" / "In progress" it's been prioritized; the sub-sections become noise. This also matches the user's mental flow: "decide what matters → pull it into action."
- **Q4 is intentionally absent.** "Not Important & Not Urgent" tasks shouldn't be on the board at all. Keeping the section out forces an honest triage at capture time.
- **Sections are individually bordered cards** inside the Backlog column, each with its own header (chevron + ◆ icon + name + count) and contents. The section border, combined with the section accent color, makes each Eisenhower bucket a visually distinct drop target — the canonical Kanban affordance for "pull from here" when picking the day's work.
- **Section colors come from a small fixed palette** (one per Eisenhower section), independent of theme color. Theme color identifies the *board*; section color identifies the *quadrant within Backlog* via the `◆` icon and the section border. They don't conflict because Backlog is per-board, so a user looking at `#bearing-v2` Backlog sees one theme color outside and three section colors inside.
- **All `tmp/Bearing` Kanban features are preserved**: column folding, section folding (now in Backlog instead of To do), per-column and per-section task counts, column reorder via the `⋮⋮` handle, column rename, insert column before/after, archive-all, column delete. Plus the per-task context menu listed above.
- **Why per-task actions live in a context menu, not as row buttons.** Elsewhere in the app (Themes / Ideation / Goals) every entity row carries explicit `[ Edit ]` / `[ ⚠ Delete ]` buttons. Kanban task cards deliberately don't — they're a different category: visual cards in a spatially-meaningful grid, manipulated primarily by drag. Per-row buttons would clutter narrow Kanban cards, compete with drag affordance, and bloat the card height. Right-click / `[⋯]` context menu is the canonical Kanban-card pattern (Trello, GitHub Projects, Linear all do this) and matches user expectations on this surface. The asymmetry with list-row tabs is intentional — Kanban cards are not list rows.
- **Drag is supported everywhere.** Tasks drag between columns and between sections within Backlog. Columns drag to reorder. Sections do not drag (their order is fixed by the Eisenhower scheme).
- **Counts everywhere** — column header `(N)` and Backlog section header `(N)` — for a glanceable workload signal.
- **Empty sections render as folded by default** with `(0)` count, never disappear — preserves the model and avoids the "where did Q3 go?" confusion.
- **Tasks render as bordered cards** in every column. A border per card gives each task a clear hit-target and a clean drop-target shape — both the canonical Kanban affordances. Inside Backlog the cards are nested inside their section's bordered card; in other columns they sit directly inside the column.
- **Priority chip (`◆`) on task cards in non-Backlog columns** keeps the triage decision visible after the task moves out of Backlog. The chip uses the same accent color as the section header in Backlog, so a card's priority is recognizable at a glance regardless of which column it's in. Cards inside Backlog don't carry the chip — their priority is already conveyed by the section they sit in.
- **Keyboard:** see § 7.4. `1 / 2 / 3` set the Eisenhower quadrant for the focused task; `⌘⇧↑/↓` reorder within a section or column; `⌘⇧→/←` move between columns.

### 6.2 Task creation dialog (batch)

A single dialog session can stage **N tasks** across the three Eisenhower sections of Backlog, then commit them all in one go. Inspired by — and matching the button conventions of — `tmp/Bearing`'s `CreateTaskDialog`. Drafts persist server-side, so closing the dialog never loses queued work.

```
┌─ Create Tasks ────────────────────────────────────────────────────────────────[ × ]┐
│                                                                                     │
│  Title *                                                                            │
│  ┌───────────────────────────────────────────────────────────────────────────────┐ │
│  │                                                                                 │ │
│  └───────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                     │
│  Description                                                                        │
│  ┌───────────────────────────────────────────────────────────────────────────────┐ │
│  │                                                                                 │ │
│  └───────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                     │
│  Tag *                                                                              │
│  ┌──────────────────┐ ▾                                                             │
│  │ ● bearing-v2     │                                                               │
│  └──────────────────┘                                                               │
│                                                                                     │
│  ─────────────────────────────────────────────────────────────────────────────      │
│                                                                                     │
│  ┌── ◆ Imp. & Urgent (2) ──┬── ◆ Not Imp. & Urgent (1) ─┬── ◆ Imp. & Not Urgent (0) ┐│
│  │ [ Prioritize to ⬇ ]     │ [ Prioritize to ⬇ ]        │ [ Prioritize to ⬇ ]       ││
│  │ ──────────────────────  │ ─────────────────────────  │ ────────────────────────  ││
│  │ ⋮⋮ Spec funnel     [×]  │ ⋮⋮ Triage stale iss…  [×]  │                           ││
│  │ ⋮⋮ Migration plan  [×]  │                            │                           ││
│  └─────────────────────────┴────────────────────────────┴───────────────────────────┘│
│                                                                                     │
│  [ Clear All ]                                       [ Close ]      [ Done (3) ]    │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

#### Tag picker — autocomplete combobox

The Tag field consumes existing tags (one per idea — they are not user-typeable here). Click the field to open the dropdown, type to filter, click or press Enter to pick.

```
Closed (collapsed):                          Open (with type-ahead filter):
┌──────────────────┐ ▾                       ┌──────────────────────────────────┐
│ ● bearing-v2     │                         │  Type to filter…                  │
└──────────────────┘                         ├──────────────────────────────────┤
                                             │ ● bearing-v2   Build Bearing v2  │
                                             │ ● 10k          Run a 10k         │
                                             │ ● korean       Learn Korean (A2) │
                                             │ ● pottery      Take pottery cls. │
                                             │ ● cold         Try cold plunges  │
                                             │ ● kitchen      Renovate kitchen  │
                                             └──────────────────────────────────┘
                                                Filtered (after typing "po"):
                                             ┌──────────────────────────────────┐
                                             │  po                               │
                                             ├──────────────────────────────────┤
                                             │ ● pottery      Take pottery cls. │
                                             └──────────────────────────────────┘
```

Notes on the picker:

- **Each row** shows: theme-color dot · tag · idea title. Title is the orientation cue — users remember "the pottery one" before they remember the tag string.
- **Filter matches both tag and idea title.** Typing `pott` or `pottery` finds the same row; typing `class` also finds it (idea title contains "classes").
- **Single-select**, single value commits on click or Enter; dropdown closes immediately.
- **No "create new tag" option** in this dropdown. Tags are owned by ideas; create the idea first in Ideation, then its tag becomes selectable here. If no ideas exist (zero tags available), the dropdown shows: `No tags yet — create an idea first` with a `[ → Ideation ]` link.
- **Routines / Untagged** are not selectable here. The Routines board's tag is reserved and only populated by routine-spawned tasks; Untagged tasks arise only from idea-deletion-with-tasks-preserved (per § 2.4), not from manual creation.
- **Empty state when the typed filter matches nothing**: `No matching tags. Press Esc to clear.` — does not offer to create a new tag (creating a tag means creating an idea, which is a different intent and tab).
- **Keyboard:** `↑` / `↓` walks the list, `Enter` picks the highlighted row, `Esc` closes without committing. Standard combobox affordances.

This picker shape is the **consumer-side counterpart** to the Idea editor's tag *editor* (§ 3.2 Tag-field UX). The two surfaces split responsibilities cleanly: Idea editor creates and validates the unique tag; Task creation picks from existing tags.

#### Flow

1. Type Title / Description, pick Tag (or accept the default).
2. Click `[ Prioritize to ⬇ ]` in one of the three section columns.
   - The current draft is staged into that section's queue and listed below the button.
   - Title and Description fields **clear automatically**, ready for the next task.
   - Tag is **kept** between stagings (typical batch creation works on one board).
3. Repeat for as many tasks as you want.
4. End the session with one of:
   - `[ Done ]` — commits all staged tasks to Backlog, dialog closes.
   - `[ Close ]` — closes without committing; staged tasks persist as drafts and are restored on reopen.
   - `[ Clear All ]` — empties every staged queue. Dialog stays open.

#### Buttons (matching `tmp/Bearing`)

| Button                | Position | Behavior                                                                 |
|-----------------------|----------|--------------------------------------------------------------------------|
| `[ Prioritize to ⬇ ]` | Per quadrant column | Stages the current draft into that section, clears form fields, keeps tag. |
| `⋮⋮` drag handle      | Inline on each staged task | Drag to reposition the task. Drop in the **same column** to reorder within that quadrant; drop in a **different column** to move the task between quadrants (re-triage without re-typing). Matches `tmp/Bearing`'s `CreateTaskDialog` drag behavior. |
| `[×]` per staged item | Inline in queue list | Removes that single staged task.                                         |
| `[ Clear All ]`       | Bottom-left | Discards all staged tasks across all quadrants. Form fields untouched.   |
| `[ Close ]`           | Bottom-right | Closes the dialog. Drafts persist via the backend (`SaveTaskDrafts` pattern from `tmp/Bearing`) so reopening restores the queues. |
| `[ Done (N) ]`        | Bottom-right | Commits all `N` staged tasks to Backlog and closes. Disabled when `N = 0`. |

Notes:

- **Drafts persist across dialog close and across sessions.** This is the key reason batch creation is safe — `[ Close ]` is non-destructive. `[ Clear All ]` is the only way to discard staged work, and it's labeled and positioned away from `[ Done ]` to prevent accidental clicks.
- **Per-section staged-task list** with `[×]` to remove gives at-a-glance feedback on what's about to be committed and surgical control to undo individual mistakes.
- **Counts in the section headers** (`◆ Imp. & Urgent (2)`) and in the `[ Done (N) ]` label are redundant on purpose — both visible, no scrolling required.
- **Tag persists between stagings** because batch capture almost always operates on one board. Switching tag mid-batch is allowed (changes the destination for subsequent stagings only; already-staged tasks keep their original tag).
- **No Q4** — same model as § 6.1.
- **All tasks land in Backlog**, in the section their `Prioritize to ⬇` button targeted. Order within section: appended at the bottom. Within the dialog, staged tasks can be **dragged** by the `⋮⋮` handle to reorder within their quadrant or to move between quadrants (re-triage without re-typing) — same drag behavior as `tmp/Bearing`'s `CreateTaskDialog`. Once committed, further re-ordering happens on the board (§ 6.1) just like any other task.
- **Keyboard:** `⌘1` / `⌘2` / `⌘3` stage the current draft into the corresponding section (saves a click for keyboard users). For staged tasks, `⌘⇧↑` / `⌘⇧↓` reorder within a quadrant and `⌘⇧→` / `⌘⇧←` move between quadrants — consistent with the keyboard reorder shortcuts used everywhere else in the app. `⌘↩` triggers `[ Done ]` when at least one task is staged. Esc fires `[ Close ]` (non-destructive).

### 6.3 Task editor dialog

The editor handles **content only** — title, description, tag. Priority and column are deliberately *not* in this dialog; they're managed by direct manipulation on the board (drag-and-drop, context menu in § 6.1). This matches the rule "priority is set at intake, not changed in motion."

```
┌─ Edit Task ──────────────────────────────────────────────────[ × ]┐
│                                                                    │
│  Title *                                                           │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │ Wireframes doc                                                │ │
│  └──────────────────────────────────────────────────────────────┘ │
│                                                                    │
│  Description                                                       │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │ ASCII wireframes for every UI inventory item.                 │ │
│  │                                                                │ │
│  └──────────────────────────────────────────────────────────────┘ │
│                                                                    │
│  Tag *                                                             │
│  ┌──────────────────┐ ▾                                            │
│  │ ● bearing-v2     │                                              │
│  └──────────────────┘                                              │
│                                                                    │
│  Current location: Backlog · Important & Urgent  (read-only)       │
│                                                                    │
│  ┌─ Danger zone ──────────────────────────────────────────────┐   │
│  │  [ ⚠ Delete task ]                                          │   │
│  └────────────────────────────────────────────────────────────┘   │
│                                                                    │
│                                       [ Cancel ]   [ Save ]        │
└────────────────────────────────────────────────────────────────────┘
```

Notes:

- **No priority field, no column field.** Both are board-managed. To re-prioritize, use the task's context menu (`Change priority →`) on the Backlog. To move columns, drag or use `Move to → …`. This keeps the editor focused on content the user *types*, not state the user *positions*.
- **Current location is shown read-only** as a one-liner — useful for orientation, not editable. For a task in motion the line reads `Current location: To do  (read-only)` (no priority because priority isn't surfaced once outside Backlog, per the established rule).
- **Tag is editable** — moving the task to a different tag effectively moves it to that tag's board. The current column is preserved on the destination board where possible.
- **Tag default** is the currently selected one — opening Edit on a task on the `#bearing-v2` board pre-fills `bearing-v2`.
- **Description is a plain textarea** — Markdown not enforced at the task level (kept for ideas where it pays off more).

### 6.4 Day check-out dialog

End-of-day reflective ritual: capture what got done across all boards today, note observations, archive completed tasks, optionally reset in-progress tasks. Triggered by `[ Check out day ]` in the Execution header — or by the same button at the bottom of the Focus Day-mode summary bar (both surfaces, same dialog, idempotent on the same date).

```
┌─ Check out today  ·  Mon, May 11 2026 ─────────────────────────[ × ]┐
│                                                                      │
│  Completed today                                                     │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │ ✓ Wireframes doc            #bearing-v2                         │ │
│  │ ✓ Gym                       routines                            │ │
│  │ ✓ Color tokens              #bearing-v2                         │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│  Still in progress                                                   │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │ ⏳ Themes view (impl)        #bearing-v2                         │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│  Day notes   (optional)                                              │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │ Wireframes took longer than expected. Themes view started      │ │
│  │ but blocked on the color picker decision.                      │ │
│  │ (Markdown · auto-saves while typing)                           │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│  Closing actions                                                     │
│  ☑  Archive the 3 completed tasks                                    │
│  ☐  Reset 1 in-progress task to Backlog for re-triage tomorrow       │
│                                                                      │
│                                  [ Cancel ]   [ Check out & save ]   │
└──────────────────────────────────────────────────────────────────────┘
```

Notes:

- **Auto-detected task lists** — completed (moved to Done today) and in-progress (any task on a Today board not in Done) are derived from task movement timestamps. Read-only here; the user manipulates tasks on the board, not in this dialog. The lists confirm "this is what the system thinks happened today" before the user commits the check-out.
- **Day notes auto-saves while typing.** Unlike the Goal check-out dialog (which is ceremonial and discards on Cancel), the day check-out's notes field is genuinely useful as a running journal entry — auto-save lets the user start writing in the morning and close out in the evening without losing thoughts.
- **Closing actions** are opt-in. `Archive the N completed tasks` defaults *on* — most users want a clean board the next day. `Reset in-progress tasks to Backlog` defaults *off* — preserves the user's current state; only useful if the user wants to deliberately re-triage tomorrow. **What "in-progress" means here:** any task currently sitting in the `To do` or `In progress` column on any active board for today. Tasks in `Done` are handled by the *completed* checkbox (archive). Tasks in `Backlog` are not touched — they were never started, so there's nothing to reset. Reset moves the task back into Backlog at the bottom of its previously-set Eisenhower section (priority metadata is preserved per § 6.1's "priority travels with the task" rule).
- **Saves a `DayLog` entity** keyed by date — title (auto from date), notes, references to completed and in-progress task IDs at the moment of checkout. The DayLog surfaces in Focus Week/Month/Year overviews as hover/tooltip detail on the day cell ("show me what I noted on May 11").
- **Re-running on the same day** updates the existing DayLog (idempotent) — useful for "I checked out at 5 pm, did more work, ran it again at 9 pm."
- **Cancel after auto-save**: notes typed are preserved in the DayLog (since they auto-saved); the archive / reset actions are NOT applied unless Save is clicked. So you can leave the dialog mid-thought without losing notes, but the bulk side effects only happen on explicit confirmation.

---

## 7. Cross-cutting

### 7.1 First-run onboarding view

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                                                                              │
│                                  Bearing                                     │
│                                                                              │
│                  Connect what matters to what gets done.                     │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │                                                                        │ │
│  │     Themes  →  Ideation  →  Goals  →  Focus  →  Execution              │ │
│  │     values   candidates    OKRs     today      kanban                  │ │
│  │                                                                        │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
│   We'll start you with five life areas. Edit, remove, or add your own —      │
│   you can change them any time on the Themes tab.                            │
│                                                                              │
│   ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐  ┌──────────┐ │
│   │ ● Work   │  │ ● Health │  │ ● Learn… │  │ ● Relations… │  │ ● Pers…  │ │
│   │  [edit]  │  │  [edit]  │  │  [edit]  │  │   [edit]     │  │  [edit]  │ │
│   └──────────┘  └──────────┘  └──────────┘  └──────────────┘  └──────────┘ │
│                                                                              │
│   [ Skip — I'll set this up later ]                  [ Next → ]              │
└──────────────────────────────────────────────────────────────────────────────┘
```

After accepting / customizing the pre-seeded themes, an optional second step offers Vision & Mission:

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                                                                              │
│                          Vision & Mission   (optional)                       │
│                                                                              │
│   A higher-frame anchor above your themes — useful if you find it helpful,   │
│   fine to skip. You can come back to this any time from the Themes tab.      │
│                                                                              │
│   Vision   (who you're trying to become)                                     │
│   ┌────────────────────────────────────────────────────────────────────────┐ │
│   │                                                                        │ │
│   └────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
│   Mission   (what you're here to do)                                         │
│   ┌────────────────────────────────────────────────────────────────────────┐ │
│   │                                                                        │ │
│   └────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
│   [ ← Back ]    [ Skip — I'll set this up later ]      [ Get started → ]     │
└──────────────────────────────────────────────────────────────────────────────┘
```

Notes:

- **Two-step flow:** Step 1 = pre-seeded themes (themes view-style), Step 2 = optional Vision & Mission. The funnel diagram lives only on Step 1.
- **Step 2 is genuinely optional.** "Skip" leads to the same place as filling it in — Bearing functions identically either way. The body copy makes that explicit so the user doesn't feel forced into philosophical writing on day one.
- **The funnel diagram is the centerpiece of Step 1** — the user sees the whole model in one screen before touching any tab.
- **Pre-seeded themes are editable inline** ("[edit]") so first-run customization doesn't require a tab switch.
- **Skip is offered at both steps** — never force onboarding completion; the Themes tab handles all of it whenever the user gets there.
- **Lands on Focus after completion** (hardcoded default; no in-app override per § 7.2).

### 7.2 Settings view

**There is no Settings view.** Bearing has no user-facing settings.

- **Storage location is hardcoded per OS.** Bearing uses Go's `os.UserConfigDir()` to resolve the platform-conventional application data directory:

  | OS      | Data folder path                                           |
  |---------|------------------------------------------------------------|
  | macOS   | `~/Library/Application Support/Bearing/`                   |
  | Linux   | `~/.config/bearing/` (XDG_CONFIG_HOME)                     |
  | Windows | `%APPDATA%\Bearing\`                                       |

  In prose elsewhere in the docs, this resolved location is referred to as **the Bearing data folder**. The folder is automatically initialized as a git repository on first run, so every state change becomes a commit. The actual resolved path and the version-control framing are surfaced in the About dialog (§ 7.3) so they remain discoverable on whatever platform the user is on.
- **Locale, theme (light/dark), and motion preferences** are auto-detected from the OS (`GetLocale`, `prefers-color-scheme`, `prefers-reduced-motion`) without an in-app override.
- **Landing tab, day rollover, and auto-promote-priority** have sensible hardcoded defaults.
- **Power-user storage relocation** is via filesystem-level directory linking — on macOS / Linux a symlink (`ln -s`); on Windows a directory symlink (`mklink /D`, requires admin or Developer Mode). No in-app UI for this — chosen deliberately: a personal planning tool has one workspace, not several, because cross-cutting themes and routines (health, sleep) don't belong to any single project.
- **No backup/restore UI.** Backup is git: `git push` to a remote, or copy the folder. Inter-tool export/import would be a separate feature for separate purposes (out of scope).

If a real configurable concern surfaces later — e.g., advisor backend choice (§ 12 Q9 of `architecture.md`) — a Settings view is added at that point with intent, rather than as vestigial chrome. Until then, there is no `[ ⚙ ]` icon and no settings dialog.

**Bootstrapping (no config file involved):**

1. Resolve the OS-conventional data folder path (table above).
2. Check whether the data folder is present and usable.
3. **Present, is a git repo:** load and proceed.
4. **Present, not a git repo:** run `git init` in place and proceed.
5. **Not usable** — missing entirely, or a symlink whose target is unreachable: create (or replace) the data folder, run `git init`, then show the **new-data-folder notification** (§ 7.7) before any app content. The user can either continue (true first-run) or quit and substitute their own backup folder at the same path (recovery case). The notification is the *only* disambiguation between first-run and accidental data-loss — Bearing intentionally does not try to detect the difference programmatically.

The first-run onboarding view (§ 7.1) appears after the notification has been dismissed with Continue.

### 7.3 About dialog

```
┌─ About Bearing ──────────────────────────────────────────────[ × ]┐
│                                                                    │
│                            ┌────────┐                              │
│                            │  logo  │                              │
│                            └────────┘                              │
│                                                                    │
│                            Bearing                                 │
│                            v2.0.0-alpha                            │
│                                                                    │
│              Connect what matters to what gets done.               │
│                                                                    │
│              License:  MIT                                         │
│              Source:   github.com/rknuus/Bearing                   │
│              Docs:     bearing.dev/docs                            │
│                                                                    │
│              Build:    2026-05-08 · 9a4f3c1                        │
│                                                                    │
│              Data:     <resolved data folder>   (tracked in git)   │
│                        e.g. ~/Library/Application Support/Bearing/ │
│                        on macOS — actual path is per-OS, see § 7.2 │
│                                                                    │
│                                                          [ Close ] │
└────────────────────────────────────────────────────────────────────┘
```

Notes:

- **Centered, low-density** — informational only.
- **Build hash + date** for bug reports.
- **Links open externally**; the dialog stays as anchor.
- **Data location + version-control framing** is surfaced here because there's no Settings view (per § 7.2). The line makes the storage location and the "every change is a git commit" property discoverable to a curious user without forcing it into the daily UI.

### 7.4 Keyboard shortcuts dialog

```
┌─ Keyboard Shortcuts ─────────────────────────────────────────[ × ]┐
│                                                                    │
│   Navigation                                                       │
│     ⌘1 / Ctrl+1      Themes                                        │
│     ⌘2 / Ctrl+2      Ideation                                      │
│     ⌘3 / Ctrl+3      Goals                                         │
│     ⌘4 / Ctrl+4      Focus                                         │
│     ⌘5 / Ctrl+5      Execution                                     │
│                                                                    │
│   Actions                                                          │
│     ⌘N               New (context-aware: theme / idea / goal /     │
│                            routine / task — based on active tab)   │
│     ⌘E               Edit selected                                 │
│     ⌘⌫               Delete selected                                │
│     ⌘K               Quick search                                  │
│     ?                Show this help                                │
│                                                                    │
│   Execution board                                                  │
│     ⌘⇧→ / ⌘⇧←        Move task between columns                     │
│     ⌘⇧↑ / ⌘⇧↓        Reorder within section (Backlog) or column   │
│     1 / 2 / 3        Set Eisenhower section for the selected task  │
│                            1 = Important & Urgent                  │
│                            2 = Not Important & Urgent              │
│                            3 = Important & Not Urgent              │
│     [ / ]            Fold / unfold focused column or section       │
│                                                                    │
│   Task creation dialog                                             │
│     ⌘1 / ⌘2 / ⌘3     Prioritize draft to section 1 / 2 / 3         │
│     ⌘⇧↑ / ⌘⇧↓        Reorder a staged task within its quadrant     │
│     ⌘⇧→ / ⌘⇧←        Move a staged task between quadrants          │
│     ⌘↩               Done (commit all staged)                      │
│     Esc              Close (drafts persist)                        │
│                                                                    │
│   Themes                                                           │
│     ⌘⇧↑ / ⌘⇧↓        Reorder focused theme card                    │
│                                                                    │
│   Focus                                                            │
│     D / W / M / Y    Switch mode (Day / Week / Month / Year)       │
│     ⌘⇧T              Jump to current period (today / this week     │
│                            / this month / this year, per mode)     │
│     ← / →            Previous / next period at the active grain    │
│                                                                    │
│   Advisor                                                          │
│     ⌘⇧A              Toggle Advisor panel (open / close)           │
│     ⌘⇧↩              Apply all pending suggestions in last reply   │
│     ⌘⇧⌫              Dismiss all pending suggestions in last reply │
│                                                                    │
│                                                          [ Close ] │
└────────────────────────────────────────────────────────────────────┘
```

Notes:

- **Three groups** mirror the user's mental model: where I navigate, what I do, what's specific to a board.
- **Mac and non-Mac shortcut shown** side by side.
- **`?` opens this dialog** — a discoverability convention familiar from many desktop apps.
- **`⌘N` is context-aware** — same keybind, different action per tab — explained inline so users learn the model rather than five separate keybinds.

### 7.5 Advisor panel

Triggered by the `[ ✦ Advisor ]` button present in every view header (Themes, Ideation, Goals, Focus, Execution) and by the global shortcut `⌘⇧A`. Inspired by `tmp/Bearing`'s OKR advisor; extended to be funnel-graph-aware so suggestions can cross tabs.

When open, the advisor renders as a **right-side split panel alongside the active view**, with a draggable divider between them. Both halves remain interactive — you can edit a goal while reading advice. By default the divider sits roughly in the middle: the panel is rendered **as wide as the active view's content area**, so chat threads, suggestions, and selection chips read at full width rather than wrapping every few characters.

#### Standalone view of the panel

```
┌─ ✦ Advisor ─────────────────────────────────────────────────────[ × ]┐
│                                                                       │
│  Context:  Goals  ·  Q2 2026                                          │
│                                                                       │
│  Focused on   (mirrors selection on the active view —                 │
│                click an entity there to add or remove)                │
│  ┌─────────────────────────────────────────────────────────────────┐  │
│  │  ● Run a 10k by Jun 2026                                   [×]  │  │
│  └─────────────────────────────────────────────────────────────────┘  │
│                                                                       │
│  ───────────────────────────────────────────────────────────────────  │
│                                                                       │
│  You                                                                  │
│   Are these KRs well-formed?                                          │
│                                                                       │
│  Advisor                                                              │
│   KR1 ("Run 5k under 28 min") is measurable — good.                   │
│                                                                       │
│   KR2 ("Complete 12-week training plan") lacks a unit.                │
│  ┌─────────────────────────────────────────────────────────────────┐  │
│  │  Replace KR2 with:                                              │  │
│  │   "Complete 12 of 12 training weeks."                           │  │
│  │                                  [ Dismiss ]   [ Apply → KR2 ]  │  │
│  └─────────────────────────────────────────────────────────────────┘  │
│                                                                       │
│   The Objective could be sharper.                                     │
│  ┌─────────────────────────────────────────────────────────────────┐  │
│  │  Rewrite Objective:                                             │  │
│  │   "Run a sub-60-min 10k by Jun 14 2026."                        │  │
│  │                            [ Dismiss ]   [ Apply → Objective ]  │  │
│  └─────────────────────────────────────────────────────────────────┘  │
│                                                                       │
│   Only 4 KRs — consider race-day fueling.                             │
│  ┌─────────────────────────────────────────────────────────────────┐  │
│  │  Add KR5:                                                       │  │
│  │   "Test race-day fueling on at least 3 long runs."              │  │
│  │                              [ Dismiss ]   [ Apply → New KR ]   │  │
│  └─────────────────────────────────────────────────────────────────┘  │
│                                                                       │
│                                       [ Dismiss all ]  [ Apply all ]  │
│                                                                       │
│  ───────────────────────────────────────────────────────────────────  │
│                                                                       │
│  ┌─────────────────────────────────────────────────────────────────┐  │
│  │  Ask the advisor…                                                │  │
│  └─────────────────────────────────────────────────────────────────┘  │
│                                                  [ Clear ]   [ Send ] │
└───────────────────────────────────────────────────────────────────────┘
```

#### Resolved suggestion states

After `[ Apply ]`, `[ Dismiss ]`, or auto-supersession (see below), the card switches to a resolved state. It stays in the conversation as readable history; the action buttons disappear.

```
Applied:                          Dismissed:                       Superseded:
┌────────────────────────────┐    ┌────────────────────────────┐   ┌────────────────────────────┐
│  Replace KR2 with:         │    │  Rewrite Objective:        │   │  Replace KR2 with:         │
│   "Complete 12 of 12 …"    │    │   "Run a sub-60-min 10k …" │   │   "Complete 12 of 12 …"    │
│                ✓ Applied   │    │              ✕ Dismissed   │   │            ↻ Superseded    │
└────────────────────────────┘    └────────────────────────────┘   └────────────────────────────┘
   (greyed background)               (greyed background)              (greyed background)
```

#### Suggestion supersession

When the advisor returns a revised suggestion in a follow-up turn for **the same target** (same `target_id` in the structured suggestion payload — e.g. both target KR2 of the same goal), the older card auto-transitions to `↻ Superseded` and only the new card carries `[ Apply ]` / `[ Dismiss ]` buttons. Invariant: **at most one pending card per target at any time** — the user never has to choose between two `[ Apply → KR2 ]` buttons that would overwrite each other.

```
Turn 1                                   After Turn 2 (revision)
┌──────────────────────────────────┐    ┌──────────────────────────────────┐
│  Replace KR2 with:               │    │  Replace KR2 with:               │
│   "Complete 12 of 12 training    │    │   "Complete 12 of 12 training    │
│    weeks."                       │    │    weeks."                       │
│           [ Dismiss ] [Apply→KR2]│    │                   ↻ Superseded   │
└──────────────────────────────────┘    └──────────────────────────────────┘

                                        ┌──────────────────────────────────┐
                                        │  Replace KR2 with:               │
                                        │   "Run 250 km across the 12-week │
                                        │    plan."                        │
                                        │           [ Dismiss ] [Apply→KR2]│
                                        └──────────────────────────────────┘
```

Edge cases:

- **Original already applied (`✓ Applied`)** — closed state, not affected. The new card is independent and pending; applying it overwrites whatever the previous Apply wrote (each Apply is a direct write, no chain tracking).
- **Original already dismissed (`✕ Dismissed`)** — closed state, not affected. The new card stands alone as a fresh pending suggestion.
- **Revision targets a *different* entity** (e.g. now KR3 instead of KR2) — treated as a new suggestion, *not* a supersession. Both can be pending simultaneously since they don't conflict.
- **Identical content re-emitted** — deduped to a single card; the duplicate is suppressed on arrival.
- **User asks "actually never mind"** with no new card emitted — the still-pending card stays as-is. The user can `[ Dismiss ]` it explicitly if they want it cleared.

Supersession is keyed off the structured `target` field, not prose text matching — the same mechanism that makes `[ Apply → KR2 ]` labels reliable.

#### Schematic of the split layout (Goals + Advisor open)

```
┌────────── Goals (narrowed) ──────────┬────── ✦ Advisor ───────[ × ]──┐
│  Goals  [ ✦ Advisor* ] [ + Goal ]    │  Context: Goals · Q2 2026     │
│                                      │                               │
│  ─── ● Health ─────                  │  Focused on                   │
│   ▸ Run a 10k ◉      [Edit] [⚠Del]   │   ● Run a 10k …          [×]  │
│   ▸ Reduce body fat  [Edit] [⚠Del]   │                               │
│                                      │  …conversation + cards…       │
│  ─── ● Career ─────                  │  [Dismiss all] [Apply all]    │
│   ▸ Ship Bearing v2  [Edit] [⚠Del]   │  [ Send ]                     │
│                                      │                               │
└──────────────────────────────────────┴───────────────────────────────┘
                                       ↑ drag divider to resize
```

The `◉` next to "Run a 10k" indicates it's the currently selected entity on the Goals view (matched by the chip in `Focused on`). The schematic compresses both panes for layout illustration; the **standalone view above is the canonical detail** of what the panel actually contains.

Notes:

- **Right-side split panel, not a modal.** The current view stays alive and interactive at reduced width; you can edit goals while reading advice. Mirrors `tmp/Bearing`'s pattern. Resizable via the divider; min-width on both sides prevents either from collapsing.
- **One panel, multiple invocation points.** Every view's `[ ✦ Advisor ]` button toggles the same singleton panel. State (messages, selection) persists across tab switches — exactly like the existing `advisorMessages`/`advisorPanelOpen` state in `tmp/Bearing`'s App.svelte.
- **Context strip at the top** tells the model (and the user) which tab is active. The panel adapts its system prompt and default suggestions per tab — KR critique on Goals, idea expansion on Ideation, task breakdown on Execution, neglected-tag nudges on Focus, balance dashboard prompts on Themes.
- **`Focused on` mirrors selection on the active view.** Click an entity on the underlying view (a goal card on Goals, an idea row on Ideation, a task on Execution) to add/remove it from the focus set; chips in `Focused on` are a read-only mirror with `[×]` as an alternative removal path. No separate `[ + Add ]` picker — you select where the entities live, not in a duplicate list. Empty `Focused on` = "discuss the whole tab."
- **Suggestions are structured objects, not parsed prose.** The advisor returns each actionable item as a structured payload (`type`, `target_id`, new value, etc.). The UI renders the card and derives the `[ Apply → … ]` button label from the structured `target` field. This is what makes labels like `Apply → KR2`, `Apply → Objective`, `Apply → New KR`, `Apply → Promote bearing-v2 to goal` reliable rather than text-matched.
- **Each suggestion is its own card, with its own buttons.** A response containing N actionable items renders N cards, anchored visually next to the prose that introduced them — no floating "which suggestion does this button apply to?" ambiguity.
- **`[ Apply ]` always writes directly. One rule, no exceptions.** Edits and creations both commit on click. Consequence for the advisor's contract: every creation suggestion (new goal, new task, new routine, idea promotion, etc.) must include all required fields — the advisor cannot propose half-finished entities that "need the user to fill in the gaps." If it doesn't have enough info, it asks first in conversation rather than emitting an incomplete card. Quality-of-suggestion is the advisor's problem; the UI's job is consistent application.
- **Per-card `[ Dismiss ]`** removes the card from the pending set without applying it. The card stays in the thread as history with a `✕ Dismissed` badge and greyed background.
- **Response-level `[ Apply all ]` and `[ Dismiss all ]`** at the bottom of a multi-card response act on all *still-pending* cards in that response, in order. Cards already in a resolved state (`Applied` / `Dismissed` / `Superseded`) are skipped. Disabled when nothing is pending. If `Apply all` hits a conflict on one card (rare — e.g. the target was deleted via another action), the other cards still apply and the conflicting one stays pending with an inline error (see § 7.7 "Apply suggestion failure").
- **Loading/streaming/error visuals** for the advisor — thinking indicator before the first token, streaming caption while content arrives, network-error fallback when the model can't be reached — are documented in § 7.7. Per-card `[ Apply ]` becomes enabled as each card finishes streaming, not only when the whole response is done.
- **Cross-tab applies surface a navigation toast.** Applying a suggestion that affects another tab (e.g. a task created on Execution while you're on Ideation) commits silently and shows a small toast: `New task on #bearing-v2  [ Open Execution ]`. No forced navigation while you're chatting.
- **Conversation persists per session**, not per view. Clearing the whole thread is explicit via the `[ Clear ]` button next to the input.
- **The button on Themes is intentionally low-leverage** — there's not much for the advisor to do on a near-static tab — but having it there preserves consistency and lets the Themes-side analytics ("balance over the last 30 days") be requested through the same surface.
- **Esc** closes the panel (when input is not focused). `⌘⇧A` toggles from anywhere.

### What the advisor knows about

Architecturally, the advisor is a sidecar that observes the whole funnel graph (themes, ideas, goals, routines, focus history, tasks, KR check-ins) plus the optional Vision & Mission text (§ 2.5) and renders into the panel. Per-tab specialization is just *prompting* and *default selections*, not separate advisors. Vision/Mission, when set, enable a higher-frame critique of goals — *"this goal fits your Career theme but drifts from your stated vision of staying present with people"* — without becoming a required input. When Vision/Mission are empty, the advisor simply omits that frame from its reasoning.

This is what enables cross-tab suggestions like:

- "You ideated `bearing-v2` 4 months ago — promote to a goal now?"
- "Goal X has had no tasks created in 3 weeks — is the KR still real?"
- "Routine `meditation` was paused last week — resume?"

These aren't tab-bound, but they surface in the panel of whichever tab the action would apply to.

### Suggestion catalog

The advisor's contract with the UI is a fixed catalog of suggestion types. Each suggestion the model emits is a structured object (not parsed prose), validated against this catalog before rendering. The catalog is what makes `[ Apply → … ]` labels deterministic, supersession reliable (keyed on `target_id` + `type`), and the "Apply commits directly, no editor pre-fill" rule safe.

#### Common shape

Every suggestion has these fields:

```
{
  "type": "<one of the catalog types below>",
  "target_type": "<kr | goal | objective | idea | task | routine | day_focus>",
  "target_id": "<string identifier — null for create_* types>",
  "button_label": "<derived from type + target — see catalog>",
  "prose": "<one-line summary shown above the card>",
  ...type-specific fields...
}
```

`type` and `target_type` are required for every suggestion. `target_id` is required for all `modify_*` and `move_*` / `change_priority` / `archive_*` / `link_*` types; null for `create_*` types (since the target doesn't yet exist).

#### Catalog

| `type` | `target_type` | Required fields | `[ Apply → ]` label |
|---|---|---|---|
| **`modify_kr`** | `kr` | `goal_id`, `target_id` (the KR's ID), `new_text`. Optionally `new_target`, `new_unit`, `new_direction` for numeric KRs; `new_done` for boolean KRs. | `Apply → KR <position>` (e.g. `KR2`) |
| **`add_kr`** | `goal` | `target_id` (the goal's ID), `kr_text`, `kr_type` (`numeric` or `boolean`), `target_value`, `unit`, `direction` (numeric only) | `Apply → New KR` |
| **`modify_objective`** | `objective` | `target_id` (the goal's ID), `new_objective` | `Apply → Objective` |
| **`create_goal`** | `goal` | `theme_id`, `objective`, `time_horizon`, `key_results[]` (each with type + text + target + unit/direction), optional `linked_idea_ids[]` | `Apply → New goal: <objective summary>` |
| **`create_task`** | `task` | `tag`, `title`, `description?`, `eisenhower_quadrant` (one of the three valid sections) | `Apply → New task on #<tag>` |
| **`create_routine`** | `routine` | `theme_id`, `name`, `recurrence` (`daily`/`weekly`/`monthly`/`custom`), `frequency`, optional `preferred_days[]` | `Apply → New routine "<name>"` |
| **`modify_idea`** | `idea` | `target_id` (the idea's ID), at least one of: `new_title`, `new_notes`, `new_theme_id`, `new_tag` | `Apply → Idea "<title>"` |
| **`link_idea_to_goal`** | `goal` | `target_id` (the goal's ID), `idea_id` | `Apply → Link #<tag> to <goal>` |
| **`move_task`** | `task` | `target_id` (the task's ID), `new_column` (`backlog` / `to_do` / `in_progress` / `done`), optional `new_section` (only when `new_column = backlog`) | `Apply → Move "<title>" to <column>` |
| **`change_priority`** | `task` | `target_id` (the task's ID), `new_section` (one of three Backlog sections — task must be in Backlog) | `Apply → "<title>" → <section>` |

#### Per-type semantics

- **`modify_kr` for boolean KRs** sets `new_done` (true/false) instead of `new_target`/`new_unit`. Per § 4.3 (KR check-in) for the implementation surface.
- **`add_kr` defaults to current quarter's relevant unit** — the advisor inherits the goal's existing KR conventions when the field can be inferred.
- **`create_goal`** is the structural shape behind the "Promote idea to goal" intent (§ 3.1). When the advisor emits this type, the new goal lands directly on the Goals tab, archived ideas notwithstanding. A cross-tab navigation toast (per § 7.5) offers `[ Open Goals ]` immediately after Apply.
- **`create_task`** lands the task in Backlog under the chosen `eisenhower_quadrant`. Cross-tab toast offers `[ Open Execution ]`.
- **`modify_idea`** with `new_tag` triggers the tag normalization + uniqueness validation defined in § 3.2's Tag-field UX. If the proposed tag collides, Apply fails with the "Apply suggestion failure" pattern (§ 7.7) and the card stays pending with an inline `⚠ Tag conflict with "<other idea>"` message.
- **`link_idea_to_goal`** appends to the goal's `linked_idea_ids[]` (idempotent if already linked — Apply silently succeeds and the card resolves).
- **`change_priority`** is rejected (fails to Apply, error inline on the card) if the task is no longer in Backlog at the moment of Apply — priority isn't editable from non-Backlog columns per § 6.1's context-menu rule.

#### Validation and unrecognized-type handling

When the advisor emits a payload:

1. **Schema-valid + recognized type** → render a card with `[ Dismiss ]` and `[ Apply → <label> ]` buttons.
2. **Schema-valid + unrecognized type** → render the `prose` field as a plain conversational message (no card, no `[ Apply ]`). Log for telemetry. The user reads the suggestion as prose and can act manually. This is the graceful-degradation mode that lets the catalog evolve without breaking older clients.
3. **Schema-invalid** (missing required field for the declared type, malformed structure) → drop the suggestion entirely; surface a discreet "Advisor returned an unparseable suggestion — try rephrasing your question" toast (per § 7.7 toast pattern). Log for telemetry.

#### What's intentionally not in the catalog

- **`create_idea`** — the advisor doesn't invent ideas for the user; ideation is human territory. If the advisor wants to suggest "consider ideating about X," it does so in prose without a card.
- **`set_focus_today`** — daily focus is an explicit human commitment; pushing it via Apply would feel intrusive. The advisor can suggest in prose ("you haven't focused on `#korean` in 3 weeks — want to add it today?") and the user adds it via Focus tab.
- **`archive_*`** — archive is a deliberate conscious gesture (per § 7.8's "manual only, no auto-archive" rule). The advisor doesn't archive on the user's behalf; it can suggest in prose.
- **`set_routine_active`** (pause/resume) — same reasoning as archive. Active-toggle is the user's call.
- **Bulk operations** (e.g. "move all stale tasks to Backlog") — out of scope for v1. The advisor produces atomic suggestions one card at a time; users opt into `[ Apply all ]` for batch effect.

When the catalog needs to grow, additions ship as new `type` values with their required-field spec; the unrecognized-type fallback above ensures older UI builds don't break when a newer advisor emits a type they don't yet handle.

### 7.6 Empty states

Every list/board view has a documented empty state. Same shape across views:

1. Short heading naming what's missing.
2. One-paragraph orientation explaining the concept and how it fits the funnel.
3. One or two clearly-labeled next-action buttons.

Empty states are never blockers — the rest of the app (other tabs, settings, advisor) remains reachable. Wireframes below show only the changed (empty) inner area; the surrounding tab header and chrome stay as documented in their respective sections.

**Buttons in empty states are reserved for actions that don't exist elsewhere on the surface.** Pure tab-navigation is carried by prose (the tab strip is always one click away). Create-actions that already exist as `[ + … ]` in the tab header are also not duplicated in the empty body; the orientation paragraph names the existing header button so the user knows where to click. Empty-state buttons are reserved for unique affordances — like `[ Pre-seed defaults ]` on Themes — that have no other home.

#### Themes — zero themes

Triggered when the user skipped onboarding or deleted every theme.

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│  Themes                                            [ ✦ Advisor ]   [ + Theme ]   │
├──────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│                                                                                  │
│                              No themes yet.                                      │
│                                                                                  │
│         Themes are the life areas that matter to you — they group goals          │
│         and routines. A small set is usually enough — for example: Work,         │
│         Health, Learning, Relationships, Personal. Use `+ Theme` above to        │
│         add one, or pre-seed a starter set:                                      │
│                                                                                  │
│                          [ Pre-seed defaults ]                                   │
│                                                                                  │
│                                                                                  │
└──────────────────────────────────────────────────────────────────────────────────┘
```

Notes:

- `[ Pre-seed defaults ]` reinstates the onboarding theme set in one click — recovery for "I skipped onboarding and now I don't know where to start." Kept in the empty-state body because it has no equivalent in the header.
- The `+ Theme` button is in the tab header (not duplicated here); the paragraph names it explicitly so users know where to look.
- This is the only view where the empty state offers a "fill it for me" shortcut, because themes are the funnel's root and everything else depends on them.

#### Ideation — zero ideas

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│  Ideation                          [ Search ideas… ]    [ ✦ Advisor ]  [ + Idea ]│
├──────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│                                                                                  │
│                              No ideas yet.                                       │
│                                                                                  │
│         Capture rough ideas you might realize someday — most won't, and          │
│         that's fine. Use `+ Idea` above to add one; add detail in its notes;     │
│         promote to a goal when you're ready to commit.                           │
│                                                                                  │
│                                                                                  │
└──────────────────────────────────────────────────────────────────────────────────┘
```

Notes:

- No CTA in the empty body — `+ Idea` is in the tab header, named in the paragraph.
- No fast-track defaults for Ideation: ideas are personal by definition; there's nothing reasonable to pre-seed.
- Search field stays visible (and disabled-looking until there's content) so users learn it exists.

#### Goals — zero goals

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│  Goals                                              [ ✦ Advisor ]    [ + Goal ]  │
├──────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│                                                                                  │
│                              No goals yet.                                       │
│                                                                                  │
│         Goals are commitments — an objective with measurable key results,        │
│         time-bound to a quarter or year, anchored to a theme. Use `+ Goal`       │
│         above to create one directly, or open Ideation, expand an idea, and      │
│         click "→ Promote to Goal".                                               │
│                                                                                  │
│                                                                                  │
└──────────────────────────────────────────────────────────────────────────────────┘
```

Notes:

- No CTA in the empty body — `+ Goal` is in the tab header, named in the paragraph.
- If **no themes exist**, the header `+ Goal` is intercepted with a one-line message: *"Add a theme first — every goal lives under one."* The user clicks the Themes tab to fix it. Ensures the funnel's required-FK stays honest.
- The promote-from-idea path is mentioned in prose — the tab strip handles the navigation, the user runs the existing § 3.1 promote flow once they're on Ideation.

#### Focus — Day mode, nothing to focus on

Triggered when no themes/ideas/routines exist, so there's nothing the user could pick.

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│  Focus  [ Day* ] [ Week ] [ Month ] [ Year ]                  [ ✦ Advisor ]      │
├──────────────────────────────────────────────────────────────────────────────────┤
│              ‹  Mon, May 11 2026 (Today)  ›        [ Today ]                     │
├──────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│                                                                                  │
│                          Nothing to focus on yet.                                │
│                                                                                  │
│         Focus picks tags (from ideas) and routines for the day. Add a theme,     │
│         then capture an idea or routine — they'll appear here grouped by         │
│         theme as soon as either exists.                                          │
│                                                                                  │
│                                                                                  │
└──────────────────────────────────────────────────────────────────────────────────┘
```

Notes:

- No CTA buttons — Focus has no direct create action (tags come from ideas, routines from themes). The orientation paragraph names the upstream tabs; the tab strip handles the navigation.
- The day navigator stays interactive — the user can flip through dates even with no content (they'll just see this same empty state).
- Mode tabs (Day / Week / Month / Year) remain switchable. Week / Month / Year empty states are described next.

#### Focus — Week / Month / Year, no focus history

The grid renders normally — every cell is unfocused (`—` in Year mode, no dots in Month mode, "—" cards in Week mode). Coverage strip shows zeros: `Coverage: ●Career 0  ●Health 0  blank N`. A small helper line above the grid:

> *"No focus recorded yet for this period. Pick today's tags and routines on Day mode."*

No dedicated wireframe — the existing § 5.1.b/c/d wireframes already show what an empty period looks like; the helper line is the only addition.

#### Execution — All board with no tasks anywhere

Triggered on a fresh install (or after deleting everything): no tag is in focus, no routines are spawning tasks, no orphan tasks exist. The strip therefore shows just `[ All* ]` — the only always-present board — and the All view has nothing to render.

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│  Execution                                                       [ ✦ Advisor ]   │
├──────────────────────────────────────────────────────────────────────────────────┤
│  Boards:  [ All* ]                                                   [ + Task ]  │
├──────────────────────────────────────────────────────────────────────────────────┤
│  All  ·  every task across every source                                          │
├──────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│                                                                                  │
│                          No tasks anywhere yet.                                  │
│                                                                                  │
│         Tasks come from creating them directly with `+ Task` above, or from      │
│         selecting routines in Focus → Day mode (which auto-spawns them on the    │
│         Routines board).                                                         │
│                                                                                  │
│                                                                                  │
└──────────────────────────────────────────────────────────────────────────────────┘
```

Notes:

- No CTA in the empty body — `+ Task` is in the tab header, named in the paragraph.
- This is the *global* execution-side empty state. Once any task exists (created directly or routine-spawned), the All board renders normally and additional chips (tag boards, Routines, Untagged) appear conditionally.
- "No tag in focus" alone is *not* an empty state in v2 — All is the default landing view in that case and shows whatever exists.

#### Execution — empty board (active board has no tasks)

When a tag is active but its board is empty (e.g. just-promoted idea, no tasks created yet). The full board chrome stays — columns, sections, counts; only the inner content is replaced.

```
│  ┌── ⋮⋮ ▾ Backlog (0) [⋯] ─────┐ ┌── ⋮⋮ ▾ To do (0) [⋯] ─┐ ┌── ⋮⋮ ▾ In progress (0) [⋯]┐ ┌── ⋮⋮ ▾ Done (0) [⋯] ┐│
│  │┌── ▸ ◆ Imp. & Urgent (0)──┐│ │                        │ │                          │ │                    ││
│  │└──────────────────────────┘│ │  No tasks in this      │ │                          │ │                    ││
│  │┌── ▸ ◆ Not Imp. & Urg. (0)┐│ │  column yet.           │ │                          │ │                    ││
│  │└──────────────────────────┘│ │                        │ │                          │ │                    ││
│  │┌── ▸ ◆ Imp. & Not Urg. (0)┐│ │                        │ │                          │ │                    ││
│  │└──────────────────────────┘│ │                        │ │                          │ │                    ││
│  │                            │ │                        │ │                          │ │                    ││
│  │  No tasks in Backlog.      │ │                        │ │                          │ │                    ││
│  │  Use [ + Task ] above to   │ │                        │ │                          │ │                    ││
│  │  add one.                  │ │                        │ │                          │ │                    ││
│  └────────────────────────────┘ └────────────────────────┘ └──────────────────────────┘ └────────────────────┘│
```

Notes:

- Sections collapse to `▸` by default when their count is 0 — saves vertical space; the user re-expands by clicking.
- Each column gets a one-liner empty message; only Backlog mentions `[ + Task ]` because new tasks always land in Backlog (per § 6.2).
- Counts everywhere stay at `(0)` so the user understands the structure even with no tasks.

### 7.7 Loading and error states

Async operations and failures need consistent visual treatment so the user always knows what's happening. Three governing principles:

1. **Reserve space.** Async-loaded content reserves its eventual vertical space — skeleton lines, spinner placeholders — so layout never jumps when data arrives.
2. **Disable in flight.** Any button that triggers a write is disabled (with an inline spinner / "…" suffix) while the operation is pending. Cancel-equivalents stay active.
3. **Errors live near the source.** Inline messages next to the field, card, or button that caused the problem. Toasts only for transient feedback that doesn't require acknowledgment.

#### Save in flight (any editor / confirmation / task creation)

While a write is being committed, the primary button shows a pending state and is disabled; secondary buttons (Cancel, Close) stay active so the user can abort.

```
                                      [ Cancel ]   [ Saving… ⟳ ]
```

On success, the button reverts to its label and the dialog closes (or stays open if the action is non-terminal). On failure, see "Save failed" below.

#### Advisor thinking

Between the user pressing Send and the first content arriving from the model, the conversation reserves a slot for the response and shows an animated indicator.

```
You
   Are these KRs well-formed?

Advisor
   ⟳  thinking…
```

The indicator stays until the first prose token (or first card) arrives. Reserved-space rule: the slot height is the height of the indicator — when content streams in, the height grows but doesn't shift previous turns up.

#### Advisor streaming

Multi-card responses arrive incrementally. Order:

1. Prose lines appear progressively (token-by-token or line-by-line).
2. Each suggestion card appears as a complete unit when the model emits it (cards aren't partially rendered).
3. The response-level `[ Dismiss all ]` / `[ Apply all ]` footer appears only when streaming completes.

```
Advisor                                                   ⟳ streaming…
   KR1 looks good — measurable.

   KR2 lacks a unit.
   ┌────────────────────────────────────────────────────────────────┐
   │  Replace KR2 with: …                                            │
   │                                  [ Dismiss ]   [ Apply → KR2 ]  │
   └────────────────────────────────────────────────────────────────┘

   (more cards may follow)
```

After streaming completes the `⟳ streaming…` caption disappears and the response footer renders:

```
                                    [ Dismiss all ]   [ Apply all ]
```

Per-card actions (`[ Apply ]` / `[ Dismiss ]`) become enabled as each card finishes streaming, not only at the end — so the user can act on early cards while later ones are still arriving.

#### Initial data load

On app launch (or tab switch with significant data), the view renders **skeleton placeholders** in the shape of expected content — theme cards, idea rows, Kanban columns — so the user doesn't see a blank page or layout shift. Skeletons fade out as content arrives.

```
─── ● ──────────────────                            ── shimmer placeholder
   ▸ ─────────────             ────  ── ──    ── ──
   ▸ ─────────────             ────  ── ──    ── ──
```

Brief, low-contrast, non-interactive. Not detailed per view; same skeleton pattern applies everywhere.

#### Inline form errors

Validation problems show inline beneath the offending field, in destructive style:

```
Tag *
┌────────────────────────────────────────────────────────────────┐
│ bearing-v2                                                      │
└────────────────────────────────────────────────────────────────┘
⚠ This tag is already used by "Build Bearing v2 (existing idea)"
```

The Save button is disabled while inline errors are present. Errors clear as the user fixes the field; validation runs on blur (and on Save attempt).

#### Toasts

Non-modal feedback for transient events. Lives in a fixed corner (bottom-right). Auto-dismisses after ~3 seconds for success messages; error toasts stay until clicked or until their action button is used.

```
Success:                              Error:
┌──────────────────────────────┐      ┌────────────────────────────────────┐
│  ✓ Idea saved.               │      │  ⚠ Couldn't save — try again.      │
└──────────────────────────────┘      │                         [ Retry ]  │
                                      └────────────────────────────────────┘
```

Used for: save confirmations, cross-tab navigation prompts (cf. § 7.5), day rollover, drafts restored, and other ambient events.

**Stacking.** Up to **3 toasts** can be visible simultaneously, stacked vertically (newest on top, oldest at the bottom). A 4th incoming toast causes the oldest to dismiss immediately to make room. Within the stack, each toast keeps its own dismiss timer (success: ~3 s) and action buttons; click-to-dismiss applies to one toast at a time. Error toasts with `[ Retry ]` are sticky — they don't auto-dismiss even when newer toasts arrive, but they will be displaced if the stack would exceed 3. (Implementation can lower the cap to 2 on shorter window heights.)

#### Advisor error (network / model failure)

Inline in the conversation, in place of the response that didn't arrive:

```
You
   Are these KRs well-formed?

Advisor
   ⚠ Couldn't reach the advisor. Check your connection.
   [ Retry ]
```

Previous conversation history stays intact; the failed turn becomes the place to retry. Pressing `[ Retry ]` re-sends the user's message without re-typing.

#### Apply suggestion failure

When `[ Apply ]` fails — most often because the target was deleted via another action since the suggestion was emitted — the card shows the error inline and stays pending:

```
┌────────────────────────────────────────────────────────────────┐
│  Replace KR2 with: …                                            │
│  ⚠ Target no longer exists.                                     │
│                                                  [ Dismiss ]    │
└────────────────────────────────────────────────────────────────┘
```

The `[ Apply → KR2 ]` button is removed (the action is no longer applicable); `[ Dismiss ]` remains so the user can clear the card. This is the partial-failure mode that `[ Apply all ]` falls back to (per § 7.5).

#### New data folder created (notification dialog)

Triggered at app launch whenever Bearing has just created a fresh data folder at the OS-conventional location (per § 7.2 Bootstrapping step 5). This happens on both *true first-run* and on the *user-deleted-or-symlink-broken* case — Bearing does not try to distinguish them programmatically. Modal — the rest of the app is blocked until the user dismisses it.

```
┌─ A new Bearing data folder was created ──────────────────────[ × ]┐
│                                                                    │
│  ℹ  Bearing has created a new git repository for your data at:    │
│                                                                    │
│      ~/Library/Application Support/Bearing/                        │
│       (or your OS-equivalent path — see About → Data)              │
│                                                                    │
│  If this is your first time using Bearing, you're all set —       │
│  click Continue.                                                   │
│                                                                    │
│  If you expected existing Bearing data to be here, your previous  │
│  folder may have been deleted, renamed, or moved to an external   │
│  drive that's currently unavailable. **Quit Bearing now** and     │
│  restore your backup folder at the path above before relaunching. │
│                                                                    │
│                                       [ Quit ]    [ Continue ]     │
└────────────────────────────────────────────────────────────────────┘
```

Notes:

- **The user is the disambiguator.** First-run users click Continue and proceed to onboarding (§ 7.1). Returning users who expected existing data click Quit and replace the freshly-created folder with their backup before relaunching.
- The expected path shown in the dialog is the OS-resolved data folder (macOS `~/Library/Application Support/Bearing/`, Linux `~/.config/bearing/`, Windows `%APPDATA%\Bearing\` — per § 7.2). Only the user's actual platform's path is shown at runtime.
- **No in-app "restore from backup" / "browse for folder"** action. Recovery is a filesystem operation the user performs outside the app — simpler, no fragile copy logic, no UI for folder picking, no risk of partial copies.
- "Use a different folder" is intentionally not offered — the data location is determined by OS convention. Users who want a different location use a filesystem-level directory link (symlink on macOS / Linux, `mklink /D` on Windows), set up outside the app.
- `[ Quit ]` lets the user exit cleanly to perform the backup substitution.
- `[ Continue ]` proceeds to first-run onboarding. The freshly-created `.git/` repo is empty — no destructive commits have happened yet, so the user retains the option to quit and substitute even after a brief Continue-then-realize moment, as long as they do so before mutating any state.
- This dialog is the only modal that can appear before any tab content. Esc closes via `[ × ]` (treated as Continue) since either choice is non-destructive to existing-but-elsewhere data — the empty new folder doesn't overwrite anything that's not at this path.

### 7.8 Archive — model and views

Archive is a **manual, conscious gesture** — no auto-archive in v1. Items archived stay on disk; they're hidden from default views and surfaced via a tab-level `[ Show archived <type>… ]` button on the relevant tab.

#### Where archive applies

| Entity | Archivable? | Trigger | Why |
|---|---|---|---|
| **Idea** | ✓ | `[ Archive ]` button inside the Idea editor dialog (§ 3.2) | Parking ideas the user wants to keep but hide |
| **Goal** | ✓ | `[ Check out ]` button on each goal row (§ 4.1) → § 4.4 Goal check-out dialog → "Archive this goal" checkbox (default on) | Reflective close-out at end-of-cycle |
| **Task** | ✓ | `[ Check out day ]` button on Execution (§ 6.1) / Focus (§ 5.1.a) → § 6.4 Day check-out dialog → "Archive the N completed tasks" checkbox (default on); or per-task `Archive` action in the task context menu (§ 6.1) | Daily reflective close-out plus single-task fallback |
| Theme | ✗ | — | Themes are rare and personal; delete or keep. No archive ceremony. |
| Routine | ✗ | — | Pause via Active toggle already covers most cases; delete for full retirement. |
| Focus selection | ✗ | — | Per-day state, not an archivable entity. |

#### How archive surfaces

Each archivable-type tab gains a `[ Show archived <type>… ]` button in its header (Ideation, Goals, Execution). Clicking the button replaces the tab content with the **archive view** for that type — not a modal overlay. A `[ ← Back to active <type> ]` link returns to the normal view.

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│  [ ← Back to active goals ]    Archived goals       [ Filter: search… ]          │
├──────────────────────────────────────────────────────────────────────────────────┤
│  Outcome: [ All ▾ ]    Theme: [ All ▾ ]                                          │
├──────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  ─── ● Career ─────────                                                          │
│   ▸ Q1 2024 cleanup           ✓ Achieved    archived 2024-04-02   [ Unarchive ]  │
│   ▸ Migrate to Tauri          ⚠ Partial      archived 2024-08-15   [ Unarchive ] │
│                                                                                  │
│  ─── ● Health ─────────                                                          │
│   ▸ Run a 5k                  ✓ Achieved    archived 2025-01-20   [ Unarchive ] │
│                                                                                  │
└──────────────────────────────────────────────────────────────────────────────────┘
```

The archive view's content varies per tab:

- **Ideation archive view** — bordered idea cards grouped by theme (same shape as active Ideation, but read-only except for `[ Unarchive ]` and expand-to-read notes). Filter inputs: text search, theme dropdown.
- **Goals archive view** — bordered goal cards grouped by theme, each with outcome chip (✓ Achieved / ⚠ Partial / ✗ Missed / − Abandoned), archived date, expandable check-out record (KR statuses + retro notes). Filters: outcome, theme, time range.
- **Execution archive view** — archived tasks grouped by board (tag), each with archived date and original column at archive time. Filters: board, time range. Default sort: archived-date descending.

#### Notes on the archive pattern

- **Modal vs tab-content-replacement chose tab replacement.** The archive view often contains many items (especially Tasks over a year of use); a modal would either be cramped or oversized. Tab replacement gives full real estate, no overlay stacking with subsequent dialogs (e.g., editing an archived item to view its detail), and the `[ ← Back ]` affordance unambiguously communicates the mode.
- **Unarchive returns the item to its source state.** Restored items reappear in the normal view at the position they would have occupied (sorted by manual order if present, by recency otherwise).
- **No bulk operations in v1.** Per-item Unarchive only. If bulk unarchive becomes needed in practice, add a multi-select; for now, kept narrow.
- **Archive does not cascade automatically.** Archiving an idea does NOT archive its tasks (tasks live on the idea's board independently). Archiving a goal does NOT archive its linked ideas. Cascade-on-archive would require its own opt-in dialog modeled after § 2.4 — deferred until the cross-entity-archive use case actually arises.
- **Search/filter logic stays trivial** — single text input, single dropdown per axis. No boolean operators. AND-combine across inputs. Consistent with the active-view's filter rule.
- **Auto-archive is intentionally absent.** Goals don't auto-archive when their horizon passes; tasks don't auto-archive after N days in Done. The user always opts in via Check-out or per-item Archive — keeping archive as a conscious, reflective act rather than a passive cleanup.

### 7.9 Window size and responsive behavior

Bearing is a **desktop-first application**. It is not designed to be responsive in the web-app sense — there is no mobile layout, no tablet adaptation, no breakpoint that collapses the sidebar into a hamburger or stacks Kanban columns vertically. The Wails-shipped desktop window has a documented minimum size; layouts inside that minimum are always horizontal.

#### Minimum window size

| Constraint | Value | Enforcement |
|---|---|---|
| **Hard floor** (window cannot be resized smaller) | **1024 × 640 px** | Set as `MinSize` in the Wails window config; the OS window manager itself blocks resize attempts below this. |
| **Comfortable minimum** (all surfaces work without cramping) | ~1280 × 720 px | No enforcement; the app simply feels less spacious below this. |
| **Comfortable with Advisor panel open** | ~1600 × 720 px | The split divider can drag below this but content/advisor cramp progressively. |

Rationale for **1024×640**: the lowest practical floor for any tab to render its content (Ideation's two-pane layout needs ~700 px content; Execution needs ~1000 px for four columns plus chrome). Below 1024 px wide, columns and side-by-side layouts genuinely break — better to refuse the resize than reflow into something the design wasn't built for.

#### How surfaces behave between min and comfortable widths

| Surface | Behavior |
|---|---|
| **App shell tab bar** | Stays horizontal; 5 tabs + chevron separators + chrome buttons. Never collapses to a menu. At 1024 px the chevrons may compress slightly; never wrap. |
| **Themes view** | Single-column theme cards. Routine sub-cards inside each theme stretch full width. No layout change below or above comfortable width. |
| **Ideation view** | Two-pane: sidebar (~180 px) + content (~remainder). Sidebar **never collapses** at desktop widths — it's the spine of navigation. Idea cards inside the content pane stretch to fill, with a max-width cap so very wide windows leave whitespace on the right rather than blow up card width. |
| **Goals view** | Single column. Goal cards stretch with a max-width cap. |
| **Focus — Day mode** | Two-column theme-grouped layout (Tags \| Routines per theme). Both columns fixed-proportion; stays horizontal. |
| **Focus — Week mode** | 7 day-cards in a row. At 1024 px each card is narrow but readable; cards never wrap to a second row. |
| **Focus — Month mode** | 7-column calendar grid. Cells shrink/grow with window width; never reflows. |
| **Focus — Year mode** | 12 × 31 grid. Cells scale with available width. At 1024 px cells are small but the grid stays one-screen; never paginates. |
| **Execution view** | 4 Kanban columns (Backlog · To do · In progress · Done). At minimum width these are tight; **horizontal scroll** kicks in if the user adds custom columns that exceed window width. Section-card nesting inside Backlog stays vertical. |
| **Advisor panel** | Right-side split with a draggable divider. Has min-widths on both sides (`~500 px content min`, `~400 px advisor min`); the divider can't be dragged past either floor. On windows narrower than `~1000 px`, opening the Advisor auto-closes the Boards strip's secondary chips to recover space. |
| **Dialogs** | Centered modals with their own max-width (~720 px wide for typical editors, ~840 px for the Goal editor, the batch Task creation, and the Goal check-out). Below 800 px window width, dialogs become full-bleed minus 24 px margin. |

#### Very wide windows

| Constraint | Behavior |
|---|---|
| Dialog max-width | Capped (~720–840 px depending on dialog). Centers in the window; doesn't stretch. |
| Tab bar | Spans full width; tab pill widths don't grow beyond their content; left-justified after the brand. |
| Kanban columns | Stay at a comfortable per-column width; extra horizontal space is whitespace on the right of the rightmost column (not stretched columns). |
| Ideation sidebar | Fixed ~180 px regardless of window width. Content pane absorbs the extra. |
| Focus modes' grids | Scale up — bigger cells, more readable. No upper cap. |

#### What we don't do

- **No mobile layout.** No phone-width design, no hamburger menus, no card stacking.
- **No tablet target.** Touch input is supported (per cross-doc guideline #2's 44×44 hit target rule) but the app is not optimized for tablet form factors.
- **No vertical-stack reflow.** Kanban columns don't stack vertically below 1024 px — the window simply can't go below 1024 px wide. Side-by-side panes (Ideation, Focus Day mode) don't collapse to a single column.
- **No content reorder at sizes.** The same controls are in the same places at every supported width. No "hide on mobile" or "promote on desktop" patterns.

#### Why this trade-off

Bearing is a planning tool, not a glanceable widget. Planning needs space — Eisenhower priority sub-sections inside Backlog, week/year calendar overviews, advisor conversations alongside the active view. Forcing these into a phone screen would either dilute the model (one tab at a time, no Advisor coexistence) or replicate desktop affordances on touch (poor outcome). Choosing desktop-first lets every surface be designed once, with one set of assumptions, and shipping fewer compromises.

### 7.10 Focus management

Every keyboard navigation transition has a defined focus-landing target. Without these rules, opening a dialog or switching modes drops focus to `<body>` and the user has to Tab from the start to reach anything useful — a major accessibility regression.

#### Universal rules

- **Focus is always visible** when keyboard-driven (per cross-doc guideline #12). Mouse-driven focus suppresses the ring (`:focus-visible` only).
- **Focus is *returned* after a transient surface closes.** Opening a dialog moves focus into the dialog; closing the dialog returns focus to the element that opened it.
- **Focus is *positioned* meaningfully when a new surface opens.** First field for editors, safe button for confirmations, primary input for chats, etc.
- **Focus *persists* across non-destructive view changes.** Switching Focus modes (Day → Week → Month → Year), expanding/collapsing cards, folding/unfolding sections — none of these reset focus.
- **Esc closes** any dialog or panel (per the established Esc rule, formalised here): focus returns to the triggering element.

#### Focus-landing table

| Transition | Focus lands on |
|---|---|
| **App open / first launch** | The default landing tab's `[ + … ]` create button (or the first interactive element on that tab if none) |
| **Tab switch** (click or `⌘1`–`⌘5`) | Tab's `[ + … ]` create button when present; otherwise the first interactive element in the content area |
| **Open editor dialog** (Theme / Routine / Idea / Goal / Task / V&M) | First text input (typically `Name *` or `Title *`) |
| **Open KR check-in dialog** (numeric) | Numeric value field |
| **Open KR check-in dialog** (boolean) | Currently-set radio option (`Not done` if never set) |
| **Open Goal check-out dialog** | Outcome radio (the currently auto-inferred value, pre-selected) |
| **Open Day check-out dialog** | Day notes textarea (the field most likely to be used immediately) |
| **Open Task creation dialog** | `Title *` text input |
| **Open Delete confirmation dialog** | `[ Cancel ]` button (safe action; per existing guideline #4) |
| **Open Data-path-missing dialog** | First radio option (`Use a different existing data folder`) |
| **Open Advisor panel** | The chat input textarea |
| **Close any dialog / panel** | Element that triggered the open (so the user returns to where they were) |
| **`[ Show archived <type>… ]` clicked** | `[ ← Back to active … ]` button (clear orientation that the user is in a different mode); next Tab moves to the search/filter input |
| **`[ ← Back to active … ]` clicked** | The `[ Show archived <type>… ]` button on the active view (closes the loop) |
| **Focus mode switch** (Day ↔ Week ↔ Month ↔ Year) | The day cell representing the currently-visible day in the previous mode (or today if no specific day was focused) |
| **Day navigator step** (`← / → / [ Today ]`) | Same as before (navigator buttons themselves; user keeps stepping) |
| **Card fold / unfold** (theme, idea, Backlog section, Kanban column) | Stays on the fold chevron (so Enter/Space toggles again or → expands inline content) |
| **Sidebar entry click** (Ideation themes, Goal-linked, Unlinked, All) | The first idea card in the filtered content pane (so Tab continues into content, not back into the sidebar) |
| **Suggestion card `[ Apply ]`** | Next pending card's `[ Apply ]` button; if none, the chat input (so the user can continue the conversation) |
| **Suggestion card `[ Dismiss ]`** | Same as Apply — next pending card's primary action, or chat input |
| **`[ Apply all ]` / `[ Dismiss all ]`** | Chat input (all cards are now resolved) |
| **`[ Promote to Goal → ]` clicked in Idea editor** | After Idea editor closes and Goal editor opens: Goal editor's `Theme *` dropdown (the first required field) |
| **`[ Check out ]` clicked on a goal row** | After Goal check-out dialog opens: outcome radio |
| **`[ Check out day ]` clicked** | After Day check-out dialog opens: Day notes textarea |
| **Cross-tab "Apply" navigates** (e.g., advisor's `create_task` while on Ideation) | After the toast appears, focus stays on the conversation (chat input). If the user clicks `[ Open Execution ]` in the toast, focus moves to that tab's first interactive element. |
| **Toast appears** | Toast does **not** steal focus; focus stays where the user was. Toast action buttons (`[ Retry ]`, `[ Open Execution ]`) are reachable via the next-Tab if the user wants them. |

#### Modal dialog focus trapping

When a dialog is open, Tab cycles only through the dialog's elements (modal focus trap). Shift-Tab cycles backward. The user cannot Tab out of the dialog to underlying tab content while the dialog is modal.

Exception: the Advisor panel is **not** a modal — its split layout keeps the underlying view interactive. Tab does flow between panel and main view. Within the panel, Tab order is: context strip → focus chips → conversation history (cards in order) → suggestion-card buttons → chat input → Send.

#### Tab order within dialogs

Tab order follows visual order top-to-bottom, left-to-right, ending with the secondary button (Cancel) and the primary button (Save / Done / Apply). Concrete order for representative dialogs:

- **Editor dialogs** (Theme / Routine / Idea / Goal / etc.): inputs in declared order → optional fields (lowest priority) → `[ Archive … ]` if present → `[ ⚠ Delete … ]` in Danger zone → `[ Cancel ]` → primary action.
- **Delete confirmation dialog** (§ 2.4): cascade checkbox (when present) → `[ Cancel ]` (initial focus) → `[ ⚠ Delete ]`.
- **Goal check-out dialog**: outcome radio (initial focus) → per-KR chips (in KR order) → per-KR notes (in KR order) → what-worked → what-didn't → archive checkbox → carry-forward checkbox → `[ Cancel ]` → `[ Check out goal ]`.
- **Day check-out dialog**: notes textarea (initial focus) → closing actions checkboxes → `[ Cancel ]` → `[ Check out & save ]`.
- **Task creation dialog (batch)**: title → description → tag combobox → first `[ Prioritize to ⬇ ]` button → its staged-task list (with `⋮⋮` and `[×]` per row) → second quadrant's button → its list → third quadrant's button → its list → `[ Clear All ]` → `[ Close ]` → `[ Done (N) ]`. Within each staged-task row: `⋮⋮` then `[×]`.
- **Suggestion-card area** (within Advisor): each card's `[ Dismiss ]` → its `[ Apply → … ]`, then move to next card.

The same rule applies to all dialogs: visual order, never columns-first-then-rows or some custom traversal.

### 7.11 References and conventions

Compact reference material to keep visual and language conventions consistent across the wireframes.

#### Glyph reference

| Glyph | Meaning | Examples |
|---|---|---|
| `●` | Theme-color dot. Appears next to anything that inherits a theme: theme card header, idea tag chip, idea card on Ideation, goal section header, focus selectable, board chip on Execution, task priority chip (in non-Backlog columns), routine name. | `● Health` · `[● bearing-v2*]` board chip |
| `◆` | Eisenhower section dot (Backlog priority). One of three fixed accent colours; **does not propagate from theme color** — it identifies the priority quadrant. | `◆ Imp. & Urgent (2)` |
| `▾` / `▸` | Fold state. `▾` expanded, `▸` collapsed. Used on theme cards, idea cards, Backlog sections, Kanban columns, the V&M header. |  |
| `⋮⋮` | Drag handle. Reorder by drag; keyboard `⌘⇧↑` / `⌘⇧↓`. Used on themes, routines, ideas, goals, KRs, staged tasks in § 6.2. |  |
| `⋯` | Overflow menu (rare). Currently used only on column headers and task cards in § 6.1. |  |
| `[ × ]` | Close button on a dialog or panel. Top-right corner. Wraps to a destructive cancel. | `[ × ]` on every editor and confirmation dialog |
| `[×]` | Inline remove for a chip or list item. *Compact form*, no internal spaces. Different from `[ × ]` by spacing convention. | `[×]` on suggestion-card removal, staged-task removal, linked-idea chip |
| `⚠` | Destructive-style marker. Always paired with the label, never alone. | `[ ⚠ Delete ]` · `⚠ This tag is already used by …` |
| `✓` | Positive completion state. Always with text: `✓ Done`, `✓ Hit`, `✓ Applied`. | KR boolean done, Goal check-out outcome, suggestion card applied |
| `✕` | Resolved-negative state. Always with text: `✕ Dismissed`, `✗ Missed`. | Suggestion dismissed, KR missed in check-out |
| `↻` | Superseded state. Always with text: `↻ Superseded`. | Suggestion supersession in advisor thread |
| `→` | Directional / "leads to". Used in chips that point at related entities, in Apply labels, and as a separator that signals direction (not chain). | `→ goal` chip · `Apply → KR2` · `Routines · ● Gym · ● Meditation` (note: this uses `·` for set membership, not `›` for chain) |
| `›` | Funnel chain separator. Used between elements of a single upstream lineage. | `● Career › Goal: Ship Bearing v2 › #bearing-v2` |
| `·` | Set / inline list separator. Used when the items don't have a chain relationship. | `Routines · ● Gym · ● Meditation` · `daily · morning` |
| `←` | Back / return navigation. Always with label. | `[ ← Back to active goals ]` |
| `↥` / `↧` | Move to top / bottom shortcuts (in tooltip and context-menu labels). | `Move to top of section  ⌘⇧↥` |

#### Naming conventions

- **Tab names**: Themes · Ideation · Goals · Focus · Execution. Title case, single word each. Order matches the funnel (see § 1 / `funnel.md`).
- **Tab-header button order** (left-to-right): `[ Show archived <type>… ]` (when applicable) · view-mode controls (search input, sort dropdown, etc.) · `[ ✦ Advisor ]` · `[ + … ]` create button (when applicable). The Advisor button is always **immediately before the create button** when both are present; rightmost otherwise. The create button is always rightmost. Show-archived sits on the left (per § 7.6 + the move-archive-button decision). This order is consistent across Themes, Ideation, Goals, Focus, and Execution headers.
- **Boards strip names**: `All`, `Routines`, `Untagged` are always capitalized; tag-based boards are lowercase matching the underlying tag string (`bearing-v2`, `korean`).
- **Abbreviations**: spell out by default. **`Imp. & Urgent`-style abbreviation is allowed only when horizontal width forces it** (column headers, narrow chips) — never in body prose, button labels, or design notes. The full forms are `Important & Urgent` / `Not Important & Urgent` / `Important & Not Urgent`. Document the abbreviation in the surrounding text the first time it appears in a wireframe.
- **Sub-section heading style inside cards**: small-caps short labels (`GOALS`, `ROUTINES`, `TAGS`) inside theme/section containers; sentence-case for theme-group divider headers (`─── ● Health ──────`). Two distinct visual languages — sub-list vs. group divider — kept apart on purpose.
- **Date formats**:
  - Active surfaces (idea cards, recent indicators, check-in history): **relative when ≤7 days, absolute thereafter**. Examples: `(edited 2h ago)`, `(edited yesterday)`, `(edited 5 days ago)`, `Apr 30 · 4 / 12 (33%)`.
  - Archived surfaces (archive views, GoalCheckout history): **absolute ISO-ish** — `archived 2024-08-15`, `completed 2025-01-20`. Distance is the point on archived surfaces; recency on active ones.
  - Calendar/day headers: locale-appropriate (`Mon, May 11 2026`).

#### Check-out flow pattern

Both the Goal check-out (§ 4.4) and Day check-out (§ 6.4) instantiate the same deliberate pattern. Codifying it so future "check-out"-style flows stay consistent:

1. **Auto-detected state at the top** (read-only) — completed tasks for the day; current per-KR progress for a goal. The system shows the user what it observed.
2. **Optional reflection block** — free-text Markdown notes (auto-saves on Day check-out; ceremonial on Goal check-out).
3. **Per-item judgment** (Goal check-out only) — auto-inferred labels the user can override.
4. **Closing actions** as opt-in checkboxes — archive default *on* (the act of checking out implies the thing is done), other actions default *off* (preserve current state by default).
5. **Two-button footer** — Cancel (discards judgment-and-archive decisions) and a singular primary action labelled with the gesture (`[ Check out goal ]` / `[ Check out & save ]`).

If a future entity type ever needs a check-out flow, copy this shape — don't reinvent.

#### Multi-select and bulk operations — out of scope for v1

Across the doc, every action operates on **one entity at a time**: one idea archived, one task moved, one suggestion applied (or all-at-once for the response-level Apply all — but that's the only deliberate "bulk" surface and it scopes to "the cards currently visible," not "everything"). Multi-selection of rows (checkboxes per row, shift-click range selection, Ctrl/Cmd-click toggle) is intentionally **not** in v1 because:

- Personal scale rarely needs it — you delete one idea, archive one goal, move one task.
- Multi-select adds a non-trivial axis to every list surface (selection state, contextual bulk-action bar, ambiguity around drag-while-selected).
- The advisor's structured suggestions can already act on multiple entities (e.g. `link_idea_to_goal` proposed for several ideas at once) when bulk *is* the right shape — and the user reviews each as a card.

If bulk operations become necessary in practice, they ship as a new selection model with a dedicated bar — not as silent retrofits to existing list rows.

---

## Cross-document UX guidelines

Applied throughout the wireframes:

1. **Color is never the only signal.** Theme color always pairs with name, label, or chip text.
2. **All interactive controls have a 44×44 px hit target — including small inline ones.** The visible glyph or label may be smaller (a `⋮⋮` drag handle visually occupies ~12 px; a chip's `[×]` is small by design), but the **clickable region** is always ≥ 44×44. Implementations use padding or a transparent expanded hit-box around the visible element. The rule covers — but isn't limited to — drag handles (`⋮⋮` on themes, routines, goals, KRs, ideas, staged tasks in § 6.2), fold chevrons (`▸` / `▾` on theme cards, idea cards, columns and sections in Backlog, the Vision & Mission header), inline removal buttons (`[×]` on chips, on staged-task rows, on suggestion-card actions in § 7.5), per-card actions on advisor cards (`[ Dismiss ]` / `[ Apply → … ]`), color-picker swatches in § 2.2, theme-fold and routine-row controls inside theme cards in § 2.1, KR rows in § 4.2, and per-task chips/menus in § 6.1. Densely-packed surfaces (KR rows in Goal editor, advisor cards, Themes-tab routine sub-list) need explicit attention during implementation: hit-boxes can overlap visually-adjacent elements without visual change as long as the expanded boxes don't conflict semantically. Keyboard users are unaffected by this rule (they reach controls via Tab order, not pointer position) — but small visible glyphs still need a visible focus ring proportionate to the hit-box, not just the glyph.
3. **Destructive actions sit in a "Danger zone" group**, never adjacent to Save.
4. **Default focus is on the safe action** (Cancel for confirms, first input for editors). Esc closes; Enter triggers the primary action only when it's safe.
5. **Empty states are instructional**, not decorative — they tell the user the next action. Every list/board view has a documented empty state per § 7.6 (heading + orientation paragraph + 1–2 next-action buttons).
6. **Funnel context appears inline, never as a global breadcrumb bar.** Lineage is surfaced only on the surfaces where it pays off — Execution board header, Focus summary chips, and dialog titles for child entities (e.g. KR check-in showing its parent goal). Tabs answer "where am I"; persistent breadcrumb chrome would be redundant and is intentionally absent.
7. **Same dialog handles create + edit** for every entity, with the title and primary button label swapping contextually.
8. **Reused dialog patterns** (Delete confirmation, the editor shell with "Danger zone") keep the UI predictable and reduce both visual and code surface.
9. **Destructive buttons carry a visual marker everywhere**, framed or not. Any button that destroys user data (`Delete`, `Delete <entity>`, the cascade-confirm `Delete` button) renders in a destructive style — red text or red outline, prefixed with `⚠` in these wireframes. The Danger zone frame in editor dialogs is *additional* layout protection (separating destructive actions from a nearby Save), not the primary signal. List rows omit the frame because there's no Save to separate from and per-row frames would saturate the page; the destructive styling alone carries the warning, with confirmation dialogs (§ 2.4) supplying the second-step safety.
10. **Async operations reserve space, disable the trigger, and surface errors near the source.** Loading content uses skeletons/spinners that occupy the eventual layout (no jump on arrival). Buttons that write are disabled with a pending indicator until the operation resolves. Errors render inline next to the field/card/button that produced them; toasts are reserved for transient acknowledgments. See § 7.7 for the full pattern catalog.
11. **Bearing is desktop-first.** Minimum window size is 1024×640 (enforced by Wails `MinSize`); layouts are always horizontal — sidebars don't collapse to menus, Kanban columns don't stack vertically, multi-pane views don't reflow to single-column. No mobile or tablet target. See § 7.9 for per-surface behavior at min vs. comfortable widths.
12. **Every focusable element has a visible focus ring.** 2 px solid outline at 2 px offset (visually a 4 px ring around the element), high-contrast colour against the surface, border-radius matched to the element. Rendered on **keyboard focus only** (`:focus-visible`) — mouse clicks don't trigger the ring. The ring is **distinct from hover and active states** (hover may add background/colour; focus adds an outline). Applies to every interactive element: buttons, form fields, chips, drag handles, fold chevrons, tabs, sidebar entries, draggable cards, drop targets, suggestion-card actions. Where the visible glyph is smaller than the hit target (per guideline #2), the ring matches the **hit-target box**, not just the glyph. See § 7.10 for where focus *lands* at each transition.
13. **Animation timing sits in the 150–300 ms range** for micro-interactions (fold/unfold, dropdown open/close, drag hover-state, button press feedback). Slower than 300 ms reads as sluggish; faster than 150 ms reads as jittery. Use `transform` and `opacity` for animated properties (cheap on the compositor); avoid animating `width`/`height`/`top`/`left` (causes reflow). Transitions on color/background can go up to 200 ms; entrance/exit animations of larger panels (e.g., the Advisor panel sliding in) up to 300 ms.
14. **Respect `prefers-reduced-motion`.** When the OS-level reduced-motion preference is set, animations are *reduced to instantaneous transitions* (0 ms) for: fold/unfold, panel slide-in, dropdown open, toast slide-in, suggestion-card streaming entrance. **Functional non-motion** (focus rings, hover color changes, button press color flash) stays — these aren't motion, they're state feedback. The advisor's streaming behaviour (per § 7.7) still arrives incrementally because it reflects real network/model timing, not animation; reduced-motion makes each card *appear* without a slide-in animation, but the cards still appear one by one. Auto-detected from OS via the standard media query (per § 7.2 — no in-app override).
15. **Resolved-card badges always carry text, not just the glyph.** `✓ Applied`, `✕ Dismissed`, `↻ Superseded` — the word is required; the glyph is supplementary. Same rule for any other status badge in the app (paused routines, archived items shown in archive views). This is the cross-doc-guideline-#1 ("color is never the only signal") rule applied to status badges specifically: glyph alone is too easy to misread; text disambiguates.
16. **Whenever a Sort dropdown exists, Manual is the canonical order, other sorts are read-only views.** Manual order is the persistent stored order the user controls via drag-reorder; non-Manual sorts (Recent, Alphabetical, etc.) are derived views that don't mutate the canonical order. Switching back to Manual restores it untouched. While a non-Manual sort is active, drag-reorder is disabled (per § 3.1 Sort dropdown details). This rule applies anywhere a Sort dropdown is added — currently only Ideation, but the convention scales.
17. **Esc is the safe-cancel action on every dialog, modal, and panel.** Pressing Esc dismisses without committing pending changes (Cancel-equivalent). Returns focus to the triggering element (per § 7.10). Exceptions are explicit and documented: the Data-path-missing dialog in § 7.7 intentionally has no Esc route (the app can't function without a decision). All other dialogs respect Esc.
18. **`tmp/Bearing` references in this doc are design provenance only.** Mentions of `tmp/Bearing` (the legacy app) describe inherited patterns, the source of inspiration, or specific original Svelte component names — they are *not* implementation dependencies. Bearing v2 is a separate codebase that may borrow patterns from `tmp/Bearing` but doesn't link against it. Future contributors can read those references as historical context, not as code constraints.
19. **Reorderability pattern is identical across every entity-row surface.** Every reorderable row carries a `⋮⋮` drag handle on its leftmost edge (always visible regardless of expanded state). Drag-to-reposition; keyboard equivalent `⌘⇧↑` / `⌘⇧↓` on a focused row. Applies to: theme cards (§ 2.1), routine sub-cards inside theme cards (§ 2.1), idea cards (§ 3.1), goal cards (§ 4.1), KR rows inside the Goal editor (§ 4.2), staged tasks inside the batch Task creation dialog (§ 6.2). Per-section design notes don't repeat this — when a section says "rows are reorderable," guideline #19 supplies the affordance. Tasks on the Kanban board (§ 6.1) are reorderable too, but via native drag-and-drop on the card body (no `⋮⋮` handle), because Kanban cards are spatial — that's the deliberate exception called out in § 6.1.
