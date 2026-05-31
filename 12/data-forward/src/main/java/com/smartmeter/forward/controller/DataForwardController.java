package com.smartmeter.forward.controller;

import com.smartmeter.common.dto.MeterDataDTO;
import com.smartmeter.common.result.Result;
import com.smartmeter.forward.service.DataForwardService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@Slf4j
@RestController
@RequestMapping("/api/forward")
public class DataForwardController {

    @Autowired
    private DataForwardService dataForwardService;

    @PostMapping("/direct")
    public Result<Void> directForward(@RequestBody MeterDataDTO dataDTO) {
        try {
            log.info("Received direct forward request, meterId: {}", dataDTO.getMeterId());
            dataForwardService.forwardDataDirect(dataDTO);
            return Result.success();
        } catch (Exception e) {
            log.error("Direct forward failed: {}", e.getMessage(), e);
            return Result.fail("Direct forward failed: " + e.getMessage());
        }
    }

    @PostMapping("/manual")
    public Result<Boolean> manualForward(@RequestBody List<Long> dataIds) {
        try {
            log.info("Received manual forward request, count: {}", dataIds.size());
            boolean result = dataForwardService.manualForward(dataIds);
            return Result.success(result);
        } catch (Exception e) {
            log.error("Manual forward failed: {}", e.getMessage(), e);
            return Result.fail("Manual forward failed: " + e.getMessage());
        }
    }

    @PostMapping("/trigger")
    public Result<Void> triggerForward() {
        try {
            log.info("Received trigger forward request");
            dataForwardService.forwardPendingData();
            return Result.success();
        } catch (Exception e) {
            log.error("Trigger forward failed: {}", e.getMessage(), e);
            return Result.fail("Trigger forward failed: " + e.getMessage());
        }
    }

    @GetMapping("/stats")
    public Result<Map<String, Object>> getForwardStats() {
        try {
            Map<String, Object> stats = dataForwardService.getForwardStats();
            return Result.success(stats);
        } catch (Exception e) {
            log.error("Get forward stats failed: {}", e.getMessage(), e);
            return Result.fail("Get forward stats failed: " + e.getMessage());
        }
    }
}
