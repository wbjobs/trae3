package server

import (
	"encoding/json"
	"fmt"
	"log"
	"net"
	"sync"
	"sync/atomic"
	"time"

	"floating-server/models"
	"floating-server/network"
)

type Server struct {
	addr              string
	listener          net.Listener
	connManager       *network.ConnectionManager
	roomManager       *RoomManager
	envSimulator      *EnvironmentSimulator
	saveManager       *OptimizedSaveManager
	resourceManager   *ResourceManager
	extremeEventMgr   *ExtremeEventManager
	deltaEncoders     map[string]*DeltaEncoder
	deltaEncoderMutex sync.RWMutex
	shutdown          chan struct{}
	wg                sync.WaitGroup
	useBinaryProtocol bool
	seqCounter        uint32
}

func NewServer(addr string) *Server {
	s := &Server{
		addr:              addr,
		connManager:       network.NewConnectionManager(),
		deltaEncoders:     make(map[string]*DeltaEncoder),
		shutdown:          make(chan struct{}),
		useBinaryProtocol: true,
	}
	s.roomManager = NewRoomManager(s)
	s.envSimulator = NewEnvironmentSimulator(s)
	s.saveManager = NewOptimizedSaveManager()
	s.resourceManager = NewResourceManager()
	s.extremeEventMgr = NewExtremeEventManager(s)
	return s
}

func (s *Server) Start() error {
	listener, err := net.Listen("tcp", s.addr)
	if err != nil {
		return fmt.Errorf("listen: %w", err)
	}
	s.listener = listener

	s.wg.Add(1)
	go s.envSimulator.Run(s.shutdown, &s.wg)

	s.wg.Add(1)
	go s.extremeEventTicker()

	log.Printf("[Server] Listening on %s, binary protocol: %v", s.addr, s.useBinaryProtocol)

	for {
		conn, err := listener.Accept()
		if err != nil {
			select {
			case <-s.shutdown:
				return nil
			default:
				log.Printf("[Server] Accept error: %v", err)
				continue
			}
		}

		s.wg.Add(1)
		go s.handleConnection(conn)
	}
}

func (s *Server) Stop() {
	close(s.shutdown)
	s.saveManager.Stop()
	if s.listener != nil {
		s.listener.Close()
	}
	s.wg.Wait()
	log.Println("[Server] Stopped")
}

func (s *Server) extremeEventTicker() {
	defer s.wg.Done()

	ticker := time.NewTicker(500 * time.Millisecond)
	defer ticker.Stop()

	for {
		select {
		case <-s.shutdown:
			return
		case <-ticker.C:
			rooms := s.roomManager.ListRooms()
			now := time.Now().UnixMilli()
			for _, room := range rooms {
				s.extremeEventMgr.Tick(now, room)
			}
		}
	}
}

