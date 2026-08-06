package tunnel

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	agentallowlist "github.com/ShadowWalkerNC/BedrockOps/apps/agent/internal/allowlist"
	agentbackup "github.com/ShadowWalkerNC/BedrockOps/apps/agent/internal/backup"
	"github.com/ShadowWalkerNC/BedrockOps/apps/agent/internal/lifecycle"
	"github.com/ShadowWalkerNC/BedrockOps/apps/agent/internal/metrics"
	"github.com/ShadowWalkerNC/BedrockOps/apps/agent/internal/protocol"
	"github.com/ShadowWalkerNC/BedrockOps/apps/agent/internal/rcon"
	"github.com/gorilla/websocket"
)

// Config holds outbound tunnel connection settings.
type Config struct {
	ControlPlaneURL string
	NodeID          string
	SecretToken     string
	ServerPathHint  string
	HeartbeatEvery  time.Duration
	MetricsEvery    time.Duration
	ReconnectWait   time.Duration
}

// Client maintains a CGNAT-safe outbound WebSocket tunnel to the control plane.
type Client struct {
	cfg       Config
	manager   *lifecycle.Manager
	collector *metrics.Collector
	rcon      *rcon.Client

	mu   sync.Mutex
	conn *websocket.Conn
}

// NewClient constructs an outbound tunnel client.
func NewClient(cfg Config, manager *lifecycle.Manager, collector *metrics.Collector) *Client {
	if cfg.HeartbeatEvery == 0 {
		cfg.HeartbeatEvery = 15 * time.Second
	}
	if cfg.MetricsEvery == 0 {
		cfg.MetricsEvery = 30 * time.Second
	}
	if cfg.ReconnectWait == 0 {
		cfg.ReconnectWait = 5 * time.Second
	}
	return &Client{
		cfg:       cfg,
		manager:   manager,
		collector: collector,
		rcon:      rcon.NewClient(),
	}
}

// Run dials the control plane and serves forever (reconnects on disconnect).
func (c *Client) Run(ctx context.Context) error {
	for {
		if err := ctx.Err(); err != nil {
			return err
		}
		if err := c.session(ctx); err != nil {
			log.Printf("[bedrock-agent] tunnel session ended: %v — reconnecting in %s", err, c.cfg.ReconnectWait)
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(c.cfg.ReconnectWait):
		}
	}
}

func (c *Client) session(ctx context.Context) error {
	wsURL, err := c.buildWSURL()
	if err != nil {
		return err
	}

	header := http.Header{}
	if c.cfg.SecretToken != "" {
		header.Set("Authorization", "Bearer "+c.cfg.SecretToken)
	}

	log.Printf("[bedrock-agent] dialing outbound tunnel %s (nodeId=%s)", wsURL, c.cfg.NodeID)
	conn, _, err := websocket.DefaultDialer.DialContext(ctx, wsURL, header)
	if err != nil {
		return fmt.Errorf("websocket dial: %w", err)
	}

	c.mu.Lock()
	c.conn = conn
	c.mu.Unlock()
	defer func() {
		c.mu.Lock()
		c.conn = nil
		c.mu.Unlock()
		_ = conn.Close()
	}()

	// Announce presence
	if err := c.sendFrame(protocol.Frame{
		ID:        fmt.Sprintf("hb_%d", time.Now().UnixNano()),
		Type:      protocol.TypeHeartbeat,
		NodeID:    c.cfg.NodeID,
		Timestamp: time.Now().Unix(),
		Payload:   mustRaw(map[string]any{"status": "ONLINE", "mode": string(c.manager.Mode())}),
	}); err != nil {
		return err
	}

	errCh := make(chan error, 1)
	go func() {
		errCh <- c.readLoop(conn)
	}()

	heartbeat := time.NewTicker(c.cfg.HeartbeatEvery)
	metricsTick := time.NewTicker(c.cfg.MetricsEvery)
	defer heartbeat.Stop()
	defer metricsTick.Stop()

	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case err := <-errCh:
			return err
		case <-heartbeat.C:
			_ = c.sendFrame(protocol.Frame{
				ID:        fmt.Sprintf("hb_%d", time.Now().UnixNano()),
				Type:      protocol.TypeHeartbeat,
				NodeID:    c.cfg.NodeID,
				Timestamp: time.Now().Unix(),
				Payload:   mustRaw(map[string]any{"status": "ONLINE"}),
			})
		case <-metricsTick.C:
			c.emitDefaultMetrics()
		}
	}
}

