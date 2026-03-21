package utilities

import (
	"os"
	"os/exec"
	"strings"
)

// DetectLocale detects the system locale and returns a BCP 47 locale tag.
// Environment variables (LC_ALL, LANG) take precedence over macOS system
// settings, since setting them signals deliberate override intent.
func DetectLocale() string {
	// Check POSIX locale environment variables (LC_ALL overrides LANG)
	for _, key := range []string{"LC_ALL", "LANG"} {
		env := os.Getenv(key)
		if env == "" || env == "C" || env == "POSIX" {
			continue
		}
		// Strip encoding suffix (e.g. ".UTF-8")
		if idx := strings.Index(env, "."); idx != -1 {
			env = env[:idx]
		}
		if env != "" {
			return strings.ReplaceAll(env, "_", "-")
		}
	}

	// Fall back to macOS system locale
	out, err := exec.Command("defaults", "read", "NSGlobalDomain", "AppleLocale").Output()
	if err == nil {
		locale := strings.TrimSpace(string(out))
		// Strip variant suffix (e.g. "@rg=chzzzz")
		if idx := strings.Index(locale, "@"); idx != -1 {
			locale = locale[:idx]
		}
		if locale != "" {
			return strings.ReplaceAll(locale, "_", "-")
		}
	}

	return "en-US"
}
