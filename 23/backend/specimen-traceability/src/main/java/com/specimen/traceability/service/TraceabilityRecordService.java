package com.specimen.traceability.service;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.service.IService;
import com.specimen.traceability.dto.TraceabilityQueryDTO;
import com.specimen.traceability.entity.TraceabilityRecord;
import com.specimen.traceability.vo.TraceabilityChainVO;
import com.specimen.traceability.vo.TraceabilityRecordVO;

public interface TraceabilityRecordService extends IService<TraceabilityRecord> {
    void recordOperation(TraceabilityRecord record);
    TraceabilityChainVO getTraceabilityChain(Long specimenId);
    IPage<TraceabilityRecordVO> queryRecords(TraceabilityQueryDTO queryDTO);
}
