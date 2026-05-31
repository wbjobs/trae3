package com.smartmeter.gateway.feign;

import com.smartmeter.common.dto.MeterDataDTO;
import com.smartmeter.common.entity.MeterData;
import com.smartmeter.common.entity.MeterDevice;
import com.smartmeter.common.result.Result;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.List;

@FeignClient(name = "data-cache-service")
public interface DataCacheClient {

    @PostMapping("/api/cache/save")
    Result<Void> saveData(@RequestBody MeterDataDTO meterDataDTO);

    @GetMapping("/api/cache/latest/{meterId}")
    Result<MeterDataDTO> getLatestData(@PathVariable("meterId") String meterId);

    @GetMapping("/api/cache/history/{meterId}")
    Result<List<MeterData>> getHistoryData(
            @PathVariable("meterId") String meterId,
            @RequestParam("startTime") @DateTimeFormat(pattern = "yyyy-MM-dd HH:mm:ss") LocalDateTime startTime,
            @RequestParam("endTime") @DateTimeFormat(pattern = "yyyy-MM-dd HH:mm:ss") LocalDateTime endTime);

    @GetMapping("/api/cache/device/{meterId}")
    Result<MeterDevice> getMeterDevice(@PathVariable("meterId") String meterId);

    @GetMapping("/api/cache/devices")
    Result<List<MeterDevice>> getAllDevices();
}