func (c *Client) buildWSURL() (string, error) {
	base := strings.TrimRight(c.cfg.ControlPlaneURL, "/")
	u, err := url.Parse(base)
	if err != nil {
		return "", err
	}
	switch u.Scheme {
	case "https":
		u.Scheme = "wss"
	case "http":
		u.Scheme = "ws"
	case "ws", "wss":
		// already websocket
	default:
		return "", fmt.Errorf("unsupported control plane scheme: %s", u.Scheme)
	}
	u.Path = strings.TrimRight(u.Path, "/") + "/api/v1/ws/agent"
	q := u.Query()
	q.Set("nodeId", c.cfg.NodeID)
	u.RawQuery = q.Encode()
	return u.String(), nil
}

func (c *Client) readLoop(conn *websocket.Conn) error {
	for {
		_, data, err := conn.ReadMessage()
		if err != nil {
			return err
		}
		var frame protocol.Frame
		if err := json.Unmarshal(data, &frame); err != nil {
			log.Printf("[bedrock-agent] invalid frame: %v", err)
			continue
		}
		if frame.Type == protocol.TypeCmdExec {
			c.handleCommand(frame)
		}
	}
}

func (c *Client) handleCommand(frame protocol.Frame) {
	payload, err := protocol.DecodeCmdExec(frame.Payload)
	if err != nil {
		c.respond(frame, protocol.CmdRespPayload{
			Success: false,
			Error:   fmt.Sprintf("invalid command payload: %v", err),
		})
		return
	}

	serverID := frame.ServerID
	switch payload.Command {
	case protocol.CmdPowerAction:
		c.handlePower(frame, serverID, strings.ToUpper(payload.Action))
	case protocol.CmdRconCommand:
		cmd := payload.RconCommand
		if cmd == "" {
			cmd = payload.Command
		}
		c.handleRcon(frame, serverID, cmd)
	case protocol.CmdTriggerBackup:
		c.handleBackup(frame, serverID, payload)
	case protocol.CmdGetStatus:
		c.handleStatus(frame, serverID)
	case protocol.CmdAllowlistSync:
		c.handleAllowlist(frame, serverID, payload)
	default:
		// POWER-style action without explicit command name
		if payload.Action != "" {
			c.handlePower(frame, serverID, strings.ToUpper(payload.Action))
			return
		}
		c.respond(frame, protocol.CmdRespPayload{
			Success: false,
			Error:   fmt.Sprintf("unknown command: %s", payload.Command),
		})
	}
}

func (c *Client) handlePower(frame protocol.Frame, serverID, action string) {
	path := c.cfg.ServerPathHint
	var (
		state lifecycle.State
		mode  lifecycle.Mode
		err   error
	)

	switch action {
	case "START":
		state, mode, err = c.manager.Start(serverID, path)
	case "STOP":
		state, mode, err = c.manager.Stop(serverID, false)
	case "KILL":
		state, mode, err = c.manager.Stop(serverID, true)
	case "RESTART":
		state, mode, err = c.manager.Restart(serverID, path)
	default:
		c.respond(frame, protocol.CmdRespPayload{
			Success: false,
			Error:   fmt.Sprintf("unknown power action: %s", action),
		})
		return
	}

	if err != nil {
		c.respond(frame, protocol.CmdRespPayload{
			Success: false,
			Mode:    string(mode),
			State:   string(state),
			Error:   err.Error(),
		})
		_ = c.sendLog(serverID, fmt.Sprintf("power %s failed: %v", action, err))
		return
	}

	c.respond(frame, protocol.CmdRespPayload{
		Success: true,
		Mode:    string(mode),
		State:   string(state),
		Output:  fmt.Sprintf("power action %s -> %s (mode=%s)", action, state, mode),
	})
	_ = c.sendLog(serverID, fmt.Sprintf("power %s -> %s", action, state))
}

func (c *Client) handleRcon(frame protocol.Frame, serverID, command string) {
	// Host/port come from env for the agent node default; per-server wiring is TODO.
	host := envOr("RCON_HOST", "127.0.0.1")
	port := 19133
	if p := os.Getenv("RCON_PORT"); p != "" {
		fmt.Sscanf(p, "%d", &port)
	}
	password := os.Getenv("RCON_PASSWORD")

	out, stub, err := c.rcon.Execute(host, port, password, command)
	if err != nil {
		c.respond(frame, protocol.CmdRespPayload{
			Success: false,
			Stub:    stub,
			Error:   err.Error(),
			Output:  out,
		})
		return
	}
	c.respond(frame, protocol.CmdRespPayload{
		Success: !stub,
		Stub:    stub,
		Output:  out,
	})
	_ = serverID
}

