package storage

import (
	"context"
	"fmt"
	"sync"
	"time"

	influxdb2 "github.com/influxdata/influxdb-client-go/v2"
	"github.com/influxdata/influxdb-client-go/v2/api"
	"github.com/influxdata/influxdb-client-go/v2/api/write"

	"industrial-protocol-gateway/common"
	"industrial-protocol-gateway/config"
	"industrial-protocol-gateway/logger"
	"industrial-protocol-gateway/protocol"
)

var (
	client       influxdb2.Client
	writeAPI     api.WriteAPI
	writeAPICold api.WriteAPI
	queryAPI     api.QueryAPI
	batchSize    int
	once         sync.Once
	coldBucket   string
	coldThreshold time.Duration
	compressRaw  bool
	downsample   bool
	compressionStats *CompressionStats
)

type CompressionStats struct {
	TotalOriginal int64
	TotalCompressed int64
	TotalPackets  int64
	mu            sync.RWMutex
}

func InitInfluxDB() error {
	var initErr error
	once.Do(func() {
		cfg := config.Get().InfluxDB

		client = influxdb2.NewClientWithOptions(
			cfg.URL,
			cfg.Token,
			influxdb2.DefaultOptions().
				SetBatchSize(uint(cfg.BatchSize)).
				SetFlushInterval(1000),
		)

		writeAPI = client.WriteAPI(cfg.Org, cfg.Bucket)
		queryAPI = client.QueryAPI(cfg.Org)
		batchSize = cfg.BatchSize

		if _, err := client.Health(context.Background()); err != nil {
			initErr = fmt.Errorf("influxdb health check failed: %w", err)
			return
		}

		compressRaw = cfg.CompressRaw
		downsample = cfg.Downsample
		coldBucket = cfg.ColdBucket
		if coldBucket != "" {
			writeAPICold = client.WriteAPI(cfg.Org, coldBucket)
			go func() {
				for err := range writeAPICold.Errors() {
					logger.Errorf("influxdb cold bucket write error: %v", err)
				}
			}()
		}

		if cfg.ColdThreshold != "" {
			if d, err := time.ParseDuration(cfg.ColdThreshold); err == nil {
				coldThreshold = d
			}
		}
		if coldThreshold == 0 {
			coldThreshold = 24 * time.Hour * 7
		}

		compressionStats = &CompressionStats{}

		errorsCh := writeAPI.Errors()
		go func() {
			for err := range errorsCh {
				logger.Errorf("influxdb write error: %v", err)
			}
		}()

		if downsample {
			go startDownsampleJob()
		}

		logger.Infof("influxdb client initialized: compress=%v, downsample=%v, cold_bucket=%s",
			compressRaw, downsample, coldBucket)
	})
	return initErr
}

func CloseInfluxDB() {
	if client != nil {
		writeAPI.Flush()
		client.Close()
		logger.Info("influxdb client closed")
	}
}

func SaveRawPacket(protocol string, deviceID string, data []byte, timestamp time.Time) error {
	originalLen := len(data)
	fields := make(map[string]interface{})
	fields["data_length"] = originalLen

	if compressRaw {
		compressed, err := common.CompressData(data)
		if err != nil {
			logger.Warnf("compress raw data failed: %v, falling back to hex", err)
			fields["data_hex"] = fmt.Sprintf("%X", data)
			fields["compressed"] = false
		} else {
			fields["data_compressed"] = compressed
			fields["data_original_len"] = originalLen
			fields["compressed"] = true
			compressedLen := len(compressed)

			compressionStats.mu.Lock()
			compressionStats.TotalOriginal += int64(originalLen)
			compressionStats.TotalCompressed += int64(compressedLen)
			compressionStats.TotalPackets++
			compressionStats.mu.Unlock()
		}
	} else {
		fields["data_hex"] = fmt.Sprintf("%X", data)
		fields["compressed"] = false
	}

	point := influxdb2.NewPointWithMeasurement("raw_packets").
		AddTag("protocol", protocol).
		AddTag("device_id", deviceID).
		SetTime(timestamp)

	for k, v := range fields {
		point.AddField(k, v)
	}

	writeAPI.WritePoint(point)

	if coldBucket != "" && time.Since(timestamp) > coldThreshold {
		coldPoint := influxdb2.NewPointWithMeasurement("raw_packets").
			AddTag("protocol", protocol).
			AddTag("device_id", deviceID).
			SetTime(timestamp)
		for k, v := range fields {
			coldPoint.AddField(k, v)
		}
		writeAPICold.WritePoint(coldPoint)
	}

	logger.LogStorage("save_raw", true, 1, nil)
	return nil
}

