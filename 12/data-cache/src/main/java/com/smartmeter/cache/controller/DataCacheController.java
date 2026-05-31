package com.smartmeter.cache.controller;

import com.smartmeter.common.dto.MeterDataDTO;
import com.smartmeter.common.entity.MeterData;
import com.smartmeter.common.entity.MeterDevice;
import com.smartmeter.common.result.Result;
import com.smartmeter.cache.service.DataCacheService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Set;

@Slf4j
@RestController
@RequestMapping("/api/cache")
public class DataCacheController {

    @Autowired
    private DataCacheService dataCacheService;

    @PostMapping("/save")
    public Result<Void> saveData(@RequestBody MeterDataDTO meterDataDTO) {
        try {
            log.info("Received save data request, meterId: {}", meterDataDTO.getMeterId());
            dataCacheService.saveMeterData(meterDataDTO);
            return Result.success();
        } catch (Exception e) {
            log.error("Save meter data failed, error: {}", e.getMessage(), e);
            return Result.fail("Save failed: " + e.getMessage());
        }
    }

    @GetMapping("/latest/{meterId}")
    public Result<MeterDataDTO> getLatestData(@PathVariable String meterId) {
        try {
            MeterDataDTO data = dataCacheService.getLatestData(meterId);
            return Result.success(data);
        } catch (Exception e) {
            log.error("Get latest data failed, meterId: {}, error: {}", meterId, e.getMessage(), e);
            return Result.fail("Get latest data failed: " + e.getMessage());
        }
    }

    @GetMapping("/history/{meterId}")
    public Result<List<MeterData>> getHistoryData(
            @PathVariable String meterId,
            @RequestParam @DateTimeFormat(pattern = "yyyy-MM-dd HH:mm:ss") LocalDateTime startTime,
            @RequestParam @DateTimeFormat(pattern = "yyyy-MM-dd HH:mm:ss") LocalDateTime endTime) {
        try {
            List<MeterData> data = dataCacheService.getHistoryData(meterId, startTime, endTime);
            return Result.success(data);
        } catch (Exception e) {
            log.error("Get history data failed, meterId: {}, error: {}", meterId, e.getMessage(), e);
            return Result.fail("Get history data failed: " + e.getMessage());
        }
    }

    @GetMapping("/device/{meterId}")
    public Result<MeterDevice> getMeterDevice(@PathVariable String meterId) {
        try {
            MeterDevice device = dataCacheService.getMeterDevice(meterId);
            return Result.success(device);
        } catch (Exception e) {
            log.error("Get meter device failed, meterId: {}, error: {}", meterId, e.getMessage(), e);
            return Result.fail("Get meter device failed: " + e.getMessage());
        }
    }

    @GetMapping("/devices")
    public Result<List<MeterDevice>> getAllDevices() {
        try {
            List<MeterDevice> devices = dataCacheService.getAllDevices();
            return Result.success(devices);
        } catch (Exception e) {
            log.error("Get all devices failed, error: {}", e.getMessage(), e);
            return Result.fail("Get all devices failed: " + e.getMessage());
        }
    }

    @GetMapping("/pending-forward")
    public Result<List<MeterData>> getPendingForwardData(
            @RequestParam(defaultValue = "3") int maxRetry,
            @RequestParam(defaultValue = "100") int limit) {
        try {
            List<MeterData> data = dataCacheService.getPendingForwardData(maxRetry, limit);
            return Result.success(data);
        } catch (Exception e) {
            log.error("Get pending forward data failed, error: {}", e.getMessage(), e);
            return Result.fail("Get pending forward data failed: " + e.getMessage());
        }
    }

    @PutMapping("/forward-status/{id}")
    public Result<Void> updateForwardStatus(
            @PathVariable Long id,
            @RequestParam String status,
            @RequestParam int retryCount) {
        try {
            dataCacheService.updateForwardStatus(id, status, retryCount);
            return Result.success();
        } catch (Exception e) {
            log.error("Update forward status failed, id: {}, error: {}", id, e.getMessage(), e);
            return Result.fail("Update forward status failed: " + e.getMessage());
        }
    }
}
