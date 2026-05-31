package network

import (
	"encoding/binary"
	"fmt"
	"io"
	"net"

	"github.com/vmihailenco/msgpack/v5"
)

const (
	FlagFull    uint8 = 0x00
	FlagDelta   uint8 = 0x01
	FlagCompressed uint8 = 0x02
	FlagAck     uint8 = 0x04
)

type BinaryPacket struct {
	Seq        uint32
	MsgType    uint8
	Flags      uint8
	FieldMask  uint64
	SeqAck     uint32
	Payload    []byte
}

const (
	MsgTypeLogin           uint8 = 1
	MsgTypeLoginOK         uint8 = 2
	MsgTypeJoinRoom        uint8 = 3
	MsgTypeLeaveRoom       uint8 = 4
	MsgTypeRoomState       uint8 = 5
	MsgTypePlayerJoined    uint8 = 6
	MsgTypePlayerLeft      uint8 = 7
	MsgTypePlayerUpdate    uint8 = 8
	MsgTypeEnvUpdate       uint8 = 9
	MsgTypePlatformUpdate  uint8 = 10
	MsgTypePlatformInteract uint8 = 11
	MsgTypeChat            uint8 = 12
	MsgTypeSaveMatch       uint8 = 13
	MsgTypeLoadMatch       uint8 = 14
	MsgTypeSaveOK          uint8 = 15
	MsgTypeLoadOK          uint8 = 16
	MsgTypeLoadFail        uint8 = 17
	MsgTypeRequestResources uint8 = 18
	MsgTypeResourcesList   uint8 = 19
	MsgTypeHeartbeat       uint8 = 20
	MsgTypeHeartbeatAck    uint8 = 21
	MsgTypeExtremeEvent    uint8 = 22
	MsgTypeAck             uint8 = 23
)

const (
	EnvFieldWeather        uint64 = 1 << 0
	EnvFieldWindSpeed      uint64 = 1 << 1
	EnvFieldWindDirection  uint64 = 1 << 2
	EnvFieldGravity        uint64 = 1 << 3
	EnvFieldTemperature    uint64 = 1 << 4
	EnvFieldVisibility     uint64 = 1 << 5
	EnvFieldPressure       uint64 = 1 << 6
	EnvFieldCloudDensity   uint64 = 1 << 7
	EnvFieldLightning      uint64 = 1 << 8
	EnvFieldAurora         uint64 = 1 << 9
	EnvFieldTimeOfDay      uint64 = 1 << 10
	EnvFieldAltitude       uint64 = 1 << 11
	EnvFieldTick           uint64 = 1 << 12
	EnvFieldSeq            uint64 = 1 << 13
	EnvFieldSnapshotTs     uint64 = 1 << 14
)

const (
	PlayerFieldPosX        uint64 = 1 << 0
	PlayerFieldPosY        uint64 = 1 << 1
	PlayerFieldPosZ        uint64 = 1 << 2
	PlayerFieldVelX        uint64 = 1 << 3
	PlayerFieldVelY        uint64 = 1 << 4
	PlayerFieldVelZ        uint64 = 1 << 5
	PlayerFieldHealth      uint64 = 1 << 6
	PlayerFieldEnergy      uint64 = 1 << 7
	PlayerFieldIsFlying    uint64 = 1 << 8
	PlayerFieldRotY        uint64 = 1 << 9
)

const (
	PlatformFieldPosX      uint64 = 1 << 0
	PlatformFieldPosY      uint64 = 1 << 1
	PlatformFieldPosZ      uint64 = 1 << 2
	PlatformFieldStability uint64 = 1 << 3
	PlatformFieldIsAnchored uint64 = 1 << 4
)

const (
	MsgTypeToName = 0
	NameToMsgType = 1
)

var msgTypeMap = map[string]uint8{
	"login":            MsgTypeLogin,
	"login_ok":         MsgTypeLoginOK,
	"join_room":        MsgTypeJoinRoom,
	"leave_room":       MsgTypeLeaveRoom,
	"room_state":       MsgTypeRoomState,
	"player_joined":    MsgTypePlayerJoined,
	"player_left":      MsgTypePlayerLeft,
	"player_update":    MsgTypePlayerUpdate,
	"env_update":       MsgTypeEnvUpdate,
	"platform_updated": MsgTypePlatformUpdate,
	"platform_interact":MsgTypePlatformInteract,
	"chat":             MsgTypeChat,
	"save_match":       MsgTypeSaveMatch,
	"load_match":       MsgTypeLoadMatch,
	"save_match_ok":    MsgTypeSaveOK,
	"load_match_ok":    MsgTypeLoadOK,
	"load_match_fail":  MsgTypeLoadFail,
	"request_resources":MsgTypeRequestResources,
	"resources_list":   MsgTypeResourcesList,
	"heartbeat":        MsgTypeHeartbeat,
	"heartbeat_ack":    MsgTypeHeartbeatAck,
	"extreme_event":    MsgTypeExtremeEvent,
}

