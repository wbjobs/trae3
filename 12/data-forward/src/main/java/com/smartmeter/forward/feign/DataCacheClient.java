package com.smartmeter.forward.feign;

import com.smartmeter.common.entity.MeterData;
import com.smartmeter.common.result.Result;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@FeignClient(name = "data-cache-service")
public interface DataCacheClient {

    @GetMapping("/api/cache/pending-forward")
    Result<List<MeterData>> getPendingForwardData(
            @RequestParam(defaultValue = "3") int maxRetry,
            @RequestParam(defaultValue = "100") int limit);

    @PutMapping("/api/cache/forward-status/{id}")
    Result<Void> updateForwardStatus(
            @PathVariable("id") Long id,
            @RequestParam("status") String status,
            @RequestParam("retryCount") int retryCount);
}
