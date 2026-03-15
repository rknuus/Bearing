---
created: 2026-02-20T14:57:09Z
last_updated: 2026-03-15T20:17:17Z
version: 1.1
author: Claude Code PM System
---

# Project Overview

## Current State
Bearing is a functional desktop application with all three planning views implemented. The app runs as a native Wails v2 application on macOS.

## Feature List

### OKR View (Long-term)
- Life theme management with color coding
- Nested objectives with status tracking (active/completed/archived)
- Key results with quantitative progress tracking (start/current/target)
- Routines — ongoing health metrics per theme with on-track/off-track status indicators (goals for stability: maintain a metric at or above/below a threshold)

### Calendar View (Mid-term)
- 12×31 yearly grid display
- Daily focus assignment to themes
- Theme color visualization across the year
- Today highlighting with primary-600 blue styling
- Cross-view navigation to related tasks

### EisenKan View (Short-term)
- Dynamic Kanban board with configurable columns
- Eisenhower matrix priority sorting (important-urgent, important-not-urgent, not-important-urgent)
- Drag-and-drop task movement
- Priority promotion automation (date-based priority escalation)
- Subtask hierarchy with expand/collapse
- Theme filtering and cross-view navigation
- Tag management with badges and editor
- Double-click to edit tasks

### Cross-Cutting
- Navigation shell with breadcrumbs and keyboard shortcuts (Ctrl+1/2/3)
- Theme color propagation across all views
- Navigation context persistence across sessions
- Mock bindings for browser-based development

## Integration Points
- Wails v2 for Go ↔ Svelte communication (WebView IPC in native, WebSocket in dev)
- Git-based data versioning via go-git
- Local filesystem storage (~/.bearing/data/)
