package managers

import (
	"github.com/rkn/bearing/internal/access"
	"github.com/rkn/bearing/internal/engines/progress_engine"
)

// toManagerLifeTheme converts an access.LifeTheme to the Manager's LifeTheme.
func toManagerLifeTheme(a access.LifeTheme) LifeTheme {
	objectives := make([]Objective, len(a.Objectives))
	for i, o := range a.Objectives {
		objectives[i] = toManagerObjective(o)
	}
	var routines []Routine
	if len(a.Routines) > 0 {
		routines = make([]Routine, len(a.Routines))
		for i, r := range a.Routines {
			routines[i] = toManagerRoutine(r)
		}
	}
	return LifeTheme{
		ID:         a.ID,
		Name:       a.Name,
		Color:      a.Color,
		Objectives: objectives,
		Routines:   routines,
	}
}

// toAccessLifeTheme converts a Manager LifeTheme to an access.LifeTheme.
func toAccessLifeTheme(m LifeTheme) access.LifeTheme {
	objectives := make([]access.Objective, len(m.Objectives))
	for i, o := range m.Objectives {
		objectives[i] = toAccessObjective(o)
	}
	var routines []access.Routine
	if len(m.Routines) > 0 {
		routines = make([]access.Routine, len(m.Routines))
		for i, r := range m.Routines {
			routines[i] = toAccessRoutine(r)
		}
	}
	return access.LifeTheme{
		ID:         m.ID,
		Name:       m.Name,
		Color:      m.Color,
		Objectives: objectives,
		Routines:   routines,
	}
}

// toManagerObjective recursively converts an access.Objective to the Manager's Objective.
func toManagerObjective(a access.Objective) Objective {
	keyResults := make([]KeyResult, len(a.KeyResults))
	for i, kr := range a.KeyResults {
		keyResults[i] = toManagerKeyResult(kr)
	}
	var children []Objective
	if len(a.Objectives) > 0 {
		children = make([]Objective, len(a.Objectives))
		for i, child := range a.Objectives {
			children[i] = toManagerObjective(child)
		}
	}
	return Objective{
		ID:            a.ID,
		ParentID:      a.ParentID,
		Title:         a.Title,
		Status:        a.Status,
		Tags:          a.Tags,
		ClosingStatus: a.ClosingStatus,
		ClosingNotes:  a.ClosingNotes,
		ClosedAt:      a.ClosedAt,
		KeyResults:    keyResults,
		Objectives:    children,
	}
}

// toAccessObjective recursively converts a Manager Objective to an access.Objective.
func toAccessObjective(m Objective) access.Objective {
	keyResults := make([]access.KeyResult, len(m.KeyResults))
	for i, kr := range m.KeyResults {
		keyResults[i] = toAccessKeyResult(kr)
	}
	var children []access.Objective
	if len(m.Objectives) > 0 {
		children = make([]access.Objective, len(m.Objectives))
		for i, child := range m.Objectives {
			children[i] = toAccessObjective(child)
		}
	}
	return access.Objective{
		ID:            m.ID,
		ParentID:      m.ParentID,
		Title:         m.Title,
		Status:        m.Status,
		Tags:          m.Tags,
		ClosingStatus: m.ClosingStatus,
		ClosingNotes:  m.ClosingNotes,
		ClosedAt:      m.ClosedAt,
		KeyResults:    keyResults,
		Objectives:    children,
	}
}

// toManagerKeyResult converts an access.KeyResult to the Manager's KeyResult.
func toManagerKeyResult(a access.KeyResult) KeyResult {
	return KeyResult{
		ID:           a.ID,
		ParentID:     a.ParentID,
		Description:  a.Description,
		Type:         a.Type,
		Status:       a.Status,
		StartValue:   a.StartValue,
		CurrentValue: a.CurrentValue,
		TargetValue:  a.TargetValue,
	}
}

// toAccessKeyResult converts a Manager KeyResult to an access.KeyResult.
func toAccessKeyResult(m KeyResult) access.KeyResult {
	return access.KeyResult{
		ID:           m.ID,
		ParentID:     m.ParentID,
		Description:  m.Description,
		Type:         m.Type,
		Status:       m.Status,
		StartValue:   m.StartValue,
		CurrentValue: m.CurrentValue,
		TargetValue:  m.TargetValue,
	}
}

// toManagerRepeatPattern converts an access.RepeatPattern to the Manager's RepeatPattern.
func toManagerRepeatPattern(a *access.RepeatPattern) *RepeatPattern {
	if a == nil {
		return nil
	}
	return &RepeatPattern{
		Frequency:  a.Frequency,
		Interval:   a.Interval,
		Weekdays:   a.Weekdays,
		DayOfMonth: a.DayOfMonth,
		StartDate:  a.StartDate,
	}
}

// toAccessRepeatPattern converts a Manager RepeatPattern to an access.RepeatPattern.
func toAccessRepeatPattern(m *RepeatPattern) *access.RepeatPattern {
	if m == nil {
		return nil
	}
	return &access.RepeatPattern{
		Frequency:  m.Frequency,
		Interval:   m.Interval,
		Weekdays:   m.Weekdays,
		DayOfMonth: m.DayOfMonth,
		StartDate:  m.StartDate,
	}
}

// toManagerExceptions converts access.ScheduleException slice to the Manager's ScheduleException slice.
func toManagerExceptions(a []access.ScheduleException) []ScheduleException {
	if len(a) == 0 {
		return nil
	}
	result := make([]ScheduleException, len(a))
	for i, e := range a {
		result[i] = ScheduleException{
			OriginalDate: e.OriginalDate,
			NewDate:      e.NewDate,
		}
	}
	return result
}

