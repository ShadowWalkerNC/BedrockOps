package protocol_test

import (
	"encoding/json"
	"testing"

	"github.com/ShadowWalkerNC/BedrockOps/apps/agent/internal/protocol"
)

func TestDecodeCmdExecPowerAction(t *testing.T) {
	raw := json.RawMessage(`{"command":"POWER_ACTION","action":"START"}`)
	payload, err := protocol.DecodeCmdExec(raw)
	if err != nil {
		t.Fatal(err)
	}
	if payload.Command != protocol.CmdPowerAction || payload.Action != "START" {
		t.Fatalf("unexpected payload: %+v", payload)
	}
}

func TestDecodeCmdExecRconOverwriteShape(t *testing.T) {
	// HostProvider historically merged { command: "RCON_COMMAND", command: "list" }
	// which collapses to { command: "list" }. Decoder should recover RCON intent.
	raw := json.RawMessage(`{"command":"list"}`)
	payload, err := protocol.DecodeCmdExec(raw)
	if err != nil {
		t.Fatal(err)
	}
	if payload.Command != protocol.CmdRconCommand {
		t.Fatalf("expected RCON_COMMAND, got %s", payload.Command)
	}
	if payload.RconCommand != "list" {
		t.Fatalf("expected rcon text list, got %q", payload.RconCommand)
	}
}

func TestDecodeCmdExecTriggerBackup(t *testing.T) {
	raw := json.RawMessage(`{"command":"TRIGGER_BACKUP","backupId":"bkp_1","presignedUploadUrl":"https://r2.example/put"}`)
	payload, err := protocol.DecodeCmdExec(raw)
	if err != nil {
		t.Fatal(err)
	}
	if payload.Command != protocol.CmdTriggerBackup || payload.BackupID != "bkp_1" {
		t.Fatalf("unexpected: %+v", payload)
	}
}

func TestMarshalPayload(t *testing.T) {
	raw, err := protocol.MarshalPayload(protocol.CmdRespPayload{Success: true, Output: "ok"})
	if err != nil {
		t.Fatal(err)
	}
	var decoded protocol.CmdRespPayload
	if err := json.Unmarshal(raw, &decoded); err != nil {
		t.Fatal(err)
	}
	if !decoded.Success || decoded.Output != "ok" {
		t.Fatalf("decoded=%+v", decoded)
	}
}
