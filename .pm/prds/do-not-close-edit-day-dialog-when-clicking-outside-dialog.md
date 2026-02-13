---
name: do-not-close-edit-day-dialog-when-clicking-outside-dialog
description: Prevent the Calendar day editor dialog from closing when clicking the overlay backdrop
status: backlog
created: 2026-02-13T11:03:33Z
---

# PRD: do-not-close-edit-day-dialog-when-clicking-outside-dialog

## Executive Summary

Remove the click-to-dismiss behavior on the Calendar view's day editor dialog overlay. Accidental clicks outside the dialog discard unsaved edits, which is frustrating when the user has entered text.

## Problem Statement

The day editor dialog in `CalendarView.svelte` closes when the user clicks the overlay backdrop (`onclick={cancelEdit}` on `.dialog-overlay`). This causes data loss when the user accidentally clicks outside the dialog after typing a focus description. The dialog should only close via the Cancel button or Escape key (intentional actions).

## User Stories

### US-1: Don't lose edits on accidental click
**As a** user editing a day's focus in the Calendar view
**I want** the dialog to stay open if I accidentally click outside it
**So that** I don't lose what I've typed

**Acceptance Criteria:**
- [ ] Clicking the overlay backdrop does NOT close the dialog
- [ ] The Cancel button still closes the dialog
- [ ] The Escape key still closes the dialog
- [ ] The Save button still saves and closes

## Requirements

### Functional Requirements
- Remove `onclick={cancelEdit}` from the `.dialog-overlay` div in `CalendarView.svelte`

## Out of Scope
- Changing dismiss behavior of other dialogs (EditTaskDialog, CreateTaskDialog, ErrorDialog)
- Adding a confirmation prompt before cancel

## Dependencies
- `frontend/src/views/CalendarView.svelte` — the overlay onclick handler (line 379)
