package allowlist_test

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"github.com/ShadowWalkerNC/BedrockOps/apps/agent/internal/allowlist"
)

func TestAtomicWrite(t *testing.T) {
	dir := t.TempDir()
	target := filepath.Join(dir, "allowlist.json")
	temp := target + ".tmp"
	contents := "[\n  {\"name\": \"Steve\", \"xuid\": \"1\", \"ignoresPlayerLimit\": false}\n]\n"

	if err := allowlist.AtomicWrite(target, temp, contents); err != nil {
		t.Fatal(err)
	}
	data, err := os.ReadFile(target)
	if err != nil {
		t.Fatal(err)
	}
	if string(data) != contents {
		t.Fatalf("contents mismatch: %s", data)
	}
	if _, err := os.Stat(temp); !os.IsNotExist(err) {
		t.Fatal("temp file should be gone after rename")
	}
}

func TestSanitizeAndSerialize(t *testing.T) {
	raw := json.RawMessage(`[{"name":"Alex","xuid":"9"}]`)
	entries, err := allowlist.SanitizeEntries(raw)
	if err != nil {
		t.Fatal(err)
	}
	out, err := allowlist.Serialize(entries)
	if err != nil {
		t.Fatal(err)
	}
	if out == "" || entries[0].Name != "Alex" {
		t.Fatalf("unexpected: %+v %s", entries, out)
	}
}
