package com.mine.ventilation.controller;

import com.mine.ventilation.common.Result;
import com.mine.ventilation.config.DataInitializer;
import com.mine.ventilation.service.AnnotationService;
import com.mine.ventilation.service.FanService;
import com.mine.ventilation.service.PipeService;
import com.mine.ventilation.service.TunnelService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/data")
public class DataController {

    private static final Logger logger = LoggerFactory.getLogger(DataController.class);

    @Autowired
    private TunnelService tunnelService;

    @Autowired
    private PipeService pipeService;

    @Autowired
    private FanService fanService;

    @Autowired
    private AnnotationService annotationService;

    @Autowired
    private DataInitializer dataInitializer;

    @Autowired
    private MongoTemplate mongoTemplate;

    @GetMapping("/summary")
    public Result<Map<String, Object>> getSummary() {
        Map<String, Object> summary = new HashMap<>();
        summary.put("tunnelCount", tunnelService.count());
        summary.put("pipeCount", pipeService.count());
        summary.put("fanCount", fanService.count());
        summary.put("annotationCount", annotationService.count());
        return Result.success(summary);
    }

    @GetMapping("/all")
    public Result<Map<String, Object>> getAllData() {
        Map<String, Object> data = new HashMap<>();
        data.put("tunnels", tunnelService.findAll());
        data.put("pipes", pipeService.findAll());
        data.put("fans", fanService.findAll());
        data.put("annotations", annotationService.findAll());
        return Result.success(data);
    }

    @GetMapping("/tunnel/{tunnelId}/detail")
    public Result<Map<String, Object>> getTunnelDetail(@PathVariable String tunnelId) {
        Map<String, Object> detail = new HashMap<>();

        tunnelService.findById(tunnelId).ifPresent(tunnel -> detail.put("tunnel", tunnel));
        detail.put("pipes", pipeService.findByTunnelId(tunnelId));
        detail.put("fans", fanService.findByTunnelId(tunnelId));
        detail.put("annotations", annotationService.findByTunnelId(tunnelId));

        return Result.success(detail);
    }

    @PostMapping("/import")
    public Result<Map<String, Object>> importData() {
        long totalCount = tunnelService.count() + pipeService.count() + fanService.count() + annotationService.count();
        if (totalCount > 0) {
            return Result.error("数据库不为空，请使用 reimport 接口清除后重新导入");
        }
        logger.info("API 调用: 导入数据");
        return dataInitializer.importAllData();
    }

    @PostMapping("/reimport")
    public Result<Map<String, Object>> reimportData(@RequestParam(required = false) Boolean confirm) {
        if (confirm == null || !confirm) {
            return Result.badRequest("请确认操作，添加参数 confirm=true");
        }
        logger.info("API 调用: 重新导入数据");
        return dataInitializer.reimportAllData();
    }

    @PostMapping("/clear")
    public Result<Map<String, Object>> clearAllData(@RequestParam(required = false) Boolean confirm) {
        if (confirm == null || !confirm) {
            return Result.badRequest("请确认操作，添加参数 confirm=true");
        }
        logger.info("API 调用: 清除所有数据");
        return dataInitializer.clearAllData();
    }

    @GetMapping("/status")
    public Result<Map<String, Object>> getDataStatus() {
        Map<String, Object> status = new HashMap<>();

        Map<String, Object> collectionCounts = new HashMap<>();
        collectionCounts.put("tunnels", tunnelService.count());
        collectionCounts.put("pipes", pipeService.count());
        collectionCounts.put("fans", fanService.count());
        collectionCounts.put("annotations", annotationService.count());
        status.put("collections", collectionCounts);

        Map<String, Object> dbStatus = new HashMap<>();
        try {
            mongoTemplate.getDb().listCollectionNames().first();
            dbStatus.put("connected", true);
            dbStatus.put("database", mongoTemplate.getDb().getName());
        } catch (Exception e) {
            dbStatus.put("connected", false);
            dbStatus.put("error", e.getMessage());
        }
        status.put("database", dbStatus);

        Result<Map<String, Object>> fileStatusResult = dataInitializer.getDataStatus();
        if (fileStatusResult.isSuccess()) {
            status.put("dataDirectory", fileStatusResult.getData());
        } else {
            status.put("dataDirectory", Map.of("error", fileStatusResult.getMessage()));
        }

        return Result.success(status);
    }

    @GetMapping("/import/status")
    public Result<Map<String, Object>> getImportStatus() {
        return dataInitializer.getImportStatus();
    }

    @PostMapping("/export/by-tunnels")
    public Result<Map<String, Object>> exportByTunnelIds(@RequestBody Map<String, List<String>> body) {
        List<String> tunnelIds = body.get("tunnelIds");
        Map<String, Object> data = new HashMap<>();

        data.put("tunnels", tunnelService.findByIds(tunnelIds));
        data.put("pipes", pipeService.findByTunnelIds(tunnelIds));
        data.put("fans", fanService.findByTunnelIds(tunnelIds));
        data.put("annotations", annotationService.findByTunnelIds(tunnelIds));

        return Result.success(data);
    }
}
