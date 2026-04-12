/**
 * Bearing Demo Video Script
 *
 * A choreographed browser automation that demonstrates Bearing's 3-view
 * goal-setting workflow: Long-term (OKR) -> Mid-term (Calendar) -> Short-term (EisenKan).
 * NOT a test with assertions — this produces a video and screenshots.
 *
 * Runs against Vite dev server (localhost:5173) with mock Wails bindings.
 *
 * Every operation uses the Bearing DSL from bearing-dsl.js — no raw
 * page.click(), page.waitForSelector(), or CSS selectors.
 */

import {
  setupDemo,
  teardownDemo,
  caption,
  screenshot,
  navigateTo,
  editVisionMission,
  createTheme,
  addObjective,
  addKeyResult,
  createRoutine,
  scrollTo,
  openAdvisor,
  closeAdvisor,
  openDayDialog,
  openDayDialogFor,
  setDailyFocus,
  selectDayOKR,
  addDayTag,
  saveDayDialog,
  updateKeyResultProgress,
  createTask,
  commitTasks,
  scrollDialogToBottom,
  toggleSection,
  moveTask,
  clickThemeBadge,
  moveCursorAway,
  checkRoutine,
  setDayText,
  toggleTodayFocus,
  TODAY_ISO,
} from './bearing-dsl.js';

const SHOW_CAPTION_DURATION = 2500;

