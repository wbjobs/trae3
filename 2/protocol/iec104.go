package protocol

import (
	"encoding/binary"
	"fmt"
	"math"
	"time"

	"industrial-protocol-gateway/common"
	"industrial-protocol-gateway/logger"
)

type IEC104Parser struct {
	protocol ProtocolType
}

const (
	IEC104StartByte = 0x68
	IEC104APCIHead  = 4
	IEC104MinLen    = 6

	IEC104TypeSinglePoint       uint8 = 1
	IEC104TypeSinglePointTime   uint8 = 30
	IEC104TypeDoublePoint       uint8 = 3
	IEC104TypeDoublePointTime   uint8 = 31
	IEC104TypeMeasuredNormal    uint8 = 9
	IEC104TypeMeasuredNormalTime uint8 = 34
	IEC104TypeMeasuredFloat     uint8 = 13
	IEC104TypeMeasuredFloatTime uint8 = 36
	IEC104TypeStepPosition      uint8 = 5
	IEC104TypeStepPositionTime  uint8 = 32
	IEC104TypeBitString         uint8 = 7
	IEC104TypeBitStringTime     uint8 = 33

	IEC104COTPeriodic       uint8 = 1
	IEC104COTBackgroundScan uint8 = 2
	IEC104COTSpontaneous    uint8 = 3
	IEC104COTInit           uint8 = 4
	IEC104COTRequest        uint8 = 5
	IEC104COTActivation     uint8 = 6
	IEC104COTActivationConf uint8 = 7
	IEC104COTDeactivation   uint8 = 8
	IEC104COTDeactConf      uint8 = 9
	IEC104COTActivationTerm uint8 = 10
	IEC104COTFileReady      uint8 = 25
	IEC104COTFileActivated  uint8 = 26
	IEC104COTFileDeact      uint8 = 27
	IEC104COTFileDeleted    uint8 = 28
	IEC104COTFileTransferred uint8 = 29
)

var typeIDMap = map[uint8]string{
	IEC104TypeSinglePoint:       "Single-point information",
	IEC104TypeSinglePointTime:   "Single-point information with time tag",
	IEC104TypeDoublePoint:       "Double-point information",
	IEC104TypeDoublePointTime:   "Double-point information with time tag",
	IEC104TypeMeasuredNormal:    "Measured value, normalized value",
	IEC104TypeMeasuredNormalTime: "Measured value, normalized value with time tag",
	IEC104TypeMeasuredFloat:     "Measured value, short floating point number",
	IEC104TypeMeasuredFloatTime: "Measured value, short floating point number with time tag",
	IEC104TypeStepPosition:      "Step position information",
	IEC104TypeStepPositionTime:  "Step position information with time tag",
	IEC104TypeBitString:         "Bit string of 32 bit",
	IEC104TypeBitStringTime:     "Bit string of 32 bit with time tag",
}

var cotMap = map[uint8]string{
	IEC104COTPeriodic:        "Periodic, cyclic",
	IEC104COTBackgroundScan:  "Background scan",
	IEC104COTSpontaneous:     "Spontaneous",
	IEC104COTInit:            "Initialized",
	IEC104COTRequest:         "Request or requested",
	IEC104COTActivation:      "Activation",
	IEC104COTActivationConf:  "Activation confirmation",
	IEC104COTDeactivation:    "Deactivation",
	IEC104COTDeactConf:       "Deactivation confirmation",
	IEC104COTActivationTerm:  "Activation termination",
	IEC104COTFileReady:       "File ready",
	IEC104COTFileActivated:   "File activated",
	IEC104COTFileDeact:       "File deactivated",
	IEC104COTFileDeleted:     "File deleted",
	IEC104COTFileTransferred: "File transferred",
}

func NewIEC104Parser() *IEC104Parser {
	return &IEC104Parser{
		protocol: ProtocolIEC104,
	}
}

func (p *IEC104Parser) GetProtocol() ProtocolType {
	return p.protocol
}

