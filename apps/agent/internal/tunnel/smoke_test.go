package tunnel_test

import (
	"archive/tar"
	"bytes"
	"compress/gzip"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"sync"
	"testing"
	"time"

	"github.com/ShadowWalkerNC/BedrockOps/apps/agent/internal/lifecycle"
	"github.com/ShadowWalkerNC/BedrockOps/apps/agent/internal/metrics"
	"github.com/ShadowWalkerNC/BedrockOps/apps/agent/internal/protocol"
	"github.com/ShadowWalkerNC/BedrockOps/apps/agent/internal/tunnel"
	"github.com/gorilla/websocket"
)

func mustTinyArchive(t *testing.T, name string, payload []byte) []byte {
	t.Helper()
	var buf bytes.Buffer
	gz := gzip.NewWriter(&buf)
	tw := tar.NewWriter(gz)
	hdr := &tar.Header{Name: name, Mode: 0o644, Size: int64(len(payload))}
	if err := tw.WriteHeader(hdr); err != nil {
		t.Fatal(err)
	}
	if _, err := tw.Write(payload); err != nil {
		t.Fatal(err)
	}
	if err := tw.Close(); err != nil {
		t.Fatal(err)
	}
	if err := gz.Close(); err != nil {
		t.Fatal(err)
	}
	return buf.Bytes()
}

// Smoke: simulated control-plane WebSocket ↔ agent power + restore commands.
func TestAgentControlPlaneSmokePowerAndRestore(t *testing.T) {
	serverPath := t.TempDir()
	worldDir := filepath.Join(serverPath, "worlds", "bedrock_level")
	if err := os.MkdirAll(worldDir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(worldDir, "level.dat"), []byte("before"), 0o644); err != nil {
		t.Fatal(err)
	}

	// Minimal gzip/tar archive served over HTTP for restore.
	archiveBytes := mustTinyArchive(t, "bedrock_level/level.dat", []byte("after-restore"))
	dl := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write(archiveBytes)
	}))
	defer dl.Close()

	var (
		mu       sync.Mutex
		gotStart bool
		gotRest  bool
		upgrader = websocket.Upgrader{CheckOrigin: func(r *http.Request) bool { return true }}
	)

	cp := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/v1/ws/agent" {
			http.NotFound(w, r)
			return
		}
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			t.Errorf("upgrade: %v", err)
			return
		}
		defer conn.Close()

		// Wait for first heartbeat from agent
		_, _, err = conn.ReadMessage()
		if err != nil {
			t.Errorf("read hb: %v", err)
			return
		}

		// POWER START
		startPayload, _ := protocol.MarshalPayload(protocol.CmdExecPayload{
			Command: protocol.CmdPowerAction,
			Action:  "START",
		})
		_ = conn.WriteJSON(protocol.Frame{
			ID:        "cmd_start",
			Type:      protocol.TypeCmdExec,
			NodeID:    "node_smoke",
			ServerID:  "srv_smoke",
			Timestamp: time.Now().Unix(),
			Payload:   startPayload,
		})

		_, msg, err := conn.ReadMessage()
		if err != nil {
			t.Errorf("read start resp: %v", err)
			return
		}
		var startFrame protocol.Frame
		_ = json.Unmarshal(msg, &startFrame)
		if startFrame.Type == protocol.TypeCmdResp {
			var resp protocol.CmdRespPayload
			_ = json.Unmarshal(startFrame.Payload, &resp)
			mu.Lock()
			gotStart = resp.Success
			mu.Unlock()
		}

		// RESTORE
		restorePayload, _ := protocol.MarshalPayload(protocol.CmdExecPayload{
			Command:              protocol.CmdRestoreBackup,
			BackupID:             "bkp_smoke",
			PresignedDownloadURL: dl.URL,
		})
		_ = conn.WriteJSON(protocol.Frame{
			ID:        "cmd_restore",
			Type:      protocol.TypeCmdExec,
			NodeID:    "node_smoke",
			ServerID:  "srv_smoke",
			Timestamp: time.Now().Unix(),
			Payload:   restorePayload,
		})

		deadline := time.Now().Add(5 * time.Second)
		for time.Now().Before(deadline) {
			_ = conn.SetReadDeadline(time.Now().Add(2 * time.Second))
			_, msg, err := conn.ReadMessage()
			if err != nil {
				break
			}
			var frame protocol.Frame
			if json.Unmarshal(msg, &frame) != nil {
				continue
			}
			if frame.Type != protocol.TypeCmdResp || frame.ID != "cmd_restore" {
				continue
			}
			var resp protocol.CmdRespPayload
			_ = json.Unmarshal(frame.Payload, &resp)
			mu.Lock()
			gotRest = resp.Success
			mu.Unlock()
			if !resp.Success {
				t.Errorf("restore failed: %s", resp.Error)
			}
			return
		}
	}))
	defer cp.Close()

	manager := lifecycle.NewManager("")
	collector := metrics.NewCollector(manager)
	client := tunnel.NewClient(tunnel.Config{
		ControlPlaneURL: cp.URL,
		NodeID:          "node_smoke",
		ServerPathHint:  serverPath,
		HeartbeatEvery:  time.Hour,
		MetricsEvery:    time.Hour,
		ReconnectWait:   50 * time.Millisecond,
	}, manager, collector)

	ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
	defer cancel()
	go func() { _ = client.Run(ctx) }()

	deadline := time.Now().Add(7 * time.Second)
	for time.Now().Before(deadline) {
		mu.Lock()
		ok := gotStart && gotRest
		mu.Unlock()
		if ok {
			break
		}
		time.Sleep(50 * time.Millisecond)
	}

	mu.Lock()
	defer mu.Unlock()
	if !gotStart {
		t.Fatal("expected successful POWER START response")
	}
	if !gotRest {
		t.Fatal("expected successful RESTORE_BACKUP response")
	}

	got, err := os.ReadFile(filepath.Join(serverPath, "worlds", "bedrock_level", "level.dat"))
	if err != nil {
		t.Fatal(err)
	}
	if string(got) != "after-restore" {
		t.Fatalf("world content=%q", got)
	}
}
