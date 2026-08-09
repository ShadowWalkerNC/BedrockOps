package rcon

import (
	"encoding/binary"
	"errors"
	"fmt"
	"io"
	"net"
	"sync/atomic"
	"time"
)

const (
	packetTypeResponse = 0
	packetTypeCommand  = 2
	packetTypeAuth     = 3
	// Auth failure responses use request ID -1.
	authFailureID = -1
	// Minimum packet size: requestId(4) + type(4) + empty payload null + pad null.
	minPacketBody = 10
	maxPacketBody = 4096 + minPacketBody
)

// Client speaks the Source RCON protocol used by Minecraft (Java/Bedrock with enable-rcon).
type Client struct {
	Timeout time.Duration
	nextID  atomic.Int32
}

// NewClient creates an RCON client with a default dial/IO timeout.
func NewClient() *Client {
	c := &Client{Timeout: 5 * time.Second}
	c.nextID.Store(1)
	return c
}

// Execute dials host:port, authenticates, runs command, and returns the response body.
// On failure, stub is false when the protocol ran (auth/command error) and true only when
// configuration prevented any attempt (missing host/port).
func (c *Client) Execute(host string, port int, password, command string) (string, bool, error) {
	if host == "" || port <= 0 {
		return "", true, fmt.Errorf("rcon host/port not configured")
	}
	if command == "" {
		return "", false, fmt.Errorf("rcon command is empty")
	}

	addr := fmt.Sprintf("%s:%d", host, port)
	conn, err := net.DialTimeout("tcp", addr, c.Timeout)
	if err != nil {
		return "", false, fmt.Errorf("rcon dial failed: %w (command not sent: %q)", err, command)
	}
	defer conn.Close()

	deadline := time.Now().Add(c.Timeout)
	_ = conn.SetDeadline(deadline)

	if err := c.authenticate(conn, password); err != nil {
		return "", false, err
	}

	out, err := c.sendCommand(conn, command)
	if err != nil {
		return "", false, err
	}
	return out, false, nil
}

func (c *Client) authenticate(conn net.Conn, password string) error {
	reqID := c.allocID()
	if err := writePacket(conn, reqID, packetTypeAuth, password); err != nil {
		return fmt.Errorf("rcon auth write failed: %w", err)
	}

	pkt, err := readPacket(conn)
	if err != nil {
		return fmt.Errorf("rcon auth read failed: %w", err)
	}
	if pkt.requestID == authFailureID {
		return errors.New("rcon authentication failed (invalid password)")
	}
	if pkt.requestID != reqID {
		return fmt.Errorf("rcon auth response id mismatch: got %d want %d", pkt.requestID, reqID)
	}
	return nil
}

func (c *Client) sendCommand(conn net.Conn, command string) (string, error) {
	reqID := c.allocID()
	if err := writePacket(conn, reqID, packetTypeCommand, command); err != nil {
		return "", fmt.Errorf("rcon command write failed: %w", err)
	}

	// Some servers may split large responses; concatenate matching request IDs
	// until we see an empty terminator-style response or a single complete packet.
	var body string
	for {
		pkt, err := readPacket(conn)
		if err != nil {
			if body != "" && errors.Is(err, io.EOF) {
				return body, nil
			}
			return body, fmt.Errorf("rcon command read failed: %w", err)
		}
		if pkt.requestID == authFailureID {
			return "", errors.New("rcon session not authenticated")
		}
		if pkt.requestID != reqID {
			// Ignore unrelated packets; keep waiting for our request id.
			continue
		}
		body += pkt.payload
		// Minecraft typically returns a single RESPONSE packet (type 0) or COMMAND type.
		// Stop after the first matching response with any payload, or an empty payload
		// after we already collected content. For empty command output, one empty packet is enough.
		if pkt.packetType == packetTypeResponse || pkt.packetType == packetTypeCommand {
			return body, nil
		}
	}
}

func (c *Client) allocID() int32 {
	id := c.nextID.Add(1)
	if id <= 0 {
		c.nextID.Store(1)
		id = 1
	}
	return id
}

type packet struct {
	requestID  int32
	packetType int32
	payload    string
}

func writePacket(w io.Writer, requestID, packetType int32, payload string) error {
	// Body = requestId + type + payload + 2 null terminators.
	payloadBytes := []byte(payload)
	size := int32(8 + len(payloadBytes) + 2)
	buf := make([]byte, 4+size)
	binary.LittleEndian.PutUint32(buf[0:4], uint32(size))
	binary.LittleEndian.PutUint32(buf[4:8], uint32(requestID))
	binary.LittleEndian.PutUint32(buf[8:12], uint32(packetType))
	copy(buf[12:], payloadBytes)
	// trailing nulls already zeroed
	_, err := w.Write(buf)
	return err
}

func readPacket(r io.Reader) (packet, error) {
	var sizeBuf [4]byte
	if _, err := io.ReadFull(r, sizeBuf[:]); err != nil {
		return packet{}, err
	}
	size := int32(binary.LittleEndian.Uint32(sizeBuf[:]))
	if size < minPacketBody || size > maxPacketBody {
		return packet{}, fmt.Errorf("rcon packet size out of range: %d", size)
	}

	body := make([]byte, size)
	if _, err := io.ReadFull(r, body); err != nil {
		return packet{}, err
	}

	reqID := int32(binary.LittleEndian.Uint32(body[0:4]))
	pktType := int32(binary.LittleEndian.Uint32(body[4:8]))
	payload := body[8:]
	// Strip trailing null terminators.
	for len(payload) > 0 && payload[len(payload)-1] == 0 {
		payload = payload[:len(payload)-1]
	}
	return packet{
		requestID:  reqID,
		packetType: pktType,
		payload:    string(payload),
	}, nil
}