func (p *IEC104Parser) Validate(data []byte) bool {
	if len(data) < IEC104MinLen {
		return false
	}
	if data[0] != IEC104StartByte {
		return false
	}
	length := int(data[1]) + 2
	if len(data) < length {
		return false
	}
	return true
}

func (p *IEC104Parser) Parse(data []byte) (*ParseResult, error) {
	logger.LogProtocol(string(ProtocolIEC104), "in", "", data)

	if len(data) < IEC104MinLen {
		err := &ParseError{
			Protocol: ProtocolIEC104,
			Reason:   fmt.Sprintf("packet too short: %d bytes, min %d", len(data), IEC104MinLen),
			Data:     data,
		}
		logger.LogParse(string(ProtocolIEC104), false, data, nil, err)
		logger.LogAbnormalPacket(string(ProtocolIEC104), data, "packet_too_short", "", err)
		return nil, err
	}

	if data[0] != IEC104StartByte {
		err := &ParseError{
			Protocol: ProtocolIEC104,
			Reason:   fmt.Sprintf("invalid start byte: 0x%02X, expected 0x%02X", data[0], IEC104StartByte),
			Offset:   0,
			Data:     data,
		}
		logger.LogParse(string(ProtocolIEC104), false, data, nil, err)
		logger.LogAbnormalPacket(string(ProtocolIEC104), data, "invalid_start_byte", "", err)
		return nil, err
	}

	length := int(data[1]) + 2
	if len(data) < length {
		err := &ParseError{
			Protocol: ProtocolIEC104,
			Reason:   fmt.Sprintf("incomplete packet: declared %d bytes, actual %d bytes", length, len(data)),
			Offset:   1,
			Data:     data,
		}
		logger.LogParse(string(ProtocolIEC104), false, data, nil, err)
		logger.LogAbnormalPacket(string(ProtocolIEC104), data, "incomplete_packet", "", err)
		return nil, err
	}

	if length < 6 || length > 255 {
		err := &ParseError{
			Protocol: ProtocolIEC104,
			Reason:   fmt.Sprintf("invalid length: %d bytes, must be 6-255", length),
			Offset:   1,
			Data:     data,
		}
		logger.LogParse(string(ProtocolIEC104), false, data, nil, err)
		logger.LogAbnormalPacket(string(ProtocolIEC104), data, "invalid_length", "", err)
		return nil, err
	}

	result := &ParseResult{
		Protocol:   ProtocolIEC104,
		Timestamp:  time.Now(),
		RawData:    common.BytesToHex(data),
		ChecksumOK: true,
		ASDU:       &ASDUData{},
	}

	apciType := data[2] & 0x03
	if apciType == 0x03 {
		result.MessageType = "U-format"
		result.Function = p.parseUFormat(data)
		logger.LogParse(string(ProtocolIEC104), true, data, result, nil)
		return result, nil
	}

	if data[2]&0x01 == 0 && data[3]&0x01 == 0 {
		result.MessageType = "I-format"
	} else {
		result.MessageType = "S-format"
	}

	if length <= IEC104APCIHead+2 {
		logger.LogParse(string(ProtocolIEC104), true, data, result, nil)
		return result, nil
	}

	asduData := data[IEC104APCIHead:length]
	if err := p.parseASDU(asduData, result); err != nil {
		result.ParseError = err.Error()
		logger.LogParse(string(ProtocolIEC104), false, data, result, err)
		if parseErr, ok := err.(*ParseError); ok {
			logger.LogParseError(string(ProtocolIEC104), data, parseErr.Offset, "asdu_parse_error", err)
		} else {
			logger.LogParseError(string(ProtocolIEC104), data, IEC104APCIHead, "asdu_parse_error", err)
		}
		return result, err
	}

	logger.LogParse(string(ProtocolIEC104), true, data, result, nil)
	return result, nil
}

