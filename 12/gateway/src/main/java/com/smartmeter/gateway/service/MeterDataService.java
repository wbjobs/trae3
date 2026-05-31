package com.smartmeter.gateway.service;

import com.alibaba.fastjson.JSON;
import com.smartmeter.common.constant.ErrorConstants;
import com.smartmeter.common.constant.ProtocolConstants;
import com.smartmeter.common.dto.*;
import com.smartmeter.common.entity.MeterData;
import com.smartmeter.common.entity.MeterDevice;
import com.smartmeter.common.exception.BusinessException;
import com.smartmeter.common.result.Result;
import com.smartmeter.gateway.feign.DataCacheClient;
import com.smartmeter.gateway.feign.DataForwardClient;
import com.smartmeter.gateway.feign.ProtocolParserClient;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.*;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executor;
import java.util.concurrent.TimeUnit;
import java.util.stream.Collectors;

@Slf4j
@Service
public class MeterDataService {

    @Autowired
    private ProtocolParserClient protocolParserClient;

    @Autowired
    private DataCacheClient dataCacheClient;

    @Autowired
    private DataForwardClient dataForwardClient;

    @Autowired
    private AbnormalDataLogService abnormalDataLogService;

    @Autowired
    private RedisTemplate<String, Object> redisTemplate;

    @Autowired
    private Executor applicationTaskExecutor;

    @Value("${gateway.forward-immediately:false}")
    private boolean forwardImmediately;

    @Value("${gateway.local-cache-max-size:10000}")
    private int localCacheMaxSize;

    @Value("${gateway.local-cache-ttl-seconds:30}")
    private int localCacheTtlSeconds;

    private final ConcurrentHashMap<String, CacheEntry> localCache = new ConcurrentHashMap<>();

    private static class CacheEntry {
        final Object data;
        final long expireAt;

        CacheEntry(Object data, long ttlMs) {
            this.data = data;
            this.expireAt = System.currentTimeMillis() + ttlMs;
        }

        boolean isExpired() {
            return System.currentTimeMillis() > expireAt;
        }
    }

    public Result<MeterDataDTO> processData(String protocolType, String hexData) {
        String validatedProtocol = validateAndNormalizeProtocol(protocolType);
        validateHexData(hexData);

        log.debug("Processing meter data, protocol: {}, hexLen: {}", validatedProtocol, hexData.length());

        Result<MeterDataDTO> parseResult;
        try {
            if (validatedProtocol != null && !validatedProtocol.isEmpty()) {
                parseResult = protocolParserClient.parse(validatedProtocol, hexData);
            } else {
                parseResult = protocolParserClient.autoParse(hexData);
            }
        } catch (Exception e) {
            log.error("Protocol parse service call failed: {}", e.getMessage());
            abnormalDataLogService.recordAbnormalData(
                    validatedProtocol, hexData,
                    ErrorConstants.ERROR_TYPE_SERVICE_UNAVAILABLE,
                    "Parse service unavailable: " + e.getMessage());
            throw new BusinessException(ErrorConstants.CODE_SERVICE_UNAVAILABLE,
                    ErrorConstants.ERROR_TYPE_SERVICE_UNAVAILABLE,
                    "Parse service unavailable");
        }

        if (parseResult == null || !parseResult.isSuccess()) {
            String errorMsg = parseResult != null ? parseResult.getMessage() : "Parse service unavailable";
            String errorType = classifyParseError(errorMsg);
            abnormalDataLogService.recordAbnormalData(validatedProtocol, hexData, errorType, errorMsg);
            return Result.fail("Parse failed: " + errorMsg);
        }

        MeterDataDTO parsedData = parseResult.getData();
        if (parsedData == null) {
            abnormalDataLogService.recordAbnormalData(validatedProtocol, hexData,
                    ErrorConstants.ERROR_TYPE_PROTOCOL_PARSE, "Parse result is empty");
            return Result.fail("Parse result is empty");
        }

        parsedData.setRawData(hexData);

        if (parsedData.getMeterId() == null || parsedData.getMeterId().isEmpty()) {
            abnormalDataLogService.recordAbnormalData(null, validatedProtocol, hexData,
                    ErrorConstants.ERROR_TYPE_METER_ID_EMPTY, "Meter ID is empty after parsing");
            throw new BusinessException(ErrorConstants.ERROR_TYPE_METER_ID_EMPTY,
                    "Meter ID is empty after parsing");
        }

        if (parsedData.getDataItems() != null) {
            for (MeterDataDTO.DataItem item : parsedData.getDataItems()) {
                if (item.getValue() != null) {
                    validateDataItemValue(item, parsedData.getMeterId(), validatedProtocol, hexData);
                }
            }
        }

        cacheLocally(ProtocolConstants.CACHE_KEY_LATEST + parsedData.getMeterId(), parsedData);

        asyncSaveAndForward(parsedData);

        return Result.success(parsedData);
    }

