package rcon

import (
	"encoding/binary"
	"net"
	"testing"
	"time"
)

func TestExecuteAuthAndCommand(t *testing.T) {
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer ln.Close()

	done := make(chan struct{})
	go func() {
		defer close(done)
		conn, err := ln.Accept()
		if err != nil {
			return
		}
		defer conn.Close()
		_ = conn.SetDeadline(time.Now().Add(3 * time.Second))

		auth, err := readPacket(conn)
		if err != nil {
			t.Errorf("read auth: %v", err)
			return
		}
		if auth.packetType != packetTypeAuth || auth.payload != "s3cret" {
			t.Errorf("unexpected auth packet: %#v", auth)
			return
		}
		if err := writePacket(conn, auth.requestID, packetTypeCommand, ""); err != nil {
			t.Errorf("auth reply: %v", err)
			return
		}

		cmd, err := readPacket(conn)
		if err != nil {
			t.Errorf("read cmd: %v", err)
			return
		}
		if cmd.packetType != packetTypeCommand || cmd.payload != "list" {
			t.Errorf("unexpected cmd packet: %#v", cmd)
			return
		}
		if err := writePacket(conn, cmd.requestID, packetTypeResponse, "There are 2/10 players online"); err != nil {
			t.Errorf("cmd reply: %v", err)
		}
	}()

	port := ln.Addr().(*net.TCPAddr).Port
	client := NewClient()
	client.Timeout = 2 * time.Second
	out, stub, err := client.Execute("127.0.0.1", port, "s3cret", "list")
	if err != nil {
		t.Fatalf("Execute: %v", err)
	}
	if stub {
		t.Fatal("expected stub=false for real RCON")
	}
	if out != "There are 2/10 players online" {
		t.Fatalf("unexpected output: %q", out)
	}
	<-done
}

func TestExecuteAuthFailure(t *testing.T) {
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer ln.Close()

	go func() {
		conn, err := ln.Accept()
		if err != nil {
			return
		}
		defer conn.Close()
		auth, err := readPacket(conn)
		if err != nil {
			return
		}
		_ = writePacket(conn, authFailureID, packetTypeCommand, "")
		_ = auth
	}()

	port := ln.Addr().(*net.TCPAddr).Port
	client := NewClient()
	client.Timeout = 2 * time.Second
	_, stub, err := client.Execute("127.0.0.1", port, "wrong", "list")
	if err == nil {
		t.Fatal("expected auth error")
	}
	if stub {
		t.Fatal("auth failure is a real protocol error, not a stub")
	}
}

func TestExecuteMissingHostIsStub(t *testing.T) {
	client := NewClient()
	_, stub, err := client.Execute("", 0, "x", "list")
	if err == nil || !stub {
		t.Fatalf("expected stub config error, got stub=%v err=%v", stub, err)
	}
}

func TestPacketRoundTrip(t *testing.T) {
	r, w := net.Pipe()
	defer r.Close()
	defer w.Close()

	go func() {
		_ = writePacket(w, 42, packetTypeCommand, "save hold")
	}()

	_ = r.SetDeadline(time.Now().Add(time.Second))
	pkt, err := readPacket(r)
	if err != nil {
		t.Fatal(err)
	}
	if pkt.requestID != 42 || pkt.packetType != packetTypeCommand || pkt.payload != "save hold" {
		t.Fatalf("round-trip mismatch: %#v", pkt)
	}
}

func TestReadPacketRejectsTinySize(t *testing.T) {
	r, w := net.Pipe()
	defer r.Close()
	defer w.Close()
	go func() {
		var buf [4]byte
		binary.LittleEndian.PutUint32(buf[:], 4)
		_, _ = w.Write(buf[:])
		_, _ = w.Write([]byte{1, 2, 3, 4})
	}()
	_ = r.SetDeadline(time.Now().Add(time.Second))
	_, err := readPacket(r)
	if err == nil {
		t.Fatal("expected size error")
	}
}
