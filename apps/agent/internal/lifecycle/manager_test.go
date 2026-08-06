package lifecycle_test

import (
	"os"
	"path/filepath"
	"testing"

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
