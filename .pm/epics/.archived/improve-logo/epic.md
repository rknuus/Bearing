---
name: improve-logo
status: completed
created: 2026-02-06T12:09:54Z
updated: 2026-02-07T00:00:00Z
progress: 100%
prd: .pm/prds/improve-logo.md
github: https://github.com/rknuus/Bearing/issues/23
---

# Epic: improve-logo

## Overview

Refine the existing `logo.svg` compass design: angle the needle ~8° right, add N/E/S/W cardinal labels, use stronger/more vibrant colors, and produce a variant with a compass rose zig-zag pattern. Generate the final `build/appicon.png` at 1024x1024 for the Wails desktop app.

## Architecture Decisions

- **Edit SVG directly** — the logo is a simple hand-authored SVG (~33 lines). No design tools needed; direct SVG editing is the most precise approach.
- **Two variants** — produce one version without zig-zag and one with, so the user can compare and choose.
- **PNG conversion** — use `rsvg-convert` (available via `librsvg` / Homebrew) or a browser-based render for SVG→PNG at 1024x1024. Fall back to opening in browser and screenshotting if tooling is unavailable.
- **No build pipeline changes** — Wails already expects `build/appicon.png` at that path. Just replace the file.

## Technical Approach

### SVG Modifications

1. **Needle rotation**: Apply `transform="rotate(8, 100, 100)"` to a `<g>` wrapping both needle polygons. This rotates around the center (100,100) of the 200x200 viewBox.

2. **Cardinal labels**: Add `<text>` elements at N (top), E (right), S (bottom), W (left) positions on the outer ring. Use a clean sans-serif font (`font-family="Arial, Helvetica, sans-serif"`), sized to be legible but not dominant.

3. **Stronger colors**:
   - North needle: more vivid blue gradient (e.g., `#1e40af` → `#60a5fa`)
   - South needle: traditional red/warm tone (e.g., `#dc2626` or `#ef4444`) instead of current slate gray
   - Rings: increase opacity and/or stroke width for more presence
   - Cardinal labels: match ring color or use a contrasting dark tone

4. **Zig-zag variant**: Add a compass rose star pattern (8 or 16 points) between the outer and middle rings. Use alternating light/dark triangular segments — a traditional compass card motif.

### PNG Generation

Convert final SVG to 1024x1024 PNG:
```bash
rsvg-convert -w 1024 -h 1024 logo.svg -o build/appicon.png
```
Or if `rsvg-convert` is unavailable, use `npx svg2png-cli` or similar.

## Implementation Strategy

This is a single design iteration. Produce both variants, present to user for selection, then finalize.

## Tasks Created

- [ ] #24 - Refine base logo SVG (parallel: true)
- [ ] #25 - Create zig-zag compass rose variant (parallel: true)
- [ ] #26 - Generate appicon.png from selected variant (parallel: false, depends on #24, #25)

Total tasks: 3
Parallel tasks: 2 (#24, #25)
Sequential tasks: 1 (#26, after user selection)
Estimated total effort: 1.25 hours

## Dependencies

- `rsvg-convert` or equivalent SVG→PNG tool (check availability, install if needed)
- No code dependencies — purely asset work

## Success Criteria (Technical)

- Needle visibly angled ~8° clockwise
- N/E/S/W labels present and legible at 128x128
- Colors noticeably more vibrant than current draft
- Two variants (with/without zig-zag) available for comparison
- `build/appicon.png` at 1024x1024 RGBA PNG

## Estimated Effort

- 3 tasks, mostly sequential
- Task 1 and 2 can be done in parallel (two SVG files)
- Total: ~1-2 hours
