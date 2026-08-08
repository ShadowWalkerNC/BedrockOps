package backup_test

import (
	"archive/tar"
	"bytes"
	"compress/gzip"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"github.com/ShadowWalkerNC/BedrockOps/apps/agent/internal/backup"
)

func TestRestoreWorldArchiveRoundTrip(t *testing.T) {
	srcRoot := t.TempDir()
	world := filepath.Join(srcRoot, "worlds")
	if err := os.MkdirAll(filepath.Join(world, "bedrock_level"), 0o755); err != nil {
		t.Fatal(err)
	}
	payload := []byte("restored-level-data")
	if err := os.WriteFile(filepath.Join(world, "bedrock_level", "level.dat"), payload, 0o644); err != nil {
		t.Fatal(err)
	}

	var archive bytes.Buffer
	gz := gzip.NewWriter(&archive)
	tw := tar.NewWriter(gz)
	hdr := &tar.Header{
		Name: "bedrock_level/level.dat",
		Mode: 0o644,
		Size: int64(len(payload)),
	}
	if err := tw.WriteHeader(hdr); err != nil {
		t.Fatal(err)
	}
	if _, err := tw.Write(payload); err != nil {
		t.Fatal(err)
	}
	_ = tw.Close()
	_ = gz.Close()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			t.Errorf("method=%s", r.Method)
		}
		_, _ = w.Write(archive.Bytes())
	}))
	defer server.Close()

	dest := filepath.Join(t.TempDir(), "worlds")
	result, err := backup.RestoreWorldArchive(dest, server.URL)
	if err != nil {
		t.Fatalf("restore: %v", err)
	}
	if result.FilesExtracted != 1 {
		t.Fatalf("files=%d", result.FilesExtracted)
	}

	got, err := os.ReadFile(filepath.Join(dest, "bedrock_level", "level.dat"))
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(got, payload) {
		t.Fatalf("content mismatch: %q", got)
	}
}

func TestRestoreRejectsPathEscape(t *testing.T) {
	var archive bytes.Buffer
	gz := gzip.NewWriter(&archive)
	tw := tar.NewWriter(gz)
	hdr := &tar.Header{Name: "../evil.txt", Mode: 0o644, Size: 4}
	_ = tw.WriteHeader(hdr)
	_, _ = tw.Write([]byte("evil"))
	_ = tw.Close()
	_ = gz.Close()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = io.Copy(w, bytes.NewReader(archive.Bytes()))
	}))
	defer server.Close()

	_, err := backup.RestoreWorldArchive(t.TempDir(), server.URL)
	if err == nil {
		t.Fatal("expected path escape error")
	}
}

func TestValidateDownloadURLRequiresValue(t *testing.T) {
	if err := backup.ValidateDownloadURL(""); err == nil {
		t.Fatal("expected error for empty URL")
	}
}
