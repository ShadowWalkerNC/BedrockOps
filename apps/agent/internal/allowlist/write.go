package allowlist

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
)

// FileName is the fixed Bedrock allowlist file name.
const FileName = "allowlist.json"

// Entry mirrors Bedrock allowlist.json objects.
type Entry struct {
	Name               string `json:"name"`
	XUID               string `json:"xuid"`
	IgnoresPlayerLimit bool   `json:"ignoresPlayerLimit"`
}

// ValidateTarget enforces a light path jail: the target must be an absolute
// path whose base name is exactly allowlist.json. This prevents a compromised
// or buggy control plane from coercing the agent into writing arbitrary files.
func ValidateTarget(targetPath string) error {
	if targetPath == "" {
		return fmt.Errorf("targetPath required")
	}
	if !filepath.IsAbs(targetPath) {
		return fmt.Errorf("targetPath must be absolute: %q", targetPath)
	}
	if filepath.Base(targetPath) != FileName {
		return fmt.Errorf("refusing to write non-allowlist file: %q", filepath.Base(targetPath))
	}
	return nil
}

// AtomicWrite writes contents to tempPath then renames onto targetPath so the
// server never observes a partially written allowlist.json.
func AtomicWrite(targetPath, tempPath, contents string) error {
	if err := ValidateTarget(targetPath); err != nil {
		return err
	}
	if tempPath == "" {
		tempPath = targetPath + ".tmp"
	}
	// Keep the temp file in the same directory as the target so the rename is atomic.
	if filepath.Dir(tempPath) != filepath.Dir(targetPath) {
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

// SanitizeEntries normalizes inbound JSON entries and validates required fields.
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

// Serialize pretty-prints allowlist.json contents (matching the control plane).
func Serialize(entries []Entry) (string, error) {
	b, err := json.MarshalIndent(entries, "", "  ")
	if err != nil {
		return "", err
	}
	return string(b) + "\n", nil
}
