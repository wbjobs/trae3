package com.railway.controller;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.railway.auth.annotation.RequireAuth;
import com.railway.cluster.service.ClusterSyncService;
import com.railway.common.dto.BatchReportDTO;
import com.railway.common.dto.Result;
import com.railway.common.dto.TrainStatusReportDTO;
import com.railway.common.entity.TrainStatus;
import com.railway.common.util.CompressUtil;
import com.railway.common.util.RateLimiter;
import com.railway.common.util.ByteUtil;
import com.railway.filter.service.FilterService;
import com.railway.mq.service.MqSendService;
import com.railway.protocol.service.ProtocolParseService;
import com.railway.service.TrainStatusService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.*;

import jakarta.annotation.Resource;
import jakarta.servlet.http.HttpServletRequest;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicLong;

@RestController
@RequestMapping("/api/train-status")
@RequireAuth
public class TrainStatusController {

    private static final Logger log = LoggerFactory.getLogger(TrainStatusController.class);
    private static final Logger trafficLog = LoggerFactory.getLogger("TRAFFIC_LOGGER");

    private static final AtomicLong totalRequests = new AtomicLong(0);
    private static final AtomicLong rejectedRequests = new AtomicLong(0);
    private static final AtomicLong batchRequests = new AtomicLong(0);

    @Resource
    private MqSendService mqSendService;

    @Resource
    private ProtocolParseService protocolParseService;

    @Resource
    private TrainStatusService trainStatusService;

    @Resource
    private ClusterSyncService clusterSyncService;

    @Resource
    private FilterService filterService;

    @Resource
    private RateLimiter.MultiRateLimiter reportRateLimiter;

    @Resource(name = "rateLimitEnabled")
    private boolean rateLimitEnabled;

    @PostMapping("/report")
    @RequireAuth(required = false)
    public Result<String> reportStatus(@RequestBody TrainStatusReportDTO reportDTO,
                                        HttpServletRequest request) {
        String clientIp = getClientIp(request);
        reportDTO.setSourceIp(clientIp);

        String trainId = reportDTO.getTrainId();
        totalRequests.incrementAndGet();

        if (rateLimitEnabled && !reportRateLimiter.tryAcquire(clientIp)) {
            rejectedRequests.incrementAndGet();
            trafficLog.warn("Rate limit exceeded, ip: {}, trainId: {}", clientIp, trainId);
            return Result.error(429, "Rate limit exceeded, " +
                    "globalAvailable=" + reportRateLimiter.getGlobalAvailable() + ", " +
                    "ipAvailable=" + reportRateLimiter.getPerIpAvailable(clientIp));
        }

        if (reportDTO.getRawData() != null) {
            byte[] compressed = CompressUtil.compressIfNeeded(reportDTO.getRawData(), 512);
            reportDTO.setRawData(compressed);
        }

        log.debug("Received train status report, trainId: {}, data length: {}",
                trainId, reportDTO.getRawData() != null ? reportDTO.getRawData().length : 0);

        mqSendService.reportTrainStatus(reportDTO);

        return Result.success("Report accepted", "RECEIVED");
    }

    @PostMapping("/report/batch")
    @RequireAuth(required = false)
    public Result<Map<String, Object>> batchReportStatus(@RequestBody BatchReportDTO batchDTO,
                                                          HttpServletRequest request) {
        String clientIp = getClientIp(request);
        batchRequests.incrementAndGet();

        if (batchDTO == null || batchDTO.size() == 0) {
            return Result.error(400, "Empty batch");
        }

        int batchSize = batchDTO.size();
        int successCount = 0;
        int failCount = 0;

        for (TrainStatusReportDTO report : batchDTO.getReports()) {
            try {
                totalRequests.incrementAndGet();

                if (rateLimitEnabled && !reportRateLimiter.tryAcquire(clientIp)) {
                    rejectedRequests.incrementAndGet();
                    failCount++;
                    continue;
                }

                report.setSourceIp(clientIp);

                if (report.getRawData() != null) {
                    byte[] compressed = CompressUtil.compressIfNeeded(report.getRawData(), 512);
                    report.setRawData(compressed);
                }

                mqSendService.reportTrainStatus(report);
                successCount++;
            } catch (Exception e) {
                failCount++;
                log.error("Batch report item failed", e);
            }
        }

        trafficLog.info("Batch report completed, total: {}, success: {}, fail: {}",
                batchSize, successCount, failCount);

        Map<String, Object> result = new HashMap<>();
        result.put("total", batchSize);
        result.put("success", successCount);
        result.put("failed", failCount);

        return Result.success(result);
    }

    @GetMapping("/report/stats")
    @RequireAuth(required = false)
    public Result<Map<String, Object>> getReportStats() {
        Map<String, Object> stats = new HashMap<>();
        stats.put("totalRequests", totalRequests.get());
        stats.put("rejectedRequests", rejectedRequests.get());
        stats.put("batchRequests", batchRequests.get());
        stats.put("globalQps", reportRateLimiter.getGlobalAvailable());
        stats.put("rateLimitEnabled", rateLimitEnabled);
        return Result.success(stats);
    }