var msgTypeToName = map[uint8]string{
	MsgTypeLogin:           "login",
	MsgTypeLoginOK:         "login_ok",
	MsgTypeJoinRoom:        "join_room",
	MsgTypeLeaveRoom:       "leave_room",
	MsgTypeRoomState:       "room_state",
	MsgTypePlayerJoined:    "player_joined",
	MsgTypePlayerLeft:      "player_left",
	MsgTypePlayerUpdate:    "player_update",
	MsgTypeEnvUpdate:       "env_update",
	MsgTypePlatformUpdate:  "platform_updated",
	MsgTypePlatformInteract:"platform_interact",
	MsgTypeChat:            "chat",
	MsgTypeSaveMatch:       "save_match",
	MsgTypeLoadMatch:       "load_match",
	MsgTypeSaveOK:          "save_match_ok",
	MsgTypeLoadOK:          "load_match_ok",
	MsgTypeLoadFail:        "load_match_fail",
	MsgTypeRequestResources:"request_resources",
	MsgTypeResourcesList:   "resources_list",
	MsgTypeHeartbeat:       "heartbeat",
	MsgTypeHeartbeatAck:    "heartbeat_ack",
	MsgTypeExtremeEvent:    "extreme_event",
}

func GetMsgType(name string) uint8 {
	if t, ok := msgTypeMap[name]; ok {
		return t
	}
	return 0
}

func GetMsgName(t uint8) string {
	if n, ok := msgTypeToName[t]; ok {
		return n
	}
	return "unknown"
}

func ReadBinaryPacket(conn net.Conn) (*BinaryPacket, error) {
	header := make([]byte, 16)
	if _, err := io.ReadFull(conn, header); err != nil {
		return nil, fmt.Errorf("read header: %w", err)
	}

	pkt := &BinaryPacket{
		Seq:       binary.BigEndian.Uint32(header[0:4]),
		MsgType:   header[4],
		Flags:     header[5],
		FieldMask: binary.BigEndian.Uint64(header[6:14]),
	}

	payloadSize := binary.BigEndian.Uint16(header[14:16])

	if payloadSize > 0 {
		pkt.Payload = make([]byte, payloadSize)
		if _, err := io.ReadFull(conn, pkt.Payload); err != nil {
			return nil, fmt.Errorf("read payload: %w", err)
		}
	}

	return pkt, nil
}

func WriteBinaryPacket(conn net.Conn, pkt *BinaryPacket) error {
	header := make([]byte, 16)
	binary.BigEndian.PutUint32(header[0:4], pkt.Seq)
	header[4] = pkt.MsgType
	header[5] = pkt.Flags
	binary.BigEndian.PutUint64(header[6:14], pkt.FieldMask)
	binary.BigEndian.PutUint16(header[14:16], uint16(len(pkt.Payload)))

	if _, err := conn.Write(header); err != nil {
		return fmt.Errorf("write header: %w", err)
	}

	if len(pkt.Payload) > 0 {
		if _, err := conn.Write(pkt.Payload); err != nil {
			return fmt.Errorf("write payload: %w", err)
		}
	}

	return nil
}

func MarshalBinaryPayload(v interface{}) ([]byte, error) {
	return msgpack.Marshal(v)
}

func UnmarshalBinaryPayload(data []byte, v interface{}) error {
	return msgpack.Unmarshal(data, v)
}

func MakeBinaryPacket(msgType uint8, fieldMask uint64, payload interface{}) (*BinaryPacket, error) {
	pkt := &BinaryPacket{
		MsgType:   msgType,
		FieldMask: fieldMask,
	}

	if payload != nil {
		data, err := MarshalBinaryPayload(payload)
		if err != nil {
			return nil, err
		}
		pkt.Payload = data
	}

	return pkt, nil
}

func MakeDeltaPacket(msgType uint8, fieldMask uint64, payload interface{}) (*BinaryPacket, error) {
	pkt, err := MakeBinaryPacket(msgType, fieldMask, payload)
	if err != nil {
		return nil, err
	}
	pkt.Flags |= FlagDelta
	return pkt, nil
}
