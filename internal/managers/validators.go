package managers

import "github.com/rkn/bearing/internal/access"

// IsValidPriority checks if a priority string is valid.
func IsValidPriority(priority string) bool {
	for _, valid := range access.ValidPriorities() {
		if string(valid) == priority {
			return true
		}
	}
	return false
}

// IsValidOKRStatus checks if a status string is valid.
// Empty string is treated as valid (equivalent to "active").
func IsValidOKRStatus(status string) bool {
	if status == "" {
		return true
	}
	switch access.OKRStatus(status) {
	case access.OKRStatusActive, access.OKRStatusCompleted, access.OKRStatusArchived:
		return true
	}
	return false
}

// EffectiveOKRStatus returns "active" if status is empty, otherwise the status as-is.
func EffectiveOKRStatus(status string) string {
	if status == "" {
		return string(access.OKRStatusActive)
	}
	return status
}

// IsValidClosingStatus checks if a closing status string is valid.
func IsValidClosingStatus(status string) bool {
	switch status {
	case access.ClosingStatusAchieved, access.ClosingStatusPartiallyAchieved, access.ClosingStatusMissed, access.ClosingStatusPostponed, access.ClosingStatusCanceled:
		return true
	}
	return false
}

// IsValidKRType checks if a KR type string is valid.
// Empty string is treated as valid (equivalent to "metric").
func IsValidKRType(krType string) bool {
	switch krType {
	case "", access.KRTypeMetric, access.KRTypeBinary:
		return true
	}
	return false
}
