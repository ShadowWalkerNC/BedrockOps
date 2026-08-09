package backup

import (
	"archive/tar"
	"compress/gzip"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
)

// ArchiveResult is the outcome of a streaming world snapshot.
type ArchiveResult struct {
	FileSizeBytes int64
	SHA256        string
	Uploaded      bool
}

type countWriter struct {
	n int64
}

func (c *countWriter) Write(p []byte) (int, error) {
	c.n += int64(len(p))
	return len(p), nil
}

// ValidateUploadURL rejects empty-ok local backups and non-HTTPS / non-allowlisted hosts.
// Allowed hosts come from R2_ALLOWED_UPLOAD_HOSTS (comma-separated) or default to *.r2.cloudflarestorage.com.
func ValidateUploadURL(presignedURL string) error {
	if presignedURL == "" {
		return nil
	}
	u, err := url.Parse(presignedURL)
	if err != nil {
		return fmt.Errorf("invalid upload URL: %w", err)
	}
	if u.Scheme != "https" && u.Scheme != "http" {
		return fmt.Errorf("upload URL scheme %q not allowed", u.Scheme)
	}
	// Disallow http except for explicit local test hosts.
	if u.Scheme == "http" {
		host := strings.ToLower(u.Hostname())
		if host != "127.0.0.1" && host != "localhost" && host != "::1" {
			return fmt.Errorf("http upload URLs only allowed for localhost")
		}
	}
	host := strings.ToLower(u.Hostname())
	if host == "" {
		return fmt.Errorf("upload URL missing host")
	}

	allowed := parseAllowedHosts(os.Getenv("R2_ALLOWED_UPLOAD_HOSTS"))
	if len(allowed) == 0 {
		allowed = []string{".r2.cloudflarestorage.com", "127.0.0.1", "localhost"}
	}
	if !hostAllowed(host, allowed) {
		return fmt.Errorf("upload host %q not in allowlist", host)
	}
	return nil
}

func parseAllowedHosts(raw string) []string {
	if strings.TrimSpace(raw) == "" {
		return nil
	}
	parts := strings.Split(raw, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		p = strings.TrimSpace(strings.ToLower(p))
		if p != "" {
			out = append(out, p)
		}
	}
	return out
}

func hostAllowed(host string, allowed []string) bool {
	for _, a := range allowed {
		if strings.HasPrefix(a, ".") {
			if host == strings.TrimPrefix(a, ".") || strings.HasSuffix(host, a) {
				return true
			}
			continue
		}
		if host == a {
			return true
		}
	}
	return false
}

// StreamWorldArchive writes a gzip-compressed tar of worldDir.
// When presignedURL is non-empty, the archive is streamed directly to that URL (zero temp disk).
// Otherwise the archive is written to a temp file and returned metadata only.
func StreamWorldArchive(worldDir, presignedURL string, onProgress func(percent int, bytes int64)) (ArchiveResult, error) {
	if _, err := os.Stat(worldDir); err != nil {
		return ArchiveResult{}, fmt.Errorf("world directory unavailable: %w", err)
	}
	if err := ValidateUploadURL(presignedURL); err != nil {
		return ArchiveResult{}, err
	}

	pr, pw := io.Pipe()
	hasher := sha256.New()
	counter := &countWriter{}
	errCh := make(chan error, 1)

	go func() {
		defer pw.Close()
		multi := io.MultiWriter(pw, hasher, counter)
		gz := gzip.NewWriter(multi)
		tw := tar.NewWriter(gz)

		walkErr := filepath.Walk(worldDir, func(path string, info os.FileInfo, err error) error {
			if err != nil {
				return err
			}
			if info.IsDir() {
				return nil
			}
			rel, err := filepath.Rel(worldDir, path)
			if err != nil {
				return err
			}
			hdr, err := tar.FileInfoHeader(info, "")
			if err != nil {
				return err
			}
			hdr.Name = filepath.ToSlash(rel)
			if err := tw.WriteHeader(hdr); err != nil {
				return err
			}
			f, err := os.Open(path)
			if err != nil {
				return err
			}
			_, copyErr := io.Copy(tw, f)
			_ = f.Close()
			if copyErr != nil {
				return copyErr
			}
			if onProgress != nil {
				onProgress(50, counter.n)
			}
			return nil
		})

		closeErr := tw.Close()
		gzErr := gz.Close()
		if walkErr != nil {
			errCh <- walkErr
			_ = pw.CloseWithError(walkErr)
			return
		}
		if closeErr != nil {
			errCh <- closeErr
			_ = pw.CloseWithError(closeErr)
			return
		}
		if gzErr != nil {
			errCh <- gzErr
			_ = pw.CloseWithError(gzErr)
			return
		}
		errCh <- nil
	}()

	var uploaded bool
	if presignedURL != "" {
		req, err := http.NewRequest(http.MethodPut, presignedURL, pr)
		if err != nil {
			_ = pr.Close()
			return ArchiveResult{}, err
		}
		req.Header.Set("Content-Type", "application/gzip")
		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			return ArchiveResult{}, fmt.Errorf("presigned upload failed: %w", err)
		}
		defer resp.Body.Close()
		if resp.StatusCode >= 300 {
			body, _ := io.ReadAll(io.LimitReader(resp.Body, 2048))
			return ArchiveResult{}, fmt.Errorf("upload status %d: %s", resp.StatusCode, string(body))
		}
		uploaded = true
	} else {
		tmp, err := os.CreateTemp("", "bedrock-backup-*.tar.gz")
		if err != nil {
			_ = pr.Close()
			return ArchiveResult{}, err
		}
		tmpPath := tmp.Name()
		defer os.Remove(tmpPath)
		if _, err := io.Copy(tmp, pr); err != nil {
			_ = tmp.Close()
			return ArchiveResult{}, err
		}
		_ = tmp.Close()
	}

	if err := <-errCh; err != nil {
		return ArchiveResult{}, err
	}

	if onProgress != nil {
		onProgress(100, counter.n)
	}

	return ArchiveResult{
		FileSizeBytes: counter.n,
		SHA256:        hex.EncodeToString(hasher.Sum(nil)),
		Uploaded:      uploaded,
	}, nil
}
