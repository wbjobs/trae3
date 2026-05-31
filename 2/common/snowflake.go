package common

import (
	"errors"
	"sync"
	"time"
)

const (
	workerIDBits     = uint(5)
	datacenterIDBits = uint(5)
	sequenceBits     = uint(12)

	maxWorkerID     = int64(-1) ^ (int64(-1) << workerIDBits)
	maxDatacenterID = int64(-1) ^ (int64(-1) << datacenterIDBits)

	workerIDShift      = sequenceBits
	datacenterIDShift  = sequenceBits + workerIDBits
	timestampLeftShift = sequenceBits + workerIDBits + datacenterIDBits

	sequenceMask = int64(-1) ^ (int64(-1) << sequenceBits)
	epoch        = int64(1609459200000)
)

type Snowflake struct {
	mu           sync.Mutex
	lastStamp    int64
	workerID     int64
	datacenterID int64
	sequence     int64
}

var defaultSnowflake *Snowflake

func InitSnowflake(nodeID uint16) {
	defaultSnowflake = NewSnowflake(int64(nodeID%32), int64(nodeID/32))
}

func NewSnowflake(workerID, datacenterID int64) *Snowflake {
	if workerID < 0 || workerID > maxWorkerID {
		panic(errors.New("worker ID out of range"))
	}
	if datacenterID < 0 || datacenterID > maxDatacenterID {
		panic(errors.New("datacenter ID out of range"))
	}
	return &Snowflake{
		workerID:     workerID,
		datacenterID: datacenterID,
		lastStamp:    -1,
	}
}

func GenerateID() int64 {
	return defaultSnowflake.Generate()
}

func (s *Snowflake) Generate() int64 {
	s.mu.Lock()
	defer s.mu.Unlock()

	now := time.Now().UnixMilli()

	if now < s.lastStamp {
		now = s.lastStamp
	}

	if now == s.lastStamp {
		s.sequence = (s.sequence + 1) & sequenceMask
		if s.sequence == 0 {
			for now <= s.lastStamp {
				now = time.Now().UnixMilli()
			}
		}
	} else {
		s.sequence = 0
	}

	s.lastStamp = now

	return (now-epoch)<<timestampLeftShift |
		s.datacenterID<<datacenterIDShift |
		s.workerID<<workerIDShift |
		s.sequence
}

func ParseID(id int64) (timestamp int64, workerID int64, datacenterID int64, sequence int64) {
	timestamp = (id >> timestampLeftShift) + epoch
	datacenterID = (id >> datacenterIDShift) & maxDatacenterID
	workerID = (id >> workerIDShift) & maxWorkerID
	sequence = id & sequenceMask
	return
}
