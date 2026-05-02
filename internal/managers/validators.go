package managers

import (
	"fmt"
	"strings"

	"github.com/rkn/bearing/internal/access"
)

// reservedTagNames lists synthetic presentational identifiers that must never
// appear as values in task.Tags. They are display-only filters in the EisenKan
// tag deck (AD-3 in the eisenkan-tag-deck epic). Comparison is case-insensitive.
var reservedTagNames = []string{"Untagged", "All"}

// validateTagName returns a non-nil error if name matches any reserved
// presentational identifier (case-insensitive). Empty values are accepted
// here — callers are responsible for trimming and empty-filtering before
// calling this guard.
func validateTagName(name string) error {
	for _, reserved := range reservedTagNames {
		if strings.EqualFold(name, reserved) {
			return fmt.Errorf("tag name %q is reserved and cannot be used", name)
		}
	}
	return nil
}

// validateTagNames runs validateTagName on every entry. Returns the first
// reserved-name error encountered, or nil if all entries are acceptable.
func validateTagNames(names []string) error {
	for _, name := range names {
		if err := validateTagName(name); err != nil {
			return err
		}
	}
	return nil
}

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
