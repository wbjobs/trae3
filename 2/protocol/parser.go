package protocol

import (
	"encoding/binary"
	"fmt"
	"sync"
	"time"

	"industrial-protocol-gateway/common"
)

type ProtocolType string

const (
	ProtocolModbus ProtocolType = "modbus"
	ProtocolIEC104 ProtocolType = "iec104"
)

type FunctionCode string

const (
	FuncReadCoils          FunctionCode = "read_coils"
	FuncReadDiscreteInputs FunctionCode = "read_discrete_inputs"
	FuncReadHoldingRegs    FunctionCode = "read_holding_registers"
	FuncReadInputRegs      FunctionCode = "read_input_registers"
	FuncWriteSingleCoil    FunctionCode = "write_single_coil"
	FuncWriteSingleReg     FunctionCode = "write_single_register"
	FuncWriteMultipleCoils FunctionCode = "write_multiple_coils"
	FuncWriteMultipleRegs  FunctionCode = "write_multiple_registers"
)

type ParseResult struct {
	Protocol    ProtocolType `json:"protocol"`
	Timestamp   time.Time    `json:"timestamp"`
	DeviceID    string       `json:"device_id"`
	SlaveID     uint8        `json:"slave_id,omitempty"`
	Function    FunctionCode `json:"function,omitempty"`
	StartAddr   uint16       `json:"start_addr,omitempty"`
	Quantity    uint16       `json:"quantity,omitempty"`
	RawData     string       `json:"raw_data"`
	DataPoints  []DataPoint  `json:"data_points"`
	ChecksumOK  bool         `json:"checksum_ok"`
	ParseError  string       `json:"parse_error,omitempty"`
	ForwardDest []string     `json:"forward_dest,omitempty"`
	MessageType string       `json:"message_type,omitempty"`
	ASDU        *ASDUData    `json:"asdu,omitempty"`
}

type DataPoint struct {
	Tag       string      `json:"tag"`
	Address   uint16      `json:"address"`
	Value     interface{} `json:"value"`
	Quality   uint8       `json:"quality"`
	Timestamp time.Time   `json:"timestamp"`
}

type ASDUData struct {
	TypeID       uint8        `json:"type_id"`
	TypeName     string       `json:"type_name"`
	VSQ          uint8        `json:"vsq"`
	NumPoints    int          `json:"num_points"`
	COT          uint8        `json:"cot"`
	COTName      string       `json:"cot_name"`
	CA           uint16       `json:"ca"`
	IOA          []uint32     `json:"ioa"`
	Values       []DataPoint  `json:"values"`
}

type Parser interface {
	Parse(data []byte) (*ParseResult, error)
	BuildRequest(req *Request) ([]byte, error)
	Validate(data []byte) bool
	GetProtocol() ProtocolType
}

type Request struct {
	Protocol  ProtocolType
	SlaveID   uint8
	Function  FunctionCode
	Address   uint16
	Quantity  uint16
	Value     interface{}
	Values    []interface{}
	DeviceID  string
	Timestamp time.Time
}

var (
	parsers     map[ProtocolType]Parser
	parsersOnce sync.Once
)

func InitParser() {
	parsersOnce.Do(func() {
		parsers = make(map[ProtocolType]Parser)
		parsers[ProtocolModbus] = NewModbusParser()
		parsers[ProtocolIEC104] = NewIEC104Parser()
	})
}

func GetParser(protocol ProtocolType) (Parser, error) {
	if parsers == nil {
		InitParser()
	}
	parser, ok := parsers[protocol]
	if !ok {
		return nil, fmt.Errorf("%w: %s", common.ErrInvalidProtocol, protocol)
	}
	return parser, nil
}

func Parse(protocol ProtocolType, data []byte) (*ParseResult, error) {
	parser, err := GetParser(protocol)
	if err != nil {
		return nil, err
	}
	return parser.Parse(data)
}

func Validate(protocol ProtocolType, data []byte) bool {
	parser, err := GetParser(protocol)
	if err != nil {
		return false
	}
	return parser.Validate(data)
}

func BuildRequest(req *Request) ([]byte, error) {
	parser, err := GetParser(req.Protocol)
	if err != nil {
		return nil, err
	}
	return parser.BuildRequest(req)
}

func GetSupportedProtocols() []ProtocolType {
	return []ProtocolType{ProtocolModbus, ProtocolIEC104}
}

func DetectProtocol(data []byte) ProtocolType {
	if len(data) < 4 {
		return ""
	}

	if len(data) >= 6 {
		if data[0] == IEC104StartByte {
			length := data[1]
			if int(length) == len(data)-2 && length >= 4 && length <= 253 {
				apciType := data[2] & 0x03
				if apciType == 0 || apciType == 1 || apciType == 3 {
					return ProtocolIEC104
				}
			}
		}
	}

	if len(data) >= ModbusMinLen {
		if isModbusRTU(data) {
			return ProtocolModbus
		}
		if isModbusTCP(data) {
			return ProtocolModbus
		}
	}

	if len(data) >= 3 {
		funcCode := data[1]
		if _, ok := functionCodeMap[funcCode]; ok {
			if len(data) >= 5 {
				return ProtocolModbus
			}
		}
	}

	return ""
}

func isModbusRTU(data []byte) bool {
	if len(data) < ModbusMinLen {
		return false
	}

	funcCode := data[1]
	if _, ok := functionCodeMap[funcCode]; !ok {
		return false
	}

	var expectedLen int
	switch funcCode {
	case ModbusFuncReadCoils, ModbusFuncReadDiscreteInputs,
		ModbusFuncReadHoldingRegs, ModbusFuncReadInputRegs:
		expectedLen = 8
	case ModbusFuncWriteSingleCoil, ModbusFuncWriteSingleReg:
		expectedLen = 8
	case ModbusFuncWriteMultipleCoils, ModbusFuncWriteMultipleRegs:
		if len(data) < 7 {
			return false
		}
		byteCount := data[6]
		expectedLen = int(byteCount) + 9
	default:
		return false
	}

	if len(data) == expectedLen {
		crc := common.ChecksumCRC16(data[:len(data)-2])
		expectedCRC := uint16(data[len(data)-2]) | (uint16(data[len(data)-1]) << 8)
		if crc == expectedCRC {
			return true
		}
	}

	return false
}

func isModbusTCP(data []byte) bool {
	if len(data) < ModbusTCPHeader+3 {
		return false
	}

	protocolID := binary.BigEndian.Uint16(data[2:4])
	if protocolID != 0 {
		return false
	}

	length := binary.BigEndian.Uint16(data[4:6])
	if int(length) != len(data)-6 {
		return false
	}

	funcCode := data[7]
	_, ok := functionCodeMap[funcCode]
	return ok
}

type ParseError struct {
	Protocol ProtocolType
	Reason   string
	Offset   int
	Data     []byte
}

func (e *ParseError) Error() string {
	return fmt.Sprintf("parse %s error at offset %d: %s, data: %X",
		e.Protocol, e.Offset, e.Reason, e.Data)
}
