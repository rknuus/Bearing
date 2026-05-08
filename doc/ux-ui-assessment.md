# Bearing Frontend UX/UI Assessment

**Date**: 2026-05-08
**Branch reviewed**: `main` (post-merge of `tag-scoped-archive-all`)
**Scope**: Svelte 5 + TypeScript frontend under `frontend/src/` — views, components, reusable primitives, global styles
**Method**: Code-level review against the UI/UX Pro Max checklist (accessibility, interaction, performance, layout, typography & color, animation, style consistency)
**Last status update**: 2026-05-08 (after merging `fix-ux-ui-critical-findings` and `okrview-icons` initiatives)

---

## Resolution Status

| Finding | Severity | Status | Resolved by |
|---------|----------|--------|-------------|
| C1 | Critical | RESOLVED | `fix-ux-ui-critical-findings` (#136-#139, EisenKan archive-all) + `okrview-icons` (#142) |
| C2 | Critical | RESOLVED | `fix-ux-ui-critical-findings` (#140) |
| C3 | Critical | RESOLVED | `fix-ux-ui-critical-findings` (#141) |
| I1 | Important | DEFERRED | — |
| I2 | Important | DEFERRED | — |
| I3 | Important | DEFERRED | — |
| I4 | Important | DEFERRED | — |
| I5 | Important | DEFERRED | — |
| I6 | Important | DEFERRED | — |
| P1 | Polish | DEFERRED | — |
| P2 | Polish | DEFERRED | — |
| P3 | Polish | DEFERRED | — |
| P4 | Polish | DEFERRED | — |

All three Critical findings shipped; Important and Polish items remain candidates for future initiatives. Additional issues uncovered during execution (not in the original assessment) and resolved are listed in [Resolved Discoveries](#resolved-discoveries-out-of-original-scope) at the bottom.

---

## Highlights

1. **TaskActionMenu portal/positioning is genuinely strong engineering** — `frontend/src/components/TaskActionMenu.svelte:201–217`, with a 60-line comment block (lines 31–49) documenting *why* it portals to `body` (ancestor `transform` creates a containing block for `position: fixed`; nested `overflow-y: auto` flashes scrollbars). Comment-as-spec that survives refactors.

2. **`stopDragStart` Svelte action on TaskCard sub-buttons** — `frontend/src/components/TaskCard.svelte:79–91` attaches *native* `mousedown/touchstart/pointerdown` listeners directly because Svelte 5 delegated handlers run after native ancestor listeners. The only correct way to stop `svelte-dnd-action` drag pickup. Documented and applied consistently.

3. **`--theme-color` CSS custom property + `color-mix(in srgb, ...)`** — `frontend/src/styles.css:14–24`, used across calendar and Eisenhower quadrants. One variable drives borders, backgrounds, and tinted hover states without per-component branching.

4. **Calendar's automatic text-color contrast adjustment** — `frontend/src/views/CalendarView.svelte:307–314` runs the WCAG relative-luminance formula and picks black/white per cell. With user-chosen theme colors this is the only correct approach; static choices would silently fail contrast on half the palette.

5. **Optimistic DnD with snapshot rollback + Escape cancel** — `frontend/src/views/EisenKanView.svelte:597–606`, `135–142`. Escape during drag dispatches a synthetic `mouseup` to terminate dnd cleanly; reconciles backend rule violations into a UI rollback.

6. **State-consistency verification after every mutation** — `verifyTaskState`, `verifyCalendarState` compare frontend state to a fresh backend fetch and surface mismatches as a banner. Unusual and excellent for this category of app.

---

## Critiques

### Critical

#### C1. Emoji used as primary action icons

**Status**: RESOLVED — `fix-ux-ui-critical-findings` initiative (commits `68723ec`, `64d5b40`, `07738e8`, `4329264`, `57379df`) plus `okrview-icons` initiative (commit `20167b9`). All called-out files migrated to `@lucide/svelte` SVG components with `stroke="currentColor"` so existing `:hover { color: ... }` cascades drive icon color. Discoveries beyond the original scope (EisenKanView Archive-all `✅`, OKRView ~25 emoji) also resolved.

**Files**: `frontend/src/components/TaskCard.svelte:135` (🗑️), `:147` (✅ for *archive*); `frontend/src/components/EisenhowerQuadrant.svelte:101` (🗑️); `frontend/src/views/CalendarView.svelte:689,693` (⬅️➡️); `frontend/src/components/CreateTaskDialog.svelte:369` (⬇).

**Why it's not good.** The ✅-for-archive is semantically wrong: a green check universally reads "complete / done", not "archive". On hover the parent `.archive-btn:hover` even sets `color: var(--color-success-600)` (line 288) — except the rule does nothing because emoji glyphs are multicolor and ignore `color`. Same dead rule on `.delete-btn:hover` for 🗑️. Emoji rendering also varies across macOS WebKit vintages.

**How to improve.** Inline SVG with `fill="currentColor"`. Heroicons or Lucide trash + archive-box are 5 paths each. Same for the calendar chevrons. Existing CSS hover rules immediately start working.

#### C2. ErrorDialog is a 5-second auto-dismissing toast, not a dialog

**Status**: RESOLVED — `fix-ux-ui-critical-findings` (#140, commit `4fab74f`). The 5 s auto-dismiss was removed entirely; errors now persist until the user explicitly dismisses via × close button (top-right, `aria-label="Dismiss"`) or `Escape`. Multiple errors stack vertically with independent dismissal. Non-modal. The user redirected from this doc's recommendation ("scaled duration + pause-on-hover") to the stronger "no auto-dismiss" because of a real failure mode: a user switching to another window during a slow operation could miss the error entirely.

**File**: `frontend/src/components/ErrorDialog.svelte:22–26`.

**Why it's not good.** Auto-closes regardless of how many violations are listed. Rule-engine violations are exactly when the user needs time to read *why* their action failed; multiple rules can stack. No hover-to-pause. Functionally identical to `Toast.svelte` despite the name. The project memory rule "errors must use ErrorDialog, never alert()" technically holds, but the *semantics* are toast semantics — a user with 4 violations gets ~1.25 s per violation to read.

**How to improve.** Either make it a real modal `<Dialog>` for rule violations (recovery-blocking; explicit close), or pause the timer on hover/focus and scale duration: `3000 + 1500 * violations.length`, capped.

#### C3. No `:focus-visible` styles on TaskCard, calendar day cells, theme badges, or nav buttons

**Status**: RESOLVED — `fix-ux-ui-critical-findings` (#141, commit `16461fa`). Added `--focus-ring: 2px solid var(--color-primary-500)` and `--focus-ring-offset: 2px` tokens to `:root` in `styles.css`. Applied `:focus-visible` outlines using these tokens to `.task-card`, `.day-num`, `.day-text`, `.legend-item`, `.theme-badge`, and `.tag-board-card-title-bar.receded`. Migrated `Breadcrumb.svelte`'s ad-hoc rule to consume the same tokens.

**Files**: `frontend/src/components/TaskCard.svelte` (`:hover`/`:active` defined, no focus); `frontend/src/views/CalendarView.svelte:1003,1049` (`.day-num`, `.day-text`).

**Why it's not good.** Tab traversal through a board is invisible to keyboard users. Desktop ≠ mouse-only. `frontend/src/lib/components/Breadcrumb.svelte:105` does this correctly (`:focus-visible { outline: 2px solid var(--color-primary-500); outline-offset: 2px; }`) — the project knows the pattern, just doesn't apply it consistently.

**How to improve.** Promote a `:root` token: `--focus-ring: 2px solid var(--color-primary-500)`. Apply to `.task-card`, `.day-num`, `.day-text`, `.theme-badge`, `.legend-item`, `.tag-board-card-title-bar.receded`, `.nav-link`.

---

### Important

#### I1. Double-click as primary edit affordance

**Status**: DEFERRED — candidate for a future initiative.

**Files**: `frontend/src/components/TaskCard.svelte:97`; `frontend/src/views/CalendarView.svelte:744,756`; `frontend/src/components/EisenhowerQuadrant.svelte:77`.

**Why it's not good.** Double-click discoverability on web/desktop is famously poor — there's no visual "I am double-clickable" cue. New users single-click and get nothing on a TaskCard, or single-click a day-text cell and discover *selection* but never editing. `TaskActionMenu` is single-click, which makes the inconsistency worse: some actions are 1-click, edit is 2-click.

**How to improve.** Add an "Edit" entry to the existing `TaskActionMenu.actions` array (already wired). For calendar days, add a hover pencil affordance, or commit to "click the day-number cell opens the editor". Keep double-click as a power-user shortcut.

#### I2. Z-index ladder has collisions and no token scale

**Status**: DEFERRED — candidate for a future initiative. Note: line numbers in `ErrorDialog.svelte` shifted after the C2 fix; the underlying issue (no `--z-*` token scale) is unchanged.

**Files**: `frontend/src/components/TaskActionMenu.svelte:352` (`1000`); `frontend/src/lib/components/Dialog.svelte:74` (`1000`); `frontend/src/lib/components/Toast.svelte:40` (`1000`); `frontend/src/components/ErrorDialog.svelte:59` (`2000`); `frontend/src/views/EisenKanView.svelte:1890–2000` (`999/1000/1100`); `frontend/src/components/TagBoardCard.svelte` (`100`).

**Why it's not good.** Open a TaskActionMenu inside a Dialog and which wins depends on DOM order. The next person bumps an unrelated number and silently breaks the stack.

**How to improve.** Tokenize in `frontend/src/styles.css`:

```css
--z-dropdown: 100;
--z-sticky: 200;
--z-overlay: 1000;
--z-modal: 1100;
--z-popover: 1200;
--z-toast: 1300;
--z-error: 1400;
```

Popovers opened *from inside* modals must beat the modal — TaskActionMenu needs `--z-popover > --z-modal`.

#### I3. Calendar text cells render at 0.7 rem (≈ 11.2 px)

**Status**: DEFERRED — candidate for a future initiative.

**File**: `frontend/src/views/CalendarView.svelte:982,1006,1020,1051`. Grid forced into 24 px + 24 px + 1fr columns at 1.5 rem row height.

**Why it's not good.** 12 × 31 is genuinely dense, and small text is unavoidable to a degree. But 11.2 px ellipsizes the day text *aggressively* — almost every cell becomes "Mon..." or "Sho...". The user sees the calendar as a color heatmap with unreadable text, defeating the free-text-per-day feature. The weekday column at 0.65 rem is decorative noise at that size.

**How to improve.** Either (a) drop the weekday column (day-number already implies the date) and bump base to `0.75rem` (12 px) — ~30 minutes, or (b) add a 3-level zoom (compact / standard / readable) swapping `grid-template-columns` and font sizes — ~half-day.

#### I4. Loading state is a single centered string

**Status**: DEFERRED — candidate for a future initiative. Worst CLS in the app; recommended quick win that didn't make this round.

**Files**: `frontend/src/views/CalendarView.svelte:705` ("Loading calendar..."); same pattern in `EisenKanView.svelte` and `OKRView.svelte`.

**Why it's not good.** Calendar grid is nontrivial to render (12 × 31 = 372 cells × theme-color computation × routine status). The viewport collapses to a centered text label, then *jumps* into the full grid — classic CLS.

**How to improve.** Skeletonize: render the same `.calendar-grid` template with neutral-gray cells while `loading === true`. Replace the `{#if loading}` branch with `class:loading` on the grid and gate cell content.

#### I5. The deck staircase (TagBoardCard peek frames) is virtuoso engineering for a barely-perceptible effect

**Status**: DEFERRED — candidate for a future initiative. Decision point (commit harder vs. drop) not yet made.

**Files**: `frontend/src/components/TagBoardCard.svelte:319–367`; `frontend/src/components/TagBoardDeck.svelte:155–230`.

**Why it's not good.** The implementation is virtuoso — clip-path polygons cut around the foreground's `border-radius`, dynamic vertical padding sized to worst-case translation, opacity falloff per depth. But the rendered effect is a 5 px L-shape at depth 1, fading to ~0.30 opacity by depth 3 (line 329). Users likely perceive it as a styling glitch or shadow, not "more boards stacked". There's no label, no count, no interactive surface (depth ≥ 2 is `pointer-events: none`). The strip above already conveys "these are the boards"; the staircase repeats the information silently.

Costs: 20 px horizontal padding, `position: relative` on every foreground card, `z-index: 100` paint layers, dynamic top/bottom padding, and 60+ lines of clip-path geometry future maintainers must understand.

**How to improve.** Either commit harder or drop it. Commit: add a board-count badge to the foreground frame ("3 of 7 boards") so the staircase has a verbal anchor users can correlate with the visual cue. Drop: remove the peek frames entirely; the strip already provides navigation. Recommend dropping unless usability testing shows users actually use the staircase to navigate.

#### I6. Spacing tokens used as font-size tokens

**Status**: DEFERRED — candidate for a future initiative. Pairs naturally with I2 (z-index tokenization) as a "design tokens cleanup" initiative.

**File**: `frontend/src/lib/components/Dialog.svelte:88` sets `h2` font-size to `var(--space-5)`. TaskCard, TaskActionMenu, EisenhowerQuadrant, CalendarView use 4–5 different ad-hoc sizes (`0.625/0.6875/0.75/0.8125/0.875rem`) without a system.

**Why it's not good.** Spacing and typography scales are different concerns. Coupling them means a layout-driven change to `--space-5` silently shifts every dialog title.

**How to improve.** Add `--font-size-{xs,sm,base,md,lg}` tokens to `styles.css`. Replace `var(--space-5)` in Dialog and the literals in components.

---

### Polish

#### P1. `prefers-reduced-motion` not honored anywhere

**Status**: DEFERRED — candidate for a future initiative.

`.task-card:active { transform: rotate(2deg) }` and similar fire unconditionally across the tree. Add a global rule in `styles.css`:

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
    transform: none !important;
  }
}
```

#### P2. Three priority buttons distinguished only by color

**Status**: DEFERRED — candidate for a future initiative.

**File**: `frontend/src/components/CreateTaskDialog.svelte:369`. Red (urgent) and amber (not-important-urgent) are the canonical red-green CVD confusion pair.

**Fix.** Add 2-letter codes (IU / NIU / INU) redundant with color.

#### P3. Missing token + dead fallback

**Status**: DEFERRED — candidate for a future initiative. The hex fallback `#dcfce7` is still silently in use.

**File**: `frontend/src/components/TaskCard.svelte:288–289` references `--color-success-100`, but `frontend/src/styles.css:53–54` only defines `--color-success-500/600`. Hex fallback `#dcfce7` is silently used.

**Fix.** Add the token, remove the fallback.

#### P4. Button.svelte's 10 icon-color variants unused at most call sites

**Status**: PARTIALLY ADDRESSED — `okrview-icons` (#142) leaned on `<Button variant="icon" color="...">` for the OKRView migration, leveraging the existing icon variants. The TaskCard / EisenhowerQuadrant / EisenKanView call sites still re-roll their styles (`.delete-btn`, `.archive-btn`, `.archive-all-btn`, `.restore-btn` define their own backgrounds, borders, and hover transitions). The duplicated-CSS consolidation remains a future task.

**File**: `frontend/src/lib/components/Button.svelte` defines `edit/delete/add/save/cancel/complete/reopen/archive/nav` icon variants. ~12 emoji icon-button call sites (TaskCard delete/archive/restore, EisenhowerQuadrant) re-roll their styles instead of using `<Button variant="icon" color="delete">`.

**Fix.** Sweep the codebase. Reduces ~200 lines of duplicated CSS.

---

## Quick Wins

Ranked by impact ÷ effort. Status reflects post-merge state:

| # | Fix | Effort | Closes | Status |
|---|-----|--------|--------|--------|
| 1 | Global `:focus-visible` ring — promote Breadcrumb's pattern to `:root`, apply to ~6 selectors | ~30 min | C3 | DONE (#141) |
| 2 | Replace emoji icons with inline SVG (start with TaskCard 🗑️/✅ + calendar chevrons) | ~2 hr | C1 + cascading dead-rule cleanup | DONE (#136–#139, EisenKan archive-all, #142 OKRView) |
| 3 | Tokenize `--z-*` and `--font-size-*` in `styles.css`, sweep four files | ~1 hr | I2 + I6 entirely | DEFERRED |
| 4 | Skeletonize calendar / EisenKan loading state | ~45 min | I4 (worst CLS in the app) | DEFERRED |
| 5 | ErrorDialog: pause-on-hover + length-scaled duration | ~20 min | C2's actual harm | DONE (#140 — shipped a stronger fix: full no-auto-dismiss + stacking + Escape) |

---

## Out-of-Scope Notes

These were explicitly preserved as non-issues during the review:

- Desktop-only (no mobile breakpoint targeted).
- No `data-testid` in production code (E2E uses CSS / text / semantic selectors).
- Svelte 5 runes mode (`$state`, `$derived`, `$effect`, `$props`) — not legacy.
- Three dev environments (Vite mock + Wails proxy + native).
- Errors use ErrorDialog, never `alert()` — the existing pattern is intentional; the critique above (C2) is about *behavior*, not *adoption*.
- No external CSS framework — hand-written CSS, scoped per component, is by design.

---

## Resolved Discoveries (out of original scope)

Issues uncovered while implementing the assessment fixes and resolved before this doc's status update:

- **EisenKan Archive-all button label still used `✅`** — same C1 root cause as the per-card archive button, missed in the original C1 file list. Resolved by `fix-ux-ui-critical-findings` extension (commit `57379df`): label split into text-only string + separate `<Archive size={14} />` icon, with consequent updates to `EisenKanView.test.ts` and `tests/e2e/eisenkan-tag-scoped-archive.test.js` assertions.

- **OKRView contained ~25 additional emoji glyphs** — flagged during task #137's regression sweep but kept out of scope for the first initiative. Resolved by the dedicated `okrview-icons` initiative (commit `20167b9`) covering theme / objective / key-result / routine action buttons (delete 🗑️, edit ✏️, save ✅, cancel ❌, complete ✅, reopen 🔄, archive 📦, calendar 📅, clipboard 📋, add ➕). Save vs complete disambiguated (`Check` vs `CheckCircle`) — both shared `✅` until then.

- **OKRView `.item-actions { opacity: 0 }` hid action buttons at rest** — a separate discoverability issue compounding C1 in OKRView. Required hovering each row to discover any affordance. Resolved by `okrview-icons` (#142): rest opacity raised to `0.6`; hover still sharpens to `1`.

- **Icon-button rest contrast was below the perceivability threshold** — after the C1 emoji-to-SVG migration, the icons inherited `gray-400` from their button frames (~3:1 contrast on white, perceivable but easy to miss). The previous emoji rendered in vibrant multicolor regardless, masking the underlying CSS choice. Resolved by commits `2b6c983` (`gray-400` → `gray-600` for `.delete-btn`, `.archive-btn` in TaskCard / EisenhowerQuadrant, `.archive-all-btn` in EisenKanView) and `5b9e7b5` (`.archive-all-btn` further to `gray-700`).

- **Lucide package half-and-half between `lucide-svelte` and `@lucide/svelte`** — task #136 added the redirect package `lucide-svelte@^1.0.1` (which transitively pulls `@lucide/svelte`). Subsequent agents normalised some imports to `@lucide/svelte` directly while leaving others on the legacy name. Both worked only because of the redirect; a fresh install or future redirect removal would break the legacy imports. Resolved by commit `be229d7` (`Issue #136: Normalize Lucide imports to @lucide/svelte`).

- **Calendar tag-section collapse marker swapped abruptly between `▼`/`▶`** — noted in passing during the original review. Resolved as a side effect of task #138's CalendarView icon migration: the marker is now a single `<ChevronRight size={16} />` rotated 90° via `aria-expanded`-driven CSS with a 200 ms transition.

---

## Open issues identified during execution but not yet fixed

- Four `🗑️` glyphs originally lived in `OKRView.svelte` (theme/objective/keyResult/routine delete) — RESOLVED by `okrview-icons`.
- A `&#x27F3;` reschedule glyph remains in `CalendarView.svelte` (rescheduling routines from past dates).
- A `·` (middle-dot) separator remains in `CalendarView.svelte`'s overdue-routine label.

These two CalendarView glyphs do not exhibit C1's dead-hover-rule symptom (they're monochrome shape characters, not multicolor emoji), so they're polish-tier rather than critical. Belongs with a future "remaining glyph audit" initiative.
