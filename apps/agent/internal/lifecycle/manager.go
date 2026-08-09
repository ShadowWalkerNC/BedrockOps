package lifecycle

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"sync"
	"time"
)

// State mirrors BedrockServer status values used by the control plane.
type State string

const (
	StateOffline  State = "OFFLINE"
	StateStarting State = "STARTING"
	StateOnline   State = "ONLINE"
	StateStopping State = "STOPPING"
	StateError    State = "ERROR"
)

// Mode indicates whether the manager drives a real BDS process or an explicit simulation.
type Mode string

const (
	ModeSim  Mode = "simulated"
	ModeLive Mode = "live"
)

// Instance tracks one managed Bedrock server on this node.
type Instance struct {
	ServerID   string
	ServerPath string
	State      State
	StartedAt  time.Time
	cmd        *exec.Cmd
}

// Manager owns local BDS process lifecycle for the agent node.
type Manager struct {
	mu      sync.RWMutex
	mode    Mode
	bdsBin  string
	servers map[string]*Instance
}

// NewManager creates a lifecycle manager.
// If bdsBin is empty or missing on disk, the manager runs in explicit simulated mode
// (state machine only — does not claim a real BDS process was started).
func NewManager(bdsBin string) *Manager {
	mode := ModeSim
	if bdsBin != "" {
		if _, err := os.Stat(bdsBin); err == nil {
			mode = ModeLive
		}
	}
	return &Manager{
		mode:    mode,
		bdsBin:  bdsBin,
		servers: make(map[string]*Instance),
	}
}

// Mode returns the current operating mode.
func (m *Manager) Mode() Mode {
	return m.mode
}

// Ensure registers a server path for lifecycle tracking.
func (m *Manager) Ensure(serverID, serverPath string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if _, ok := m.servers[serverID]; ok {
		return
	}
	m.servers[serverID] = &Instance{
		ServerID:   serverID,
		ServerPath: serverPath,
		State:      StateOffline,
	}
}

// GetState returns the current state for a server (OFFLINE if unknown).
func (m *Manager) GetState(serverID string) State {
	m.mu.RLock()
	defer m.mu.RUnlock()
	inst, ok := m.servers[serverID]
	if !ok {
		return StateOffline
	}
	return inst.State
}

// UptimeSeconds returns process uptime when ONLINE.
func (m *Manager) UptimeSeconds(serverID string) int64 {
	m.mu.RLock()
	defer m.mu.RUnlock()
	inst, ok := m.servers[serverID]
	if !ok || inst.State != StateOnline || inst.StartedAt.IsZero() {
		return 0
	}
	return int64(time.Since(inst.StartedAt).Seconds())
}

// Start brings a server online.
func (m *Manager) Start(serverID, serverPath string) (State, Mode, error) {
	m.Ensure(serverID, serverPath)
	m.mu.Lock()
	defer m.mu.Unlock()

	inst := m.servers[serverID]
	if serverPath != "" {
		inst.ServerPath = serverPath
	}

	if inst.State == StateOnline || inst.State == StateStarting {
		return inst.State, m.mode, nil
	}

	inst.State = StateStarting

	if m.mode == ModeLive {
		bin := m.bdsBin
		workDir := inst.ServerPath
		if workDir == "" {
			inst.State = StateError
			return inst.State, m.mode, fmt.Errorf("server path empty for %s", serverID)
		}
		if err := os.MkdirAll(workDir, 0o755); err != nil {
			inst.State = StateError
			return inst.State, m.mode, fmt.Errorf("create server path: %w", err)
		}
		cmd := exec.Command(bin)
		cmd.Dir = workDir
		cmd.Stdout = os.Stdout
		cmd.Stderr = os.Stderr
		if err := cmd.Start(); err != nil {
			inst.State = StateError
			return inst.State, m.mode, fmt.Errorf("start BDS process: %w", err)
		}
		inst.cmd = cmd
		go func() {
			_ = cmd.Wait()
			m.mu.Lock()
			defer m.mu.Unlock()
			if current := m.servers[serverID]; current != nil && current.cmd == cmd {
				current.State = StateOffline
				current.cmd = nil
			}
		}()
	}

	inst.State = StateOnline
	inst.StartedAt = time.Now()
	return inst.State, m.mode, nil
}

// Stop stops a server. force=true sends Kill; otherwise graceful Interrupt/Signal.
func (m *Manager) Stop(serverID string, force bool) (State, Mode, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	inst, ok := m.servers[serverID]
	if !ok {
		return StateOffline, m.mode, nil
	}
	if inst.State == StateOffline || inst.State == StateStopping {
		inst.State = StateOffline
		return inst.State, m.mode, nil
	}

	inst.State = StateStopping

	if m.mode == ModeLive && inst.cmd != nil && inst.cmd.Process != nil {
		var err error
		if force {
			err = inst.cmd.Process.Kill()
		} else {
			err = inst.cmd.Process.Signal(os.Interrupt)
		}
		if err != nil {
			inst.State = StateError
			return inst.State, m.mode, err
		}
		inst.cmd = nil
	}

	inst.State = StateOffline
	inst.StartedAt = time.Time{}
	return inst.State, m.mode, nil
}

// Restart stops then starts a server.
func (m *Manager) Restart(serverID, serverPath string) (State, Mode, error) {
	if _, _, err := m.Stop(serverID, false); err != nil {
		return StateError, m.mode, err
	}
	return m.Start(serverID, serverPath)
}

// WorldDir returns the expected world directory for backup snapshots.
func WorldDir(serverPath string) string {
	if serverPath == "" {
		return ""
	}
	return filepath.Join(serverPath, "worlds")
}
