package com.ancient.platform.project.controller;

import com.ancient.platform.common.ratelimit.annotation.RateLimit;
import com.ancient.platform.common.result.Result;
import com.ancient.platform.project.dto.request.BatchAnnotationUpdateRequest;
import com.ancient.platform.project.dto.request.BatchPageStatusRequest;
import com.ancient.platform.project.service.CollaborationOptimizationService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.concurrent.TimeUnit;

@RestController
@RequestMapping("/api/optimization")
@RequiredArgsConstructor
public class OptimizationController {

    private final CollaborationOptimizationService optimizationService;

    @GetMapping("/online-users/{projectId}")
    @RateLimit(key = "#projectId", limit = 60, window = 1, timeUnit = TimeUnit.MINUTES)
    public Result<List<Map<String, Object>>> getOnlineUsers(@PathVariable Long projectId) {
        return Result.success(optimizationService.getOnlineUsers(projectId));
    }

    @GetMapping("/workload/{userId}")
    @RateLimit(key = "#userId", limit = 60, window = 1, timeUnit = TimeUnit.MINUTES)
    public Result<Map<String, Object>> getUserWorkload(@PathVariable Long userId) {
        return Result.success(optimizationService.getUserWorkload(userId));
    }

    @PostMapping("/batch/page-status")
    @RateLimit(limit = 30, window = 1, timeUnit = TimeUnit.MINUTES)
    public Result<Void> batchUpdatePageStatus(@Valid @RequestBody BatchPageStatusRequest request) {
        optimizationService.batchUpdatePageStatus(request);
        return Result.success();
    }

    @PostMapping("/batch/annotations")
    @RateLimit(limit = 30, window = 1, timeUnit = TimeUnit.MINUTES)
    public Result<Void> batchUpdateAnnotations(@Valid @RequestBody BatchAnnotationUpdateRequest request) {
        optimizationService.batchUpdateAnnotations(request);
        return Result.success();
    }

    @GetMapping("/metrics")
    @RateLimit(limit = 120, window = 1, timeUnit = TimeUnit.MINUTES)
    public Result<Map<String, Object>> getSystemMetrics() {
        return Result.success(optimizationService.getSystemMetrics());
    }

    @PostMapping("/online/{projectId}/users/{userId}")
    public Result<Void> updateUserOnlineStatus(@PathVariable Long projectId,
                                                @PathVariable Long userId,
                                                @RequestParam boolean isOnline) {
        optimizationService.updateUserOnlineStatus(projectId, userId, isOnline);
        return Result.success();
    }
}
