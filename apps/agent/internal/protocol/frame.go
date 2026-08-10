package protocol

import "encoding/json"

// FrameType matches the control-plane agent tunnel contract (PROJECT.md).
type FrameType string

const (
	TypeHeartbeat      FrameType = "HEARTBEAT"
	TypeCmdExec        FrameType = "CMD_EXEC"
	TypeCmdResp        FrameType = "CMD_RESP"
	TypeLogLine        FrameType = "LOG_LINE"
	TypeMetrics        FrameType = "METRICS"
	TypeBackupStart    FrameType = "BACKUP_START"
	TypeBackupProgress FrameType = "BACKUP_PROGRESS"
	TypeBackupComplete FrameType = "BACKUP_COMPLETE"
	TypeBackupError    FrameType = "BACKUP_ERROR"
	TypeCrash          FrameType = "CRASH"
)

// Command names embedded in CMD_EXEC payloads by HostProvider.
const (
	CmdPowerAction       = "POWER_ACTION"
	CmdRconCommand       = "RCON_COMMAND"
	CmdTriggerBackup     = "TRIGGER_BACKUP"
	CmdRestoreBackup     = "RESTORE_BACKUP"
	CmdGetStatus         = "GET_STATUS"
	CmdAllowlistSync     = "ALLOWLIST_SYNC"
	CmdWriteProperties   = "WRITE_PROPERTIES"
	CmdWritePackFiles    = "WRITE_PACK_FILES"
	CmdReadWorldFile     = "READ_WORLD_FILE"
	CmdWriteWorldFile    = "WRITE_WORLD_FILE"
)

// Frame is the bidirectional agent ↔ API tunnel envelope.
type Frame struct {
	ID        string          `json:"id"`
	Type      FrameType       `json:"type"`
	NodeID    string          `json:"nodeId"`
	ServerID  string          `json:"serverId,omitempty"`
	Timestamp int64           `json:"timestamp"`
	Payload   json.RawMessage `json:"payload"`
}

// CmdExecPayload is the control-plane command envelope.
type CmdExecPayload struct {
	Command              string `json:"command"`
	Action               string `json:"action,omitempty"`
	RconCommand          string `json:"rconCommand,omitempty"`
	BackupID             string `json:"backupId,omitempty"`
	PresignedUploadURL   string `json:"presignedUploadUrl,omitempty"`
	PresignedDownloadURL string `json:"presignedDownloadUrl,omitempty"`
	IsManual             bool   `json:"isManual,omitempty"`
	IsHoldCheckpoint     bool   `json:"isHoldCheckpoint,omitempty"`
	// Working directory for POWER_ACTION (falls back to agent -server-path hint).
	ServerPath string `json:"serverPath,omitempty"`
	// Allowlist sync (ALLOWLIST_SYNC) fields.
	Entries       json.RawMessage `json:"entries,omitempty"`
	TargetPath    string          `json:"targetPath,omitempty"`
	TempPath      string          `json:"tempPath,omitempty"`
	Contents      string          `json:"contents,omitempty"`
	ReloadCommand string          `json:"reloadCommand,omitempty"`
	// WRITE_PACK_FILES — multiple jailed files under serverPath.
	Files []PackFileSpec `json:"files,omitempty"`
	// READ/WRITE_WORLD_FILE — jailed binary world files (level.dat).
	RelativePath    string `json:"relativePath,omitempty"`
	ContentsBase64  string `json:"contentsBase64,omitempty"`
	Backup          *bool  `json:"backup,omitempty"`
}

// PackFileSpec is one file in a WRITE_PACK_FILES payload.
type PackFileSpec struct {
	RelativePath string `json:"relativePath"`
	Contents     string `json:"contents"`
}

