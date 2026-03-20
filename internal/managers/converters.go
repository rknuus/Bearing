package managers

import "github.com/rkn/bearing/internal/access"

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

// toManagerRoutine converts an access.Routine to the Manager's Routine.
func toManagerRoutine(a access.Routine) Routine {
	return Routine{
		ID:           a.ID,
		Description:  a.Description,
		CurrentValue: a.CurrentValue,
		TargetValue:  a.TargetValue,
		TargetType:   a.TargetType,
		Unit:         a.Unit,
	}
}

// toAccessRoutine converts a Manager Routine to an access.Routine.
func toAccessRoutine(m Routine) access.Routine {
	return access.Routine{
		ID:           m.ID,
		Description:  m.Description,
		CurrentValue: m.CurrentValue,
		TargetValue:  m.TargetValue,
		TargetType:   m.TargetType,
		Unit:         m.Unit,
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
