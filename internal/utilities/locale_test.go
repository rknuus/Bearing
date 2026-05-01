package utilities

import (
	"errors"
	"os"
	"regexp"
	"testing"
)

// withRunDefaults swaps the package-private runDefaults function for the
// duration of a test, restoring the original on cleanup. Using a helper keeps
// each test focused on its scenario without leaking state between tests.
func withRunDefaults(t *testing.T, fn func() (string, error)) {
	t.Helper()
	old := runDefaults
	runDefaults = fn
	t.Cleanup(func() { runDefaults = old })
}

// withEnv sets an env var for the duration of a test, restoring the original
// on cleanup. Empty values are written via Setenv (not Unsetenv) so that the
// test can reliably suppress an inherited LC_ALL/LANG.
func withEnv(t *testing.T, key, value string) {
	t.Helper()
	old, hadOld := os.LookupEnv(key)
	if err := os.Setenv(key, value); err != nil {
		t.Fatalf("os.Setenv(%q): %v", key, err)
	}
	t.Cleanup(func() {
		if hadOld {
			_ = os.Setenv(key, old)
		} else {
			_ = os.Unsetenv(key)
		}
	})
}

func TestUnit_DetectLocale_ReturnsBCP47(t *testing.T) {
	locale := DetectLocale()
	if locale == "" {
		t.Fatal("DetectLocale() returned empty string")
	}

	bcp47 := regexp.MustCompile(`^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,})*$`)
	if !bcp47.MatchString(locale) {
		t.Errorf("DetectLocale() = %q, does not match BCP 47 pattern", locale)
	}
}

func TestUnit_DetectLocale_AppleLocaleWithRegionOverride(t *testing.T) {
	// macOS encodes Language=English, Region=Switzerland as en_US@rg=chzzzz.
	// Set a non-empty LANG to prove the macOS path wins on darwin and that
	// the env-var fallback is not consulted when AppleLocale is usable.
	withEnv(t, "LC_ALL", "")
	withEnv(t, "LANG", "en_US.UTF-8")
	withRunDefaults(t, func() (string, error) {
		return "en_US@rg=chzzzz", nil
	})

	if got := detectMacLocale(); got != "en-CH" {
		t.Errorf("detectMacLocale() with AppleLocale=en_US@rg=chzzzz = %q, want %q", got, "en-CH")
	}
}

func TestUnit_DetectLocale_AppleLocaleNoOverride(t *testing.T) {
	withRunDefaults(t, func() (string, error) {
		return "de_CH", nil
	})

	if got := detectMacLocale(); got != "de-CH" {
		t.Errorf("detectMacLocale() with AppleLocale=de_CH = %q, want %q", got, "de-CH")
	}
}

func TestUnit_DetectLocale_AppleLocaleSimpleEnUS(t *testing.T) {
	withRunDefaults(t, func() (string, error) {
		return "en_US", nil
	})

	if got := detectMacLocale(); got != "en-US" {
		t.Errorf("detectMacLocale() with AppleLocale=en_US = %q, want %q", got, "en-US")
	}
}

func TestUnit_DetectLocale_AppleLocaleEmptyFallsThrough(t *testing.T) {
	// AppleLocale empty plus empty env vars should fall back to "en-US".
	withEnv(t, "LC_ALL", "")
	withEnv(t, "LANG", "")
	withRunDefaults(t, func() (string, error) {
		return "", nil
	})

	if got := DetectLocale(); got != "en-US" {
		t.Errorf("DetectLocale() with empty probes = %q, want %q", got, "en-US")
	}
}

func TestUnit_DetectLocale_AppleLocaleErrorFallsThrough(t *testing.T) {
	// When `defaults` errors (or the binary is absent), fall through to env.
	withEnv(t, "LC_ALL", "")
	withEnv(t, "LANG", "fr_FR.UTF-8")
	withRunDefaults(t, func() (string, error) {
		return "", errors.New("defaults not found")
	})

	if got := DetectLocale(); got != "fr-FR" {
		t.Errorf("DetectLocale() with defaults error = %q, want %q", got, "fr-FR")
	}
}

func TestUnit_DetectLocale_LCAllOverride(t *testing.T) {
	// LC_ALL must steer the env path. Suppress the macOS path so the
	// behaviour is identical on darwin and Linux.
	withRunDefaults(t, func() (string, error) { return "", nil })
	withEnv(t, "LC_ALL", "de_CH.UTF-8")
	withEnv(t, "LANG", "")

	if got := DetectLocale(); got != "de-CH" {
		t.Errorf("DetectLocale() with LC_ALL=de_CH.UTF-8 = %q, want %q", got, "de-CH")
	}
}

func TestUnit_DetectLocale_LANGFallback(t *testing.T) {
	withRunDefaults(t, func() (string, error) { return "", nil })
	withEnv(t, "LC_ALL", "")
	withEnv(t, "LANG", "fr_FR.UTF-8")

	if got := DetectLocale(); got != "fr-FR" {
		t.Errorf("DetectLocale() with LANG=fr_FR.UTF-8 = %q, want %q", got, "fr-FR")
	}
}

func TestUnit_DetectLocale_LCAllTakesPrecedenceOverLANG(t *testing.T) {
	withRunDefaults(t, func() (string, error) { return "", nil })
	withEnv(t, "LC_ALL", "ja_JP.UTF-8")
	withEnv(t, "LANG", "fr_FR.UTF-8")

	if got := DetectLocale(); got != "ja-JP" {
		t.Errorf("DetectLocale() with LC_ALL=ja_JP, LANG=fr_FR = %q, want %q", got, "ja-JP")
	}
}

func TestUnit_DetectLocale_IgnoresCAndPOSIX(t *testing.T) {
	withRunDefaults(t, func() (string, error) { return "", nil })

	for _, val := range []string{"C", "POSIX"} {
		withEnv(t, "LC_ALL", val)
		withEnv(t, "LANG", "")
		got := DetectLocale()
		if got == val {
			t.Errorf("DetectLocale() should ignore LC_ALL=%s, but returned %q", val, got)
		}
	}
}

func TestUnit_DetectLocale_AllProbesEmptyReturnsDefault(t *testing.T) {
	withRunDefaults(t, func() (string, error) { return "", nil })
	withEnv(t, "LC_ALL", "")
	withEnv(t, "LANG", "")

	if got := DetectLocale(); got != "en-US" {
		t.Errorf("DetectLocale() with no probes = %q, want %q", got, "en-US")
	}
}

func TestUnit_ParseAppleLocale(t *testing.T) {
	cases := []struct {
		in, want string
	}{
		{"en_US@rg=chzzzz", "en-CH"},
		{"en_US", "en-US"},
		{"de_CH", "de-CH"},
		{"de_DE@rg=atzzzz", "de-AT"},
		{"en@rg=gbzzzz", "en-GB"},
		{"", ""},
		{"@rg=chzzzz", ""},
	}
	for _, c := range cases {
		if got := parseAppleLocale(c.in); got != c.want {
			t.Errorf("parseAppleLocale(%q) = %q, want %q", c.in, got, c.want)
		}
	}
}
