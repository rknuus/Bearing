# Dependency Security Audit — 2026-07-24

Audit trail for the `secure-deps-and-macos-app-bundle` initiative. Confirms the
post-update vulnerability posture of the Go and npm dependency trees and records
the one dependency major upgrade that was **deliberately deferred** because it
carries breaking-interface risk.

Branch: `initiative/secure-deps-and-macos-app-bundle`
Scanners: `govulncheck` (x/vuln v1.6.0), `npm audit`.

## 1. What was updated

### Go (Issue #151 — commit `89434da`)

Direct dependencies refreshed to their latest **within-major** versions; no
major upgrades were taken.

| Package | Before | After |
|---------|--------|-------|
| `github.com/wailsapp/wails/v2` | v2.12.0 | v2.13.0 |
| `github.com/go-git/go-git/v5` | v5.18.0 | v5.19.1 |
| `golang.org/x/crypto` (indirect) | v0.50.x | v0.53.0 |
| `golang.org/x/net` (indirect) | v0.53.x | v0.56.0 |
| `golang.org/x/sys` (indirect) | — | v0.46.0 |
| `golang.org/x/text` (indirect) | — | v0.38.0 |

No Go dependency required a major-version jump to reach a secure or current
release, so nothing was deferred on the Go side.

### npm / frontend (Issue #152 — commit `7a4d7ab`)

15 packages bumped within-major. `npm audit` on the refreshed tree already
reported 0 vulnerabilities. One major upgrade was available but **held back**
(see the Deferred-Major table below): `typescript` 6.0.3 → 7.0.2.

## 2. govulncheck result

Command (also runnable via `make vulncheck`):

```
go run golang.org/x/vuln/cmd/govulncheck@latest ./...
```

Result — **0 reachable vulnerabilities**:

```
=== Symbol Results ===
No vulnerabilities found.

Your code is affected by 0 vulnerabilities.
This scan also found 0 vulnerabilities in packages you import and 1
vulnerability in modules you require, but your code doesn't appear to call these
vulnerabilities.
```

The scan covered 12 root packages, 27 modules, and the Go 1.26 standard library.

### Remaining finding (unreachable, no fix available)

| Advisory | Module | Found in | Fixed in | Disposition |
|----------|--------|----------|----------|-------------|
| [GO-2026-5932](https://pkg.go.dev/vuln/GO-2026-5932) | `golang.org/x/crypto` (`openpgp` subpackage) | v0.53.0 | N/A | Unreachable — our code does not call `x/crypto/openpgp`; pulled transitively via go-git's OpenPGP commit-signing path. |

`x/crypto/openpgp` is flagged as unmaintained/unsafe-by-design; the advisory has
**no fixed version** (`Fixed in: N/A`), so this is not resolvable by any upgrade
(major or otherwise). govulncheck classifies it as a module-level finding only —
no symbol in the reachable call graph reaches it. No action possible; tracked
here for the record.

## 3. npm audit result

Command:

```
npm --prefix frontend audit
```

Result:

```
found 0 vulnerabilities
```

**Zero high/critical** (and zero of every severity) across production and dev
dependencies.

## 4. Deferred-Major table

Upgrades that would cross a major-version boundary and were deliberately held
back to honor the "no breaking-interface migrations" constraint of this
initiative.

| Package | Ecosystem | Current | Latest-major | Reason deferred |
|---------|-----------|---------|--------------|-----------------|
| `typescript` | npm | 6.0.3 | 7.0.2 | New major with breaking-interface risk across the `svelte-check` / `typescript-eslint` toolchain. Deferred pending a dedicated compatibility pass; current tree scans clean, so there is no security pressure to force it now. |

Go: **no deferred majors.** Every Go dependency was current at its latest
within-major release, and the single govulncheck finding (GO-2026-5932) has no
fixed version, so no major upgrade would resolve it.

## 5. Test gate

Status on the updated tree:

- `make test` (Go lint + Go tests + frontend type-check + Vitest) — **verified green.** The
  Go backend suite and lint passed under #151, the frontend type-check + 733 Vitest
  tests + lint passed under #152, and `make test` was re-run on the final combined tree
  (including this task's `Makefile` change) to confirm.
- `make test-ui-component-headless` (Playwright UI component) — **NOT run in this
  environment.** Playwright's Chromium browser could not be installed on the build
  machine (the install deterministically wedged mid-extraction — an environment/tooling
  issue unrelated to the dependency changes, which touch only `go.mod` and
  `frontend/package.json`, not Playwright's browser binary).
- `make test-e2e-headless` (true E2E, Wails dev) — **NOT run in this environment**, same
  Playwright-browser reason.

**Action required before merge:** run `make test-ui-component-headless` and
`make test-e2e-headless` locally on a machine with a healthy Playwright browser cache
(e.g. after a successful `npx playwright install chromium`). The dependency changes are
low-risk for these suites (no runtime behavior change intended), but the suites should be
confirmed green before the initiative is merged.

## How to re-run

```
make vulncheck                 # Go: govulncheck ./...
npm --prefix frontend audit    # npm: production + dev advisories
```
