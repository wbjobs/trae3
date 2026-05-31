package com.smartmeter.forward.service;

import com.alibaba.fastjson.JSON;
import com.smartmeter.common.constant.ProtocolConstants;
import com.smartmeter.common.dto.ForwardDataDTO;
import com.smartmeter.common.dto.MeterDataDTO;
import com.smartmeter.common.entity.MeterData;
import com.smartmeter.forward.feign.DataCacheClient;
import lombok.extern.slf4j.Slf4j;
import org.apache.http.HttpResponse;
import org.apache.http.client.config.RequestConfig;
import org.apache.http.client.methods.HttpPost;
import org.apache.http.entity.StringEntity;
import org.apache.http.impl.client.CloseableHttpClient;
import org.apache.http.impl.client.HttpClients;
import org.apache.http.util.EntityUtils;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;

@Slf4j
@Service
public class DataForwardService {

    private static final String FORWARD_LOCK_KEY = "forward:lock";
    private static final String FORWARD_STATS_KEY = "forward:stats";

    @Autowired
    private DataCacheClient dataCacheClient;

    @Autowired
    private RedisTemplate<String, Object> redisTemplate;

    @Value("${dataplatform.url:http://127.0.0.1:9000/api/data/receive}")
    private String dataPlatformUrl;

    @Value("${dataplatform.app-key:smartmeter-gateway}")
    private String appKey;

    @Value("${dataplatform.app-secret:smartmeter-secret-2024}")
    private String appSecret;

    @Value("${dataplatform.batch-size:50}")
    private int batchSize;

    @Value("${dataplatform.max-retry:3}")
    private int maxRetry;

    @Value("${dataplatform.timeout:10000}")
    private int timeout;

    @Scheduled(fixedDelayString = "${dataplatform.forward-interval:5000}")
    public void forwardPendingData() {
        Boolean lock = redisTemplate.opsForValue().setIfAbsent(FORWARD_LOCK_KEY, "1", 30, java.util.concurrent.TimeUnit.SECONDS);
        if (!Boolean.TRUE.equals(lock)) {
            return;
        }

        try {
            List<MeterData> pendingData = fetchPendingData();
            if (pendingData.isEmpty()) {
                return;
            }

            log.info("Found {} pending data to forward", pendingData.size());

            Map<String, List<MeterData>> groupedData = pendingData.stream()
                    .collect(Collectors.groupingBy(MeterData::getMeterId));

            for (Map.Entry<String, List<MeterData>> entry : groupedData.entrySet()) {
                String meterId = entry.getKey();
                List<MeterData> meterDataList = entry.getValue();

                List<List<MeterData>> batches = partitionList(meterDataList, batchSize);
                for (List<MeterData> batch : batches) {
                    forwardBatch(meterId, batch);
                }
            }

        } catch (Exception e) {
            log.error("Forward pending data failed: {}", e.getMessage(), e);
        } finally {
            redisTemplate.delete(FORWARD_LOCK_KEY);
        }
    }

    public void forwardDataDirect(MeterDataDTO dataDTO) {
        try {
            ForwardDataDTO forwardData = buildForwardData(Collections.singletonList(dataDTO));
            boolean success = sendToDataPlatform(forwardData);
            if (!success) {
                log.warn("Direct forward failed, data will be retried by scheduled task");
            } else {
                log.info("Direct forward success, meterId: {}", dataDTO.getMeterId());
            }
        } catch (Exception e) {
            log.error("Direct forward failed: {}", e.getMessage(), e);
        }
    }

    private List<MeterData> fetchPendingData() {
        try {
            Result<List<MeterData>> result = dataCacheClient.getPendingForwardData(maxRetry, batchSize * 2);
            if (result != null && result.isSuccess() && result.getData() != null) {
                return result.getData();
            }
        } catch (Exception e) {
            log.error("Fetch pending data failed: {}", e.getMessage(), e);
        }
        return Collections.emptyList();
    }

    private void forwardBatch(String meterId, List<MeterData> batch) {
        try {
            List<MeterDataDTO> dataDTOs = convertToDTOs(batch);
            ForwardDataDTO forwardData = buildForwardData(dataDTOs);

            boolean success = sendToDataPlatform(forwardData);

            for (MeterData data : batch) {
                int newRetryCount = data.getRetryCount() + 1;
                String status = success ? ProtocolConstants.FORWARD_STATUS_SUCCESS :
                        (newRetryCount >= maxRetry ? ProtocolConstants.FORWARD_STATUS_FAILED : ProtocolConstants.FORWARD_STATUS_PENDING);

                try {
                    dataCacheClient.updateForwardStatus(data.getId(), status, newRetryCount);
                } catch (Exception e) {
                    log.error("Update forward status failed, id: {}, error: {}", data.getId(), e.getMessage());
                }
            }

            updateForwardStats(success, batch.size());
            log.info("Batch forward {} data for meterId: {}, success: {}", batch.size(), meterId, success);

        } catch (Exception e) {
            log.error("Forward batch failed, meterId: {}, error: {}", meterId, e.getMessage(), e);
            for (MeterData data : batch) {
                int newRetryCount = data.getRetryCount() + 1;
                String status = newRetryCount >= maxRetry ? ProtocolConstants.FORWARD_STATUS_FAILED : ProtocolConstants.FORWARD_STATUS_PENDING;
                try {
                    dataCacheClient.updateForwardStatus(data.getId(), status, newRetryCount);
                } catch (Exception ex) {
                    log.error("Update forward status failed after error, id: {}", data.getId());
                }
            }
        }
    }

