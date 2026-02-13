---
name: swap-order-of-last-two-todo-sections
description: Swap Q2 and Q3 Eisenhower sections in the Todo column so urgent tasks appear before important-only tasks
status: backlog
created: 2026-02-13T10:50:51Z
---

# PRD: swap-order-of-last-two-todo-sections

## Executive Summary

Reorder the EisenKan Todo column's priority sections so "Not Important & Urgent" (Q3) appears before "Important & Not Urgent" (Q2), prioritizing urgency over importance in the short-term execution board.

## Problem Statement

The current section order follows the classic Eisenhower quadrant numbering (Q1, Q2, Q3), but for a short-term Kanban board, urgency should take precedence over importance — urgent tasks need action sooner regardless of importance level.

## User Stories

### US-1: See urgent tasks higher in the Todo column
**As a** user viewing the EisenKan board
**I want** urgent tasks (Q3) to appear above merely important tasks (Q2)
**So that** I address time-sensitive items before items that can be scheduled later

**Acceptance Criteria:**
- [ ] Todo column sections appear in order: Q1 (Important & Urgent), Q3 (Not Important & Urgent), Q2 (Important & Not Urgent)
- [ ] Priority labels, colors, and sorting all reflect the new order

## Requirements

### Functional Requirements
- Swap the second and third `SectionDefinition` entries in `DefaultBoardConfiguration()`
- Update `priorityOrder` sorting in the frontend `$effect` (if it relies on section index order)

## Out of Scope
- Changing priority names, colors, or labels
- Making section order configurable by the user

## Dependencies
- `internal/access/models.go` — `DefaultBoardConfiguration()`
- `frontend/src/views/EisenKanView.svelte` — priority display labels and colors (may need reordering)
