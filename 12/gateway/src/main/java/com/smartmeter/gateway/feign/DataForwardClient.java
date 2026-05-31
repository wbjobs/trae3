package com.smartmeter.gateway.feign;

import com.smartmeter.common.dto.MeterDataDTO;
import com.smartmeter.common.result.Result;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@FeignClient(name = "data-forward-service")
public interface DataForwardClient {

    @PostMapping("/api/forward/direct")
    Result<Void> directForward(@RequestBody MeterDataDTO dataDTO);

    @GetMapping("/api/forward/stats")
    Result<Map<String, Object>> getForwardStats();
}
