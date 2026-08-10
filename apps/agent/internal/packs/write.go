package packs

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// FileSpec is one atomic write under the server path jail.
type FileSpec struct {
	RelativePath string
	Contents     string
}

// ValidateRelative ensures the relative path is pack-jail safe (no escape).
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

	base := filepath.Base(clean)
	if base == "world_behavior_packs.json" || base == "world_resource_packs.json" {
		if !strings.HasPrefix(clean, "worlds/") {
			return fmt.Errorf("enable list must live under worlds/: %q", rel)
		}
		return nil
	}

	if strings.Contains(clean, "/behavior_packs/") || strings.HasPrefix(clean, "behavior_packs/") {
		return nil
	}
	if strings.Contains(clean, "/resource_packs/") || strings.HasPrefix(clean, "resource_packs/") {
		return nil
	}
	return fmt.Errorf("refusing path outside pack jail: %q", rel)
}

// ResolveTarget joins serverPath with a validated relative path.
func ResolveTarget(serverPath, rel string) (string, error) {
	if err := ValidateRelative(rel); err != nil {
		return "", err
	}
	if serverPath == "" || !filepath.IsAbs(serverPath) {
		return "", fmt.Errorf("serverPath must be absolute: %q", serverPath)
	}
	target := filepath.Join(serverPath, filepath.FromSlash(filepath.Clean(rel)))
	// Ensure resolved path stays under serverPath.
	relCheck, err := filepath.Rel(serverPath, target)
	if err != nil || strings.HasPrefix(relCheck, "..") {
		return "", fmt.Errorf("path escapes serverPath: %q", rel)
	}
	return target, nil
}

// AtomicWriteAll writes each file under serverPath using temp+rename.
func AtomicWriteAll(serverPath string, files []FileSpec) (int, error) {
	if len(files) == 0 {
		return 0, fmt.Errorf("no pack files to write")
	}
	written := 0
	for _, f := range files {
		target, err := ResolveTarget(serverPath, f.RelativePath)
		if err != nil {
			return written, err
		}
		if err := atomicWrite(target, f.Contents); err != nil {
			return written, err
		}
		written++
	}
	return written, nil
}

func atomicWrite(targetPath, contents string) error {
	dir := filepath.Dir(targetPath)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return fmt.Errorf("create pack dir: %w", err)
	}
	tempPath := targetPath + ".tmp"
	if err := os.WriteFile(tempPath, []byte(contents), 0o644); err != nil {
		return fmt.Errorf("write temp pack file: %w", err)
	}
	if err := os.Rename(tempPath, targetPath); err != nil {
		_ = os.Remove(tempPath)
		return fmt.Errorf("atomic rename pack file: %w", err)
	}
	return nil
}