    public Result<MeterDataLiteVO> processDataLite(String protocolType, String hexData) {
        Result<MeterDataDTO> fullResult = processData(protocolType, hexData);
        if (!fullResult.isSuccess()) {
            return Result.fail(fullResult.getCode(), fullResult.getMessage());
        }
        return Result.success(toLiteVO(fullResult.getData()));
    }

    public Result<List<Result<MeterDataDTO>>> processBatch(BatchUploadRequest request) {
        if (request.getHexDataList() == null || request.getHexDataList().isEmpty()) {
            throw new BusinessException(ErrorConstants.ERROR_TYPE_DATA_VALIDATION, "Batch data list cannot be empty");
        }
        if (request.getHexDataList().size() > ProtocolConstants.BATCH_UPLOAD_MAX_SIZE) {
            throw new BusinessException(ErrorConstants.ERROR_TYPE_DATA_VALIDATION,
                    "Batch size exceeds limit: " + ProtocolConstants.BATCH_UPLOAD_MAX_SIZE);
        }

        String protocol = validateAndNormalizeProtocol(request.getProtocolType());

        List<CompletableFuture<Result<MeterDataDTO>>> futures = request.getHexDataList().stream()
                .map(hexData -> CompletableFuture.supplyAsync(
                        () -> processData(protocol, hexData.trim()), applicationTaskExecutor))
                .collect(Collectors.toList());

        List<Result<MeterDataDTO>> results = futures.stream()
                .map(f -> {
                    try {
                        return f.get();
                    } catch (Exception e) {
                        return Result.fail("Batch item failed: " + e.getMessage());
                    }
                })
                .collect(Collectors.toList());

        return Result.success(results);
    }

    public Result<MeterDataDTO> processAutoData(String hexData) {
        return processData(null, hexData);
    }

    public Result<MeterDataDTO> getLatestData(String meterId) {
        MeterDataDTO localCached = getFromLocalCache(ProtocolConstants.CACHE_KEY_LATEST + meterId, MeterDataDTO.class);
        if (localCached != null) {
            return Result.success(localCached);
        }

        try {
            Result<MeterDataDTO> result = dataCacheClient.getLatestData(meterId);
            if (result != null && result.isSuccess() && result.getData() != null) {
                cacheLocally(ProtocolConstants.CACHE_KEY_LATEST + meterId, result.getData());
            }
            return result != null ? result : Result.fail("Cache service unavailable");
        } catch (Exception e) {
            log.error("Get latest data failed, meterId: {}, error: {}", meterId, e.getMessage());
            return Result.fail("Get latest data failed: " + e.getMessage());
        }
    }

    public Result<MeterDataLiteVO> getLatestDataLite(String meterId) {
        Result<MeterDataDTO> fullResult = getLatestData(meterId);
        if (!fullResult.isSuccess()) {
            return Result.fail(fullResult.getCode(), fullResult.getMessage());
        }
        return Result.success(toLiteVO(fullResult.getData()));
    }

    public Result<PageResult<MeterData>> getHistoryDataPaged(String meterId, LocalDateTime startTime,
                                                               LocalDateTime endTime, int page, int size) {
        try {
            Result<List<MeterData>> result = dataCacheClient.getHistoryData(meterId, startTime, endTime);
            if (result == null || !result.isSuccess() || result.getData() == null) {
                return Result.fail("Query history data failed");
            }
            List<MeterData> all = result.getData();
            long total = all.size();
            int from = Math.min((page - 1) * size, all.size());
            int to = Math.min(from + size, all.size());
            List<MeterData> paged = all.subList(from, to);
            return Result.success(PageResult.of(paged, total, page, size));
        } catch (Exception e) {
            log.error("Get paged history failed, meterId: {}, error: {}", meterId, e.getMessage());
            return Result.fail("Get history data failed: " + e.getMessage());
        }
    }

