package com.railway.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.railway.common.entity.TrainStatus;
import com.railway.mapper.TrainStatusMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import jakarta.annotation.Resource;
import java.time.LocalDateTime;
import java.util.List;

@Service
public class TrainStatusService extends ServiceImpl<TrainStatusMapper, TrainStatus> {

    private static final Logger log = LoggerFactory.getLogger(TrainStatusService.class);

    @Resource
    private TrainStatusMapper trainStatusMapper;

    public List<TrainStatus> getLatestByTrainId(String trainId, int limit) {
        return trainStatusMapper.findLatestByTrainId(trainId, limit);
    }

    public IPage<TrainStatus> getByTrainIdAndTimeRange(String trainId,
                                                        LocalDateTime startTime,
                                                        LocalDateTime endTime,
                                                        int pageNum,
                                                        int pageSize) {
        Page<TrainStatus> page = new Page<>(pageNum, pageSize);
        return trainStatusMapper.findByTrainIdAndTimeRange(page, trainId, startTime, endTime);
    }

    public IPage<TrainStatus> getByLineIdAndTimeRange(String lineId,
                                                        LocalDateTime startTime,
                                                        LocalDateTime endTime,
                                                        int pageNum,
                                                        int pageSize) {
        Page<TrainStatus> page = new Page<>(pageNum, pageSize);
        return trainStatusMapper.findByLineIdAndTimeRange(page, lineId, startTime, endTime);
    }

    public List<TrainStatus> getByStatusSince(Integer status, LocalDateTime sinceTime) {
        return trainStatusMapper.findByStatusSince(status, sinceTime);
    }

    public List<String> getActiveTrainIds(LocalDateTime sinceTime) {
        return trainStatusMapper.findActiveTrainIds(sinceTime);
    }

    public IPage<TrainStatus> queryByConditions(String trainId, String lineId,
                                                  Integer status, LocalDateTime startTime,
                                                  LocalDateTime endTime,
                                                  int pageNum, int pageSize) {
        Page<TrainStatus> page = new Page<>(pageNum, pageSize);

        LambdaQueryWrapper<TrainStatus> wrapper = new LambdaQueryWrapper<>();

        if (trainId != null && !trainId.isEmpty()) {
            wrapper.eq(TrainStatus::getTrainId, trainId);
        }

        if (lineId != null && !lineId.isEmpty()) {
            wrapper.eq(TrainStatus::getLineId, lineId);
        }

        if (status != null) {
            wrapper.eq(TrainStatus::getStatus, status);
        }

        if (startTime != null) {
            wrapper.ge(TrainStatus::getReportTime, startTime);
        }

        if (endTime != null) {
            wrapper.le(TrainStatus::getReportTime, endTime);
        }

        wrapper.orderByDesc(TrainStatus::getReportTime);

        return page(page, wrapper);
    }

    public long countByTrainIdAndTimeRange(String trainId,
                                            LocalDateTime startTime,
                                            LocalDateTime endTime) {
        return trainStatusMapper.countByTrainIdAndTimeRange(trainId, startTime, endTime);
    }

    public boolean saveStatus(TrainStatus status) {
        if (status.getCreateTime() == null) {
            status.setCreateTime(LocalDateTime.now());
        }
        return save(status);
    }

    public TrainStatus getLatestStatus(String trainId) {
        List<TrainStatus> list = getLatestByTrainId(trainId, 1);
        return (list != null && !list.isEmpty()) ? list.get(0) : null;
    }
}
