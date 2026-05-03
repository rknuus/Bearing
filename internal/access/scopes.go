package access

// Scope sentinel values for tag-scoped task operations. These literals
// mirror the frontend's `selectedTag` reserved values exactly so the
// caller can pass the user-facing selection string through unchanged
// without any DTO translation at the binding boundary.
//
//   - ScopeAll      : every task qualifies (tag list ignored).
//   - ScopeUntagged : only tasks with an empty tag list qualify.
//   - any other     : tasks whose tag list contains that exact tag
//                     (membership; multi-tag tasks match if at least one
//                     tag equals the supplied string).
const (
	ScopeAll      = "All"
	ScopeUntagged = "Untagged"
)