func GetCompressionStats() map[string]interface{} {
	if compressionStats == nil {
		return nil
	}

	compressionStats.mu.RLock()
	defer compressionStats.mu.RUnlock()

	ratio := float64(0)
	saved := int64(0)
	if compressionStats.TotalOriginal > 0 {
		ratio = float64(compressionStats.TotalCompressed) / float64(compressionStats.TotalOriginal)
		saved = compressionStats.TotalOriginal - compressionStats.TotalCompressed
	}

	return map[string]interface{}{
		"enabled":          compressRaw,
		"total_packets":    compressionStats.TotalPackets,
		"total_original":   compressionStats.TotalOriginal,
		"total_compressed": compressionStats.TotalCompressed,
		"total_saved":      saved,
		"compression_ratio": fmt.Sprintf("%.2f%%", ratio*100),
		"space_saved":      fmt.Sprintf("%.2f%%", (1-ratio)*100),
	}
}

func startDownsampleJob() {
	ticker := time.NewTicker(1 * time.Hour)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			performDownsample()
		}
	}
}

func performDownsample() {
	logger.Info("starting data downsample job")

	now := time.Now()
	oneHourAgo := now.Add(-1 * time.Hour)
	oneDayAgo := now.Add(-24 * time.Hour)
	oneWeekAgo := now.Add(-24 * time.Hour * 7)

	if err := downsampleData("protocol_data", "protocol_data_1h", oneHourAgo, now); err != nil {
		logger.Errorf("1h downsample failed: %v", err)
	}

	if err := downsampleData("protocol_data_1h", "protocol_data_1d", oneDayAgo, oneHourAgo); err != nil {
		logger.Errorf("1d downsample failed: %v", err)
	}

	if err := downsampleData("protocol_data_1d", "protocol_data_1w", oneWeekAgo, oneDayAgo); err != nil {
		logger.Errorf("1w downsample failed: %v", err)
	}

	logger.Info("data downsample job completed")
}

func downsampleData(source, target string, start, end time.Time) error {
	cfg := config.Get().InfluxDB

	fluxQuery := fmt.Sprintf(`
		data = from(bucket: "%s")
			|> range(start: %d, stop: %d)
			|> filter(fn: (r) => r._measurement == "%s")
			|> filter(fn: (r) => r._field == "value")
			|> aggregateWindow(every: %s, fn: mean, createEmpty: false)
			|> to(bucket: "%s", org: "%s")
	`, cfg.Bucket, start.Unix(), end.Unix(), source,
		getAggregateWindow(target), cfg.Bucket, cfg.Org)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()

	_, err := queryAPI.Query(ctx, fluxQuery)
	if err != nil {
		return fmt.Errorf("downsample %s failed: %w", target, err)
	}

	logger.Infof("downsample %s -> %s completed", source, target)
	return nil
}

func getAggregateWindow(target string) string {
	switch target {
	case "protocol_data_1h":
		return "1h"
	case "protocol_data_1d":
		return "1d"
	case "protocol_data_1w":
		return "1w"
	default:
		return "1h"
	}
}

func BatchSaveRawPackets(packets []struct {
	Protocol   string
	DeviceID   string
	Data       []byte
	Timestamp  time.Time
}) error {
	if len(packets) == 0 {
		return nil
	}

	for _, p := range packets {
		if err := SaveRawPacket(p.Protocol, p.DeviceID, p.Data, p.Timestamp); err != nil {
			return err
		}
	}

	logger.LogStorage("batch_save_raw", true, len(packets), nil)
	return nil
}

func ArchiveColdData() error {
	if coldBucket == "" {
		return fmt.Errorf("cold bucket not configured")
	}

	cfg := config.Get().InfluxDB
	cutoff := time.Now().Add(-coldThreshold)

	fluxQuery := fmt.Sprintf(`
		from(bucket: "%s")
			|> range(start: 0, stop: %d)
			|> filter(fn: (r) => r._measurement == "raw_packets")
			|> to(bucket: "%s", org: "%s")
	`, cfg.Bucket, cutoff.Unix(), coldBucket, cfg.Org)

	ctx, cancel := context.WithTimeout(context.Background(), 1*time.Hour)
	defer cancel()

	if _, err := queryAPI.Query(ctx, fluxQuery); err != nil {
		return fmt.Errorf("archive cold data failed: %w", err)
	}

	logger.Infof("cold data archived to bucket: %s", coldBucket)
	return nil
}

