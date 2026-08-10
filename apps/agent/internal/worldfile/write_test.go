package worldfile

import (
	"encoding/base64"
	"os"
	"path/filepath"
	"testing"
)

func TestValidateRelative(t *testing.T) {
	if err := ValidateRelative("worlds/Bedrock level/level.dat"); err != nil {
		t.Fatalf("expected ok, got %v", err)
	}
	if err := ValidateRelative("worlds/x/server.properties"); err == nil {
		t.Fatal("expected reject non-level.dat")
	}
	if err := ValidateRelative("../level.dat"); err == nil {
		t.Fatal("expected reject escape")
	}
}

func TestReadWriteRoundTrip(t *testing.T) {
	dir := t.TempDir()
	rel := "worlds/Bedrock level/level.dat"
	payload := []byte{10, 0, 0, 0, 4, 0, 0, 0, 1, 2, 3, 4}
	b64 := base64.StdEncoding.EncodeToString(payload)
	if err := WriteBase64(dir, rel, b64, false); err != nil {
		t.Fatalf("write: %v", err)
	}
	got, err := ReadBase64(dir, rel)
	if err != nil {
		t.Fatalf("read: %v", err)
	}
	raw, err := base64.StdEncoding.DecodeString(got)
	if err != nil {
		t.Fatalf("decode: %v", err)
	}
	if string(raw) != string(payload) {
		t.Fatalf("mismatch: %v vs %v", raw, payload)
	}
	// backup path
	payload2 := []byte{9, 0, 0, 0, 2, 0, 0, 0, 5, 6}
	if err := WriteBase64(dir, rel, base64.StdEncoding.EncodeToString(payload2), true); err != nil {
		t.Fatalf("rewrite: %v", err)
	}
	bak := filepath.Join(dir, "worlds", "Bedrock level", "level.dat.bak")
	if _, err := os.Stat(bak); err != nil {
		t.Fatalf("expected bak: %v", err)
	}
}
