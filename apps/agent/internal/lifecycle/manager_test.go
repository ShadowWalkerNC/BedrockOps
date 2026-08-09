package lifecycle_test

import (
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/ShadowWalkerNC/BedrockOps/apps/agent/internal/lifecycle"
)

func TestManagerSimulatedLifecycle(t *testing.T) {
	m := lifecycle.NewManager("")
	if m.Mode() != lifecycle.ModeSim {
		t.Fatalf("expected simulated mode, got %s", m.Mode())
	}

	state, mode, err := m.Start("srv_1", "/tmp/bedrock-test")
	if err != nil {
		t.Fatalf("start: %v", err)
	}
	if mode != lifecycle.ModeSim {
		t.Fatalf("mode=%s", mode)
	}
	if state != lifecycle.StateOnline {
		t.Fatalf("state=%s", state)
	}
	if m.UptimeSeconds("srv_1") < 0 {
		t.Fatalf("uptime should be non-negative")
	}

	state, _, err = m.Stop("srv_1", false)
	if err != nil {
		t.Fatalf("stop: %v", err)
	}
	if state != lifecycle.StateOffline {
		t.Fatalf("expected OFFLINE after stop, got %s", state)
	}

	state, _, err = m.Restart("srv_1", "/tmp/bedrock-test")
	if err != nil {
		t.Fatalf("restart: %v", err)
	}
	if state != lifecycle.StateOnline {
		t.Fatalf("expected ONLINE after restart, got %s", state)
	}
}

func TestManagerLiveModeRequiresBinary(t *testing.T) {
	dir := t.TempDir()
	bin := filepath.Join(dir, "fake-bds")
	if err := os.WriteFile(bin, []byte("#!/bin/sh\nsleep 30\n"), 0o755); err != nil {
		t.Fatal(err)
	}

	m := lifecycle.NewManager(bin)
	if m.Mode() != lifecycle.ModeLive {
		t.Fatalf("expected live mode when binary exists")
	}

	work := filepath.Join(dir, "server")
	state, mode, err := m.Start("srv_live", work)
	if err != nil {
		t.Fatalf("live start: %v", err)
	}
	if mode != lifecycle.ModeLive || state != lifecycle.StateOnline {
		t.Fatalf("mode=%s state=%s", mode, state)
	}

	if _, _, err := m.Stop("srv_live", true); err != nil {
		t.Fatalf("live stop: %v", err)
	}
}

func TestWorldDir(t *testing.T) {
	if got := lifecycle.WorldDir("/var/minecraft/srv"); got != "/var/minecraft/srv/worlds" {
		t.Fatalf("WorldDir=%s", got)
	}
	if lifecycle.WorldDir("") != "" {
		t.Fatal("empty path should yield empty world dir")
	}
}

func TestManagerPipesStdoutAndReportsUnexpectedExit(t *testing.T) {
	dir := t.TempDir()
	bin := filepath.Join(dir, "fake-bds")
	// Emit a BDS-style join line then exit non-zero (unexpected crash).
	script := "#!/bin/sh\necho 'Player connected: LogPipeTester, xuid: 2535499999999999'\nexit 7\n"
	if err := os.WriteFile(bin, []byte(script), 0o755); err != nil {
		t.Fatal(err)
	}

	m := lifecycle.NewManager(bin)
	var lines []string
	var exitUnexpected bool
	done := make(chan struct{}, 2)
	m.SetHandlers(
		func(serverID, line string) {
			if serverID != "srv_log" {
				t.Errorf("unexpected serverID %s", serverID)
			}
			lines = append(lines, line)
			done <- struct{}{}
		},
		func(serverID string, unexpected bool, waitErr error) {
			exitUnexpected = unexpected
			done <- struct{}{}
		},
	)

	work := filepath.Join(dir, "server")
	if _, _, err := m.Start("srv_log", work); err != nil {
		t.Fatalf("start: %v", err)
	}

	// Wait for log + exit callbacks (with timeout).
	for i := 0; i < 2; i++ {
		select {
		case <-done:
		case <-time.After(3 * time.Second):
			t.Fatal("timed out waiting for log/exit handlers")
		}
	}

	if len(lines) == 0 || lines[0] != "Player connected: LogPipeTester, xuid: 2535499999999999" {
		t.Fatalf("expected join log line, got %#v", lines)
	}
	if !exitUnexpected {
		t.Fatal("expected unexpected exit after non-zero process exit")
	}
	// Process exit should settle ERROR for unexpected death.
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		if m.GetState("srv_log") == lifecycle.StateError {
			return
		}
		time.Sleep(20 * time.Millisecond)
	}
	t.Fatalf("expected ERROR state after crash, got %s", m.GetState("srv_log"))
}