    @PostMapping("/report-hex")
    @RequireAuth(required = false)
    public Result<TrainStatus> reportStatusHex(@RequestParam String trainId,
                                                @RequestParam String hexData,
                                                @RequestParam(required = false) String lineId,
                                                HttpServletRequest request) {
        byte[] rawData = ByteUtil.hexStringToBytes(hexData);
        if (rawData.length == 0) {
            return Result.error(400, "Invalid hex data");
        }

        TrainStatusReportDTO reportDTO = new TrainStatusReportDTO();
        reportDTO.setTrainId(trainId);
        reportDTO.setLineId(lineId);
        reportDTO.setRawData(rawData);
        reportDTO.setSourceIp(getClientIp(request));

        TrainStatus status = protocolParseService.parse(reportDTO);

        boolean pass = filterService.filter(status);
        if (!pass) {
            return Result.error(400, "Data filtered out");
        }

        trainStatusService.saveStatus(status);
        clusterSyncService.syncTrainStatus(status);

        return Result.success(status);
    }

    @GetMapping("/train/{trainId}")
    public Result<TrainStatus> getTrainLatestStatus(@PathVariable String trainId) {
        TrainStatus status = clusterSyncService.getTrainStatus(trainId);
        if (status == null) {
            status = trainStatusService.getLatestStatus(trainId);
        }
        return status != null ? Result.success(status) : Result.error(404, "Train status not found");
    }

    @GetMapping("/train/{trainId}/history")
    public Result<IPage<TrainStatus>> getTrainHistory(
            @PathVariable String trainId,
            @RequestParam @DateTimeFormat(pattern = "yyyy-MM-dd HH:mm:ss") LocalDateTime startTime,
            @RequestParam @DateTimeFormat(pattern = "yyyy-MM-dd HH:mm:ss") LocalDateTime endTime,
            @RequestParam(defaultValue = "1") int pageNum,
            @RequestParam(defaultValue = "20") int pageSize) {

        IPage<TrainStatus> page = trainStatusService.getByTrainIdAndTimeRange(
                trainId, startTime, endTime, pageNum, pageSize);
        return Result.success(page);
    }

    @GetMapping("/line/{lineId}/history")
    public Result<IPage<TrainStatus>> getLineHistory(
            @PathVariable String lineId,
            @RequestParam @DateTimeFormat(pattern = "yyyy-MM-dd HH:mm:ss") LocalDateTime startTime,
            @RequestParam @DateTimeFormat(pattern = "yyyy-MM-dd HH:mm:ss") LocalDateTime endTime,
            @RequestParam(defaultValue = "1") int pageNum,
            @RequestParam(defaultValue = "20") int pageSize) {

        IPage<TrainStatus> page = trainStatusService.getByLineIdAndTimeRange(
                lineId, startTime, endTime, pageNum, pageSize);
        return Result.success(page);
    }

    @GetMapping("/query")
    public Result<IPage<TrainStatus>> queryStatus(
            @RequestParam(required = false) String trainId,
            @RequestParam(required = false) String lineId,
            @RequestParam(required = false) Integer status,
            @RequestParam(required = false) @DateTimeFormat(pattern = "yyyy-MM-dd HH:mm:ss") LocalDateTime startTime,
            @RequestParam(required = false) @DateTimeFormat(pattern = "yyyy-MM-dd HH:mm:ss") LocalDateTime endTime,
            @RequestParam(defaultValue = "1") int pageNum,
            @RequestParam(defaultValue = "20") int pageSize) {

        IPage<TrainStatus> page = trainStatusService.queryByConditions(
                trainId, lineId, status, startTime, endTime, pageNum, pageSize);
        return Result.success(page);
    }

    @GetMapping("/all")
    public Result<List<TrainStatus>> getAllTrainStatus() {
        List<TrainStatus> statuses = clusterSyncService.getAllTrainStatus();
        return Result.success(statuses);
    }

    @GetMapping("/active-trains")
    public Result<List<String>> getActiveTrains(
            @RequestParam(defaultValue = "30") int minutes) {
        LocalDateTime sinceTime = LocalDateTime.now().minusMinutes(minutes);
        List<String> trainIds = trainStatusService.getActiveTrainIds(sinceTime);
        return Result.success(trainIds);
    }

    @GetMapping("/alerts")
    public Result<List<TrainStatus>> getAlertTrains(
            @RequestParam(defaultValue = "5") int minutes) {
        LocalDateTime sinceTime = LocalDateTime.now().minusMinutes(minutes);
        List<TrainStatus> alerts = trainStatusService.getByStatusSince(2, sinceTime);
        return Result.success(alerts);
    }

    @GetMapping("/validate-protocol")
    @RequireAuth(required = false)
    public Result<Map<String, Object>> validateProtocol(@RequestParam String hexData) {
        byte[] rawData = ByteUtil.hexStringToBytes(hexData);
        Map<String, Object> result = new HashMap<>();

        boolean valid = protocolParseService.validate(rawData);
        result.put("valid", valid);
        result.put("version", protocolParseService.getProtocolVersion(rawData));
        result.put("messageType", protocolParseService.getMessageType(rawData));

        return Result.success(result);
    }

    private String getClientIp(HttpServletRequest request) {
        String ip = request.getHeader("X-Forwarded-For");
        if (ip == null || ip.isEmpty() || "unknown".equalsIgnoreCase(ip)) {
            ip = request.getHeader("X-Real-IP");
        }
        if (ip == null || ip.isEmpty() || "unknown".equalsIgnoreCase(ip)) {
            ip = request.getRemoteAddr();
        }
        if (ip != null && ip.contains(",")) {
            ip = ip.split(",")[0].trim();
        }
        return ip;
    }
}