// toAccessExceptions converts Manager ScheduleException slice to access.ScheduleException slice.
func toAccessExceptions(m []ScheduleException) []access.ScheduleException {
	if len(m) == 0 {
		return nil
	}
	result := make([]access.ScheduleException, len(m))
	for i, e := range m {
		result[i] = access.ScheduleException{
			OriginalDate: e.OriginalDate,
			NewDate:      e.NewDate,
		}
	}
	return result
}

// toManagerRoutine converts an access.Routine to the Manager's Routine.
func toManagerRoutine(a access.Routine) Routine {
	return Routine{
		ID:            a.ID,
		Description:   a.Description,
		CurrentValue:  a.CurrentValue,
		TargetValue:   a.TargetValue,
		TargetType:    a.TargetType,
		Unit:          a.Unit,
		RepeatPattern: toManagerRepeatPattern(a.RepeatPattern),
		Exceptions:    toManagerExceptions(a.Exceptions),
	}
}

// toAccessRoutine converts a Manager Routine to an access.Routine.
func toAccessRoutine(m Routine) access.Routine {
	return access.Routine{
		ID:            m.ID,
		Description:   m.Description,
		CurrentValue:  m.CurrentValue,
		TargetValue:   m.TargetValue,
		TargetType:    m.TargetType,
		Unit:          m.Unit,
		RepeatPattern: toAccessRepeatPattern(m.RepeatPattern),
		Exceptions:    toAccessExceptions(m.Exceptions),
	}
}

// toManagerTask converts an access.Task to the Manager's Task.
func toManagerTask(a access.Task) Task {
	return Task{
		ID:            a.ID,
		Title:         a.Title,
		Description:   a.Description,
		ThemeID:       a.ThemeID,
		Priority:      a.Priority,
		Tags:          a.Tags,
		PromotionDate: a.PromotionDate,
		CreatedAt:     a.CreatedAt,
		UpdatedAt:     a.UpdatedAt,
	}
}

// toAccessTask converts a Manager Task to an access.Task.
func toAccessTask(m Task) access.Task {
	return access.Task{
		ID:            m.ID,
		Title:         m.Title,
		Description:   m.Description,
		ThemeID:       m.ThemeID,
		Priority:      m.Priority,
		Tags:          m.Tags,
		PromotionDate: m.PromotionDate,
		CreatedAt:     m.CreatedAt,
		UpdatedAt:     m.UpdatedAt,
	}
}

// toManagerDayFocus converts an access.DayFocus to the Manager's DayFocus.
func toManagerDayFocus(a access.DayFocus) DayFocus {
	return DayFocus{
		Date:     a.Date,
		ThemeIDs: a.ThemeIDs,
		Notes:    a.Notes,
		Text:     a.Text,
		OkrIDs:   a.OkrIDs,
		Tags:     a.Tags,
	}
}

// toAccessDayFocus converts a Manager DayFocus to an access.DayFocus.
func toAccessDayFocus(m DayFocus) access.DayFocus {
	return access.DayFocus{
		Date:     m.Date,
		ThemeIDs: m.ThemeIDs,
		Notes:    m.Notes,
		Text:     m.Text,
		OkrIDs:   m.OkrIDs,
		Tags:     m.Tags,
	}
}

// toManagerBoardConfig converts an access.BoardConfiguration to the Manager's BoardConfiguration.
func toManagerBoardConfig(a *access.BoardConfiguration) *BoardConfiguration {
	columns := make([]ColumnDefinition, len(a.ColumnDefinitions))
	for i, col := range a.ColumnDefinitions {
		var sections []SectionDefinition
		if len(col.Sections) > 0 {
			sections = make([]SectionDefinition, len(col.Sections))
			for j, sec := range col.Sections {
				sections[j] = SectionDefinition{
					Name:  sec.Name,
					Title: sec.Title,
					Color: sec.Color,
				}
			}
		}
		columns[i] = ColumnDefinition{
			Name:     col.Name,
			Title:    col.Title,
			Type:     string(col.Type),
			Sections: sections,
		}
	}
	return &BoardConfiguration{
		Name:              a.Name,
		ColumnDefinitions: columns,
	}
}

// toManagerPersonalVision converts an access.PersonalVision to the Manager's PersonalVision.
func toManagerPersonalVision(a *access.PersonalVision) *PersonalVision {
	return &PersonalVision{
		Mission:   a.Mission,
		Vision:    a.Vision,
		UpdatedAt: a.UpdatedAt,
	}
}

// toEngineThemeData converts an access.LifeTheme to a progress_engine.ThemeData.
func toEngineThemeData(a access.LifeTheme) progress_engine.ThemeData {
	return progress_engine.ThemeData{
		ID:         a.ID,
		Objectives: toEngineObjectiveDataSlice(a.Objectives),
	}
}

// toEngineObjectiveDataSlice converts a slice of access.Objective to progress_engine.ObjectiveData.
func toEngineObjectiveDataSlice(objectives []access.Objective) []progress_engine.ObjectiveData {
	result := make([]progress_engine.ObjectiveData, len(objectives))
	for i, obj := range objectives {
		krs := make([]progress_engine.KeyResultData, len(obj.KeyResults))
		for j, kr := range obj.KeyResults {
			krs[j] = progress_engine.KeyResultData{
				ID:           kr.ID,
				Status:       kr.Status,
				StartValue:   kr.StartValue,
				CurrentValue: kr.CurrentValue,
				TargetValue:  kr.TargetValue,
			}
		}
		result[i] = progress_engine.ObjectiveData{
			ID:         obj.ID,
			Status:     obj.Status,
			KeyResults: krs,
			Objectives: toEngineObjectiveDataSlice(obj.Objectives),
		}
	}
	return result
}
