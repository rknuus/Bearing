package main

import (
	"regexp"
	"testing"
)

func TestGetLocale(t *testing.T) {
	app := NewApp()
	locale := app.GetLocale()

	if locale == "" {
		t.Fatal("GetLocale() returned empty string")
	}

	// BCP 47 pattern: letters, optionally followed by hyphen and more letters/digits
	bcp47 := regexp.MustCompile(`^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,})*$`)
	if !bcp47.MatchString(locale) {
		t.Errorf("GetLocale() = %q, does not match BCP 47 pattern", locale)
	}
}
