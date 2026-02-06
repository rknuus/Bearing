---
name: improve-logo
description: Refine the compass logo with angled needle, cardinal labels, stronger colors, and optional zig-zag pattern
status: backlog
created: 2026-02-06T12:03:31Z
---

# PRD: improve-logo

## Executive Summary

Refine the existing Bearing compass logo (SVG) to make it more polished and distinctive as a desktop app icon. The compass + concentric rings concept stays — the changes are: slightly angled needle (~8 degrees right), cardinal direction labels (N/E/S/W), stronger colors, and optionally a compass rose zig-zag pattern.

## Problem Statement

### The Problem

The current logo is a draft (committed as "Add draft of logo"). While the concept is sound — a compass with three concentric rings representing long/mid/short-term planning — the execution is too plain and generic. As a macOS dock icon, it doesn't stand out.

### Why This Matters Now

The app icon is the first thing users see. A polished icon signals a quality application and makes it easy to find in the dock.

## User Stories

### US-01: Recognizable App Icon

**As a** Bearing user,
**I want** a distinctive app icon in my dock,
**So that** I can quickly find and launch Bearing among other applications.

**Acceptance Criteria:**
- Logo is visually distinct at 1024x1024, 512x512, 256x256, 128x128, 64x64, and 32x32 pixels
- Compass needle is recognizable even at small sizes
- Cardinal labels (N/E/S/W) are legible at 128x128 and above
- Colors are vibrant enough to stand out against both light and dark macOS dock backgrounds

## Requirements

### Functional Requirements

#### FR-01: Angled Needle

The compass needle must be rotated approximately 8 degrees clockwise (to the right of true north). This makes the logo feel dynamic rather than static, and subtly suggests "finding your bearing" rather than already pointing perfectly north.

#### FR-02: Cardinal Direction Labels

Add N, E, S, and W text labels at the corresponding positions on or near the outer ring:
- N at top, E at right, S at bottom, W at left
- Font should be clean and legible (sans-serif)
- Labels should be proportional to the ring — not dominant, but clearly readable

#### FR-03: Stronger Colors

Replace the current muted navy/slate palette with more vibrant, saturated colors:
- The north needle should have a strong, vivid blue gradient
- The south needle should contrast clearly (red or warm tone, per compass tradition)
- Rings should be more visible — less transparent, or use color differentiation
- Overall: the logo should "pop" as an app icon

#### FR-04: Optional Zig-Zag Pattern

Explore adding a traditional compass rose zig-zag (star) pattern. Potential placements:
- Between the outer and middle rings
- As a background fill behind the needle
- As decorative points at the cardinal directions

This is exploratory — produce a variant with and without the zig-zag so the user can choose.

#### FR-05: App Icon Output

Generate the final logo as:
- `logo.svg` — updated vector source (replaces existing)
- `build/appicon.png` — 1024x1024 PNG for Wails desktop app icon

### Non-Functional Requirements

#### NFR-01: Scalability
- Must look good from 32x32 (dock) to 1024x1024 (About screen)
- Fine details (zig-zag, labels) should degrade gracefully at small sizes

#### NFR-02: Compatibility
- SVG must be valid and render correctly in browsers and macOS Preview
- PNG must be RGBA with transparency (rounded corners handled by macOS)

## Success Criteria

1. Compass needle is visibly angled (~8 degrees right)
2. N/E/S/W labels are present and legible at 128x128+
3. Colors are noticeably more vibrant than the current draft
4. Logo is recognizable and distinctive at dock icon size (64x64)
5. At least two variants produced (with and without zig-zag) for user selection

## Constraints & Assumptions

### Constraints
- Must remain an SVG (vector source of truth)
- Must keep the compass + 3 concentric rings concept
- Output PNG at 1024x1024 for Wails appicon.png

### Assumptions
- The user will visually review variants and select one
- No animation or dynamic elements needed (static icon)
- macOS is the primary platform (icon conventions)

## Out of Scope

1. **Favicon** — not needed (app icon only)
2. **In-app branding** — no header/nav logo
3. **Splash screen** — not needed
4. **Multiple color themes** — one final color scheme
5. **Logo guidelines document** — not needed for a personal project

## Dependencies

### Internal
- Existing `logo.svg` as starting point
- `build/appicon.png` path expected by Wails

### External
- SVG-to-PNG conversion tool (e.g., `rsvg-convert`, browser, or Inkscape CLI)
