package progress_engine

// IProgressEngine defines the interface for progress computation operations.
type IProgressEngine interface {
	// ComputeAllThemeProgress computes progress for all themes and their objectives.
	ComputeAllThemeProgress(themes []ThemeData) []ThemeProgress
}

// ProgressEngine implements IProgressEngine. It is stateless and computes
// progress from provided data without requiring external dependencies.
type ProgressEngine struct{}

// NewProgressEngine creates a new ProgressEngine.
func NewProgressEngine() *ProgressEngine {
	return &ProgressEngine{}
}

// ComputeAllThemeProgress computes progress for all themes and their objectives.
func (pe *ProgressEngine) ComputeAllThemeProgress(themes []ThemeData) []ThemeProgress {
	result := make([]ThemeProgress, 0, len(themes))
	for _, theme := range themes {
		var themeObjProgress []ObjectiveProgress
		var topLevelProgressValues []float64

		for _, obj := range theme.Objectives {
			if !isActiveOKRStatus(obj.Status) {
				continue
			}
			objProgress, nested := pe.computeObjectiveProgress(obj)
			themeObjProgress = append(themeObjProgress, nested...)
			if objProgress >= 0 {
				topLevelProgressValues = append(topLevelProgressValues, objProgress)
			}
		}

		var themeProgress float64
		if len(topLevelProgressValues) == 0 {
			themeProgress = -1
		} else {
			var sum float64
			for _, v := range topLevelProgressValues {
				sum += v
			}
			themeProgress = sum / float64(len(topLevelProgressValues))
		}

		if themeObjProgress == nil {
			themeObjProgress = []ObjectiveProgress{}
		}

		result = append(result, ThemeProgress{
			ThemeID:    theme.ID,
			Progress:   themeProgress,
			Objectives: themeObjProgress,
		})
	}

	return result
}

// computeKRProgress computes the progress percentage of a single key result.
// Returns -1 if the KR is untracked (targetValue == 0).
func computeKRProgress(kr KeyResultData) float64 {
	if kr.TargetValue == 0 {
		return -1
	}
	rangeVal := float64(kr.TargetValue - kr.StartValue)
	if rangeVal == 0 {
		return 0
	}
	progress := float64(kr.CurrentValue-kr.StartValue) / rangeVal * 100
	if progress < 0 {
		return 0
	}
	if progress > 100 {
		return 100
	}
	return progress
}

// isActiveOKRStatus returns true if the status is active (empty or "active").
func isActiveOKRStatus(status string) bool {
	return status == "" || status == "active"
}

// computeObjectiveProgress recursively computes progress for an objective
// and collects all nested objective progress entries.
func (pe *ProgressEngine) computeObjectiveProgress(obj ObjectiveData) (float64, []ObjectiveProgress) {
	var allObjProgress []ObjectiveProgress
	var progressValues []float64

	// Collect progress from active, tracked KRs
	for _, kr := range obj.KeyResults {
		if !isActiveOKRStatus(kr.Status) {
			continue
		}
		p := computeKRProgress(kr)
		if p >= 0 {
			progressValues = append(progressValues, p)
		}
	}

	// Collect progress from active child objectives
	for _, child := range obj.Objectives {
		if !isActiveOKRStatus(child.Status) {
			continue
		}
		childProgress, childObjProgress := pe.computeObjectiveProgress(child)
		allObjProgress = append(allObjProgress, childObjProgress...)
		if childProgress >= 0 {
			progressValues = append(progressValues, childProgress)
		}
	}

	var progress float64
	if len(progressValues) == 0 {
		progress = -1
	} else {
		var sum float64
		for _, v := range progressValues {
			sum += v
		}
		progress = sum / float64(len(progressValues))
	}

	allObjProgress = append(allObjProgress, ObjectiveProgress{
		ObjectiveID: obj.ID,
		Progress:    progress,
	})

	return progress, allObjProgress
}