// CmdRespPayload is returned on CMD_RESP frames.
type CmdRespPayload struct {
	Success bool   `json:"success"`
	Stub    bool   `json:"stub,omitempty"`
	Mode    string `json:"mode,omitempty"`
	Output  string `json:"output,omitempty"`
	Error   string `json:"error,omitempty"`
	// Power / status extras
	State string `json:"state,omitempty"`
	// Metrics extras (also used for GET_STATUS)
	CPUPercent     float64 `json:"cpuPercent,omitempty"`
	MemoryMb       float64 `json:"memoryMb,omitempty"`
	TotalMemoryMb  float64 `json:"totalMemoryMb,omitempty"`
	UptimeSeconds  int64   `json:"uptimeSeconds,omitempty"`
	ActivePlayers  int     `json:"activePlayers,omitempty"`
	// Backup extras
	BackupID      string `json:"backupId,omitempty"`
	FileSizeBytes int64  `json:"fileSizeBytes,omitempty"`
	SHA256        string `json:"sha256,omitempty"`
	// World file extras
	ContentsBase64 string `json:"contentsBase64,omitempty"`
}

// MetricsPayload is emitted on METRICS frames.
type MetricsPayload struct {
	CPUPercent        float64 `json:"cpuPercent"`
	MemoryUsageMB     float64 `json:"memoryUsageMB"`
	MemoryLimitMB     float64 `json:"memoryLimitMB"`
	DiskUsageMB       float64 `json:"diskUsageMB"`
	UptimeSeconds     int64   `json:"uptimeSeconds"`
	ActiveConnections int     `json:"activeConnections"`
	Timestamp         int64   `json:"timestamp"`
}

// LogLinePayload is emitted on LOG_LINE frames.
type LogLinePayload struct {
	Line string `json:"line"`
}

// MarshalPayload encodes an arbitrary payload as JSON raw message.
func MarshalPayload(v any) (json.RawMessage, error) {
	b, err := json.Marshal(v)
	if err != nil {
		return nil, err
	}
	return json.RawMessage(b), nil
}

// DecodeCmdExec parses a CMD_EXEC payload, accepting either nested RCON
// command field names used by the TypeScript HostProvider.
func DecodeCmdExec(raw json.RawMessage) (CmdExecPayload, error) {
	var payload CmdExecPayload
	if err := json.Unmarshal(raw, &payload); err != nil {
		return payload, err
	}
	// HostProvider spreads { command: "RCON_COMMAND", command: "list" } — second wins
	// in JSON objects, so also accept a string-only "command" when action is empty
	// and look for an alternate key used by the TS gateway.
	var loose map[string]any
	if err := json.Unmarshal(raw, &loose); err == nil {
		if payload.Command == CmdRconCommand {
			if cmd, ok := loose["command"].(string); ok && cmd != CmdRconCommand {
				payload.RconCommand = cmd
			}
			// TS sends: { command: "RCON_COMMAND", command: "<rcon>" } which collapses;
			// preferred shape from gateway is { command: "RCON_COMMAND", ...payload }
			// where payload includes { command: "<rcon text>" } — see sendCommand merge.
			if rc, ok := loose["command"].(string); ok && rc != CmdRconCommand && rc != CmdPowerAction && rc != CmdTriggerBackup && rc != CmdGetStatus {
				payload.RconCommand = rc
			}
		}
		// When HostProvider calls sendCommand(id, sid, 'RCON_COMMAND', { command }),
		// the merged payload is { command: <rcon>, ... } overwriting POWER style.
		// Detect: if command looks like RCON text (not a known cmd name) treat as RCON.
		known := map[string]bool{
			CmdPowerAction: true, CmdRconCommand: true, CmdTriggerBackup: true, CmdRestoreBackup: true, CmdGetStatus: true, CmdAllowlistSync: true, CmdWriteProperties: true, CmdWritePackFiles: true, CmdReadWorldFile: true, CmdWriteWorldFile: true,
		}
		if !known[payload.Command] && payload.Action == "" && payload.BackupID == "" {
			payload.RconCommand = payload.Command
			payload.Command = CmdRconCommand
		}
		if a, ok := loose["action"].(string); ok {
			payload.Action = a
			if payload.Command == "" {
				payload.Command = CmdPowerAction
			}
		}
	}
	return payload, nil
}