func DeleteExpiredData(retention time.Duration) error {
	cfg := config.Get().InfluxDB
	cutoff := time.Now().Add(-retention)

	deleteAPI := client.DeleteAPI()
	err := deleteAPI.DeleteWithName(
		context.Background(),
		cfg.Org,
		cfg.Bucket,
		time.Unix(0, 0),
		cutoff,
		`_measurement="raw_packets"`,
	)
	if err != nil {
		return fmt.Errorf("delete expired data failed: %w", err)
	}

	logger.Infof("expired data deleted before: %s", cutoff.Format(time.RFC3339))
	return nil
}

func SaveParsedData(result *protocol.ParseResult) error {
	for _, dp := range result.DataPoints {
		tags := map[string]string{
			"protocol":  string(result.Protocol),
			"device_id": result.DeviceID,
			"tag":       dp.Tag,
			"slave_id":  fmt.Sprintf("%d", result.SlaveID),
		}

		fields := map[string]interface{}{
			"address": dp.Address,
			"value":   dp.Value,
			"quality": dp.Quality,
		}

		point := influxdb2.NewPoint(
			"protocol_data",
			tags,
			fields,
			dp.Timestamp,
		)

		writeAPI.WritePoint(point)
	}

	logger.LogStorage("save_parsed", true, len(result.DataPoints), nil)
	return nil
}

func SaveParseResult(result *protocol.ParseResult, rawData []byte) error {
	if err := SaveRawPacket(string(result.Protocol), result.DeviceID, rawData, result.Timestamp); err != nil {
		return err
	}

	if len(result.DataPoints) > 0 {
		return SaveParsedData(result)
	}

	return nil
}

func QueryData(ctx context.Context, query string) ([]*write.Point, error) {
	result, err := queryAPI.Query(ctx, query)
	if err != nil {
		logger.LogStorage("query", false, 0, err)
		return nil, fmt.Errorf("%w: %v", common.ErrStorageFailed, err)
	}
	defer result.Close()

	points := make([]*write.Point, 0)
	for result.Next() {
		values := result.Record().Values()
		tags := make(map[string]string)
		fields := make(map[string]interface{})

		for k, v := range values {
			if k == "time" || k == "result" || k == "table" {
				continue
			}
			if strVal, ok := v.(string); ok {
				tags[k] = strVal
			} else {
				fields[k] = v
			}
		}

		point := influxdb2.NewPoint(
			result.Record().Measurement(),
			tags,
			fields,
			result.Record().Time(),
		)
		points = append(points, point)
	}

	if err := result.Err(); err != nil {
		logger.LogStorage("query", false, 0, err)
		return nil, err
	}

	logger.LogStorage("query", true, len(points), nil)
	return points, nil
}

func QueryProtocolData(ctx context.Context, protocol, deviceID string, startTime, endTime time.Time) ([]map[string]interface{}, error) {
	fluxQuery := fmt.Sprintf(`
		from(bucket: "%s")
			|> range(start: %d, stop: %d)
			|> filter(fn: (r) => r._measurement == "protocol_data")
			|> filter(fn: (r) => r.protocol == "%s")
			|> filter(fn: (r) => r.device_id == "%s")
			|> pivot(rowKey:["_time"], columnKey: ["_field"], valueColumn: "_value")
	`, config.Get().InfluxDB.Bucket, startTime.Unix(), endTime.Unix(), protocol, deviceID)

	result, err := queryAPI.Query(ctx, fluxQuery)
	if err != nil {
		logger.LogStorage("query_protocol", false, 0, err)
		return nil, err
	}
	defer result.Close()

	data := make([]map[string]interface{}, 0)
	for result.Next() {
		record := result.Record()
		row := make(map[string]interface{})
		row["time"] = record.Time().Format(time.RFC3339)
		for k, v := range record.Values() {
			row[k] = v
		}
		data = append(data, row)
	}

	if err := result.Err(); err != nil {
		logger.LogStorage("query_protocol", false, 0, err)
		return nil, err
	}

	logger.LogStorage("query_protocol", true, len(data), nil)
	return data, nil
}

func QueryRawPackets(ctx context.Context, protocol, deviceID string, startTime, endTime time.Time, limit int) ([]map[string]interface{}, error) {
	return QueryRawPacketsWithOptions(ctx, protocol, deviceID, startTime, endTime, limit, false)
}

