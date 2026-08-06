package allowlist

import (
	"os"
	"path/filepath"
	"testing"
)

func TestResolveJailPathBlocksEscape(t *testing.T) {
	root := t.TempDir()
	_, err := ResolveJailPath(root, filepath.Join(root, "..", "etc", "passwd"))
	if err == nil {
		t.Fatal("expected jail escape to fail")
	}
}

func TestResolveJailPathAllowsRelative(t *testing.T) {
	root := t.TempDir()
	got, err := ResolveJailPath(root, "allowlist.json")
	if err != nil {
		t.Fatal(err)
	}
	want := filepath.Join(root, "allowlist.json")
	if got != want {
		t.Fatalf("got %q want %q", got, want)
	}
}

func TestAtomicWriteRoundTrip(t *testing.T) {
	root := t.TempDir()
	target, err := ResolveJailPath(root, "allowlist.json")
	if err != nil {
		t.Fatal(err)
	}
	temp, err := ResolveJailPath(root, "allowlist.json.tmp")
	if err != nil {
		t.Fatal(err)
	}
	if err := AtomicWrite(target, temp, "[]\n"); err != nil {
		t.Fatal(err)
	}
	b, err := os.ReadFile(target)
	if err != nil {
		t.Fatal(err)
	}
	if string(b) != "[]\n" {
		t.Fatalf("unexpected contents %q", b)
	}
}