func (c *Client) handleStatus(frame protocol.Frame, serverID string) {
	m := c.collector.Collect(serverID)
	state := c.manager.GetState(serverID)
	c.respond(frame, protocol.CmdRespPayload{
		Success:       true,
		Mode:          string(c.manager.Mode()),
		State:         string(state),
		CPUPercent:    m.CPUPercent,
		MemoryMb:      m.MemoryUsageMB,
		TotalMemoryMb: m.MemoryLimitMB,
		UptimeSeconds: m.UptimeSeconds,
		ActivePlayers: m.ActiveConnections,
	})
}

func (c *Client) handleAllowlist(frame protocol.Frame, serverID string, payload protocol.CmdExecPayload) {
	contents := payload.Contents
	targetPath := payload.TargetPath
	tempPath := payload.TempPath

	if contents == "" {
		entries, err := agentallowlist.SanitizeEntries(payload.Entries)
		if err != nil {
			c.respond(frame, protocol.CmdRespPayload{Success: false, Error: err.Error()})
			return
		}
		serialized, err := agentallowlist.Serialize(entries)
		if err != nil {
			c.respond(frame, protocol.CmdRespPayload{Success: false, Error: err.Error()})
			return
		}
		contents = serialized
	}

	root := c.cfg.ServerPathHint
	if root == "" {
		root = filepath.Join(os.TempDir(), "bedrockops", serverID)
	}

	// Ignore remote absolute paths that escape the jail — only basename/relative under root.
	if targetPath != "" && (filepath.IsAbs(targetPath) || strings.Contains(targetPath, "..")) {
		targetPath = filepath.Base(filepath.Clean(targetPath))
		if targetPath == "." || targetPath == string(filepath.Separator) {
			targetPath = "allowlist.json"
		}
	}
	resolvedTarget, err := agentallowlist.ResolveJailPath(root, targetPath)
	if err != nil {
		c.respond(frame, protocol.CmdRespPayload{Success: false, Error: err.Error()})
		return
	}
	resolvedTemp, err := agentallowlist.ResolveJailPath(root, filepath.Base(resolvedTarget)+".tmp")
	if err != nil {
		c.respond(frame, protocol.CmdRespPayload{Success: false, Error: err.Error()})
		return
	}
	_ = tempPath // remote tempPath ignored — always use jailed sibling

	if err := agentallowlist.AtomicWrite(resolvedTarget, resolvedTemp, contents); err != nil {
		c.respond(frame, protocol.CmdRespPayload{Success: false, Error: err.Error()})
		_ = c.sendLog(serverID, fmt.Sprintf("allowlist sync failed: %v", err))
		return
	}

	reload := payload.ReloadCommand
	if reload == "" {
		reload = "allowlist reload"
	}
	_ = c.sendLog(serverID, fmt.Sprintf("allowlist written to %s (%d bytes); reload via %q", resolvedTarget, len(contents), reload))

	c.respond(frame, protocol.CmdRespPayload{
		Success: true,
		Output:  fmt.Sprintf("allowlist synced to %s", resolvedTarget),
		Mode:    string(c.manager.Mode()),
	})
}

