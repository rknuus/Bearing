package utilities

import "strings"

// Slugify converts a title to a URL-friendly slug suitable for use as a
// directory name and column identifier. It lowercases the input, replaces
// non-alphanumeric characters with hyphens, collapses consecutive hyphens,
// and trims leading/trailing hyphens. Returns empty string for empty input.
func Slugify(title string) string {
	s := strings.ToLower(strings.TrimSpace(title))
	// Replace non-alphanumeric with hyphens
	var b strings.Builder
	for _, r := range s {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') {
			b.WriteRune(r)
		} else {
			b.WriteByte('-')
		}
	}
	s = b.String()
	// Collapse consecutive hyphens
	for strings.Contains(s, "--") {
		s = strings.ReplaceAll(s, "--", "-")
	}
	// Trim leading/trailing hyphens
	s = strings.Trim(s, "-")
	return s
}
