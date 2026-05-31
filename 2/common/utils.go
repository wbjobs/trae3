package common

import (
	"bytes"
	"compress/gzip"
	"crypto/md5"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"math/rand"
	"net"
	"strings"
	"time"
)

func init() {
	rand.New(rand.NewSource(time.Now().UnixNano()))
}

func BytesToHex(data []byte) string {
	return hex.EncodeToString(data)
}

func HexToBytes(s string) ([]byte, error) {
	return hex.DecodeString(s)
}

func MD5(data string) string {
	h := md5.New()
	h.Write([]byte(data))
	return hex.EncodeToString(h.Sum(nil))
}

func SHA256(data string) string {
	h := sha256.New()
	h.Write([]byte(data))
	return hex.EncodeToString(h.Sum(nil))
}

func JSONString(v interface{}) string {
	b, _ := json.Marshal(v)
	return string(b)
}

func RandomString(length int) string {
	const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
	b := make([]byte, length)
	for i := range b {
		b[i] = chars[rand.Intn(len(chars))]
	}
	return string(b)
}

func GetLocalIP() string {
	addrs, err := net.InterfaceAddrs()
	if err != nil {
		return "127.0.0.1"
	}
	for _, addr := range addrs {
		if ipNet, ok := addr.(*net.IPNet); ok && !ipNet.IP.IsLoopback() {
			if ipNet.IP.To4() != nil {
				return ipNet.IP.String()
			}
		}
	}
	return "127.0.0.1"
}

func CompressData(data []byte) (string, error) {
	if len(data) == 0 {
		return "", nil
	}

	var buf bytes.Buffer
	gz, err := gzip.NewWriterLevel(&buf, gzip.BestCompression)
	if err != nil {
		return "", fmt.Errorf("%w: create gzip writer failed: %v", ErrCompressionFailed, err)
	}

	if _, err := gz.Write(data); err != nil {
		gz.Close()
		return "", fmt.Errorf("%w: gzip write failed: %v", ErrCompressionFailed, err)
	}

	if err := gz.Close(); err != nil {
		return "", fmt.Errorf("%w: gzip close failed: %v", ErrCompressionFailed, err)
	}

	return base64.StdEncoding.EncodeToString(buf.Bytes()), nil
}

func DecompressData(compressed string) ([]byte, error) {
	if compressed == "" {
		return nil, nil
	}

	data, err := base64.StdEncoding.DecodeString(compressed)
	if err != nil {
		return nil, fmt.Errorf("%w: base64 decode failed: %v", ErrCompressionFailed, err)
	}

	buf := bytes.NewBuffer(data)
	gz, err := gzip.NewReader(buf)
	if err != nil {
		return nil, fmt.Errorf("%w: create gzip reader failed: %v", ErrCompressionFailed, err)
	}
	defer gz.Close()

	result, err := io.ReadAll(gz)
	if err != nil {
		return nil, fmt.Errorf("%w: gzip read failed: %v", ErrCompressionFailed, err)
	}

	return result, nil
}

func CompressHex(hexStr string) (string, int, error) {
	data, err := HexToBytes(hexStr)
	if err != nil {
		return "", 0, err
	}

	compressed, err := CompressData(data)
	if err != nil {
		return "", 0, err
	}

	return compressed, len(data) - (len(compressed) * 6 / 8), nil
}

func EstimateCompressionRatio(originalSize int, compressedSize int) float64 {
	if originalSize == 0 {
		return 1.0
	}
	return float64(compressedSize) / float64(originalSize)
}

func GetOutboundIP() string {
	conn, err := net.Dial("udp", "8.8.8.8:80")
	if err != nil {
		return GetLocalIP()
	}
	defer conn.Close()
	localAddr := conn.LocalAddr().(*net.UDPAddr)
	return localAddr.IP.String()
}

func ChecksumCRC16(data []byte) uint16 {
	var crc uint16 = 0xFFFF
	for _, b := range data {
		crc ^= uint16(b)
		for i := 0; i < 8; i++ {
			if crc&0x0001 != 0 {
				crc = (crc >> 1) ^ 0xA001
			} else {
				crc >>= 1
			}
		}
	}
	return crc
}

func ChecksumCRC32(data []byte) uint32 {
	const poly uint32 = 0xEDB88320
	var crc uint32 = 0xFFFFFFFF
	for _, b := range data {
		crc ^= uint32(b)
		for i := 0; i < 8; i++ {
			if crc&1 != 0 {
				crc = (crc >> 1) ^ poly
			} else {
				crc >>= 1
			}
		}
	}
	return ^crc
}

func LuhnCheck(number string) bool {
	var sum int
	alt := false
	for i := len(number) - 1; i >= 0; i-- {
		n := int(number[i] - '0')
		if alt {
			n *= 2
			if n > 9 {
				n = (n % 10) + 1
			}
		}
		sum += n
		alt = !alt
	}
	return sum%10 == 0
}

func MaskString(s string, start, end int) string {
	if len(s) <= start+end {
		return s
	}
	return s[:start] + strings.Repeat("*", len(s)-start-end) + s[len(s)-end:]
}

func FormatDuration(d time.Duration) string {
	if d < time.Millisecond {
		return fmt.Sprintf("%dus", d.Microseconds())
	}
	if d < time.Second {
		return fmt.Sprintf("%dms", d.Milliseconds())
	}
	if d < time.Minute {
		return fmt.Sprintf("%.2fs", d.Seconds())
	}
	return fmt.Sprintf("%dm%ds", int(d.Minutes()), int(d.Seconds())%60)
}

func Retry(fn func() error, attempts int, sleep time.Duration) error {
	var err error
	for i := 0; i < attempts; i++ {
		if err = fn(); err == nil {
			return nil
		}
		time.Sleep(sleep * time.Duration(i+1))
	}
	return err
}
