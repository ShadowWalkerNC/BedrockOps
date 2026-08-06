package backup_test

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"github.com/ShadowWalkerNC/BedrockOps/apps/agent/internal/backup"
)

func TestStreamWorldArchiveLocal(t *testing.T) {
	dir := t.TempDir()
	world := filepath.Join(dir, "worlds", "bedrock_level")
	if err := os.MkdirAll(world, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(world, "level.dat"), []byte("hello"), 0o644); err != nil {
		t.Fatal(err)
	}

	result, err := backup.StreamWorldArchive(filepath.Join(dir, "worlds"), "", nil)
	if err != nil {
		t.Fatalf("archive: %v", err)
	}
	if result.FileSizeBytes <= 0 {
		t.Fatalf("expected positive size, got %d", result.FileSizeBytes)
	}
	if len(result.SHA256) != 64 {
		t.Fatalf("sha256=%s", result.SHA256)
	}
	if result.Uploaded {
		t.Fatal("local archive should not mark uploaded")
	}
}

func TestStreamWorldArchivePresignedPut(t *testing.T) {
	dir := t.TempDir()
	world := filepath.Join(dir, "worlds")
	if err := os.MkdirAll(world, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(world, "level.dat"), []byte("world-data"), 0o644); err != nil {
		t.Fatal(err)
	}

	var received int
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPut {
			t.Errorf("method=%s", r.Method)
		}
		buf := make([]byte, 64*1024)
		for {
			n, err := r.Body.Read(buf)
			received += n
			if err != nil {
				break
			}
		}
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	result, err := backup.StreamWorldArchive(world, server.URL, nil)
	if err != nil {
		t.Fatalf("archive upload: %v", err)
	}
	if !result.Uploaded {
		t.Fatal("expected uploaded=true")
	}
	if received <= 0 || result.FileSizeBytes <= 0 {
		t.Fatalf("received=%d size=%d", received, result.FileSizeBytes)
	}
}
