# Bearing — Ideation-to-Execution Funnel

## Purpose

Bearing's information architecture links durable intent to concrete daily action through a five-stage funnel. Each stage answers exactly one question and operates at a distinct time horizon and volatility. The funnel makes the path from "what matters" to "what I'm doing right now" visible and navigable.

## Mental model

| Stage | Question | Time horizon | Volatility |
|---|---|---|---|
| Theme | What matters to me in life? | years / decades | very low |
| Idea | What might I want to do? | months / years (or never) | high — many die |
| Goal (OKR) | What am I committing to? | quarter / year | medium |
| Daily focus | What gets attention today? | day / week | very high |
| Kanban | What's the next task? | hours / days | very high |

Themes and ideas are deliberately distinct: themes are *evergreen containers* that are never "completed" (Health, Career, Relationships); ideas are *candidates* that may or may not become goals.

## Tab structure (5 tabs)

```
[ Themes ]  [ Ideation ]  [ Goals ]  [ Focus ]  [ Execution ]
  values     candidates    OKRs       today      kanban
```

Tab labels are stage-named — each label describes the activity that takes place at that layer of the funnel:

- **Themes** — values and life areas (rare-visit, evergreen)
- **Ideation** — candidates for future realization (high-churn)
- **Goals** — committed OKRs (medium-volatility)
- **Focus** — daily focus selection (visited every day)
- **Execution** — Kanban execution surface (visited continuously)

### Why 5 tabs and not 4

A 4-tab variant (Ideation → Goals → Focus → Execution) leaks in two places:

1. **Goals without ideas** (e.g. "balance social activities", "stay healthy") have no parent — they orphan.
2. **Routines** have no home — they're not goals, not ideas, but still need definition.