func (p *IEC104Parser) parseUFormat(data []byte) FunctionCode {
	if data[2]&0x04 != 0 {
		return "start_dt"
	}
	if data[2]&0x08 != 0 {
		return "stop_dt"
	}
	if data[2]&0x10 != 0 {
		return "test_fr"
	}
	if data[2]&0x20 != 0 {
		return "test_fr_con"
	}
	return "unknown"
}

func (p *IEC104Parser) parseASDU(data []byte, result *ParseResult) error {
	if len(data) < 4 {
		return &ParseError{
			Protocol: ProtocolIEC104,
			Reason:   "ASDU too short",
			Data:     data,
		}
	}

	result.ASDU.TypeID = data[0]
	if typeName, ok := typeIDMap[data[0]]; ok {
		result.ASDU.TypeName = typeName
	} else {
		result.ASDU.TypeName = fmt.Sprintf("Unknown (0x%02X)", data[0])
	}

	result.ASDU.VSQ = data[1]
	result.ASDU.NumPoints = int(result.ASDU.VSQ & 0x7F)
	if result.ASDU.VSQ&0x80 != 0 {
		result.ASDU.NumPoints = int(result.ASDU.VSQ)
	}

	result.ASDU.COT = data[2] & 0x3F
	if cotName, ok := cotMap[result.ASDU.COT]; ok {
		result.ASDU.COTName = cotName
	} else {
		result.ASDU.COTName = fmt.Sprintf("Unknown (0x%02X)", result.ASDU.COT)
	}

	if len(data) < 6 {
		return &ParseError{
			Protocol: ProtocolIEC104,
			Reason:   "ASDU missing CA field",
			Data:     data,
		}
	}
	result.ASDU.CA = binary.LittleEndian.Uint16(data[4:6])
	result.SlaveID = uint8(result.ASDU.CA)

	offset := 6
	for i := 0; i < result.ASDU.NumPoints; i++ {
		point, newOffset, err := p.parseInfoObject(result.ASDU.TypeID, data, offset)
		if err != nil {
			return err
		}
		point.Timestamp = result.Timestamp
		result.DataPoints = append(result.DataPoints, point)
		result.ASDU.IOA = append(result.ASDU.IOA, uint32(point.Address))
		offset = newOffset
	}

	return nil
}

