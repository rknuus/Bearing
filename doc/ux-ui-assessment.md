# Bearing Frontend UX/UI Assessment

**Date**: 2026-05-08
**Branch reviewed**: `main` (post-merge of `tag-scoped-archive-all`)
**Scope**: Svelte 5 + TypeScript frontend under `frontend/src/` — views, components, reusable primitives, global styles
**Method**: Code-level review against the UI/UX Pro Max checklist (accessibility, interaction, performance, layout, typography & color, animation, style consistency)

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

**Files**: `frontend/src/components/TaskCard.svelte:135` (🗑️), `:147` (✅ for *archive*); `frontend/src/components/EisenhowerQuadrant.svelte:101` (🗑️); `frontend/src/views/CalendarView.svelte:689,693` (⬅️➡️); `frontend/src/components/CreateTaskDialog.svelte:369` (⬇).

**Why it's not good.** The ✅-for-archive is semantically wrong: a green check universally reads "complete / done", not "archive". On hover the parent `.archive-btn:hover` even sets `color: var(--color-success-600)` (line 288) — except the rule does nothing because emoji glyphs are multicolor and ignore `color`. Same dead rule on `.delete-btn:hover` for 🗑️. Emoji rendering also varies across macOS WebKit vintages.

**How to improve.** Inline SVG with `fill="currentColor"`. Heroicons or Lucide trash + archive-box are 5 paths each. Same for the calendar chevrons. Existing CSS hover rules immediately start working.

#### C2. ErrorDialog is a 5-second auto-dismissing toast, not a dialog

**File**: `frontend/src/components/ErrorDialog.svelte:22–26`.

**Why it's not good.** Auto-closes regardless of how many violations are listed. Rule-engine violations are exactly when the user needs time to read *why* their action failed; multiple rules can stack. No hover-to-pause. Functionally identical to `Toast.svelte` despite the name. The project memory rule "errors must use ErrorDialog, never alert()" technically holds, but the *semantics* are toast semantics — a user with 4 violations gets ~1.25 s per violation to read.

**How to improve.** Either make it a real modal `<Dialog>` for rule violations (recovery-blocking; explicit close), or pause the timer on hover/focus and scale duration: `3000 + 1500 * violations.length`, capped.

#### C3. No `:focus-visible` styles on TaskCard, calendar day cells, theme badges, or nav buttons

**Files**: `frontend/src/components/TaskCard.svelte` (`:hover`/`:active` defined, no focus); `frontend/src/views/CalendarView.svelte:1003,1049` (`.day-num`, `.day-text`).

**Why it's not good.** Tab traversal through a board is invisible to keyboard users. Desktop ≠ mouse-only. `frontend/src/lib/components/Breadcrumb.svelte:105` does this correctly (`:focus-visible { outline: 2px solid var(--color-primary-500); outline-offset: 2px; }`) — the project knows the pattern, just doesn't apply it consistently.

**How to improve.** Promote a `:root` token: `--focus-ring: 2px solid var(--color-primary-500)`. Apply to `.task-card`, `.day-num`, `.day-text`, `.theme-badge`, `.legend-item`, `.tag-board-card-title-bar.receded`, `.nav-link`.

---

### Important

#### I1. Double-click as primary edit affordance

**Files**: `frontend/src/components/TaskCard.svelte:97`; `frontend/src/views/CalendarView.svelte:744,756`; `frontend/src/components/EisenhowerQuadrant.svelte:77`.

**Why it's not good.** Double-click discoverability on web/desktop is famously poor — there's no visual "I am double-clickable" cue. New users single-click and get nothing on a TaskCard, or single-click a day-text cell and discover *selection* but never editing. `TaskActionMenu` is single-click, which makes the inconsistency worse: some actions are 1-click, edit is 2-click.

**How to improve.** Add an "Edit" entry to the existing `TaskActionMenu.actions` array (already wired). For calendar days, add a hover pencil affordance, or commit to "click the day-number cell opens the editor". Keep double-click as a power-user shortcut.

#### I2. Z-index ladder has collisions and no token scale

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

**File**: `frontend/src/views/CalendarView.svelte:982,1006,1020,1051`. Grid forced into 24 px + 24 px + 1fr columns at 1.5 rem row height.

**Why it's not good.** 12 × 31 is genuinely dense, and small text is unavoidable to a degree. But 11.2 px ellipsizes the day text *aggressively* — almost every cell becomes "Mon..." or "Sho...". The user sees the calendar as a color heatmap with unreadable text, defeating the free-text-per-day feature. The weekday column at 0.65 rem is decorative noise at that size.

**How to improve.** Either (a) drop the weekday column (day-number already implies the date) and bump base to `0.75rem` (12 px) — ~30 minutes, or (b) add a 3-level zoom (compact / standard / readable) swapping `grid-template-columns` and font sizes — ~half-day.

#### I4. Loading state is a single centered string

**Files**: `frontend/src/views/CalendarView.svelte:705` ("Loading calendar..."); same pattern in `EisenKanView.svelte` and `OKRView.svelte`.