func (s *Server) handleConnection(conn net.Conn) {
	defer s.wg.Done()
	defer conn.Close()

	conn.SetReadDeadline(time.Time{})

	netConn := conn
	c := network.NewConnection(netConn, "")
	s.connManager.Add(c)

	s.deltaEncoderMutex.Lock()
	s.deltaEncoders[c.ID] = NewDeltaEncoder()
	s.deltaEncoderMutex.Unlock()

	log.Printf("[Server] New connection: %s", c.ID)

	defer func() {
		s.connManager.Remove(c.ID)
		s.deltaEncoderMutex.Lock()
		delete(s.deltaEncoders, c.ID)
		s.deltaEncoderMutex.Unlock()
		if c.RoomID != "" {
			s.roomManager.RemovePlayer(c.RoomID, c.PlayerID)
			s.connManager.BroadcastInRoom(c.RoomID, "player_left", map[string]string{
				"player_id": c.PlayerID,
			}, c.ID)
		}
		log.Printf("[Server] Disconnected: %s", c.ID)
	}()

	lastActivity := time.Now()
	const idleTimeout = 30 * time.Second

	for {
		select {
		case <-s.shutdown:
			return
		default:
		}

		conn.SetReadDeadline(time.Now().Add(5 * time.Second))

		var pktType string
		var payload interface{}
		var isBinary bool

		if s.useBinaryProtocol {
			binPkt, err := network.ReadBinaryPacket(conn)
			if err != nil {
				if netErr, ok := err.(net.Error); ok && netErr.Timeout() {
					if time.Since(lastActivity) > idleTimeout {
						log.Printf("[Server] Connection idle timeout: %s", c.ID)
						return
					}
					continue
				}
				return
			}
			lastActivity = time.Now()
			pktType = network.GetMsgName(binPkt.MsgType)
			payload = binPkt
			isBinary = true
		} else {
			jsonPkt, err := network.ReadPacket(conn)
			if err != nil {
				if netErr, ok := err.(net.Error); ok && netErr.Timeout() {
					if time.Since(lastActivity) > idleTimeout {
						log.Printf("[Server] Connection idle timeout: %s", c.ID)
						return
					}
					continue
				}
				return
			}
			lastActivity = time.Now()
			pktType = jsonPkt.Type
			payload = jsonPkt
			isBinary = false
		}

		s.handlePacket(c, pktType, payload, isBinary)
	}
}

func (s *Server) handlePacket(c *network.Connection, pktType string, payload interface{}, isBinary bool) {
	switch pktType {
	case "heartbeat":
		sendAck(c, "heartbeat_ack", map[string]int64{"ts": time.Now().UnixMilli()})

	case "login":
		s.handleLogin(c, payload, isBinary)

	case "join_room":
		s.handleJoinRoom(c, payload, isBinary)

	case "leave_room":
		s.handleLeaveRoom(c, payload, isBinary)

	case "player_update":
		s.handlePlayerUpdate(c, payload, isBinary)

	case "platform_interact":
		s.handlePlatformInteract(c, payload, isBinary)

	case "chat":
		s.handleChat(c, payload, isBinary)

	case "save_match":
		s.handleSaveMatch(c)

	case "load_match":
		s.handleLoadMatch(c, payload, isBinary)

	case "request_resources":
		s.handleRequestResources(c, payload, isBinary)

	default:
		log.Printf("[Server] Unknown packet type: %s", pktType)
	}
}

func sendAck(c *network.Connection, msgType string, data interface{}) {
	c.SendTyped(msgType, data)
}

func (s *Server) nextSeq() uint32 {
	return atomic.AddUint32(&s.seqCounter, 1)
}

func (s *Server) getDeltaEncoder(connID string) *DeltaEncoder {
	s.deltaEncoderMutex.RLock()
	defer s.deltaEncoderMutex.RUnlock()
	return s.deltaEncoders[connID]
}

type LoginPayload struct {
	PlayerID string `json:"player_id"`
	Name     string `json:"name"`
}

func (s *Server) handleLogin(c *network.Connection, payload interface{}, isBinary bool) {
	var p LoginPayload

	if isBinary {
		bp := payload.(*network.BinaryPacket)
		if len(bp.Payload) > 0 {
			network.UnmarshalBinaryPayload(bp.Payload, &p)
		}
	} else {
		json.Unmarshal(payload.(*network.Packet).Payload, &p)
	}

	c.PlayerID = p.PlayerID

	respData := map[string]string{
		"connection_id": c.ID,
		"player_id":     c.PlayerID,
		"binary":        fmt.Sprintf("%v", s.useBinaryProtocol),
	}

	c.SendTyped("login_ok", respData)
	log.Printf("[Server] Player %s logged in, binary: %v", c.PlayerID, s.useBinaryProtocol)
}

type JoinRoomPayload struct {
	RoomID string `json:"room_id"`
	Name   string `json:"name"`
}

