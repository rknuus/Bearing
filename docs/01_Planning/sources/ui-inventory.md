# Bearing — UI Inventory

Hierarchical inventory of UI surfaces at the view/dialog level. Drill-down into individual fields, controls, and component states is intentionally out of scope at this stage.

Editors for entities are unified surfaces — the same dialog handles both create and edit.

## App shell

- Tab bar (Themes · Ideation · Goals · Focus · Execution)
- Main content area (hosts the active tab's view)
- Help entry point (`[ ? ]` icon in the shell chrome — opens Keyboard Shortcuts dialog)

## Themes tab

- **Themes view** — collapsible Vision & Mission header (set / expanded / empty states) + list of theme cards, each with a routines sub-list (goals are not embedded here; they're on the Goals tab, grouped by theme)
- **Theme editor dialog** — create/edit theme (name, color, ordering)
- **Routine editor dialog** — create/edit routine (name, theme, recurrence, frequency, preferred days, active toggle)
- **Vision & Mission editor dialog** — edits both Vision and Mission Markdown fields in one dialog; both optional; reset by emptying the textarea and saving (no dedicated clear control)
- **Delete theme confirmation dialog**
- **Delete routine confirmation dialog**

## Ideation tab

- **Ideation view** — two-pane layout: left sidebar (themes with counts + All / Untagged / Goal-linked / Unlinked) + right content pane (theme-grouped bordered idea cards with `⋮⋮` drag handles, expand-to-read notes inline, per-row `[ Edit ]` and `[ ⚠ Delete ]`, goal-link chip rendered as `→ goal` / `→ N goals` / `—`). Top of right pane: `[ Filter ]` text search + `Sort` dropdown (Manual / Recently added / Recently edited / Alphabetical). Header: `[ ✦ Advisor ]`, `[ Show archived ideas… ]`, `[ + Idea ]`. No `labels[]` field on the Idea entity — cross-theme grouping handled by text search and advisor
- **Idea editor dialog** — create/edit idea (title, detailed thoughts, optional theme, Tag field with normalization preview + uniqueness/reserved validation — four field states: Normal / Normalization preview / Collision / Reserved)
- **Delete idea confirmation dialog**

## Goals tab

- **Goals view** — OKRs grouped by theme as individually bordered cards with `⋮⋮` drag handles (manual priority reorder within each theme). Per-row buttons: `[ Edit ]`, `[ Check out ]`, `[ ⚠ Delete ]`. Tab header: `[ ✦ Advisor ]`, `[ Show archived goals… ]`, `[ + Goal ]`.
- **Goal editor dialog** — create/edit OKR (theme, objective, key results with `⋮⋮` drag-reorderable rows, linked ideas, time horizon)
- **KR check-in dialog** — periodic progress update on key results. Renders one of two variants depending on KR type: **Numeric** (slider + numeric value + unit + history with `%`) or **Boolean** (two-option `Not done / Done` toggle + history with `✓ Done` / `○ Not done`). A type chip in the dialog header makes the variant explicit.
- **Goal check-out dialog** — end-of-cycle closing flow (outcome rating, per-KR status with auto-inferred labels + per-KR optional notes, what-worked / what-didn't retro, archive + optional carry-forward to a follow-up goal). Auto-infer rule is type-aware: numeric KRs use `≥100%/50–99%/<50% → Hit/Partial/Missed`; boolean KRs use `Done/Not done → Hit/Missed` (no Partial auto-emit for boolean — the type has no intermediate state, though manual override to Partial is allowed).
- **Delete goal confirmation dialog**

## Focus tab

- **Focus view** with four switchable modes:
  - **Day mode** *(editable)* — day navigator + theme-grouped selectables (tags and routines) + selected-for-today summary. The only mode that writes focus state.
  - **Week mode** *(read-only)* — 7 day cards across the visible week, each listing focused tags/routines; coverage strip at the bottom.
  - **Month mode** *(read-only)* — calendar grid, each day cell stacked with theme-colored dots; coverage strip.
  - **Year mode** *(read-only)* — 12×31 grid (same shape as `tmp/Bearing`'s mid-term calendar) showing daily focus across the year; coverage strip.
- *(reuses Routine editor dialog via "Add new routine" entry point in Day mode)*

## Execution tab

- **Execution view** — Boards strip + funnel context header + Kanban with full `tmp/Bearing` feature set. Boards strip has two kinds: always-present **`All`** (aggregates every task; default landing view unless a Focus is set) + **per-tag boards** keyed by tag string. `routine` and `untagged` are *reserved tag strings* shown as per-tag boards under one consistent rule ("show when there's something to show"): `routine` chip appears when routines are due or in-flight; `untagged` chip appears when orphan tasks exist from cascade-opt-out. Eisenhower priority sections live inside the **Backlog** column (3 sections — Important & Urgent / Not Important & Urgent / Important & Not Urgent; Q4 omitted by design); other columns (To do / In progress / Done) are flat. Supports column folding, section folding, per-column and per-section task counts, column reorder via drag handle, column rename, insert column before/after, archive-all, column delete, per-task context menu (state-aware: section moves and priority change shown for Backlog tasks only). Tab header: `[ Check out day ]`, `[ Show archived tasks… ]`, `[ ✦ Advisor ]`.
- **Task creation dialog (batch)** — title, description, tag (autocomplete combobox over existing idea-tags, theme-colored, with idea-title context per row; no inline "create new tag" path — that lives on Ideation), plus three per-section `[ Prioritize to ⬇ ]` buttons (matching `tmp/Bearing`'s `CreateTaskDialog`). Stages N tasks in one session across the three Eisenhower sections; drafts persist server-side so `[ Close ]` is non-destructive. Staged tasks have `⋮⋮` drag handles (within-quadrant reorder, cross-quadrant move). Confirm buttons: `[ Clear All ]` (discards staged), `[ Close ]` (preserves drafts, closes), `[ Done (N) ]` (commits all staged to Backlog and closes). New tasks always land in Backlog.
- **Task editor dialog** — content only: title, description, tag. Read-only "Current location" line for orientation. Priority and column are not in the dialog — they're managed via direct manipulation on the board.
- **Day check-out dialog** — end-of-day reflective ritual. Auto-detected completed/in-progress task lists, optional Markdown day notes (auto-save), opt-in closing actions (archive completed tasks default-on, reset in-progress to Backlog default-off). Saves a `DayLog` entity keyed by date; idempotent on re-run. Reachable from Execution and from Focus Day-mode summary bar.
- **Delete task confirmation dialog**

## Cross-cutting

- **Advisor panel** — right-side split panel triggered by the `[ ✦ Advisor ]` button present in every view header (Themes, Ideation, Goals, Focus, Execution) and by `⌘⇧A`. Singleton, view-aware, funnel-graph-aware; surfaces cross-tab suggestions and applies them with explicit `[ Apply ]` actions. Suggestion contract is the **Suggestion catalog** in `ui-wireframes.md` § 7.5 — covers 10 types (`modify_kr`, `add_kr`, `modify_objective`, `create_goal`, `create_task`, `create_routine`, `modify_idea`, `link_idea_to_goal`, `move_task`, `change_priority`) with documented unrecognized-type and invalid-schema fallbacks. New types can be added later under the same evolution rule.
- **Empty states** — per-view first-run / zero-data screens for Themes, Ideation, Goals, Focus (Day mode + helper line for Week/Month/Year), Execution (no active boards + empty active board). Each: heading, one-paragraph orientation, 1–2 next-action buttons. Documented in `ui-wireframes.md` § 7.6.
- **Loading and error states** — cross-cutting patterns for save-in-flight (button disabled + spinner), advisor thinking, advisor streaming (incremental cards + caption), initial-load skeletons, inline form errors, success / error toasts, advisor network-error fallback, apply-suggestion failure on a card. Documented in `ui-wireframes.md` § 7.7.
- **New-data-folder notification dialog** — modal triggered at app launch after Bearing creates a fresh data folder at the OS-conventional location (true first-run, or because the previous folder was deleted / moved / its symlink target is offline). Informational; offers Quit (so the user can substitute a backup folder before relaunch) or Continue (proceed to onboarding). Bearing does not programmatically distinguish first-run from accidental data-loss; the user is the disambiguator. Documented in `ui-wireframes.md` § 7.7.
- **Archive — model and views** — manual conscious gesture (no auto-archive). Applies to Ideas (via Idea editor), Goals (via Goal check-out dialog), Tasks (via Day check-out dialog or per-task context menu). Per-archivable-tab `[ Show archived <type>… ]` button replaces the tab content with a context-specific archive view (theme-grouped, with filter inputs + per-item `[ Unarchive ]`). Themes and Routines are not archivable — delete-only. Documented in `ui-wireframes.md` § 7.8.
- **Window size and responsive policy** — Bearing is desktop-first. Hard minimum window size 1024×640 (enforced by Wails); layouts are always horizontal (no vertical stack, no sidebar collapse, no Kanban column reflow). Documented in `ui-wireframes.md` § 7.9 and cross-doc UX guideline #11.
- **Focus management** — every focusable element has a visible focus ring (keyboard-only, distinct from hover); every transition has a documented focus-landing target (open dialog → first field / safe action / sensible primary; close → triggering element; tab/mode switch → meaningful starting point; modal dialogs trap Tab; Advisor panel is non-modal and shares Tab order with the underlying view). Per-dialog tab order follows visual order top-to-bottom. Documented in `ui-wireframes.md` § 7.10 and cross-doc UX guidelines #12 (rings) and the focus-landing table.
- **References and conventions** — glyph reference (●, ◆, ▾/▸, ⋮⋮, ⋯, [×], [ × ], ⚠, ✓, ✕, ↻, →, ›, ·, ←, ↥/↧); naming conventions (tab names, abbreviation rule, sub-section heading style, date formats per surface); check-out flow pattern as a reusable shape. Documented in `ui-wireframes.md` § 7.11.
- **Multi-select / bulk operations** — explicitly **out of scope for v1**. All list operations are one-entity-at-a-time; the only "bulk" surface is the advisor's response-level `[ Apply all ]` / `[ Dismiss all ]` which scopes to the response's cards, not arbitrary selection. Rationale documented in `ui-wireframes.md` § 7.11.
- **First-run onboarding view** — pre-seeds 3–5 default themes, brief funnel intro
- **No Settings view** — Bearing has no user-facing settings. Storage location is the OS-conventional application data folder (macOS `~/Library/Application Support/Bearing/`, Linux `~/.config/bearing/`, Windows `%APPDATA%\Bearing\`), git-initialized on first run; locale/theme/motion are auto-detected from the OS; other preferences have hardcoded defaults. Data location + version-control framing are surfaced in the About dialog. Power-user storage relocation is via filesystem-level directory linking. Documented in `ui-wireframes.md` § 7.2.
- **About dialog** — version, license, links
- **Keyboard shortcuts dialog** — reference card for navigation and actions
