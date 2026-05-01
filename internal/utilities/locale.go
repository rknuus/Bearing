package utilities

import (
	"os"
	"os/exec"
	"runtime"
	"strings"
)

// runDefaults reads NSGlobalDomain AppleLocale via the macOS `defaults` binary.
// Declared as a package-private function variable so tests can override it
// without shelling out and to allow non-darwin builds to run unit tests.
var runDefaults = func() (string, error) {
	out, err := exec.Command("defaults", "read", "NSGlobalDomain", "AppleLocale").Output()
	return strings.TrimSpace(string(out)), err
}

// DetectLocale detects the system locale and returns a BCP 47 locale tag.
//
// On darwin, the macOS System Settings Region selection is encoded as a
// modifier on AppleLocale (e.g. `en_US@rg=chzzzz` for Language=English,
// Region=Switzerland). macOS shells set `LANG=en_US.UTF-8` regardless of the
// Region, so on darwin the AppleLocale probe runs first to honour Region
// overrides. On non-darwin platforms only the POSIX env-var chain is used.
func DetectLocale() string {
	if runtime.GOOS == "darwin" {
		if locale := detectMacLocale(); locale != "" {
			return locale
		}
	}
	if locale := detectEnvLocale(); locale != "" {
		return locale
	}
	return "en-US"
}

// detectEnvLocale reads the POSIX locale environment variables. LC_ALL takes
// precedence over LANG. Returns an empty string if no usable value is found.
func detectEnvLocale() string {
	for _, key := range []string{"LC_ALL", "LANG"} {
		env := os.Getenv(key)
		if env == "" || env == "C" || env == "POSIX" {
			continue
		}
		// Strip encoding suffix (e.g. ".UTF-8")
		if idx := strings.Index(env, "."); idx != -1 {
			env = env[:idx]
		}
		// Strip any modifier (e.g. "@euro") — env-var modifiers do not carry
		// a Region in the macOS sense and have no BCP 47 equivalent here.
		if idx := strings.Index(env, "@"); idx != -1 {
			env = env[:idx]
		}
		if env != "" {
			return strings.ReplaceAll(env, "_", "-")
		}
	}
	return ""
}

// detectMacLocale reads AppleLocale via runDefaults and translates it into a
// BCP 47 tag, honouring the `@rg=XXyyyy` Region modifier. Returns an empty
// string if AppleLocale is missing or unusable.
func detectMacLocale() string {
	raw, err := runDefaults()
	if err != nil || raw == "" {
		return ""
	}
	return parseAppleLocale(raw)
}

// parseAppleLocale converts a macOS AppleLocale value (e.g.
// `en_US@rg=chzzzz`) into a BCP 47 tag. The `@rg=` modifier overrides the
// region with the first two letters of its value, uppercased.
func parseAppleLocale(raw string) string {
	tag := raw
	modifier := ""
	if idx := strings.Index(raw, "@"); idx != -1 {
		tag = raw[:idx]
		modifier = raw[idx+1:]
	}
	if tag == "" {
		return ""
	}

	if region := regionFromModifier(modifier); region != "" {
		// Replace (or append) the region with the modifier-derived value.
		language := tag
		if idx := strings.Index(tag, "_"); idx != -1 {
			language = tag[:idx]
		}
		if language == "" {
			return ""
		}
		return language + "-" + region
	}

	return strings.ReplaceAll(tag, "_", "-")
}

// regionFromModifier extracts the BCP 47 region from an AppleLocale modifier.
// The modifier may contain multiple key=value pairs separated by `;`. Only
// `rg` is recognised; its value's first two characters become the region.
func regionFromModifier(modifier string) string {
	if modifier == "" {
		return ""
	}
	for _, part := range strings.Split(modifier, ";") {
		eq := strings.Index(part, "=")
		if eq == -1 {
			continue
		}
		if part[:eq] != "rg" {
			continue
		}
		val := part[eq+1:]
		if len(val) < 2 {
			continue
		}
		return strings.ToUpper(val[:2])
	}
	return ""
}