async function runDemo() {
  console.log('Starting Bearing demo video recording...\n');
  const { browser, context, page } = await setupDemo();

  try {
    // ================================================================
    // Scene 1 — Opening
    // ================================================================
    console.log('Scene 1: Opening');

    await caption(page, 'Bearing \u2014 Connect your goals to daily action.', SHOW_CAPTION_DURATION);

    await caption(page, 'Three planning horizons, one connected system:', SHOW_CAPTION_DURATION);

    await caption(page, '1) Long-term \u2014 set strategic goals with OKRs and routines.', SHOW_CAPTION_DURATION);

    await navigateTo(page, 'mid-term');
    await caption(page, '2) Mid-term \u2014 balance your themes across the calendar.', SHOW_CAPTION_DURATION);

    await navigateTo(page, 'short-term');
    await caption(page, '3) Short-term \u2014 focus on the tasks of your daily theme.', SHOW_CAPTION_DURATION);

    await navigateTo(page, 'long-term');

    // ================================================================
    // Scene 2 — Vision & Mission
    // ================================================================
    console.log('Scene 2: Vision & Mission');

    await caption(page, 'Define your personal vision and mission', SHOW_CAPTION_DURATION);
    await editVisionMission(page, {
      // FIXME: replace by vision/mission to properly plan life/priorities
      vision: 'Live a healthy, balanced, and fulfilling life.',
      mission: 'Invest daily in physical and mental well-being.',
    });
    await screenshot(page, 'vision-mission');
    await toggleSection(page, '.vision-section');

    // ================================================================
    // Scene 3 — Long-term goals
    // ================================================================
    console.log('Scene 3: Long-term goals');

    await caption(page, 'Life themes drive your goals');
    await createTheme(page, 'Health', { color: 4 });
    await caption(page, 'Add objectives to each life theme');
    await addObjective(page, 'Health', 'Run a half marathon by autumn 2026');
    await caption(page, 'Add key results and sub-objectives to each objective');
    await addKeyResult(page, 'Run a half marathon by autumn 2026', {
      name: 'Weeks with running distance \u226550km',
      target: 20,
    });

    await screenshot(page, 'okr-populated');
    await caption(page, 'Themes \u2192 Objectives \u2192 Key Results');

    await createTheme(page, 'Learning', { color: 7 });
    await addObjective(page, 'Learning', 'Try new programming languages in 2026');
    await addKeyResult(page, 'Try new programming languages in 2026', {
      name: 'Use different languages for Advent of Code',
      target: 24,
    });

    // ================================================================
    // Scene 3b — Routines
    // ================================================================
    console.log('Scene 3b: Routines');

    await caption(page, 'Track recurring habits with routines');

    await createRoutine(page, 'Morning run', {
      schedule: 'weekly',
      // FIXME: does this work if today is none of the 3 selected days?
      days: ['mon', 'wed', 'fri'],
      startDate: TODAY_ISO,
    });
    await screenshot(page, 'routine-created');

    // Fold Vision & Mission to declutter the view
    await scrollTo(page, 'top');

    // ================================================================
    // Scene 4 — Goal Advisor
    // ================================================================
    console.log('Scene 4: Goal Advisor');

    await caption(page, 'Setting good goals is a challenge \u2014 the goal advisor helps');

    await openAdvisor(page);
    await caption(page, 'Ask the AI based goal advisor to review or suggest goals', SHOW_CAPTION_DURATION);
    await caption(page, '\u26A0 Beware: sends data to AI provider', SHOW_CAPTION_DURATION);
    await caption(page, '\u26A0 Beware: requires Claude CLI setup', SHOW_CAPTION_DURATION);
    await screenshot(page, 'advisor-panel');

    await closeAdvisor(page);

    // ================================================================
    // Scene 5 — Daily focus
    // ================================================================
    console.log('Scene 5: Daily focus');

    await navigateTo(page, 'mid-term');
    await caption(page, "Assign today's focus to a theme", SHOW_CAPTION_DURATION);
    await caption(page, "Double-click a day to edit it");

    await openDayDialog(page);
    await setDailyFocus(page, 'Health');
    await caption(page, 'Add tags to annotate the day');
    await addDayTag(page, 'fit');
    await saveDayDialog(page);
    await caption(page, 'Tags auto-populate the calendar');
    await caption(page, 'Colored dots mark due routines');

    await caption(page, 'Edit the day again to add more focus areas');
    await openDayDialog(page);
    await selectDayOKR(page, 'Use different languages for Advent of Code');
    await caption(page, 'Check the routines you plan to do today');
    await checkRoutine(page, 'Morning run');
    await setDayText(page, 'Legs day, ');
    await saveDayDialog(page);
    await screenshot(page, 'calendar-today');

    // Assign themes to other days to show colour distribution
    await caption(page, 'Assign themes to different days');
    await openDayDialogFor(page, +1);
    await setDailyFocus(page, 'Learning');
    await saveDayDialog(page);

    await openDayDialogFor(page, +2);
    await setDailyFocus(page, 'Health');
    await saveDayDialog(page);

    await openDayDialogFor(page, +3);
    await setDailyFocus(page, 'Learning');
    await saveDayDialog(page);
    await caption(page, 'Theme colors help spot imbalances');

    await screenshot(page, 'calendar-themes-distributed');

    // ================================================================
    // Scene 6 — Task execution
    // ================================================================
    console.log('Scene 6: Task execution');

    await navigateTo(page, 'short-term');

    await caption(page, 'Checking a routine auto-creates a task as Important & Not Urgent', SHOW_CAPTION_DURATION);
    await caption(page, 'Overdue routines promote to Important & Urgent', SHOW_CAPTION_DURATION);

    // await caption(page, 'Eisenhower matrix + Kanban board = EisenKan');
    // FIXME: show this caption after opening the edit dialog
    await caption(page, 'Break goals into prioritized tasks', SHOW_CAPTION_DURATION);

    // FIXME: I want to separate entering task from prioritizing/staging tasks, so that I can set the caption below inbetween
    await createTask(page, 'Plan running schedule', { theme: 'Health', priority: 'iu', tags: ['fit'] });
    await caption(page, 'Before committing, prioritize with the Eisenhower matrix');
    await createTask(page, 'Research running shoes', { theme: 'Health', priority: 'inu', tags: ['fit'] });
    await createTask(page, 'Read about nutrition', { theme: 'Learning', priority: 'inu' });
    await scrollDialogToBottom(page);
    await commitTasks(page);

    await screenshot(page, 'eisenkan-tasks');

    // ================================================================
    // Scene 7 — Today's Focus filter
    // ================================================================
    console.log("Scene 7: Today's Focus filter");

    await caption(page, "Today's Focus filters tasks to your daily theme");
    await screenshot(page, 'today-focus-active');

    await toggleTodayFocus(page);
    await scrollTo(page, '.task-card:has-text("Read about nutrition")');
    await caption(page, 'Toggle off to see all tasks');
    await screenshot(page, 'today-focus-off');

    await toggleTodayFocus(page);
    await caption(page, 'Toggle on to focus on your daily theme');

    // ================================================================
    // Scene 8 — Task workflow
    // ================================================================
    console.log('Scene 8: Task workflow');

    await caption(page, 'Move tasks through your workflow');

    await moveTask(page, 'Plan running schedule', 'doing');
    await caption(page, 'Todo \u2192 Doing');

    await moveTask(page, 'Plan running schedule', 'done');
    await caption(page, 'Doing \u2192 Done');

    // ================================================================
    // Scene 9 — Cross-view navigation
    // ================================================================
    console.log('Scene 9: Cross-view navigation');

    await clickThemeBadge(page, 'Health');
    await caption(page, 'Everything connected \u2014 goals to action and back');
    await screenshot(page, 'cross-view-navigation');

    // ================================================================
    // Scene 10 — Track progress
    // ================================================================
    console.log('Scene 10: Track progress');

    await caption(page, 'Track progress on your key results');
    await updateKeyResultProgress(page, 'Weeks with running distance', 1);
    await moveCursorAway(page);
    await screenshot(page, 'kr-progress');

    // ================================================================
    // Scene 11 — Closing
    // ================================================================
    console.log('Scene 11: Closing');

    await caption(page, 'Plan long-term. Focus daily. Execute now.', SHOW_CAPTION_DURATION);
    await caption(page, 'Bearing', SHOW_CAPTION_DURATION);

    console.log('\nDemo recording complete!');
  } catch (err) {
    console.error('\nDemo failed:', err);
  } finally {
    await teardownDemo({ browser, context, page });
  }
}

runDemo().catch(console.error);