**Why it's not good.** Calendar grid is nontrivial to render (12 × 31 = 372 cells × theme-color computation × routine status). The viewport collapses to a centered text label, then *jumps* into the full grid — classic CLS.

**How to improve.** Skeletonize: render the same `.calendar-grid` template with neutral-gray cells while `loading === true`. Replace the `{#if loading}` branch with `class:loading` on the grid and gate cell content.

#### I5. The deck staircase (TagBoardCard peek frames) is virtuoso engineering for a barely-perceptible effect

**Files**: `frontend/src/components/TagBoardCard.svelte:319–367`; `frontend/src/components/TagBoardDeck.svelte:155–230`.

**Why it's not good.** The implementation is virtuoso — clip-path polygons cut around the foreground's `border-radius`, dynamic vertical padding sized to worst-case translation, opacity falloff per depth. But the rendered effect is a 5 px L-shape at depth 1, fading to ~0.30 opacity by depth 3 (line 329). Users likely perceive it as a styling glitch or shadow, not "more boards stacked". There's no label, no count, no interactive surface (depth ≥ 2 is `pointer-events: none`). The strip above already conveys "these are the boards"; the staircase repeats the information silently.

Costs: 20 px horizontal padding, `position: relative` on every foreground card, `z-index: 100` paint layers, dynamic top/bottom padding, and 60+ lines of clip-path geometry future maintainers must understand.

**How to improve.** Either commit harder or drop it. Commit: add a board-count badge to the foreground frame ("3 of 7 boards") so the staircase has a verbal anchor users can correlate with the visual cue. Drop: remove the peek frames entirely; the strip already provides navigation. Recommend dropping unless usability testing shows users actually use the staircase to navigate.

#### I6. Spacing tokens used as font-size tokens

**File**: `frontend/src/lib/components/Dialog.svelte:88` sets `h2` font-size to `var(--space-5)`. TaskCard, TaskActionMenu, EisenhowerQuadrant, CalendarView use 4–5 different ad-hoc sizes (`0.625/0.6875/0.75/0.8125/0.875rem`) without a system.

**Why it's not good.** Spacing and typography scales are different concerns. Coupling them means a layout-driven change to `--space-5` silently shifts every dialog title.

**How to improve.** Add `--font-size-{xs,sm,base,md,lg}` tokens to `styles.css`. Replace `var(--space-5)` in Dialog and the literals in components.

---

### Polish

#### P1. `prefers-reduced-motion` not honored anywhere

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

**File**: `frontend/src/components/CreateTaskDialog.svelte:369`. Red (urgent) and amber (not-important-urgent) are the canonical red-green CVD confusion pair.

**Fix.** Add 2-letter codes (IU / NIU / INU) redundant with color.

#### P3. Missing token + dead fallback

**File**: `frontend/src/components/TaskCard.svelte:288–289` references `--color-success-100`, but `frontend/src/styles.css:53–54` only defines `--color-success-500/600`. Hex fallback `#dcfce7` is silently used.

**Fix.** Add the token, remove the fallback.

#### P4. Button.svelte's 10 icon-color variants unused at most call sites

**File**: `frontend/src/lib/components/Button.svelte` defines `edit/delete/add/save/cancel/complete/reopen/archive/nav` icon variants. ~12 emoji icon-button call sites (TaskCard delete/archive/restore, EisenhowerQuadrant) re-roll their styles instead of using `<Button variant="icon" color="delete">`.

**Fix.** Sweep the codebase. Reduces ~200 lines of duplicated CSS.

---

## Quick Wins

Ranked by impact ÷ effort:

| # | Fix | Effort | Closes |
|---|-----|--------|--------|
| 1 | Global `:focus-visible` ring — promote Breadcrumb's pattern to `:root`, apply to ~6 selectors | ~30 min | C3 |
| 2 | Replace emoji icons with inline SVG (start with TaskCard 🗑️/✅ + calendar chevrons) | ~2 hr | C1 + cascading dead-rule cleanup |
| 3 | Tokenize `--z-*` and `--font-size-*` in `styles.css`, sweep four files | ~1 hr | I2 + I6 entirely |
| 4 | Skeletonize calendar / EisenKan loading state | ~45 min | I4 (worst CLS in the app) |
| 5 | ErrorDialog: pause-on-hover + length-scaled duration | ~20 min | C2's actual harm |

#1 + #3 + #5 together fit comfortably in one PR.

---

## Out-of-Scope Notes

These were explicitly preserved as non-issues during the review:

- Desktop-only (no mobile breakpoint targeted).
- No `data-testid` in production code (E2E uses CSS / text / semantic selectors).
- Svelte 5 runes mode (`$state`, `$derived`, `$effect`, `$props`) — not legacy.
- Three dev environments (Vite mock + Wails proxy + native).
- Errors use ErrorDialog, never `alert()` — the existing pattern is intentional; the critique above (C2) is about *behavior*, not *adoption*.
- No external CSS framework — hand-written CSS, scoped per component, is by design.