func (s *Server) handleJoinRoom(c *network.Connection, payload interface{}, isBinary bool) {
	var p JoinRoomPayload
	if isBinary {
		bp := payload.(*network.BinaryPacket)
		if len(bp.Payload) > 0 {
			network.UnmarshalBinaryPayload(bp.Payload, &p)
		}
	} else {
		json.Unmarshal(payload.(*network.Packet).Payload, &p)
	}

	room := s.roomManager.GetOrCreateRoom(p.RoomID, p.Name)
	c.RoomID = room.RoomID

	playerState := &models.PlayerState{
		PlayerID:   c.PlayerID,
		Name:       p.Name,
		Position:   models.Vector3{X: 0, Y: 10, Z: 0},
		Health:     100,
		Energy:     100,
		LastUpdate: time.Now().UnixMilli(),
	}

	s.roomManager.AddPlayer(room.RoomID, c.PlayerID, playerState)

	c.SendTyped("room_state", room)

	s.connManager.BroadcastInRoom(room.RoomID, "player_joined", playerState, c.ID)

	log.Printf("[Server] Player %s joined room %s", c.PlayerID, room.RoomID)
}

func (s *Server) handleLeaveRoom(c *network.Connection, _payload interface{}, _isBinary bool) {
	if c.RoomID == "" {
		return
	}
	roomID := c.RoomID
	s.roomManager.RemovePlayer(roomID, c.PlayerID)
	c.RoomID = ""

	s.connManager.BroadcastInRoom(roomID, "player_left", map[string]string{
		"player_id": c.PlayerID,
	})
}

func (s *Server) handlePlayerUpdate(c *network.Connection, payload interface{}, isBinary bool) {
	if c.RoomID == "" {
		return
	}

	var state models.PlayerState

	if isBinary {
		bp := payload.(*network.BinaryPacket)
		if len(bp.Payload) > 0 {
			network.UnmarshalBinaryPayload(bp.Payload, &state)
		}
	} else {
		json.Unmarshal(payload.(*network.Packet).Payload, &state)
	}

	state.PlayerID = c.PlayerID
	state.LastUpdate = time.Now().UnixMilli()

	s.roomManager.UpdatePlayerState(c.RoomID, c.PlayerID, &state)

	if s.useBinaryProtocol {
		enc := s.getDeltaEncoder(c.ID)
		if enc != nil {
			mask, delta := enc.EncodePlayerDelta(c.PlayerID, &state)
			binPkt, _ := network.MakeDeltaPacket(network.MsgTypePlayerUpdate, mask, delta)
			binPkt.Seq = s.nextSeq()
			s.connManager.BroadcastBinaryInRoom(c.RoomID, binPkt, c.ID)
			return
		}
	}

	s.connManager.BroadcastInRoom(c.RoomID, "player_updated", &state, c.ID)
}

type PlatformInteractPayload struct {
	PlatformID string          `json:"platform_id"`
	Action     string          `json:"action"`
	Params     json.RawMessage `json:"params"`
}

func (s *Server) handlePlatformInteract(c *network.Connection, payload interface{}, isBinary bool) {
	if c.RoomID == "" {
		return
	}

	var p PlatformInteractPayload
	if isBinary {
		bp := payload.(*network.BinaryPacket)
		if len(bp.Payload) > 0 {
			network.UnmarshalBinaryPayload(bp.Payload, &p)
		}
	} else {
		json.Unmarshal(payload.(*network.Packet).Payload, &p)
	}

	room := s.roomManager.GetRoom(c.RoomID)
	if room == nil {
		return
	}

	platform, ok := room.Platforms[p.PlatformID]
	if !ok {
		return
	}

	switch p.Action {
	case "anchor":
		platform.IsAnchored = !platform.IsAnchored
	case "stabilize":
		platform.Stability = 1.0
		platform.Velocity = models.Vector3{}
	}

	snapshot := platform.Clone()

	if s.useBinaryProtocol {
		enc := s.getDeltaEncoder(c.ID)
		if enc != nil {
			mask, delta := enc.EncodePlatformDelta(p.PlatformID, platform)
			binPkt, _ := network.MakeDeltaPacket(network.MsgTypePlatformUpdate, mask, delta)
			binPkt.Seq = s.nextSeq()
			s.connManager.BroadcastBinaryInRoom(c.RoomID, binPkt)
			return
		}
	}

	s.connManager.BroadcastInRoom(c.RoomID, "platform_updated", snapshot)
}

