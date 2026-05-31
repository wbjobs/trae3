package protocol

import (
	"encoding/binary"
	"fmt"
	"math"
	"time"

	"industrial-protocol-gateway/common"
	"industrial-protocol-gateway/logger"
)

type ModbusParser struct {
	protocol ProtocolType
}

const (
	ModbusFuncReadCoils          uint8 = 0x01
	ModbusFuncReadDiscreteInputs uint8 = 0x02
	ModbusFuncReadHoldingRegs    uint8 = 0x03
	ModbusFuncReadInputRegs      uint8 = 0x04
	ModbusFuncWriteSingleCoil    uint8 = 0x05
	ModbusFuncWriteSingleReg     uint8 = 0x06
	ModbusFuncWriteMultipleCoils uint8 = 0x0F
	ModbusFuncWriteMultipleRegs  uint8 = 0x10

	ModbusMinLen    = 5
	ModbusTCPHeader = 6
	ModbusCRCLen    = 2
)

var functionCodeMap = map[uint8]FunctionCode{
	ModbusFuncReadCoils:          FuncReadCoils,
	ModbusFuncReadDiscreteInputs: FuncReadDiscreteInputs,
	ModbusFuncReadHoldingRegs:    FuncReadHoldingRegs,
	ModbusFuncReadInputRegs:      FuncReadInputRegs,
	ModbusFuncWriteSingleCoil:    FuncWriteSingleCoil,
	ModbusFuncWriteSingleReg:     FuncWriteSingleReg,
	ModbusFuncWriteMultipleCoils: FuncWriteMultipleCoils,
	ModbusFuncWriteMultipleRegs:  FuncWriteMultipleRegs,
}

var functionNameMap = map[uint8]string{
	ModbusFuncReadCoils:          "Read Coils",
	ModbusFuncReadDiscreteInputs: "Read Discrete Inputs",
	ModbusFuncReadHoldingRegs:    "Read Holding Registers",
	ModbusFuncReadInputRegs:      "Read Input Registers",
	ModbusFuncWriteSingleCoil:    "Write Single Coil",
	ModbusFuncWriteSingleReg:     "Write Single Register",
	ModbusFuncWriteMultipleCoils: "Write Multiple Coils",
	ModbusFuncWriteMultipleRegs:  "Write Multiple Registers",
}

func NewModbusParser() *ModbusParser {
	return &ModbusParser{
		protocol: ProtocolModbus,
	}
}

func (p *ModbusParser) GetProtocol() ProtocolType {
	return p.protocol
}

func (p *ModbusParser) Validate(data []byte) bool {
	if len(data) < ModbusMinLen {
		return false
	}

	funcCode := data[1]
	if _, ok := functionCodeMap[funcCode]; !ok {
		return false
	}

	if len(data) > ModbusMinLen {
		crcOffset := len(data) - ModbusCRCLen
		receivedCRC := binary.LittleEndian.Uint16(data[crcOffset:])
		calcCRC := common.ChecksumCRC16(data[:crcOffset])
		return receivedCRC == calcCRC
	}

	return true
}

func (p *ModbusParser) Parse(data []byte) (*ParseResult, error) {
	logger.LogProtocol(string(ProtocolModbus), "in", "", data)

	if len(data) < ModbusMinLen {
		err := &ParseError{
			Protocol: ProtocolModbus,
			Reason:   fmt.Sprintf("packet too short: %d bytes, min %d", len(data), ModbusMinLen),
			Data:     data,
		}
		logger.LogParse(string(ProtocolModbus), false, data, nil, err)
		logger.LogAbnormalPacket(string(ProtocolModbus), data, "packet_too_short", "", err)
		return nil, err
	}

	result := &ParseResult{
		Protocol:  ProtocolModbus,
		Timestamp: time.Now(),
		RawData:   common.BytesToHex(data),
	}

	if len(data) >= ModbusTCPHeader+3 {
		result.MessageType = "tcp"
	} else {
		result.MessageType = "rtu"
	}

	offset := 0
	if result.MessageType == "tcp" {
		offset = ModbusTCPHeader
	}

	result.SlaveID = data[offset]
	funcCode := data[offset+1]

	function, ok := functionCodeMap[funcCode]
	if !ok {
		err := &ParseError{
			Protocol: ProtocolModbus,
			Reason:   fmt.Sprintf("unsupported function code: 0x%02X", funcCode),
			Offset:   offset + 1,
			Data:     data,
		}
		result.ParseError = err.Error()
		logger.LogParse(string(ProtocolModbus), false, data, result, err)
		logger.LogParseError(string(ProtocolModbus), data, offset+1, "unsupported_function_code", err)
		return result, err
	}
	result.Function = function

	crcOffset := len(data) - ModbusCRCLen
	if crcOffset > 0 {
		receivedCRC := binary.LittleEndian.Uint16(data[crcOffset:])
		calcCRC := common.ChecksumCRC16(data[:crcOffset])
		result.ChecksumOK = (receivedCRC == calcCRC)
		if !result.ChecksumOK {
			logger.Warnf("modbus crc mismatch: received 0x%04X, calculated 0x%04X", receivedCRC, calcCRC)
			logger.LogAbnormalPacket(string(ProtocolModbus), data, "crc_mismatch", "",
				fmt.Errorf("crc mismatch: received 0x%04X, calculated 0x%04X", receivedCRC, calcCRC))
		}
	} else {
		result.ChecksumOK = true
	}

	result.DataPoints = p.parseDataPoints(funcCode, data, offset, result)

	logger.LogParse(string(ProtocolModbus), true, data, result, nil)
	return result, nil
}

