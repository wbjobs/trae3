package com.smartmeter.cache.service;

import com.alibaba.fastjson.JSON;
import com.smartmeter.common.constant.ProtocolConstants;
import com.smartmeter.common.dto.MeterDataDTO;
import com.smartmeter.common.entity.MeterData;
import com.smartmeter.common.entity.MeterDevice;
import com.smartmeter.cache.mapper.MeterDataMapper;
import com.smartmeter.cache.mapper.MeterDeviceMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;

@Slf4j
@Service
public class DataCacheService {

    @Autowired
    private RedisCacheService redisCacheService;

    @Autowired
    private MeterDataMapper meterDataMapper;

    @Autowired
    private MeterDeviceMapper meterDeviceMapper;

    @Async
    @Transactional(rollbackFor = Exception.class)
    public void saveMeterData(MeterDataDTO dto) {
        log.debug("Saving meter data, meterId: {}, protocol: {}", dto.getMeterId(), dto.getProtocolType());

        try {
            redisCacheService.cacheLatestData(dto.getMeterId(), dto);
            redisCacheService.addHistoryData(dto.getMeterId(), dto);
            log.debug("Data cached in Redis, meterId: {}", dto.getMeterId());

            if (dto.getDataItems() != null) {
                for (MeterDataDTO.DataItem item : dto.getDataItems()) {
                    MeterData meterData = new MeterData();
                    meterData.setMeterId(dto.getMeterId());
                    meterData.setProtocolType(dto.getProtocolType());
                    meterData.setDataType(item.getDataType());
                    meterData.setValue(item.getValue());
                    meterData.setUnit(item.getUnit());
                    meterData.setCollectTime(dto.getCollectTime());
                    meterData.setRawData(dto.getRawData());
                    meterData.setParsedData(JSON.toJSONString(item.getExtra()));
                    meterData.setForwardStatus(ProtocolConstants.FORWARD_STATUS_PENDING);
                    meterData.setRetryCount(0);
                    meterData.setCreateTime(LocalDateTime.now());
                    meterData.setUpdateTime(LocalDateTime.now());
                    meterDataMapper.insert(meterData);
                }
            }

            updateDeviceOnlineStatus(dto.getMeterId(), dto.getProtocolType());
            log.info("Meter data saved successfully, meterId: {}, items count: {}",
                    dto.getMeterId(),
                    dto.getDataItems() != null ? dto.getDataItems().size() : 0);

        } catch (Exception e) {
            log.error("Save meter data failed, meterId: {}, error: {}", dto.getMeterId(), e.getMessage(), e);
            throw e;
        }
    }

    public MeterDataDTO getLatestData(String meterId) {
        MeterDataDTO cached = redisCacheService.getLatestData(meterId);
        if (cached != null) {
            log.debug("Redis cache hit for latest data, meterId: {}", meterId);
            return cached;
        }

        log.debug("Redis cache miss for latest data, querying MySQL, meterId: {}", meterId);
        MeterData dbData = meterDataMapper.findLatestByMeterId(meterId);
        if (dbData != null) {
            MeterDataDTO dto = convertToDTO(dbData);
            redisCacheService.cacheLatestData(meterId, dto);
            return dto;
        }

        redisCacheService.cacheNullPlaceholder(meterId);
        return null;
    }

    public List<MeterData> getHistoryData(String meterId, LocalDateTime startTime, LocalDateTime endTime) {
        return meterDataMapper.findByMeterIdAndTimeRange(meterId, startTime, endTime);
    }

    public List<MeterData> getPendingForwardData(int maxRetry, int limit) {
        return meterDataMapper.findPendingForwardData(
                ProtocolConstants.FORWARD_STATUS_PENDING,
                maxRetry,
                limit);
    }

    @Transactional(rollbackFor = Exception.class)
    public void updateForwardStatus(Long id, String status, int retryCount) {
        MeterData data = new MeterData();
        data.setId(id);
        data.setForwardStatus(status);
        data.setRetryCount(retryCount);
        data.setUpdateTime(LocalDateTime.now());
        if (ProtocolConstants.FORWARD_STATUS_SUCCESS.equals(status)) {
            data.setForwardTime(LocalDateTime.now());
        }
        meterDataMapper.updateById(data);
    }

    private void updateDeviceOnlineStatus(String meterId, String protocolType) {
        MeterDevice device = meterDeviceMapper.selectOne(
                new com.baomidou.mybatisplus.core.conditions.query.QueryWrapper<MeterDevice>()
                        .eq("meter_id", meterId));

        if (device == null) {
            device = new MeterDevice();
            device.setMeterId(meterId);
            device.setProtocolType(protocolType);
            device.setStatus(1);
            device.setCreateTime(LocalDateTime.now());
            device.setLastOnlineTime(LocalDateTime.now());
            device.setUpdateTime(LocalDateTime.now());
            meterDeviceMapper.insert(device);
            log.info("New meter device registered, meterId: {}", meterId);
        } else {
            device.setLastOnlineTime(LocalDateTime.now());
            device.setStatus(1);
            device.setUpdateTime(LocalDateTime.now());
            meterDeviceMapper.updateById(device);
        }
    }

    private MeterDataDTO convertToDTO(MeterData data) {
        MeterDataDTO dto = new MeterDataDTO();
        dto.setMeterId(data.getMeterId());
        dto.setProtocolType(data.getProtocolType());
        dto.setRawData(data.getRawData());
        dto.setCollectTime(data.getCollectTime());

        MeterDataDTO.DataItem item = new MeterDataDTO.DataItem();
        item.setDataType(data.getDataType());
        item.setValue(data.getValue());
        item.setUnit(data.getUnit());
        if (data.getParsedData() != null) {
            item.setExtra(JSON.parseObject(data.getParsedData()));
        }
        dto.setDataItems(List.of(item));

        return dto;
    }

    public MeterDevice getMeterDevice(String meterId) {
        MeterDevice cached = redisCacheService.getDevice(meterId);
        if (cached != null) {
            log.debug("Redis cache hit for device, meterId: {}", meterId);
            return cached;
        }

        log.debug("Redis cache miss for device, querying MySQL, meterId: {}", meterId);
        MeterDevice device = meterDeviceMapper.selectOne(
                new com.baomidou.mybatisplus.core.conditions.query.QueryWrapper<MeterDevice>()
                        .eq("meter_id", meterId));
        redisCacheService.cacheDevice(meterId, device);
        return device;
    }

    public List<MeterDevice> getAllDevices() {
        return meterDeviceMapper.selectList(null);
    }
}