    public Result<List<MeterData>> getHistoryData(String meterId, LocalDateTime startTime, LocalDateTime endTime) {
        try {
            Result<List<MeterData>> result = dataCacheClient.getHistoryData(meterId, startTime, endTime);
            return result != null ? result : Result.fail("Cache service unavailable");
        } catch (Exception e) {
            log.error("Get history data failed, meterId: {}, error: {}", meterId, e.getMessage());
            return Result.fail("Get history data failed: " + e.getMessage());
        }
    }

    public Result<MeterDevice> getMeterDevice(String meterId) {
        MeterDevice localCached = getFromLocalCache(ProtocolConstants.CACHE_KEY_DEVICE + meterId, MeterDevice.class);
        if (localCached != null) {
            return Result.success(localCached);
        }

        String nullKey = ProtocolConstants.CACHE_KEY_NULL_PLACEHOLDER + "device:" + meterId;
        if (getFromLocalCache(nullKey, String.class) != null) {
            return Result.fail(404, "Device not found");
        }

        try {
            Result<MeterDevice> result = dataCacheClient.getMeterDevice(meterId);
            if (result != null && result.isSuccess() && result.getData() != null) {
                cacheLocally(ProtocolConstants.CACHE_KEY_DEVICE + meterId, result.getData());
            } else if (result != null && result.getData() == null) {
                cacheLocally(nullKey, "NULL");
            }
            return result != null ? result : Result.fail("Cache service unavailable");
        } catch (Exception e) {
            log.error("Get meter device failed, meterId: {}, error: {}", meterId, e.getMessage());
            return Result.fail("Get meter device failed: " + e.getMessage());
        }
    }

    public Result<List<MeterDevice>> getAllDevices() {
        try {
            Result<List<MeterDevice>> result = dataCacheClient.getAllDevices();
            return result != null ? result : Result.fail("Cache service unavailable");
        } catch (Exception e) {
            log.error("Get all devices failed, error: {}", e.getMessage());
            return Result.fail("Get all devices failed: " + e.getMessage());
        }
    }

    @Async
    public void asyncSaveAndForward(MeterDataDTO parsedData) {
        try {
            Result<Void> cacheResult = dataCacheClient.saveData(parsedData);
            if (cacheResult == null || !cacheResult.isSuccess()) {
                log.warn("Async cache data failed for meterId: {}", parsedData.getMeterId());
            }
        } catch (Exception e) {
            log.warn("Async cache data exception for meterId: {}, error: {}", parsedData.getMeterId(), e.getMessage());
        }

        if (forwardImmediately) {
            try {
                dataForwardClient.directForward(parsedData);
            } catch (Exception e) {
                log.warn("Direct forward failed, will retry later: {}", e.getMessage());
            }
        }
    }

    private MeterDataLiteVO toLiteVO(MeterDataDTO dto) {
        if (dto == null) return null;
        MeterDataLiteVO lite = new MeterDataLiteVO();
        lite.setMid(dto.getMeterId());
        lite.setPt(dto.getProtocolType());
        lite.setCt(dto.getCollectTime() != null ?
                dto.getCollectTime().toEpochSecond(ZoneOffset.ofHours(8)) : null);
        if (dto.getDataItems() != null) {
            lite.setItems(dto.getDataItems().stream().map(item -> {
                MeterDataLiteVO.ItemLite il = new MeterDataLiteVO.ItemLite();
                il.setDt(item.getDataType());
                il.setV(item.getValue());
                il.setU(item.getUnit());
                return il;
            }).collect(Collectors.toList()));
        }
        return lite;
    }

    private void cacheLocally(String key, Object value) {
        if (localCache.size() > localCacheMaxSize) {
            localCache.entrySet().removeIf(e -> e.getValue().isExpired());
        }
        if (localCache.size() > localCacheMaxSize) {
            Iterator<Map.Entry<String, CacheEntry>> it = localCache.entrySet().iterator();
            int removeCount = localCache.size() / 4;
            for (int i = 0; i < removeCount && it.hasNext(); i++) {
                it.next();
                it.remove();
            }
        }
        localCache.put(key, new CacheEntry(value, localCacheTtlSeconds * 1000L));
    }

    private <T> T getFromLocalCache(String key, Class<T> type) {
        CacheEntry entry = localCache.get(key);
        if (entry == null || entry.isExpired()) {
            if (entry != null) {
                localCache.remove(key);
            }
            return null;
        }
        try {
            return type.cast(entry.data);
        } catch (ClassCastException e) {
            return null;
        }
    }

