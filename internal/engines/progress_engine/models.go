// Package progress_engine provides Engine layer components for computing
// OKR progress. It is stateless and operates on its own input/output DTOs,
// without importing access layer types.
package progress_engine

// KeyResultData contains the key result fields needed for progress computation.
type KeyResultData struct {
	ID           string
	Status       string
	StartValue   int
	CurrentValue int
	TargetValue  int
}

// ObjectiveData contains the objective fields needed for progress computation.
type ObjectiveData struct {
	ID         string
	Status     string
	KeyResults []KeyResultData
	Objectives []ObjectiveData
}

// ThemeData contains the theme fields needed for progress computation.
type ThemeData struct {
	ID         string
	Objectives []ObjectiveData
}

// ObjectiveProgress represents the computed progress of an objective.
type ObjectiveProgress struct {
	ObjectiveID string
	Progress    float64 // 0-100, or -1 if no data
}

// ThemeProgress represents computed progress for a theme and its objectives.
type ThemeProgress struct {
	ThemeID    string
	Progress   float64 // 0-100, average of objective progresses
	Objectives []ObjectiveProgress
}
