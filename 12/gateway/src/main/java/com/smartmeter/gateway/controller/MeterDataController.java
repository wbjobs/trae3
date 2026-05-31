package com.smartmeter.gateway.controller;

import com.smartmeter.common.dto.BatchUploadRequest;
import com.smartmeter.common.dto.MeterDataDTO;
import com.smartmeter.common.dto.MeterDataLiteVO;
import com.smartmeter.common.dto.PageResult;
import com.smartmeter.common.entity.MeterData;
import com.smartmeter.common.entity.MeterDevice;
import com.smartmeter.common.result.Result;
import com.smartmeter.gateway.feign.LoadBalancerClient;
import com.smartmeter.gateway.service.MeterDataService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

@Slf4j
@RestController
@RequestMapping("/api/meter")
public class MeterDataController {

    @Autowired
    private MeterDataService meterDataService;

    @Autowired
    private LoadBalancerClient loadBalancerClient;

    @PostMapping("/data/upload/{protocolType}")
    public Result<MeterDataDTO> uploadData(
            @PathVariable String protocolType,
            @RequestBody String hexData) {
        return meterDataService.processData(protocolType, hexData.trim());
    }

    @PostMapping("/data/upload")
    public Result<MeterDataDTO> uploadAutoData(@RequestBody String hexData) {
        return meterDataService.processAutoData(hexData.trim());
    }

    @PostMapping("/data/upload/{protocolType}/lite")
    public Result<MeterDataLiteVO> uploadDataLite(
            @PathVariable String protocolType,
            @RequestBody String hexData) {
        return meterDataService.processDataLite(protocolType, hexData.trim());
    }

    @PostMapping("/data/batch")
    public Result<List<Result<MeterDataDTO>>> uploadBatch(@RequestBody BatchUploadRequest request) {
        return meterDataService.processBatch(request);
    }

    @GetMapping("/data/latest/{meterId}")
    public Result<MeterDataDTO> getLatestData(@PathVariable String meterId) {
        return meterDataService.getLatestData(meterId);
    }

    @GetMapping("/data/latest/{meterId}/lite")
    public Result<MeterDataLiteVO> getLatestDataLite(@PathVariable String meterId) {
        return meterDataService.getLatestDataLite(meterId);
    }

    @GetMapping("/data/history/{meterId}")
    public Result<List<MeterData>> getHistoryData(
            @PathVariable String meterId,
            @RequestParam @DateTimeFormat(pattern = "yyyy-MM-dd HH:mm:ss") LocalDateTime startTime,
            @RequestParam @DateTimeFormat(pattern = "yyyy-MM-dd HH:mm:ss") LocalDateTime endTime) {
        return meterDataService.getHistoryData(meterId, startTime, endTime);
    }

    @GetMapping("/data/history/{meterId}/page")
    public Result<PageResult<MeterData>> getHistoryDataPaged(
            @PathVariable String meterId,
            @RequestParam @DateTimeFormat(pattern = "yyyy-MM-dd HH:mm:ss") LocalDateTime startTime,
            @RequestParam @DateTimeFormat(pattern = "yyyy-MM-dd HH:mm:ss") LocalDateTime endTime,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int size) {
        return meterDataService.getHistoryDataPaged(meterId, startTime, endTime, page, size);
    }

    @GetMapping("/device/{meterId}")
    public Result<MeterDevice> getMeterDevice(@PathVariable String meterId) {
        return meterDataService.getMeterDevice(meterId);
    }

    @GetMapping("/devices")
    public Result<List<MeterDevice>> getAllDevices() {
        return meterDataService.getAllDevices();
    }

    @GetMapping("/stats/loadbalancer")
    public Result<Map<String, Object>> getLoadBalancerStats() {
        return loadBalancerClient.getStats();
    }
}
