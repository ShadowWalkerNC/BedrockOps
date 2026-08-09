package main

import (
	"context"
	"flag"
	"log"
	"os"
	"os/signal"
	"syscall"

	"github.com/ShadowWalkerNC/BedrockOps/apps/agent/internal/lifecycle"
	"github.com/ShadowWalkerNC/BedrockOps/apps/agent/internal/metrics"
	"github.com/ShadowWalkerNC/BedrockOps/apps/agent/internal/tunnel"
)

func main() {
	controlPlane := flag.String("control-plane", envOr("BEDROCK_CONTROL_PLANE", "http://127.0.0.1:4000"), "Control plane base URL (http/https)")
	nodeID := flag.String("node-id", envOr("BEDROCK_NODE_ID", "node_docker_agent_1"), "Registered agent node id")
	token := flag.String("token", envOr("BEDROCK_AGENT_TOKEN", "dev_agent_token_change_me"), "Bearer token for tunnel auth (required)")
	bdsBin := flag.String("bds-bin", envOr("BDS_BIN", ""), "Path to bedrock_server binary (empty = simulated lifecycle)")
	serverPath := flag.String("server-path", envOr("BDS_SERVER_PATH", ""), "Default BDS server working directory")
	flag.Parse()

	manager := lifecycle.NewManager(*bdsBin)
	collector := metrics.NewCollector(manager)
	client := tunnel.NewClient(tunnel.Config{
		ControlPlaneURL: *controlPlane,
		NodeID:          *nodeID,
		SecretToken:     *token,
		ServerPathHint:  *serverPath,
	}, manager, collector)

	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer cancel()

	log.Printf("[bedrock-agent] starting outbound tunnel (node=%s mode=%s)", *nodeID, manager.Mode())
	if err := client.Run(ctx); err != nil && err != context.Canceled {
		log.Fatalf("[bedrock-agent] fatal: %v", err)
	}
	log.Printf("[bedrock-agent] shutdown complete")
}

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
