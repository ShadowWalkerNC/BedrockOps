package packs

import (
	"os"
	"path/filepath"
	"testing"
)

func TestValidateRelative(t *testing.T) {
	ok := []string{
		"worlds/Bedrock level/behavior_packs/pack_sample_bp/manifest.json",
		"worlds/Bedrock level/world_behavior_packs.json",
		"worlds/Bedrock level/resource_packs/pack_sample_rp/manifest.json",
		"worlds/Bedrock level/world_resource_packs.json",
	}
	for _, p := range ok {
		if err := ValidateRelative(p); err != nil {
			t.Fatalf("expected ok for %q: %v", p, err)
		}
	}
	bad := []string{"../etc/passwd", "/absolute", "server.properties", "worlds/../secret"}
	for _, p := range bad {
		if err := ValidateRelative(p); err == nil {
			t.Fatalf("expected reject for %q", p)
		}
	}
}

func TestAtomicWriteAll(t *testing.T) {
	root := t.TempDir()
	n, err := AtomicWriteAll(root, []FileSpec{
		{RelativePath: "worlds/Bedrock level/behavior_packs/p1/manifest.json", Contents: "{}\n"},
		{RelativePath: "worlds/Bedrock level/world_behavior_packs.json", Contents: "[]\n"},
	})
	if err != nil {
		t.Fatalf("AtomicWriteAll: %v", err)
	}
	if n != 2 {
		t.Fatalf("written=%d", n)
	}
	got, err := os.ReadFile(filepath.Join(root, "worlds", "Bedrock level", "world_behavior_packs.json"))
	if err != nil {
		t.Fatal(err)
	}
	if string(got) != "[]\n" {
		t.Fatalf("contents=%q", got)
	}
}