func (p *ModbusParser) parseDataPoints(funcCode uint8, data []byte, offset int, result *ParseResult) []DataPoint {
	points := make([]DataPoint, 0)

	switch funcCode {
	case ModbusFuncReadCoils, ModbusFuncReadDiscreteInputs:
		if len(data) < offset+4 {
			return points
		}
		result.StartAddr = binary.BigEndian.Uint16(data[offset+2 : offset+4])
		if len(data) < offset+6 {
			return points
		}
		result.Quantity = binary.BigEndian.Uint16(data[offset+4 : offset+6])

		if len(data) > offset+6 {
			byteCount := int(data[offset+3])
			dataStart := offset + 4
			dataEnd := dataStart + byteCount
			if dataEnd > len(data)-2 {
				dataEnd = len(data) - 2
			}
			coilData := data[dataStart:dataEnd]

			for i := uint16(0); i < result.Quantity; i++ {
				byteIdx := i / 8
				bitIdx := i % 8
				value := false
				if int(byteIdx) < len(coilData) {
					value = (coilData[byteIdx]>>bitIdx)&0x01 == 1
				}
				points = append(points, DataPoint{
					Tag:       fmt.Sprintf("coil_%d", result.StartAddr+i),
					Address:   result.StartAddr + i,
					Value:     value,
					Quality:   0,
					Timestamp: time.Now(),
				})
			}
		}

	case ModbusFuncReadHoldingRegs, ModbusFuncReadInputRegs:
		if len(data) < offset+4 {
			return points
		}
		result.StartAddr = binary.BigEndian.Uint16(data[offset+2 : offset+4])
		if len(data) < offset+6 {
			return points
		}
		result.Quantity = binary.BigEndian.Uint16(data[offset+4 : offset+6])

		if len(data) > offset+6 {
			byteCount := int(data[offset+3])
			dataStart := offset + 4
			dataEnd := dataStart + byteCount
			if dataEnd > len(data)-2 {
				dataEnd = len(data) - 2
			}
			regData := data[dataStart:dataEnd]

			for i := uint16(0); i < result.Quantity; i++ {
				regStart := int(i) * 2
				if regStart+2 > len(regData) {
					break
				}
				rawValue := binary.BigEndian.Uint16(regData[regStart : regStart+2])
				points = append(points, DataPoint{
					Tag:       fmt.Sprintf("reg_%d", result.StartAddr+i),
					Address:   result.StartAddr + i,
					Value:     rawValue,
					Quality:   0,
					Timestamp: time.Now(),
				})
			}
		}

	case ModbusFuncWriteSingleCoil:
		if len(data) >= offset+6 {
			result.StartAddr = binary.BigEndian.Uint16(data[offset+2 : offset+4])
			result.Quantity = 1
			value := binary.BigEndian.Uint16(data[offset+4 : offset+6])
			points = append(points, DataPoint{
				Tag:       fmt.Sprintf("coil_%d", result.StartAddr),
				Address:   result.StartAddr,
				Value:     value == 0xFF00,
				Quality:   0,
				Timestamp: time.Now(),
			})
		}

	case ModbusFuncWriteSingleReg:
		if len(data) >= offset+6 {
			result.StartAddr = binary.BigEndian.Uint16(data[offset+2 : offset+4])
			result.Quantity = 1
			value := binary.BigEndian.Uint16(data[offset+4 : offset+6])
			points = append(points, DataPoint{
				Tag:       fmt.Sprintf("reg_%d", result.StartAddr),
				Address:   result.StartAddr,
				Value:     value,
				Quality:   0,
				Timestamp: time.Now(),
			})
		}

	case ModbusFuncWriteMultipleCoils, ModbusFuncWriteMultipleRegs:
		if len(data) >= offset+7 {
			result.StartAddr = binary.BigEndian.Uint16(data[offset+2 : offset+4])
			result.Quantity = binary.BigEndian.Uint16(data[offset+4 : offset+6])
			byteCount := int(data[offset+6])
			dataStart := offset + 7
			dataEnd := dataStart + byteCount
			if dataEnd > len(data)-2 {
				dataEnd = len(data) - 2
			}
			regData := data[dataStart:dataEnd]

			if funcCode == ModbusFuncWriteMultipleCoils {
				for i := uint16(0); i < result.Quantity; i++ {
					byteIdx := i / 8
					bitIdx := i % 8
					value := false
					if int(byteIdx) < len(regData) {
						value = (regData[byteIdx]>>bitIdx)&0x01 == 1
					}
					points = append(points, DataPoint{
						Tag:       fmt.Sprintf("coil_%d", result.StartAddr+i),
						Address:   result.StartAddr + i,
						Value:     value,
						Quality:   0,
						Timestamp: time.Now(),
					})
				}
			} else {
				for i := uint16(0); i < result.Quantity; i++ {
					regStart := int(i) * 2
					if regStart+2 > len(regData) {
						break
					}
					value := binary.BigEndian.Uint16(regData[regStart : regStart+2])
					points = append(points, DataPoint{
						Tag:       fmt.Sprintf("reg_%d", result.StartAddr+i),
						Address:   result.StartAddr + i,
						Value:     value,
						Quality:   0,
						Timestamp: time.Now(),
					})
				}
			}
		}
	}

	return points
}

