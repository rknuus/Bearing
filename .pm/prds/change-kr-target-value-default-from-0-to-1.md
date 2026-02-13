---
name: change-kr-target-value-default-from-0-to-1
description: Change the default target value for new Key Results from 0 to 1
status: backlog
created: 2026-02-13T10:58:53Z
---

# PRD: change-kr-target-value-default-from-0-to-1

## Executive Summary

Change the default target value when creating a new Key Result from 0 to 1. A target of 0 is rarely meaningful — most KRs track progress toward at least 1 unit of completion.

## Problem Statement

When creating a Key Result, the target value defaults to 0, which is a nonsensical default — a KR with target 0 is already "complete" at creation. The most common use case is binary completion (target = 1), so defaulting to 1 saves a step.

## User Stories

### US-1: Sensible default for new KRs
**As a** user creating a Key Result
**I want** the target value to default to 1
**So that** I don't have to manually change it every time for simple completion-based KRs

**Acceptance Criteria:**
- [ ] New KR creation form shows target value of 1 by default
- [ ] After creating a KR, the form resets target to 1 (not 0)
- [ ] Existing KRs with target 0 are not affected

## Requirements

### Functional Requirements
- Change `newKeyResultTargetValue` default from `$state(0)` to `$state(1)` in `OKRView.svelte`
- Change the reset value after KR creation from 0 to 1
- Update mock binding default parameter from 0 to 1

## Out of Scope
- Migrating existing KRs with target value 0
- Making the default configurable

## Dependencies
- `frontend/src/views/OKRView.svelte` — default state and reset
- `frontend/src/lib/wails-mock.ts` — mock default parameter