    private ForwardDataDTO buildForwardData(List<MeterDataDTO> dataDTOs) {
        ForwardDataDTO forwardData = new ForwardDataDTO();
        forwardData.setBatchId(UUID.randomUUID().toString());
        forwardData.setSource("smartmeter-gateway");
        forwardData.setTimestamp(LocalDateTime.now());
        forwardData.setDataList(dataDTOs);
        forwardData.setSignature(generateSignature(forwardData));
        return forwardData;
    }

    private boolean sendToDataPlatform(ForwardDataDTO forwardData) {
        try (CloseableHttpClient httpClient = HttpClients.createDefault()) {
            HttpPost httpPost = new HttpPost(dataPlatformUrl);

            RequestConfig requestConfig = RequestConfig.custom()
                    .setConnectTimeout(timeout)
                    .setSocketTimeout(timeout)
                    .setConnectionRequestTimeout(timeout)
                    .build();
            httpPost.setConfig(requestConfig);

            httpPost.setHeader("Content-Type", "application/json");
            httpPost.setHeader("App-Key", appKey);
            httpPost.setHeader("Timestamp", String.valueOf(System.currentTimeMillis()));

            String jsonData = JSON.toJSONString(forwardData);
            httpPost.setEntity(new StringEntity(jsonData, StandardCharsets.UTF_8));

            HttpResponse response = httpClient.execute(httpPost);
            int statusCode = response.getStatusLine().getStatusCode();
            String responseBody = EntityUtils.toString(response.getEntity(), StandardCharsets.UTF_8);

            log.debug("Data platform response, status: {}, body: {}", statusCode, responseBody);

            return statusCode >= 200 && statusCode < 300;

        } catch (Exception e) {
            log.error("Send to data platform failed: {}", e.getMessage(), e);
            return false;
        }
    }

    private String generateSignature(ForwardDataDTO forwardData) {
        try {
            String content = forwardData.getBatchId() + "|" +
                    forwardData.getSource() + "|" +
                    forwardData.getTimestamp().toString() + "|" +
                    appSecret;

            Mac sha256Hmac = Mac.getInstance("HmacSHA256");
            SecretKeySpec secretKey = new SecretKeySpec(appSecret.getBytes(StandardCharsets.UTF_8), "HmacSHA256");
            sha256Hmac.init(secretKey);
            byte[] hash = sha256Hmac.doFinal(content.getBytes(StandardCharsets.UTF_8));
            return Base64.getEncoder().encodeToString(hash);
        } catch (Exception e) {
            log.error("Generate signature failed: {}", e.getMessage(), e);
            return "";
        }
    }

    private List<MeterDataDTO> convertToDTOs(List<MeterData> dataList) {
        Map<String, MeterDataDTO> dtoMap = new LinkedHashMap<>();

        for (MeterData data : dataList) {
            MeterDataDTO dto = dtoMap.computeIfAbsent(data.getMeterId(), k -> {
                MeterDataDTO newDto = new MeterDataDTO();
                newDto.setMeterId(data.getMeterId());
                newDto.setProtocolType(data.getProtocolType());
                newDto.setRawData(data.getRawData());
                newDto.setCollectTime(data.getCollectTime());
                newDto.setDataItems(new ArrayList<>());
                return newDto;
            });

            MeterDataDTO.DataItem item = new MeterDataDTO.DataItem();
            item.setDataType(data.getDataType());
            item.setValue(data.getValue());
            item.setUnit(data.getUnit());
            if (data.getParsedData() != null) {
                item.setExtra(JSON.parseObject(data.getParsedData()));
            }
            dto.getDataItems().add(item);
        }

        return new ArrayList<>(dtoMap.values());
    }

    private <T> List<List<T>> partitionList(List<T> list, int batchSize) {
        List<List<T>> batches = new ArrayList<>();
        for (int i = 0; i < list.size(); i += batchSize) {
            batches.add(list.subList(i, Math.min(i + batchSize, list.size())));
        }
        return batches;
    }

    private void updateForwardStats(boolean success, int count) {
        try {
            String key = FORWARD_STATS_KEY + ":" + LocalDateTime.now().toLocalDate();
            String field = success ? "success" : "failed";
            redisTemplate.opsForHash().increment(key, field, count);
            redisTemplate.expire(key, 30, java.util.concurrent.TimeUnit.DAYS);
        } catch (Exception e) {
            log.warn("Update forward stats failed: {}", e.getMessage());
        }
    }

    public Map<String, Object> getForwardStats() {
        Map<String, Object> stats = new HashMap<>();
        try {
            String key = FORWARD_STATS_KEY + ":" + LocalDateTime.now().toLocalDate();
            Map<Object, Object> todayStats = redisTemplate.opsForHash().entries(key);
            stats.put("today", todayStats);
            stats.put("config", Map.of(
                    "dataPlatformUrl", dataPlatformUrl,
                    "batchSize", batchSize,
                    "maxRetry", maxRetry,
                    "timeout", timeout
            ));
        } catch (Exception e) {
            log.error("Get forward stats failed: {}", e.getMessage(), e);
        }
        return stats;
    }

    public boolean manualForward(List<Long> dataIds) {
        log.info("Manual forward requested for data ids: {}", dataIds);
        return true;
    }
}
