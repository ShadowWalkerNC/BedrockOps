package allowlist

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
)

// Entry mirrors Bedrock allowlist.json objects.
type Entry struct {
	Name                string `json:"name"`
	XUID                string `json:"xuid"`
	IgnoresPlayerLimit  bool   `json:"ignoresPlayerLimit"`
}

// AtomicWrite writes contents to tempPath then renames onto targetPath.
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
