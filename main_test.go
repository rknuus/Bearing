package main

import (
	"os"
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

func TestGetLocale_LCAllOverride(t *testing.T) {
	app := NewApp()

	old := os.Getenv("LC_ALL")
	defer os.Setenv("LC_ALL", old)

	os.Setenv("LC_ALL", "de_CH.UTF-8")
	locale := app.GetLocale()

	if locale != "de-CH" {
		t.Errorf("GetLocale() with LC_ALL=de_CH.UTF-8 = %q, want %q", locale, "de-CH")
	}
}

func TestGetLocale_LANGFallback(t *testing.T) {
	app := NewApp()

	oldLCAll := os.Getenv("LC_ALL")
	oldLang := os.Getenv("LANG")
	defer func() {
		os.Setenv("LC_ALL", oldLCAll)
		os.Setenv("LANG", oldLang)
	}()

	os.Setenv("LC_ALL", "")
	os.Setenv("LANG", "fr_FR.UTF-8")
	locale := app.GetLocale()

	if locale != "fr-FR" {
		t.Errorf("GetLocale() with LANG=fr_FR.UTF-8 = %q, want %q", locale, "fr-FR")
	}
}

func TestGetLocale_LCAllTakesPrecedenceOverLANG(t *testing.T) {
	app := NewApp()

	oldLCAll := os.Getenv("LC_ALL")
	oldLang := os.Getenv("LANG")
	defer func() {
		os.Setenv("LC_ALL", oldLCAll)
		os.Setenv("LANG", oldLang)
	}()

	os.Setenv("LC_ALL", "ja_JP.UTF-8")
	os.Setenv("LANG", "fr_FR.UTF-8")
	locale := app.GetLocale()

	if locale != "ja-JP" {
		t.Errorf("GetLocale() with LC_ALL=ja_JP, LANG=fr_FR = %q, want %q", locale, "ja-JP")
	}
}

func TestGetLocale_IgnoresCAndPOSIX(t *testing.T) {
	app := NewApp()

	oldLCAll := os.Getenv("LC_ALL")
	oldLang := os.Getenv("LANG")
	defer func() {
		os.Setenv("LC_ALL", oldLCAll)
		os.Setenv("LANG", oldLang)
	}()

	for _, val := range []string{"C", "POSIX"} {
		os.Setenv("LC_ALL", val)
		os.Setenv("LANG", "")
		locale := app.GetLocale()

		// Should fall through to macOS defaults or en-US, not return "C"/"POSIX"
		if locale == val {
			t.Errorf("GetLocale() should ignore LC_ALL=%s, but returned %q", val, locale)
		}
	}
}