    private String validateAndNormalizeProtocol(String protocolType) {
        if (protocolType == null || protocolType.isEmpty()) {
            return null;
        }
        String trimmed = protocolType.trim().toUpperCase();
        if (ProtocolConstants.PROTOCOL_DLT645.equals(trimmed) || "DLT645".equals(trimmed)
                || "DL/T645".equals(trimmed)) {
            return ProtocolConstants.PROTOCOL_DLT645;
        }
        if (ProtocolConstants.PROTOCOL_CJT188.equals(trimmed) || "CJT188".equals(trimmed)
                || "CJ/T188".equals(trimmed)) {
            return ProtocolConstants.PROTOCOL_CJT188;
        }
        throw new BusinessException(ErrorConstants.ERROR_TYPE_PROTOCOL_PARSE,
                "Unsupported protocol type: " + protocolType);
    }

    private void validateHexData(String hexData) {
        if (hexData == null || hexData.trim().isEmpty()) {
            throw new BusinessException(ErrorConstants.ERROR_TYPE_DATA_VALIDATION, "Hex data cannot be empty");
        }
        String trimmed = hexData.trim();
        if (trimmed.length() < 4) {
            throw new BusinessException(ErrorConstants.ERROR_TYPE_DATA_LENGTH,
                    "Hex data too short, minimum 2 bytes required");
        }
        if (trimmed.length() % 2 != 0) {
            throw new BusinessException(ErrorConstants.ERROR_TYPE_FRAME_FORMAT,
                    "Hex data length must be even, got: " + trimmed.length());
        }
        if (!trimmed.matches("^[0-9a-fA-F]+$")) {
            throw new BusinessException(ErrorConstants.ERROR_TYPE_DATA_VALIDATION,
                    "Hex data contains invalid characters");
        }
    }

    private void validateDataItemValue(MeterDataDTO.DataItem item, String meterId,
                                        String protocolType, String rawData) {
        if (item.getValue() == null) return;
        double val = item.getValue().doubleValue();
        switch (item.getDataType()) {
            case "VOLTAGE":
                if (val < 0 || val > 500) {
                    abnormalDataLogService.recordAbnormalData(meterId, protocolType, rawData,
                            ErrorConstants.ERROR_TYPE_DATA_VALUE_INVALID,
                            "Voltage out of range: " + val + "V");
                }
                break;
            case "CURRENT":
                if (val < 0 || val > 1000) {
                    abnormalDataLogService.recordAbnormalData(meterId, protocolType, rawData,
                            ErrorConstants.ERROR_TYPE_DATA_VALUE_INVALID,
                            "Current out of range: " + val + "A");
                }
                break;
            case "ACTIVE_POWER": case "TOTAL_ENERGY":
                if (val < 0) {
                    abnormalDataLogService.recordAbnormalData(meterId, protocolType, rawData,
                            ErrorConstants.ERROR_TYPE_DATA_VALUE_INVALID,
                            item.getDataType() + " negative: " + val);
                }
                break;
            case "FORWARD_TEMP": case "RETURN_TEMP":
                if (val < -50 || val > 200) {
                    abnormalDataLogService.recordAbnormalData(meterId, protocolType, rawData,
                            ErrorConstants.ERROR_TYPE_DATA_VALUE_INVALID,
                            "Temp out of range: " + val + "℃");
                }
                break;
            case "INSTANT_FLOW": case "ACCUMULATED_FLOW":
                if (val < 0) {
                    abnormalDataLogService.recordAbnormalData(meterId, protocolType, rawData,
                            ErrorConstants.ERROR_TYPE_DATA_VALUE_INVALID,
                            "Flow negative: " + val);
                }
                break;
            default: break;
        }
    }

    private String classifyParseError(String errorMsg) {
        if (errorMsg == null) return ErrorConstants.ERROR_TYPE_PROTOCOL_PARSE;
        String lower = errorMsg.toLowerCase();
        if (lower.contains("crc") || lower.contains("checksum")) return ErrorConstants.ERROR_TYPE_CRC_CHECK;
        if (lower.contains("length") || lower.contains("too short")) return ErrorConstants.ERROR_TYPE_DATA_LENGTH;
        if (lower.contains("frame") || lower.contains("start") || lower.contains("end")) return ErrorConstants.ERROR_TYPE_FRAME_FORMAT;
        return ErrorConstants.ERROR_TYPE_PROTOCOL_PARSE;
    }
}
