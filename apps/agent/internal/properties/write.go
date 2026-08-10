package properties

import (
	"fmt"
	"os"
	"path/filepath"
)

// FileName is the fixed Bedrock server.properties file name.
const FileName = "server.properties"

// ValidateTarget enforces a light path jail: absolute path whose base name is
// exactly server.properties.
func ValidateTarget(targetPath string) error {
	if targetPath == "" {
		return fmt.Errorf("targetPath required")
	}
	if !filepath.IsAbs(targetPath) {
		return fmt.Errorf("targetPath must be absolute: %q", targetPath)
	}
	if filepath.Base(targetPath) != FileName {
		return fmt.Errorf("refusing to write non-properties file: %q", filepath.Base(targetPath))
	}
	return nil
}

// AtomicWrite writes contents to tempPath then renames onto targetPath.
func AtomicWrite(targetPath, tempPath, contents string) error {
	if err := ValidateTarget(targetPath); err != nil {
		return err
	}
	if tempPath == "" {
		tempPath = targetPath + ".tmp"
	}
	if filepath.Dir(tempPath) != filepath.Dir(targetPath) {
		tempPath = targetPath + ".tmp"
	}

	dir := filepath.Dir(targetPath)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return fmt.Errorf("create properties dir: %w", err)
	}

	if err := os.WriteFile(tempPath, []byte(contents), 0o644); err != nil {
		return fmt.Errorf("write temp properties: %w", err)
	}

	if err := os.Rename(tempPath, targetPath); err != nil {
		_ = os.Remove(tempPath)
		return fmt.Errorf("atomic rename properties: %w", err)
	}
	return nil
}
