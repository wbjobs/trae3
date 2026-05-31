package com.specimen.traceability.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.specimen.common.enums.SpecimenTypeEnum;
import com.specimen.traceability.doc.SpecimenIndexDoc;
import com.specimen.traceability.dto.TraceabilityQueryDTO;
import com.specimen.traceability.entity.TraceabilityRecord;
import com.specimen.traceability.enums.OperationTypeEnum;
import com.specimen.traceability.feign.SpecimenClient;
import com.specimen.traceability.mapper.TraceabilityRecordMapper;
import com.specimen.traceability.service.TraceabilityRecordService;
import com.specimen.traceability.vo.TraceabilityChainVO;
import com.specimen.traceability.vo.TraceabilityRecordVO;
import org.springframework.beans.BeanUtils;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.List;
import java.util.stream.Collectors;

@Service
public class TraceabilityRecordServiceImpl extends ServiceImpl<TraceabilityRecordMapper, TraceabilityRecord> implements TraceabilityRecordService {

    @Autowired
    private SpecimenClient specimenClient;

    @Override
    public void recordOperation(TraceabilityRecord record) {
        if (record.getOperationTime() == null) {
            record.setOperationTime(LocalDateTime.now());
        }
        save(record);
    }

    @Override
    public TraceabilityChainVO getTraceabilityChain(Long specimenId) {
        SpecimenIndexDoc specimen = specimenClient.getSpecimenById(specimenId).getData();
        if (specimen == null) {
            return null;
        }

        LambdaQueryWrapper<TraceabilityRecord> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(TraceabilityRecord::getSpecimenId, specimenId)
                .orderByDesc(TraceabilityRecord::getOperationTime);
        List<TraceabilityRecord> records = list(wrapper);

        TraceabilityChainVO chainVO = new TraceabilityChainVO();
        chainVO.setSpecimenId(specimen.getSpecimenId());
        chainVO.setSpecimenNo(specimen.getSpecimenNo());
        chainVO.setSpecimenName(specimen.getName());
        chainVO.setSpecimenType(specimen.getType());
        chainVO.setSpecimenTypeName(
            specimen.getType() != null && SpecimenTypeEnum.getByCode(specimen.getType()) != null
                ? SpecimenTypeEnum.getByCode(specimen.getType()).getName()
                : "未知"
        );
        chainVO.setClassification(specimen.getClassification());
        chainVO.setDescription(specimen.getDescription());
        chainVO.setLocation(specimen.getLocation());
        chainVO.setCollector(specimen.getCollector());
        chainVO.setCollectTime(specimen.getCollectTime() != null ? specimen.getCollectTime().toString() : null);
        chainVO.setTags(specimen.getTags());

        List<TraceabilityRecordVO> recordVOS = records.stream().map(this::convertToVO).collect(Collectors.toList());
        chainVO.setRecords(recordVOS);

        return chainVO;
    }

    @Override
    public IPage<TraceabilityRecordVO> queryRecords(TraceabilityQueryDTO queryDTO) {
        Page<TraceabilityRecord> page = new Page<>(queryDTO.getPageNum(), queryDTO.getPageSize());
        LambdaQueryWrapper<TraceabilityRecord> wrapper = new LambdaQueryWrapper<>();

        if (queryDTO.getSpecimenId() != null) {
            wrapper.eq(TraceabilityRecord::getSpecimenId, queryDTO.getSpecimenId());
        }
        if (queryDTO.getOperationType() != null) {
            wrapper.eq(TraceabilityRecord::getOperationType, queryDTO.getOperationType());
        }
        if (queryDTO.getOperatorId() != null) {
            wrapper.eq(TraceabilityRecord::getOperatorId, queryDTO.getOperatorId());
        }
        if (queryDTO.getOperatorName() != null && !queryDTO.getOperatorName().isEmpty()) {
            wrapper.like(TraceabilityRecord::getOperatorName, queryDTO.getOperatorName());
        }
        if (queryDTO.getStartTime() != null) {
            wrapper.ge(TraceabilityRecord::getOperationTime, queryDTO.getStartTime());
        }
        if (queryDTO.getEndTime() != null) {
            wrapper.le(TraceabilityRecord::getOperationTime, queryDTO.getEndTime());
        }
        wrapper.orderByDesc(TraceabilityRecord::getOperationTime);

        IPage<TraceabilityRecord> recordPage = page(page, wrapper);
        IPage<TraceabilityRecordVO> voPage = new Page<>(recordPage.getCurrent(), recordPage.getSize(), recordPage.getTotal());
        List<TraceabilityRecordVO> voList = recordPage.getRecords().stream().map(this::convertToVO).collect(Collectors.toList());
        voPage.setRecords(voList);

        return voPage;
    }

    private TraceabilityRecordVO convertToVO(TraceabilityRecord record) {
        TraceabilityRecordVO vo = new TraceabilityRecordVO();
        BeanUtils.copyProperties(record, vo);
        OperationTypeEnum typeEnum = OperationTypeEnum.getByCode(record.getOperationType());
        if (typeEnum != null) {
            vo.setOperationTypeName(typeEnum.getDesc());
        }
        return vo;
    }
}