func (c *Client) handleBackup(frame protocol.Frame, serverID string, payload protocol.CmdExecPayload) {
	backupID := payload.BackupID
	if backupID == "" {
		backupID = fmt.Sprintf("bkp_local_%d", time.Now().Unix())
	}

	_ = c.sendFrame(protocol.Frame{
		ID:        frame.ID + "_start",
		Type:      protocol.TypeBackupStart,
		NodeID:    c.cfg.NodeID,
		ServerID:  serverID,
		Timestamp: time.Now().Unix(),
		Payload:   mustRaw(map[string]any{"backupId": backupID, "status": "STARTING", "holdCheckpoint": true}),
	})

	worldDir := lifecycle.WorldDir(c.cfg.ServerPathHint)
	if worldDir == "" || !dirExists(worldDir) {
		msg := fmt.Sprintf("world directory unavailable at %q — backup not executed", worldDir)
		c.failBackup(frame, serverID, backupID, msg)
		return
	}

	if err := agentbackup.ValidateUploadURL(payload.PresignedUploadURL); err != nil {
		c.failBackup(frame, serverID, backupID, err.Error())
		return
	}

	host := envOr("RCON_HOST", "127.0.0.1")
	port := 19133
	if p := os.Getenv("RCON_PORT"); p != "" {
		fmt.Sscanf(p, "%d", &port)
	}
	password := os.Getenv("RCON_PASSWORD")

	held := false
	_ = c.sendLog(serverID, "save hold checkpoint: attempting RCON save hold/query (resume after archive)")
	if out, stub, err := c.rcon.Execute(host, port, password, "save hold"); err != nil {
		_ = c.sendLog(serverID, fmt.Sprintf("save hold skipped: %v", err))
		_ = stub
		_ = out
	} else {
		held = true
		_, _, _ = c.rcon.Execute(host, port, password, "save query")
	}

	result, err := agentbackup.StreamWorldArchive(worldDir, payload.PresignedUploadURL, func(percent int, bytes int64) {
		_ = c.sendFrame(protocol.Frame{
			ID:        fmt.Sprintf("%s_prog_%d", frame.ID, percent),
			Type:      protocol.TypeBackupProgress,
			NodeID:    c.cfg.NodeID,
			ServerID:  serverID,
			Timestamp: time.Now().Unix(),
			Payload: mustRaw(map[string]any{
				"backupId":         backupID,
				"progressPercent":  percent,
				"bytesTransferred": bytes,
			}),
		})
	})

	if held {
		if _, _, resumeErr := c.rcon.Execute(host, port, password, "save resume"); resumeErr != nil {
			_ = c.sendLog(serverID, fmt.Sprintf("save resume failed: %v", resumeErr))
		}
	}

	if err != nil {
		c.failBackup(frame, serverID, backupID, err.Error())
		return
	}

	_ = c.sendFrame(protocol.Frame{
		ID:        frame.ID + "_done",
		Type:      protocol.TypeBackupComplete,
		NodeID:    c.cfg.NodeID,
		ServerID:  serverID,
		Timestamp: time.Now().Unix(),
		Payload: mustRaw(map[string]any{
			"backupId":         backupID,
			"status":           "COMPLETED",
			"bytesTransferred": result.FileSizeBytes,
			"checksum":         result.SHA256,
			"uploaded":         result.Uploaded,
		}),
	})

	c.respond(frame, protocol.CmdRespPayload{
		Success:       true,
		BackupID:      backupID,
		FileSizeBytes: result.FileSizeBytes,
		SHA256:        result.SHA256,
		Mode:          string(c.manager.Mode()),
		Output:        fmt.Sprintf("backup archived %d bytes sha256=%s uploaded=%v", result.FileSizeBytes, result.SHA256, result.Uploaded),
	})
}

func (c *Client) failBackup(frame protocol.Frame, serverID, backupID, msg string) {
	_ = c.sendFrame(protocol.Frame{
		ID:        frame.ID + "_err",
		Type:      protocol.TypeBackupError,
		NodeID:    c.cfg.NodeID,
		ServerID:  serverID,
		Timestamp: time.Now().Unix(),
		Payload:   mustRaw(map[string]any{"backupId": backupID, "error": msg}),
	})
	c.respond(frame, protocol.CmdRespPayload{
		Success:  false,
		Stub:     true,
		BackupID: backupID,
		Error:    msg,
	})
}

func (c *Client) respond(req protocol.Frame, payload protocol.CmdRespPayload) {
	raw, err := protocol.MarshalPayload(payload)
	if err != nil {
		return
	}
	_ = c.sendFrame(protocol.Frame{
		ID:        req.ID,
		Type:      protocol.TypeCmdResp,
		NodeID:    c.cfg.NodeID,
		ServerID:  req.ServerID,
		Timestamp: time.Now().Unix(),
		Payload:   raw,
	})
}

func (c *Client) sendLog(serverID, line string) error {
	raw, err := protocol.MarshalPayload(protocol.LogLinePayload{Line: line})
	if err != nil {
		return err
	}
	return c.sendFrame(protocol.Frame{
		ID:        fmt.Sprintf("log_%d", time.Now().UnixNano()),
		Type:      protocol.TypeLogLine,
		NodeID:    c.cfg.NodeID,
		ServerID:  serverID,
		Timestamp: time.Now().Unix(),
		Payload:   raw,
	})
}

func (c *Client) emitDefaultMetrics() {
	// Emit for any known servers; if none, emit node-level metrics with empty serverId.
	serverID := ""
	m := c.collector.Collect(serverID)
	raw, err := protocol.MarshalPayload(m)
	if err != nil {
		return
	}
	_ = c.sendFrame(protocol.Frame{
		ID:        fmt.Sprintf("met_%d", time.Now().UnixNano()),
		Type:      protocol.TypeMetrics,
		NodeID:    c.cfg.NodeID,
		ServerID:  serverID,
		Timestamp: time.Now().Unix(),
		Payload:   raw,
	})
}

func (c *Client) sendFrame(frame protocol.Frame) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.conn == nil {
		return fmt.Errorf("not connected")
	}
	return c.conn.WriteJSON(frame)
}

func mustRaw(v any) json.RawMessage {
	b, err := json.Marshal(v)
	if err != nil {
		return json.RawMessage(`{}`)
	}
	return json.RawMessage(b)
}

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func dirExists(path string) bool {
	info, err := os.Stat(path)
	return err == nil && info.IsDir()
}