func (p *ModbusParser) BuildRequest(req *Request) ([]byte, error) {
	if req.Protocol != ProtocolModbus {
		return nil, common.ErrInvalidProtocol
	}

	var funcCode uint8
	for code, name := range functionCodeMap {
		if name == req.Function {
			funcCode = code
			break
		}
	}
	if funcCode == 0 {
		return nil, fmt.Errorf("%w: %s", common.ErrInvalidParameter, req.Function)
	}

	buf := make([]byte, 0, 256)
	buf = append(buf, req.SlaveID)
	buf = append(buf, funcCode)

	switch req.Function {
	case FuncReadCoils, FuncReadDiscreteInputs, FuncReadHoldingRegs, FuncReadInputRegs:
		addrBytes := make([]byte, 2)
		binary.BigEndian.PutUint16(addrBytes, req.Address)
		buf = append(buf, addrBytes...)

		qtyBytes := make([]byte, 2)
		binary.BigEndian.PutUint16(qtyBytes, req.Quantity)
		buf = append(buf, qtyBytes...)

	case FuncWriteSingleCoil:
		addrBytes := make([]byte, 2)
		binary.BigEndian.PutUint16(addrBytes, req.Address)
		buf = append(buf, addrBytes...)

		value := uint16(0x0000)
		if v, ok := req.Value.(bool); ok && v {
			value = 0xFF00
		}
		valBytes := make([]byte, 2)
		binary.BigEndian.PutUint16(valBytes, value)
		buf = append(buf, valBytes...)

	case FuncWriteSingleReg:
		addrBytes := make([]byte, 2)
		binary.BigEndian.PutUint16(addrBytes, req.Address)
		buf = append(buf, addrBytes...)

		valBytes := make([]byte, 2)
		switch v := req.Value.(type) {
		case uint16:
			binary.BigEndian.PutUint16(valBytes, v)
		case int:
			binary.BigEndian.PutUint16(valBytes, uint16(v))
		case float32:
			bits := math.Float32bits(v)
			binary.BigEndian.PutUint16(valBytes, uint16(bits>>16))
		default:
			return nil, fmt.Errorf("unsupported value type: %T", req.Value)
		}
		buf = append(buf, valBytes...)

	case FuncWriteMultipleCoils:
		addrBytes := make([]byte, 2)
		binary.BigEndian.PutUint16(addrBytes, req.Address)
		buf = append(buf, addrBytes...)

		qtyBytes := make([]byte, 2)
		binary.BigEndian.PutUint16(qtyBytes, req.Quantity)
		buf = append(buf, qtyBytes...)

		byteCount := (req.Quantity + 7) / 8
		buf = append(buf, byte(byteCount))

		coilBytes := make([]byte, byteCount)
		for i, v := range req.Values {
			if boolVal, ok := v.(bool); ok && boolVal {
				byteIdx := i / 8
				bitIdx := i % 8
				coilBytes[byteIdx] |= 1 << bitIdx
			}
		}
		buf = append(buf, coilBytes...)

	case FuncWriteMultipleRegs:
		addrBytes := make([]byte, 2)
		binary.BigEndian.PutUint16(addrBytes, req.Address)
		buf = append(buf, addrBytes...)

		qtyBytes := make([]byte, 2)
		binary.BigEndian.PutUint16(qtyBytes, req.Quantity)
		buf = append(buf, qtyBytes...)

		byteCount := req.Quantity * 2
		buf = append(buf, byte(byteCount))

		for _, v := range req.Values {
			valBytes := make([]byte, 2)
			switch val := v.(type) {
			case uint16:
				binary.BigEndian.PutUint16(valBytes, val)
			case int:
				binary.BigEndian.PutUint16(valBytes, uint16(val))
			default:
				return nil, fmt.Errorf("unsupported value type: %T", v)
			}
			buf = append(buf, valBytes...)
		}
	}

	crc := common.ChecksumCRC16(buf)
	crcBytes := make([]byte, 2)
	binary.LittleEndian.PutUint16(crcBytes, crc)
	buf = append(buf, crcBytes...)

	logger.LogProtocol(string(ProtocolModbus), "out", req.DeviceID, buf)
	return buf, nil
}