func (p *IEC104Parser) parseInfoObject(typeID uint8, data []byte, offset int) (DataPoint, int, error) {
	if len(data) < offset+3 {
		return DataPoint{}, offset, &ParseError{
			Protocol: ProtocolIEC104,
			Reason:   "info object too short for IOA",
			Offset:   offset,
			Data:     data,
		}
	}

	ioa := uint32(data[offset]) | uint32(data[offset+1])<<8 | uint32(data[offset+2]&0x07)<<16
	offset += 3

	point := DataPoint{
		Tag:     fmt.Sprintf("ioa_%d", ioa),
		Address: uint16(ioa),
		Quality: 0,
	}

	switch typeID {
	case IEC104TypeSinglePoint:
		if len(data) < offset+1 {
			return point, offset, nil
		}
		iv := data[offset]
		point.Value = (iv & 0x01) == 1
		point.Quality = iv >> 1
		offset++

	case IEC104TypeSinglePointTime:
		if len(data) < offset+8 {
			return point, offset, nil
		}
		iv := data[offset]
		point.Value = (iv & 0x01) == 1
		point.Quality = iv >> 1
		offset++
		point.Timestamp = p.parseCP56Time(data[offset : offset+7])
		offset += 7

	case IEC104TypeDoublePoint:
		if len(data) < offset+1 {
			return point, offset, nil
		}
		iv := data[offset]
		point.Value = iv & 0x03
		point.Quality = iv >> 2
		offset++

	case IEC104TypeDoublePointTime:
		if len(data) < offset+8 {
			return point, offset, nil
		}
		iv := data[offset]
		point.Value = iv & 0x03
		point.Quality = iv >> 2
		offset++
		point.Timestamp = p.parseCP56Time(data[offset : offset+7])
		offset += 7

	case IEC104TypeMeasuredNormal:
		if len(data) < offset+3 {
			return point, offset, nil
		}
		raw := int16(binary.LittleEndian.Uint16(data[offset : offset+2]))
		point.Value = float64(raw) / 32767.0
		point.Quality = data[offset+2]
		offset += 3

	case IEC104TypeMeasuredNormalTime:
		if len(data) < offset+10 {
			return point, offset, nil
		}
		raw := int16(binary.LittleEndian.Uint16(data[offset : offset+2]))
		point.Value = float64(raw) / 32767.0
		point.Quality = data[offset+2]
		offset += 3
		point.Timestamp = p.parseCP56Time(data[offset : offset+7])
		offset += 7

	case IEC104TypeMeasuredFloat:
		if len(data) < offset+5 {
			return point, offset, nil
		}
		bits := binary.LittleEndian.Uint32(data[offset : offset+4])
		point.Value = float32frombits(bits)
		point.Quality = data[offset+4]
		offset += 5

	case IEC104TypeMeasuredFloatTime:
		if len(data) < offset+12 {
			return point, offset, nil
		}
		bits := binary.LittleEndian.Uint32(data[offset : offset+4])
		point.Value = float32frombits(bits)
		point.Quality = data[offset+4]
		offset += 5
		point.Timestamp = p.parseCP56Time(data[offset : offset+7])
		offset += 7

	case IEC104TypeStepPosition:
		if len(data) < offset+2 {
			return point, offset, nil
		}
		val := int8(data[offset])
		point.Value = val & 0x3F
		point.Quality = data[offset+1]
		offset += 2

	case IEC104TypeStepPositionTime:
		if len(data) < offset+9 {
			return point, offset, nil
		}
		val := int8(data[offset])
		point.Value = val & 0x3F
		point.Quality = data[offset+1]
		offset += 2
		point.Timestamp = p.parseCP56Time(data[offset : offset+7])
		offset += 7

	case IEC104TypeBitString:
		if len(data) < offset+5 {
			return point, offset, nil
		}
		point.Value = binary.LittleEndian.Uint32(data[offset : offset+4])
		point.Quality = data[offset+4]
		offset += 5

	case IEC104TypeBitStringTime:
		if len(data) < offset+12 {
			return point, offset, nil
		}
		point.Value = binary.LittleEndian.Uint32(data[offset : offset+4])
		point.Quality = data[offset+4]
		offset += 5
		point.Timestamp = p.parseCP56Time(data[offset : offset+7])
		offset += 7

	default:
		logger.Warnf("unsupported IEC104 type ID: 0x%02X", typeID)
	}

	return point, offset, nil
}

func (p *IEC104Parser) parseCP56Time(data []byte) time.Time {
	if len(data) < 7 {
		return time.Now()
	}

	milliseconds := int(binary.LittleEndian.Uint16(data[0:2]))
	minutes := int(data[2] & 0x3F)
	hours := int(data[3] & 0x1F)
	day := int(data[4] & 0x1F)
	month := int(data[5] & 0x0F)
	year := int(data[6]&0x7F) + 2000

	return time.Date(year, time.Month(month), day, hours, minutes, milliseconds/1000, (milliseconds%1000)*1000000, time.Local)
}

func (p *IEC104Parser) BuildRequest(req *Request) ([]byte, error) {
	if req.Protocol != ProtocolIEC104 {
		return nil, common.ErrInvalidProtocol
	}

	buf := make([]byte, 0, 256)
	buf = append(buf, IEC104StartByte)
	buf = append(buf, 0x04)
	buf = append(buf, 0x00, 0x00, 0x00, 0x00)

	logger.LogProtocol(string(ProtocolIEC104), "out", req.DeviceID, buf)
	return buf, nil
}

func float32frombits(b uint32) float32 {
	return math.Float32frombits(b)
}
