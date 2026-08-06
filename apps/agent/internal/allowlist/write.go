package allowlist

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// Entry mirrors Bedrock allowlist.json objects.
type Entry struct {
	Name               string `json:"name"`
	XUID               string `json:"xuid"`
	IgnoresPlayerLimit bool   `json:"ignoresPlayerLimit"`
}

// ResolveJailPath ensures candidate resolves under rootDir (no path escape).
func ResolveJailPath(rootDir, candidate string) (string, error) {
	if rootDir == "" {
		return "", fmt.Errorf("allowlist root directory required")
	}
	absRoot, err := filepath.Abs(rootDir)
	if err != nil {
		return "", fmt.Errorf("resolve root: %w", err)
	}
	absRoot = filepath.Clean(absRoot)

	target := candidate
	if target == "" {
		target = filepath.Join(absRoot, "allowlist.json")
	}
	if !filepath.IsAbs(target) {
		target = filepath.Join(absRoot, target)
	}
	absTarget, err := filepath.Abs(target)
	if err != nil {
		return "", fmt.Errorf("resolve target: %w", err)
	}
	absTarget = filepath.Clean(absTarget)

	sep := string(os.PathSeparator)
	if absTarget != absRoot && !strings.HasPrefix(absTarget, absRoot+sep) {
		return "", fmt.Errorf("allowlist path %q escapes jail root %q", absTarget, absRoot)
	}
	return absTarget, nil
}

// AtomicWrite writes contents to tempPath then renames onto targetPath.
// Both paths must already be jail-resolved by the caller.
func AtomicWrite(targetPath, tempPath, contents string) error {
	if targetPath == "" {
		return fmt.Errorf("targetPath required")
	}
	if tempPath == "" {
		tempPath = targetPath + ".tmp"
	}

	dir := filepath.Dir(targetPath)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return fmt.Errorf("create allowlist dir: %w", err)
	}

	if err := os.WriteFile(tempPath, []byte(contents), 0o644); err != nil {
		return fmt.Errorf("write temp allowlist: %w", err)
	}

	if err := os.Rename(tempPath, targetPath); err != nil {
		_ = os.Remove(tempPath)
		return fmt.Errorf("atomic rename allowlist: %w", err)
	}
	return nil
}

// SanitizeEntries normalizes inbound JSON entries.
func SanitizeEntries(raw json.RawMessage) ([]Entry, error) {
	if len(raw) == 0 || string(raw) == "null" {
		return []Entry{}, nil
	}
	var entries []Entry
	if err := json.Unmarshal(raw, &entries); err != nil {
		return nil, err
	}
	for i := range entries {
		if entries[i].Name == "" {
			return nil, fmt.Errorf("allowlist entry missing name")
		}
	}
	return entries, nil
}

// Serialize pretty-prints allowlist.json contents.
func Serialize(entries []Entry) (string, error) {
	b, err := json.MarshalIndent(entries, "", "  ")
	if err != nil {
		return "", err
	}
	return string(b) + "\n", nil
}
