package network

import (
	"encoding/binary"
	"encoding/json"
	"fmt"
	"io"
	"net"
)

const (
	MaxPacketSize = 65536
	HeaderSize    = 4
)

type Packet struct {
	Type    string          `json:"type"`
	Payload json.RawMessage `json:"payload"`
}

func ReadPacket(conn net.Conn) (*Packet, error) {
	header := make([]byte, HeaderSize)
	if _, err := io.ReadFull(conn, header); err != nil {
		return nil, fmt.Errorf("read header: %w", err)
	}

	size := binary.BigEndian.Uint32(header)
	if size > MaxPacketSize {
		return nil, fmt.Errorf("packet too large: %d", size)
	}

	data := make([]byte, size)
	if _, err := io.ReadFull(conn, data); err != nil {
		return nil, fmt.Errorf("read body: %w", err)
	}

	var pkt Packet
	if err := json.Unmarshal(data, &pkt); err != nil {
		return nil, fmt.Errorf("unmarshal: %w", err)
	}

	return &pkt, nil
}

func WritePacket(conn net.Conn, pkt *Packet) error {
	data, err := json.Marshal(pkt)
	if err != nil {
		return fmt.Errorf("marshal: %w", err)
	}

	if len(data) > MaxPacketSize {
		return fmt.Errorf("packet too large: %d", len(data))
	}

	header := make([]byte, HeaderSize)
	binary.BigEndian.PutUint32(header, uint32(len(data)))

	if _, err := conn.Write(header); err != nil {
		return fmt.Errorf("write header: %w", err)
	}
	if _, err := conn.Write(data); err != nil {
		return fmt.Errorf("write body: %w", err)
	}

	return nil
}

func MakePacket(msgType string, payload interface{}) (*Packet, error) {
	data, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}
	return &Packet{
		Type:    msgType,
		Payload: data,
	}, nil
}
