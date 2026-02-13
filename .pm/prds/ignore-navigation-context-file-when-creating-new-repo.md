---
name: ignore-navigation-context-file-when-creating-new-repo
description: Auto-create .gitignore with navigation_context.json when initializing the data repo
status: backlog
created: 2026-02-13T10:39:14Z
---

# PRD: ignore-navigation-context-file-when-creating-new-repo

## Executive Summary

When Bearing initializes its data repository (`~/.bearing/`) on a fresh install, it should automatically create a `.gitignore` file that excludes `navigation_context.json`. Without this, the navigation context (a user preference file) gets tracked by git, polluting the versioned data history with transient UI state.

## Problem Statement

The `~/.bearing/` directory serves as both a git-versioned data store (themes, calendar, tasks) and the location for the navigation context file (`navigation_context.json`). The navigation context stores transient UI state (current view, selected item, expanded IDs) and is explicitly marked as "not versioned with git" in the code comments (`SaveNavigationContext` in `plan_access.go`).

However, neither `InitializeRepositoryWithConfig` nor `ensureDirectoryStructure` creates a `.gitignore`. On a fresh install, when the user navigates the app and the navigation context is saved, it appears as an untracked file. The next git commit (triggered by saving themes/tasks/calendar) would include this file in the versioned history.

## User Stories

### US-1: Fresh install does not track navigation state
**As a** new Bearing user
**I want** my navigation preferences to be excluded from the data repo automatically
**So that** my versioned history only contains meaningful data changes

**Acceptance Criteria:**
- [ ] When `~/.bearing/` is initialized for the first time, a `.gitignore` file is created
- [ ] The `.gitignore` contains `navigation_context.json`
- [ ] The `.gitignore` itself is committed to the data repo
- [ ] Existing installations with a manual `.gitignore` are not affected

## Requirements

### Functional Requirements

- During data directory initialization, create a `.gitignore` file in the data path if one does not already exist
- The `.gitignore` must contain `navigation_context.json`
- The `.gitignore` should be committed to the repo as part of the initial setup

### Non-Functional Requirements

- Must not break existing installations that already have a `.gitignore`
- Must not modify an existing `.gitignore` if one is present

## Success Criteria

- On a fresh install, `navigation_context.json` does not appear in `git status` within `~/.bearing/`
- Existing repos with a manual `.gitignore` continue to work unchanged

## Constraints & Assumptions

- The `.gitignore` creation should happen in `PlanAccess.ensureDirectoryStructure()` alongside the directory creation, or in `InitializeRepositoryWithConfig` after repo init
- Only `navigation_context.json` needs to be ignored currently; the `.gitignore` can be kept minimal

## Out of Scope

- Migrating existing repos that already accidentally committed `navigation_context.json`
- Adding other files to `.gitignore` beyond `navigation_context.json`
- Changing how or where `navigation_context.json` is stored

## Dependencies

- `internal/access/plan_access.go` — `ensureDirectoryStructure()` is the natural place for this
- `internal/utilities/versioning.go` — `InitializeRepositoryWithConfig()` is an alternative location
