package lifecycle_test

import (
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"sync"
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
	bin := buildFakeBDS(t, dir, "Player connected: LogPipeTester, xuid: 2535499999999999", 7)

	m := lifecycle.NewManager(bin)
	var (
		mu             sync.Mutex
		lines          []string
		exitUnexpected bool
		exitSeen       bool
	)
	logSeen := make(chan struct{}, 1)
	exitCh := make(chan struct{}, 1)
	m.SetHandlers(
		func(serverID, line string) {
			if serverID != "srv_log" {
				t.Errorf("unexpected serverID %s", serverID)
				return
			}
			mu.Lock()
			lines = append(lines, line)
			mu.Unlock()
			select {
			case logSeen <- struct{}{}:
			default:
			}
		},
		func(serverID string, unexpected bool, waitErr error) {
			mu.Lock()
			exitUnexpected = unexpected
			exitSeen = true
			mu.Unlock()
			select {
			case exitCh <- struct{}{}:
			default:
			}
		},
	)

	work := filepath.Join(dir, "server")
	if _, _, err := m.Start("srv_log", work); err != nil {
		t.Fatalf("start: %v", err)
	}

	// Wait for log then exit (exit is gated on pipe drain, so order is stable).
	select {
	case <-logSeen:
	case <-time.After(10 * time.Second):
		mu.Lock()
		got := append([]string(nil), lines...)
		mu.Unlock()
		t.Fatalf("timed out waiting for log handler; lines=%#v", got)
	}
	select {
	case <-exitCh:
	case <-time.After(10 * time.Second):
		t.Fatal("timed out waiting for exit handler")
	}

	mu.Lock()
	defer mu.Unlock()
	if len(lines) == 0 || lines[0] != "Player connected: LogPipeTester, xuid: 2535499999999999" {
		t.Fatalf("expected join log line, got %#v", lines)
	}
	if !exitSeen || !exitUnexpected {
		t.Fatalf("expected unexpected exit after non-zero process exit (seen=%v unexpected=%v)", exitSeen, exitUnexpected)
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

// buildFakeBDS compiles a tiny Go program that prints one line and exits.
// Using a compiled binary avoids shell stdout buffering flakes under pipes.
func buildFakeBDS(t *testing.T, dir, line string, exitCode int) string {
	t.Helper()
	src := filepath.Join(dir, "fake_bds.go")
	bin := filepath.Join(dir, "fake-bds")
	program := "package main\n" +
		"import (\n" +
		"\t\"fmt\"\n" +
		"\t\"os\"\n" +
		")\n" +
		"func main() {\n" +
		"\tfmt.Println(`" + line + "`)\n" +
		"\tos.Exit(" + strconv.Itoa(exitCode) + ")\n" +
		"}\n"
	if err := os.WriteFile(src, []byte(program), 0o644); err != nil {
		t.Fatal(err)
	}
	cmd := exec.Command("go", "build", "-o", bin, src)
	cmd.Dir = dir
	out, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("go build fake-bds: %v\n%s", err, out)
	}
	return bin
}
