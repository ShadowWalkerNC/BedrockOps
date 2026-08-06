package rcon

import (
	"fmt"
	"net"
	"time"
)

// Client is a minimal TCP dialer used to probe RCON reachability.
// Full Minecraft Bedrock/Java RCON framing is TODO — callers must treat
// Execute as best-effort until the protocol codec lands.
type Client struct {
	Timeout time.Duration
}

// NewClient creates an RCON client with a default dial timeout.
func NewClient() *Client {
	return &Client{Timeout: 3 * time.Second}
}

// Execute attempts a TCP dial to host:port and returns an honest stub response.
// It does not claim the game command succeeded — only that the socket was reachable
// when dial succeeds.
func (c *Client) Execute(host string, port int, password, command string) (string, bool, error) {
	if host == "" || port <= 0 {
		return "", true, fmt.Errorf("rcon host/port not configured")
	}

	addr := fmt.Sprintf("%s:%d", host, port)
	conn, err := net.DialTimeout("tcp", addr, c.Timeout)
	if err != nil {
		return "", true, fmt.Errorf("rcon dial failed: %w (command not sent: %q)", err, command)
	}
	defer conn.Close()

	// TODO: Implement full RCON packet codec (length + requestId + type + payload + nulls).
	_ = password
	return fmt.Sprintf(
		"[STUB] RCON TCP reachable at %s — command %q not framed (protocol codec pending)",
		addr,
		command,
	), true, nil
}
