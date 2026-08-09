package backup

import (
	"archive/tar"
	"compress/gzip"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
)

// RestoreResult is the outcome of downloading and extracting a world archive.
type RestoreResult struct {
	FilesExtracted int
	BytesRead      int64
}

// ValidateDownloadURL reuses the same host allowlist rules as uploads.
func ValidateDownloadURL(presignedURL string) error {
	if strings.TrimSpace(presignedURL) == "" {
		return fmt.Errorf("download URL is required for restore")
	}
	return ValidateUploadURL(presignedURL)
}

// RestoreWorldArchive downloads a gzip tar from downloadURL and extracts it into worldDir.
// Existing files under worldDir are replaced; the directory is created if missing.
func RestoreWorldArchive(worldDir, downloadURL string) (RestoreResult, error) {
	if err := ValidateDownloadURL(downloadURL); err != nil {
		return RestoreResult{}, err
	}
	if strings.TrimSpace(worldDir) == "" {
		return RestoreResult{}, fmt.Errorf("world directory is required")
	}
	if err := os.MkdirAll(worldDir, 0o755); err != nil {
		return RestoreResult{}, fmt.Errorf("create world dir: %w", err)
	}

	req, err := http.NewRequest(http.MethodGet, downloadURL, nil)
	if err != nil {
		return RestoreResult{}, err
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return RestoreResult{}, fmt.Errorf("download failed: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 2048))
		return RestoreResult{}, fmt.Errorf("download status %d: %s", resp.StatusCode, string(body))
	}

	gz, err := gzip.NewReader(resp.Body)
	if err != nil {
		return RestoreResult{}, fmt.Errorf("gzip open: %w", err)
	}
	defer gz.Close()

	tr := tar.NewReader(gz)
	var files int
	var bytesRead int64

	for {
		hdr, err := tr.Next()
		if err == io.EOF {
			break
		}
		if err != nil {
			return RestoreResult{}, fmt.Errorf("tar read: %w", err)
		}

		target, err := sanitizeExtractPath(worldDir, hdr.Name)
		if err != nil {
			return RestoreResult{}, err
		}

		switch hdr.Typeflag {
		case tar.TypeDir:
			if err := os.MkdirAll(target, 0o755); err != nil {
				return RestoreResult{}, err
			}
		case tar.TypeReg, tar.TypeRegA:
			if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
				return RestoreResult{}, err
			}
			f, err := os.OpenFile(target, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, os.FileMode(hdr.Mode)&0o777)
			if err != nil {
				return RestoreResult{}, err
			}
			n, copyErr := io.Copy(f, tr)
			_ = f.Close()
			if copyErr != nil {
				return RestoreResult{}, copyErr
			}
			bytesRead += n
			files++
		default:
			// skip specials
		}
	}

	return RestoreResult{FilesExtracted: files, BytesRead: bytesRead}, nil
}

func sanitizeExtractPath(root, name string) (string, error) {
	clean := filepath.Clean(name)
	if clean == "." || clean == "" {
		return "", fmt.Errorf("empty archive entry name")
	}
	if filepath.IsAbs(clean) || strings.HasPrefix(clean, ".."+string(filepath.Separator)) || clean == ".." {
		return "", fmt.Errorf("refusing path escape in archive entry %q", name)
	}
	target := filepath.Join(root, clean)
	rel, err := filepath.Rel(root, target)
	if err != nil || strings.HasPrefix(rel, "..") {
		return "", fmt.Errorf("refusing path escape in archive entry %q", name)
	}
	return target, nil
}