func QueryRawPacketsWithOptions(ctx context.Context, protocol, deviceID string, startTime, endTime time.Time, limit int, decompress bool) ([]map[string]interface{}, error) {
	fluxQuery := fmt.Sprintf(`
		from(bucket: "%s")
			|> range(start: %d, stop: %d)
			|> filter(fn: (r) => r._measurement == "raw_packets")
			|> filter(fn: (r) => r.protocol == "%s")
			|> filter(fn: (r) => r.device_id == "%s")
			|> limit(n: %d)
			|> pivot(rowKey:["_time"], columnKey: ["_field"], valueColumn: "_value")
	`, config.Get().InfluxDB.Bucket, startTime.Unix(), endTime.Unix(), protocol, deviceID, limit)

	result, err := queryAPI.Query(ctx, fluxQuery)
	if err != nil {
		logger.LogStorage("query_raw", false, 0, err)
		return nil, err
	}
	defer result.Close()

	data := make([]map[string]interface{}, 0)
	decompressedCount := 0

	for result.Next() {
		record := result.Record()
		row := make(map[string]interface{})
		row["time"] = record.Time().Format(time.RFC3339)
		for k, v := range record.Values() {
			row[k] = v
		}

		if decompress {
			if compressed, ok := row["data_compressed"].(string); ok && compressed != "" {
				if rawData, err := common.DecompressData(compressed); err == nil {
					row["data_hex"] = common.BytesToHex(rawData)
					row["data_decompressed"] = true
					decompressedCount++
				} else {
					row["data_decompress_error"] = err.Error()
				}
			} else if _, ok := row["data_hex"]; ok {
				row["data_decompressed"] = false
			}
		}

		data = append(data, row)
	}

	if err := result.Err(); err != nil {
		logger.LogStorage("query_raw", false, 0, err)
		return nil, err
	}

	if decompressedCount > 0 {
		logger.Infof("decompressed %d/%d raw packets", decompressedCount, len(data))
	}

	logger.LogStorage("query_raw", true, len(data), nil)
	return data, nil
}

func DeleteData(ctx context.Context, measurement string, startTime, endTime time.Time, predicate string) error {
	deleteAPI := client.DeleteAPI()
	err := deleteAPI.DeleteWithName(ctx,
		config.Get().InfluxDB.Org,
		config.Get().InfluxDB.Bucket,
		startTime,
		endTime,
		predicate,
	)
	if err != nil {
		logger.LogStorage("delete", false, 0, err)
		return err
	}
	logger.LogStorage("delete", true, 0, nil)
	return nil
}

func Flush() {
	if writeAPI != nil {
		writeAPI.Flush()
	}
	if writeAPICold != nil {
		writeAPICold.Flush()
	}
}

func GetStats() map[string]interface{} {
	stats := map[string]interface{}{
		"url":            config.Get().InfluxDB.URL,
		"org":            config.Get().InfluxDB.Org,
		"bucket":         config.Get().InfluxDB.Bucket,
		"cold_bucket":    coldBucket,
		"batch_size":     batchSize,
		"compress_raw":   compressRaw,
		"downsample":     downsample,
		"cold_threshold": coldThreshold.String(),
	}

	if compressionStats := GetCompressionStats(); compressionStats != nil {
		stats["compression"] = compressionStats
	}

	return stats
}

func BatchSave(points []*write.Point) error {
	for _, p := range points {
		writeAPI.WritePoint(p)
	}
	logger.LogStorage("batch_save", true, len(points), nil)
	return nil
}

type QueryOptions struct {
	Protocol   string
	DeviceID   string
	StartTime  time.Time
	EndTime    time.Time
	Measurement string
	Tags       map[string]string
	Limit      int
	Offset     int
}

func QueryWithOptions(ctx context.Context, opts QueryOptions) ([]map[string]interface{}, error) {
	measurement := opts.Measurement
	if measurement == "" {
		measurement = "protocol_data"
	}

	filter := ""
	for k, v := range opts.Tags {
		filter += fmt.Sprintf(`|> filter(fn: (r) => r.%s == "%s")`, k, v)
	}

	limit := ""
	if opts.Limit > 0 {
		limit = fmt.Sprintf("|> limit(n: %d, offset: %d)", opts.Limit, opts.Offset)
	}

	fluxQuery := fmt.Sprintf(`
		from(bucket: "%s")
			|> range(start: %d, stop: %d)
			|> filter(fn: (r) => r._measurement == "%s")
			%s
			%s
			|> pivot(rowKey:["_time"], columnKey: ["_field"], valueColumn: "_value")
	`, config.Get().InfluxDB.Bucket, opts.StartTime.Unix(), opts.EndTime.Unix(), measurement, filter, limit)

	result, err := queryAPI.Query(ctx, fluxQuery)
	if err != nil {
		return nil, err
	}
	defer result.Close()

	data := make([]map[string]interface{}, 0)
	for result.Next() {
		record := result.Record()
		row := make(map[string]interface{})
		row["time"] = record.Time().Format(time.RFC3339)
		for k, v := range record.Values() {
			row[k] = v
		}
		data = append(data, row)
	}

	return data, result.Err()
}