The 5-tab variant absorbs both: Themes is the right home for "values without endpoints," and routines naturally live there alongside goals (see [Routines](#routines)). It also preserves Bearing's existing theme-color propagation as a first-class linking mechanic.

## Linking model

The five funnel stages are connected by **two distinct graphs** that point in opposite directions. Keeping them separate prevents confusion (and prevented at least one design mistake during this doc's evolution).

### Graph A — funnel order (workflow / time of creation)

This is the user's mental model and the tab order:

```
  Theme  ──►  Idea  ──►  Goal  ──►  Focus  ──►  Task
   L1         L2         L3         L4         L5
```

You define a theme, ideate under it, commit some ideas to goals, pick what to focus on today, execute tasks. "Downstream" always means *to the right* in this graph.

### Graph B — data references (who stores a foreign key to whom)

Independent of funnel order. Arrows point from the entity that holds the reference to the entity it points at:

```
  Theme  ◄────  Idea          (idea.theme_id, optional)
    ▲
    │ (goal.theme_id, required)
    │
  Goal   ────►  Idea           (goal.linked_idea_ids, 0..N)
                  ▲
                  │ (task.tag = idea.tag)
                Task
                  ▲
                  │ (task.created_from_routine_id, when spawned)
  Theme  ◄────  Routine       (routine.theme_id, required)
```

### Entity reference fields

```
Theme         { id, name, color, order, archived_at? }
Idea          { id, theme_id?, title, tag (unique), details, archived_at? }
Goal          { id, theme_id, objective, time_horizon,
                linked_idea_ids[],   // 0..N
                key_results[],
                archived_at?,
                carry_forward_from?  // GoalCheckout.id of originating goal }
Routine       { id, theme_id, name, recurrence, frequency,
                preferred_days[], active }
DayFocus      { date, selected_idea_ids[], selected_routine_ids[] }
Task          { id, tag,                        // = idea.tag, OR "routine"
                title, description,
                eisenhower_quadrant, column,
                created_from_routine_id?,
                archived_at? }
DayLog        { date, notes_md,
                completed_task_ids[],           // snapshot at check-out
                in_progress_task_ids[] }        // snapshot at check-out
GoalCheckout  { id, goal_id, completed_at,
                outcome,                        // achieved/partial/missed/abandoned
                per_kr_status[],                // KR id → label + optional note
                worked_md, didnt_work_md,
                follow_up_goal_id? }            // set when carry-forward used
```

### Linking rules

- A **theme** groups goals and routines (required `theme_id` on both); ideas may optionally affiliate via `theme_id`.
- A **goal** links to 0–N ideas (typically 1). Theme-only goals (no linked idea) are legitimate — their progress is KR check-ins only.
- An **idea** owns a unique tag. The tag identifies the Kanban board for tasks of that idea.
- A **task belongs to exactly one tag** (= one board). Either the idea's tag, or the special `routine` tag for routine-spawned tasks.
- **Tag uniqueness is a load-bearing invariant.** Multiple ideas cannot share a tag. To combine work across ideas, consolidate them into one idea or use the **All** board with filtering — do not relax tag uniqueness.
- **Tag normalization rule:** tags are stored lowercase with non-alphanumeric characters replaced by `-` (hyphens and underscores preserved). User input is normalized on save; the Idea editor (§ 3.2) shows a "Will be saved as:" preview when normalization changes the input. The reserved string `routine` is rejected — it identifies the Routines board. Uniqueness check applies across both active and archived ideas (an archived idea still owns its tag until its tag is renamed or the idea is unarchived-then-renamed).
- A **routine** sits parallel to goals under a theme; selecting it in Focus spawns a task on the Routines board.
- **Focus** is per-day state, not an entity with downstream ownership.
- **Color** propagates from theme through every downstream layer in Graph A.

### Goal ↔ Task: indirect by design

Tasks have no direct link to goals. The chain is:

```
Task ──tag──► Idea ──linked_idea_ids──► Goal ──theme_id──► Theme
```

A goal "has" tasks only via the boards of its linked ideas. The Execution board's funnel context header walks this chain to render `● Career › Goal: Ship Bearing v2 › #bearing-v2`.

Why no direct goal → task FK:

- An idea (and its board) outlives any single goal — the same `#bearing-v2` board can carry across consecutive goals.
- Tasks completed *before* a goal was framed are still real work; pinning them to a goal would either retroactively reassign them or leave them goalless.
- Theme-only goals would need a special "no-task goal" subtype to satisfy a direct FK, which the indirect link makes unnecessary.

### Deletion cascade rule

> Cascade follows **downstream ownership** in Graph A — an entity offers a cascade only where deletion would otherwise orphan data it directly owns.

- **Theme** owns goals and routines (required FK) → cascade offered for goals/routines and their tasks.
- **Idea** owns its tag/board (1:1) → cascade offered for the board and its tasks.
- **Goal** owns only its KRs and check-ins, which go automatically. Linked ideas, their boards, and tasks belong to the upstream Idea, **not the Goal** — so Goal deletion has **no cascade**, by design.
- **Routine** has back-referenced tasks on the Routines board → cascade offered for those tasks.
- **Task** owns nothing → no cascade.

Wire-level UX for the delete confirmation lives in `ui-wireframes.md` § 2.4.

## Stage details

### 1. Themes

Evergreen containers for values. Edited 2–4× per year. Each theme card holds:

- Name and color
- Sub-list of **Goals** (OKRs)
- Sub-list of **Routines**
- Counter chip: "2 goals · 3 routines"

A theme with only routines (and no goals) is valid — it's how "balance" and "maintenance" areas live in the model.

**The Themes tab embeds routines only, not goals.** Goals are visible on the Goals tab (their canonical home, already grouped by theme); embedding them on Themes would duplicate that content, create accumulation pressure for completed goals, and break the "one canonical home per entity" principle. Routines are the single deliberate "downstream embedding" exception, justified by their having no other tab. The symmetric mechanism for everywhere else is **upstream context** — Ideas, Goals, and Tasks carry a theme chip (or color) that says "this belongs to <theme>," so the funnel link is visible without parent tabs needing to embed their children.

#### Vision & Mission (optional higher frame)

Themes is also the home for an optional **Vision & Mission** layer that sits *above* the theme cards in the UI (collapsible header on the Themes tab, edited via dialog). Vision and Mission are reflective prose — "who you want to become" and "what you're here to do" — one rung higher in the funnel than themes.

Both fields are fully optional and not required for any other part of the funnel to function. When set, the optional content flows into the advisor's context for higher-frame goal critique ("does this goal serve your stated vision?"). When unset, the advisor simply omits that frame.

Vision and Mission don't appear as separate funnel stages because their volatility, scope, and lack of structural integration don't justify a tab. They live as a collapsible header on the Themes view — the lowest-friction placement for content that is high-meaning but low-frequency.

### 2. Ideation

Free-form ideation surface for things you might want to realize someday. Per idea:

- Title and detailed thoughts
- Optional theme assignment (gives color and grouping)
- Maps 1:1 to a tag

Ideas may be deleted once captured as a goal (for small ideas) or kept across multiple goal iterations (for larger ideas). Most ideas will never become goals — that's the point.

### 3. Goals (OKRs)

Committed objectives with measurable key results. Per goal:

- Theme (required — every goal lives under a theme)
- 0–N linked ideas (typically 1; may be 0 for theme-only goals)
- Time-bound (quarter / year)

#### OKRs are deliberately flat (no nesting)

Goals do not have parent or child goals. The model is intentionally a flat list within a theme, not a tree. Decomposition of large initiatives uses two existing layers instead:

1. **Sequential goals over time** linked to the same idea — e.g. `Bearing v2 — Q2 2026 phase` and `Bearing v2 — Q3 2026 phase` both have `linked_idea_ids = [bearing-v2]`. Time horizon distinguishes them; the shared idea threads them together.
2. **Tasks on the Kanban** — the Execution board provides the within-goal decomposition.

**Why no nesting:**

- Personal scope. Active goal counts are small (~10–20); a tree adds complexity without removing flatness pain.
- KR roll-up across nested goals is genuinely hard (aggregation rules, mismatched units, partial completion semantics) and most enterprise OKR tools get it wrong. Avoiding the question is cheaper.
- The funnel context header (`Theme › Goal › Tag`) loses sharpness once goals nest — "which goal is *the* goal for this task?" becomes ambiguous.
- Advisor traversal, check-ins, and Focus selection all stay simpler with a flat list.

**When to revisit:** if in practice the user repeatedly creates the "phase 1 / phase 2 / phase 3" pattern and feels the need for an explicit multi-year North Star above them, a single annual-horizon parent goal could be added later. Don't add it speculatively — wait for the pain to be real, then do it once with eyes open.

### 4. Focus (daily focus)

Daily selection surface. Two parallel selectables, both theme-colored:

- **Tags** (idea-/goal-bound) → activate the tag's Kanban board for the day
- **Routines** → auto-spawn tasks on the Routines board

Selectables are grouped under their theme header so the funnel link is visible at the point of choice.

#### Day / Week / Month / Year overviews

Focus is always selected per **day** — that's the unit of intent. The tab additionally offers **Week / Month / Year overview modes** that aggregate per-day selections into read-only summaries (with a coverage strip showing theme balance over the period). Editing happens only in Day mode; clicking any day in an overview drills back into Day mode for that date.

This preserves the funnel's "single grain, multiple lenses" principle: there's exactly one place to change a plan (the day), and several places to *see* what was planned. The Year overview reuses the same 12×31 calendar shape as `tmp/Bearing`'s mid-term view.

#### Day rollover

Bearing rolls the active day at **local midnight** (no in-app configuration — there is no Settings view; see `ui-wireframes.md` § 7.2 for the no-settings rationale). When the day rolls:

- The Focus tab's Day mode advances to the new date. Previous day's selections are preserved as part of the DayFocus history reachable via Week/Month/Year overviews.
- Any **selected routines** for the new day auto-spawn their tasks on the Routines board (per the routine's recurrence + preferred-days rules).
- The previous day's `DayLog` (if a Day check-out was performed) becomes immutable historical context. A new DayLog will be created when the user performs a check-out at the end of the new day.
- The "Today" jump button in Focus's day navigator now points at the new date; the relative-time chip on idea cards (`edited 2h ago`) re-evaluates against the new clock.

UI surfaces touching day rollover: Focus tab Day mode (§ 5.1.a), Day check-out dialog (§ 6.4), and `ui-wireframes.md` § 7.2 for the no-settings rationale that locks the rollover time as hardcoded.

### 5. Execution (Kanban)

Eisenhower-sorted Kanban. The Boards strip has exactly **two kinds of board** — `All` (synthetic aggregate, always present) and **per-tag boards**. The values `routine` and `untagged` are *reserved tag strings* that show up as per-tag boards under the same rule as any other tag, just under specific conditions:

- **`All`** — always present. Aggregates every task across every tag. Default landing view unless today has a Focus selection, in which case the most-recently-active tag board takes the default.
- **`<any idea-tag>`** — appears when selected in today's Focus.
- **`routine`** (reserved) — appears when today has at least one selected routine, or there are in-flight `routine`-tagged tasks carried over from previous days.
- **`untagged`** (reserved) — appears when at least one orphan task exists (created by deleting an idea while opting out of cascading its tasks, per § 2.4).

The same "show the board for a tag when there's something to show" rule applies to all four — no special-case board types in the model.

The board header surfaces the funnel context inline:

```
Focus: <tag> · Goal: <OKR> · Theme: <chip>
```

This makes the lineage of every task visible without forcing a tab switch.

#### Eisenhower priority lives in Backlog (not "To do"), with three sections

Diverging from `tmp/Bearing`, priority sub-sections appear inside the **Backlog** column rather than "To do":

1. **Important & Urgent**
2. **Not Important & Urgent**
3. **Important & Not Urgent**

Reasoning: Eisenhower priority is a *triage* decision, and triage happens at intake. Once a task moves into "To do" / "In progress" / "Done" it has already been prioritized; sub-sections there become noise. Sections fold/unfold per-section with task counts, like `tmp/Bearing`'s pattern.

The fourth quadrant ("Not Important & Not Urgent") is intentionally absent. If a task is neither important nor urgent it shouldn't be on the board — the omission is a forcing function for honest triage. Tasks in non-Backlog columns are flat; priority becomes metadata that travels with the task and re-applies if it returns to Backlog.

## Archive and check-out flows

Bearing supports a manual **archive** mechanism for the three entity types where hiding-without-deleting earns its place: **Ideas**, **Goals**, and **Tasks**. Archive is always a conscious gesture — no auto-archive in v1. Archived items remain on disk and are reachable via a tab-level `[ Show archived <type>… ]` button that replaces the tab content with the corresponding archive view.

Two of the three entity types reach archive through a **check-out** flow rather than a bare archive action:

- **Goal check-out** (Perdoo-inspired) — triggered by a `[ Check out ]` button per goal. Opens a dialog that captures: overall outcome (Achieved / Partially achieved / Missed / Abandoned), per-KR statuses with auto-inferred labels and optional notes, what-worked / what-didn't retrospective, and an "Archive this goal" checkbox (default on) plus an optional carry-forward action that seeds a follow-up goal pre-filled with missed/partial KRs.
- **Day check-out** (Kanban "complete a day") — triggered by `[ Check out day ]` on the Execution tab and on the Focus Day-mode summary bar. Captures auto-detected completed/in-progress task lists, a Markdown notes field (auto-save), and opt-in closing actions (archive completed tasks default-on, reset in-progress tasks to Backlog default-off). Saves a `DayLog` entity keyed by date.

Ideas archive directly via an `[ Archive idea ]` button in the Idea editor — no ceremony, since parking an idea is a low-stakes gesture. The Themes and Routines entity types are not archivable; they're either kept active (with the Active toggle for routines) or deleted.

UI specifics live in `ui-wireframes.md`: § 4.4 (Goal check-out dialog), § 6.4 (Day check-out dialog), § 7.8 (archive model and per-tab archive views).

## Routines

Routines are *evergreen recurring activities* that don't warrant a goal — gym, meditation, sleep hygiene, etc. They're maintenance, not achievement.

### Where they live

Under **Themes**, alongside goals. A theme expresses itself as either:

- **Goals** — finite, achievement-shaped (idea → goal → done)
- **Routines** — evergreen, habit-shaped (just keep doing it)

```
Theme: Health
├── Goals: "Run a 10k by Jun 2026"
└── Routines: "Gym 3×/week", "Sleep before 23:00"
```

### Definition vs. selection

- **Definition** — owned by the Themes tab via a focused editor (modal or drawer). The tab itself stays glanceable; complexity lives behind a click.
- **Selection** — happens in Focus. Selecting a routine auto-creates a task on the Routines board.

### Routine editor fields

| Field | Notes |
|---|---|
| Name | "Gym", "Meditation", "Sleep before 23:00" |
| Theme | Pre-filled from parent card; changeable |
| Color | Inherits from the selected theme (read-only) |
| **Recurrence pattern** | Daily / Weekly / Monthly / Custom |
| **Frequency** | "3× per week", "1× per day", "2× per month" |
| Preferred days *(optional)* | Mon/Wed/Fri — soft hint, not a hard constraint |
| Active toggle | Pause without deleting (vacation, injury, etc.) |

Out of scope for v1: skip-on-holiday rules, streak goals, reminders/notifications.

### Entry points (all converge on the same editor)

- Themes tab — "+ Add routine" under each theme card (primary path)
- Focus — `[ + Routine ]` in the routine selector (prompts for theme, then opens editor)
- Routines Kanban board — "+ New routine" header action

### Card summary on Themes tab

Each routine card shows enough to skip opening the editor most of the time:

```
● Gym                    3×/week · M·W·F     [⋯]
● Meditation             daily               [⋯]
● Sleep before 23:00     daily               [paused]
```

Color dot = theme color. The `[⋯]` menu has Edit / Pause / Delete.

## UX principles for the funnel

The 5-tab structure adds one concept relative to a 4-tab version. The following details make sure that cost is paid back in clarity rather than friction.

1. **Default landing tab = Focus** (or Execution), never Themes. The funnel's left side is "settings-adjacent"; you live on the right.
2. **Funnel direction shown via chevron connectors** in the tab bar — `Themes › Ideation › Goals › Focus › Execution`. All tabs are equal weight (no muting); the chevrons carry the left-to-right flow without penalising any tab's readability or accessibility. The active tab is distinguished by an underline + bold, independent of the chevrons.
3. **Pre-seed 3–5 themes on first run** (Work, Health, Learning, Relationships, Personal) so Themes is never empty or intimidating.
4. **Stage-named tab labels** — Themes, Ideation, Goals, Focus, Execution. Each label names the activity at that layer, making the funnel direction explicit in the navigation itself.
5. **Inline funnel context, no global breadcrumb bar** — funnel lineage (Theme › Goal › Tag) is surfaced only where it carries weight: Execution board header, Focus summary chips, and dialog titles for child entities (e.g. KR check-in showing its parent goal). The app shell does not carry a persistent breadcrumb — tabs already answer "where am I"; redundant chrome adds noise.
6. **Color as the primary linking signal** — theme color propagates to goals, routines, tasks, focus chips, and board cards consistently.

## What this replaces in current Bearing

| Current Bearing | New funnel |
|---|---|
| Long-term (OKR view with Life Themes) | Split into **Themes** (themes + routines) and **Goals** (OKRs) |
| Mid-term (yearly 12×31 calendar grid) | **Focus** (daily focus selection) |
| Short-term (Eisenhower Kanban) | **Execution** (always-present **All** board + per-tag Kanban + conditional **Routines** / **Untagged** boards) |
| Routines defined in Goals tab | Routines defined under their parent theme on the Themes tab |
| — | New: **Ideation** tab for ideation before commitment |

The core mechanic — theme color propagation and hierarchical linking — is preserved and extended, not replaced.