type ChatPayload struct {
	Message string `json:"message"`
}

func (s *Server) handleChat(c *network.Connection, payload interface{}, isBinary bool) {
	if c.RoomID == "" {
		return
	}

	var p ChatPayload
	if isBinary {
		bp := payload.(*network.BinaryPacket)
		if len(bp.Payload) > 0 {
			network.UnmarshalBinaryPayload(bp.Payload, &p)
		}
	} else {
		json.Unmarshal(payload.(*network.Packet).Payload, &p)
	}

	s.connManager.BroadcastInRoom(c.RoomID, "chat", map[string]string{
		"player_id": c.PlayerID,
		"message":   p.Message,
	})
}

func (s *Server) handleSaveMatch(c *network.Connection) {
	if c.RoomID == "" {
		return
	}

	room := s.roomManager.GetRoom(c.RoomID)
	if room == nil {
		return
	}

	saveIDCh := s.saveManager.SaveAsync(room)

	go func() {
		saveID := <-saveIDCh
		c.SendTyped("save_match_ok", map[string]string{
			"save_id": saveID,
		})
		log.Printf("[Server] Match saved (async): %s", saveID)
	}()
}

type LoadMatchPayload struct {
	SaveID string `json:"save_id"`
}

func (s *Server) handleLoadMatch(c *network.Connection, payload interface{}, isBinary bool) {
	var p LoadMatchPayload
	if isBinary {
		bp := payload.(*network.BinaryPacket)
		if len(bp.Payload) > 0 {
			network.UnmarshalBinaryPayload(bp.Payload, &p)
		}
	} else {
		json.Unmarshal(payload.(*network.Packet).Payload, &p)
	}

	resultCh, doneCh := s.saveManager.LoadAsync(p.SaveID)

	go func() {
		save := <-resultCh
		ok := <-doneCh

		if !ok {
			c.SendTyped("load_match_fail", map[string]string{
				"error": "save not found",
			})
			return
		}

		c.SendTyped("load_match_ok", save)
		log.Printf("[Server] Match loaded (async): %s", p.SaveID)
	}()
}

type RequestResourcesPayload struct {
	Category string `json:"category"`
}

func (s *Server) handleRequestResources(c *network.Connection, payload interface{}, isBinary bool) {
	var p RequestResourcesPayload
	if isBinary {
		bp := payload.(*network.BinaryPacket)
		if len(bp.Payload) > 0 {
			network.UnmarshalBinaryPayload(bp.Payload, &p)
		}
	} else {
		json.Unmarshal(payload.(*network.Packet).Payload, &p)
	}

	resources := s.resourceManager.GetByCategory(p.Category)
	c.SendTyped("resources_list", resources)
}

func (s *Server) BroadcastEnvUpdate(roomID string, snapshot *models.EnvironmentState) {
	conns := s.connManager.ListByRoom(roomID)
	for _, c := range conns {
		enc := s.getDeltaEncoder(c.ID)
		if enc == nil {
			continue
		}

		mask, delta := enc.EncodeEnvDelta(snapshot)

		binPkt, err := network.MakeDeltaPacket(network.MsgTypeEnvUpdate, mask, delta)
		if err != nil {
			continue
		}
		binPkt.Seq = s.nextSeq()

		netConn, ok := c.Conn.(net.Conn)
		if ok {
			network.WriteBinaryPacket(netConn, binPkt)
		}
	}
}

func (s *Server) GetConnectionManager() *network.ConnectionManager {
	return s.connManager
}

func (s *Server) GetRoomManager() *RoomManager {
	return s.roomManager
}

func (s *Server) GetExtremeEventManager() *ExtremeEventManager {
	return s.extremeEventMgr
}
