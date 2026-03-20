# 11 — Excessive Git Commits for Routine Operations

## Finding

Every single save operation creates a git commit. Updating a key result's `currentValue` from 5 to 6 creates a commit. Saving a day focus note creates a commit. This creates significant I/O overhead and an enormous commit history with low signal-to-noise ratio.

## Severity: Low

## Urgency: When convenient

This is a deployment/infrastructure concern, not an architectural violation. The system functions correctly. The overhead is only noticeable with heavy usage.

## Current State

Every write method in `PlanAccess` ends with a `commitFiles` call:

**`internal/access/plan_access.go:313`** — `SaveTheme` commits after every theme save:
```go
if err := pa.commitFiles([]string{filePath}, fmt.Sprintf("%s theme: %s", action, theme.Name)); err != nil {
```

**`internal/access/plan_access.go:424`** — `SaveDayFocus` commits after every day focus save.

**`internal/access/plan_access.go:564`** — `SaveTask` commits after every task update.

**`internal/access/plan_access.go:1196`** — `SaveTaskOrder` commits after every order change.

**`internal/access/plan_access.go:1295`** — `SaveVision` commits after every vision update.

A single `MoveTask` operation can trigger 2 commits: one for `MoveTask` (line 724) and one for `SaveTaskOrder` (line 1196). Similarly, `ArchiveTask` triggers 2 commits (lines 751 and the `removeFromTaskOrder` call).

## Target State

**Option A: Batch commits per use case (Recommended — simplest)**
The Manager controls when commits happen. The RA writes files without committing. The Manager calls a commit method after all writes for a use case are complete.

```
Manager.MoveTask():
    planAccess.MoveTaskFile(taskId, newStatus)   // no commit
    planAccess.WriteTaskOrder(orderMap)           // no commit
    planAccess.Commit("Move task: X to doing")   // single commit
```

**Option B: Debounced auto-commit**
The Repository utility batches changes and commits after a configurable quiet period (e.g., 2 seconds with no new writes). This keeps the RA simple but adds complexity to the utility.

**Option C: Explicit session/unit-of-work**
The Manager begins a "session", performs multiple RA operations, then commits the session. This is closest to the existing Transaction pattern but at a higher level.

## Steps (Option A)

1. **Add `WriteTheme`, `WriteDayFocus`, `WriteTask` methods** to the RA that write files without committing. The existing `Save*` methods become convenience wrappers that call Write + Commit.

2. **Update Manager methods** that perform multiple writes to use Write methods instead of Save methods, then commit once at the end.

3. **Target multi-write operations**:
   - `MoveTask` (planning_manager.go:1225-1335): 2 commits → 1
   - `ArchiveTask` (planning_manager.go:1469-1503): 2 commits → 1
   - `RestoreTask` (planning_manager.go:1525-1574): 2 commits → 1
   - `AddColumn` (planning_manager.go:1665-1732): Already uses `CommitAll` for a single commit — good.
   - `RemoveColumn` (planning_manager.go:1735-1792): Uses `CommitAll` — good.
   - `ArchiveAllDoneTasks` (planning_manager.go:1506-1522): N commits (one per task) → 1.

4. **For single-write operations** (e.g., `UpdateKeyResultProgress`, `SaveDayFocus`), keep the current behavior. One commit per operation is acceptable for user-initiated actions.

5. **Consider batching `ArchiveAllDoneTasks`**: Currently loops and calls `ArchiveTask` per task (each doing 2 commits). Refactor to archive all tasks, then commit once.

## Risk

- **Low risk for Option A**: Write-then-commit is a straightforward pattern. The Transaction utility already supports multi-file staging.
- **Data loss window**: Between Write and Commit, data is on disk but not versioned. If the app crashes between these calls, the git history misses the change. This is acceptable — the file is still written.
- **Existing tests**: Tests that verify commit behavior (if any) may need updates.

## Dependencies

- **Independent**: Can be done at any time.
- **Partially addressed by**: Finding 04/05 decomposition — when Managers are split, each Manager can manage its own commit boundary.
- **Related to**: The Method principle "Separate architecture from deployment from infrastructure" — commit frequency is an infrastructure concern.
