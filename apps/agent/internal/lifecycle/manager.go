package lifecycle

import (
	"bufio"
	"fmt"
	"io"
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

// LogHandler receives each stdout/stderr line from a live BDS process.
type LogHandler func(serverID, line string)

// ExitHandler is invoked when a live BDS process exits.
// unexpected is true when the process died without an intentional Stop/Kill.
type ExitHandler func(serverID string, unexpected bool, waitErr error)

// Instance tracks one managed Bedrock server on this node.
type Instance struct {
	ServerID   string
	ServerPath string
	State      State
	StartedAt  time.Time
	cmd        *exec.Cmd
	// generation increments on each Start so Wait callbacks can tell
	// intentional stops apart from a later restart of the same serverId.
	generation int
}

// Manager owns local BDS process lifecycle for the agent node.
type Manager struct {
	mu      sync.RWMutex
	mode    Mode
	bdsBin  string
	servers map[string]*Instance
	// intentionalStop maps serverID → generation that is expected to exit.
	intentionalStop map[string]int
	onLog           LogHandler
	onExit          ExitHandler
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
		mode:            mode,
		bdsBin:          bdsBin,
		servers:         make(map[string]*Instance),
		intentionalStop: make(map[string]int),
	}
}

// SetHandlers registers optional callbacks for live process log lines and exits.
func (m *Manager) SetHandlers(onLog LogHandler, onExit ExitHandler) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.onLog = onLog
	m.onExit = onExit
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
	inst.generation++
	gen := inst.generation

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

		stdout, err := cmd.StdoutPipe()
		if err != nil {
			inst.State = StateError
			return inst.State, m.mode, fmt.Errorf("stdout pipe: %w", err)
		}
		stderr, err := cmd.StderrPipe()
		if err != nil {
			inst.State = StateError
			return inst.State, m.mode, fmt.Errorf("stderr pipe: %w", err)
		}

		if err := cmd.Start(); err != nil {
			inst.State = StateError
			return inst.State, m.mode, fmt.Errorf("start BDS process: %w", err)
		}
		inst.cmd = cmd

		// Drain stdout/stderr before treating the process as exited so log
		// handlers always see lines that were written before the child quit.
		// (cmd.Wait closes pipe ends and must not race ahead of readers.)
		var pumps sync.WaitGroup
		pumps.Add(2)
		go func() {
			defer pumps.Done()
			m.pumpLines(serverID, stdout)
		}()
		go func() {
			defer pumps.Done()
			m.pumpLines(serverID, stderr)
		}()

		go func(cmd *exec.Cmd, serverID string, gen int) {
			waitErr := cmd.Wait()
			pumps.Wait()

			m.mu.Lock()
			intentional := m.intentionalStop[serverID] == gen
			if intentional {
				delete(m.intentionalStop, serverID)
			}
			onExit := m.onExit
			if current := m.servers[serverID]; current != nil && current.cmd == cmd {
				if intentional {
					current.State = StateOffline
				} else {
					current.State = StateError
				}
				current.cmd = nil
				current.StartedAt = time.Time{}
			}
			m.mu.Unlock()

			if onExit != nil {
				onExit(serverID, !intentional, waitErr)
			}
		}(cmd, serverID, gen)
	}

	inst.State = StateOnline
	inst.StartedAt = time.Now()
	return inst.State, m.mode, nil
}

func (m *Manager) pumpLines(serverID string, r io.Reader) {
	scanner := bufio.NewScanner(r)
	// BDS lines can be long; raise the default token size.
	buf := make([]byte, 0, 64*1024)
	scanner.Buffer(buf, 1024*1024)
	for scanner.Scan() {
		line := scanner.Text()
		m.mu.RLock()
		onLog := m.onLog
		m.mu.RUnlock()
		if onLog != nil {
			onLog(serverID, line)
		}
	}
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
	m.intentionalStop[serverID] = inst.generation

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
		// Leave cmd set so Wait goroutine can clear it; state will settle there.
		// For API responsiveness, mark offline now when intentional.
		inst.State = StateOffline
		inst.StartedAt = time.Time{}
		return inst.State, m.mode, nil
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
