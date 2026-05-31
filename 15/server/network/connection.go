package network

import (
	"encoding/json"
	"net"
	"sync"
	"time"

	"github.com/google/uuid"
)

type Connection struct {
	ID        string
	Conn      interface{}
	PlayerID  string
	RoomID    string
	Connected time.Time
	mu        sync.Mutex
	UseBinary bool
}

func NewConnection(conn interface{}, playerID string) *Connection {
	return &Connection{
		ID:        uuid.New().String(),
		Conn:      conn,
		PlayerID:  playerID,
		Connected: time.Now(),
	}
}

func (c *Connection) Send(pkt *Packet) error {
	c.mu.Lock()
	defer c.mu.Unlock()

	netConn, ok := c.Conn.(net.Conn)
	if !ok {
		return ErrInvalidConnection
	}
	return WritePacket(netConn, pkt)
}

func (c *Connection) SendBinary(binPkt *BinaryPacket) error {
	c.mu.Lock()
	defer c.mu.Unlock()

	netConn, ok := c.Conn.(net.Conn)
	if !ok {
		return ErrInvalidConnection
	}
	return WriteBinaryPacket(netConn, binPkt)
}

func (c *Connection) SendTyped(msgType string, payload interface{}) error {
	pkt, err := MakePacket(msgType, payload)
	if err != nil {
		return err
	}
	return c.Send(pkt)
}

type ConnectionManager struct {
	connections map[string]*Connection
	mu          sync.RWMutex
}

func NewConnectionManager() *ConnectionManager {
	return &ConnectionManager{
		connections: make(map[string]*Connection),
	}
}

func (cm *ConnectionManager) Add(conn *Connection) {
	cm.mu.Lock()
	defer cm.mu.Unlock()
	cm.connections[conn.ID] = conn
}

func (cm *ConnectionManager) Remove(id string) {
	cm.mu.Lock()
	defer cm.mu.Unlock()
	delete(cm.connections, id)
}

func (cm *ConnectionManager) Get(id string) (*Connection, bool) {
	cm.mu.RLock()
	defer cm.mu.RUnlock()
	c, ok := cm.connections[id]
	return c, ok
}

func (cm *ConnectionManager) GetByPlayer(playerID string) (*Connection, bool) {
	cm.mu.RLock()
	defer cm.mu.RUnlock()
	for _, c := range cm.connections {
		if c.PlayerID == playerID {
			return c, true
		}
	}
	return nil, false
}

func (cm *ConnectionManager) BroadcastInRoom(roomID string, msgType string, payload interface{}, exclude ...string) {
	pkt, err := MakePacket(msgType, payload)
	if err != nil {
		return
	}

	cm.mu.RLock()
	defer cm.mu.RUnlock()

	excludeSet := make(map[string]bool)
	for _, id := range exclude {
		excludeSet[id] = true
	}

	for _, c := range cm.connections {
		if c.RoomID == roomID && !excludeSet[c.ID] {
			_ = c.Send(pkt)
		}
	}
}

func (cm *ConnectionManager) BroadcastBinaryInRoom(roomID string, binPkt *BinaryPacket, exclude ...string) {
	cm.mu.RLock()
	defer cm.mu.RUnlock()

	excludeSet := make(map[string]bool)
	for _, id := range exclude {
		excludeSet[id] = true
	}

	for _, c := range cm.connections {
		if c.RoomID == roomID && !excludeSet[c.ID] {
			_ = c.SendBinary(binPkt)
		}
	}
}

func (cm *ConnectionManager) ListByRoom(roomID string) []*Connection {
	cm.mu.RLock()
	defer cm.mu.RUnlock()

	var result []*Connection
	for _, c := range cm.connections {
		if c.RoomID == roomID {
			result = append(result, c)
		}
	}
	return result
}

var ErrInvalidConnection = &ConnectionError{"invalid connection type"}

type ConnectionError struct {
	msg string
}

func (e *ConnectionError) Error() string {
	return e.msg
}
