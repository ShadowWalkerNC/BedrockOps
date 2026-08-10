package properties

import (
	"os"
	"path/filepath"
	"testing"
)

func TestValidateTarget(t *testing.T) {
	if err := ValidateTarget("/tmp/world/server.properties"); err != nil {
		t.Fatalf("expected ok, got %v", err)
	}
	if err := ValidateTarget("relative/server.properties"); err == nil {
		t.Fatal("expected relative path error")
	}
	if err := ValidateTarget("/tmp/world/allowlist.json"); err == nil {
		t.Fatal("expected basename jail error")
	}
}

func TestAtomicWrite(t *testing.T) {
	dir := t.TempDir()
	target := filepath.Join(dir, FileName)
	temp := target + ".tmp"
	body := "gamemode=creative\ndifficulty=peaceful\n"
	if err := AtomicWrite(target, temp, body); err != nil {
		t.Fatalf("AtomicWrite: %v", err)
	}
	got, err := os.ReadFile(target)
	if err != nil {
		t.Fatalf("read: %v", err)
	}
	if string(got) != body {
		t.Fatalf("contents mismatch: %q", got)
	}
}
