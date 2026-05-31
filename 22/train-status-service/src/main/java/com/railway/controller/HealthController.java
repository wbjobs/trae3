package com.railway.controller;

import com.railway.auth.annotation.RequireAuth;
import com.railway.common.dto.Result;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.HashMap;
import java.util.Map;

@RestController
@RequestMapping("/api")
@RequireAuth(required = false)
public class HealthController {

    @GetMapping("/health")
    public Result<Map<String, Object>> health() {
        Map<String, Object> result = new HashMap<>();
        result.put("status", "UP");
        result.put("service", "train-status-api");
        result.put("version", "1.0.0");
        result.put("timestamp", System.currentTimeMillis());
        return Result.success(result);
    }
}
