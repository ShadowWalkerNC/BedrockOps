package worldfile

import (
	"encoding/base64"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// ValidateRelative allows only worlds/<level>/level.dat under the server jail.
func ValidateRelative(rel string) error {
	if rel == "" {
		return fmt.Errorf("relativePath required")
	}
	clean := filepath.ToSlash(filepath.Clean(rel))
	if clean == "." || strings.HasPrefix(clean, "..") || strings.Contains(clean, ":") {
		return fmt.Errorf("invalid relativePath: %q", rel)
	}
	if strings.HasPrefix(clean, "/") {
		return fmt.Errorf("relativePath must not be absolute: %q", rel)
	}
	if !strings.HasPrefix(clean, "worlds/") {
		return fmt.Errorf("world file must live under worlds/: %q", rel)
	}
	if filepath.Base(clean) != "level.dat" {
		return fmt.Errorf("only level.dat is allowed: %q", rel)
	}
	// Reject worlds/level.dat (missing level folder) and deep escapes.
	parts := strings.Split(clean, "/")
	if len(parts) != 3 {
		return fmt.Errorf("expected worlds/<level>/level.dat, got %q", rel)
	}
	if parts[1] == "" || parts[1] == "." || parts[1] == ".." {
		return fmt.Errorf("invalid level name in path: %q", rel)
	}
	return nil
}

func ResolveTarget(serverPath, rel string) (string, error) {
	if err := ValidateRelative(rel); err != nil {
		return "", err
	}
	if serverPath == "" || !filepath.IsAbs(serverPath) {
		return "", fmt.Errorf("serverPath must be absolute: %q", serverPath)
	}
	target := filepath.Join(serverPath, filepath.FromSlash(filepath.Clean(rel)))
	relCheck, err := filepath.Rel(serverPath, target)
	if err != nil || strings.HasPrefix(relCheck, "..") {
		return "", fmt.Errorf("path escapes serverPath: %q", rel)
	}
	return target, nil
}

func ReadBase64(serverPath, rel string) (string, error) {
	target, err := ResolveTarget(serverPath, rel)
	if err != nil {
		return "", err
	}
	raw, err := os.ReadFile(target)
	if err != nil {
		return "", err
	}
	return base64.StdEncoding.EncodeToString(raw), nil
}

func WriteBase64(serverPath, rel, contentsBase64 string, backup bool) error {
	target, err := ResolveTarget(serverPath, rel)
	if err != nil {
		return err
	}
	raw, err := base64.StdEncoding.DecodeString(contentsBase64)
	if err != nil {
		return fmt.Errorf("invalid base64 contents: %w", err)
	}
	if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
		return fmt.Errorf("create world dir: %w", err)
	}
	if backup {
		if _, err := os.Stat(target); err == nil {
			bak := target + ".bak"
			if copyErr := copyFile(target, bak); copyErr != nil {
				return fmt.Errorf("backup level.dat: %w", copyErr)
			}
		}
	}
	tempPath := target + ".tmp"
	if err := os.WriteFile(tempPath, raw, 0o644); err != nil {
		return fmt.Errorf("write temp level.dat: %w", err)
	}
	if err := os.Rename(tempPath, target); err != nil {
		_ = os.Remove(tempPath)
		return fmt.Errorf("atomic rename level.dat: %w", err)
	}
	return nil
}

func copyFile(src, dst string) error {
	data, err := os.ReadFile(src)
	if err != nil {
		return err
	}
	return os.WriteFile(dst, data, 0o644)
}
