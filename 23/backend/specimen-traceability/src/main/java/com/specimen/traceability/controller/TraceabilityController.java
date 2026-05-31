package com.specimen.traceability.controller;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.specimen.common.result.Result;
import com.specimen.traceability.dto.TraceabilityQueryDTO;
import com.specimen.traceability.entity.TraceabilityRecord;
import com.specimen.traceability.service.TraceabilityRecordService;
import com.specimen.traceability.vo.TraceabilityChainVO;
import com.specimen.traceability.vo.TraceabilityRecordVO;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

@Tag(name = "溯源记录管理", description = "溯源记录查询、溯源链查询")
@RestController
@RequestMapping("/traceability/record")
@RequiredArgsConstructor
public class TraceabilityController {

    private final TraceabilityRecordService traceabilityRecordService;

    @Operation(summary = "记录操作日志")
    @PostMapping
    public Result<Void> recordOperation(@RequestBody TraceabilityRecord record) {
        traceabilityRecordService.recordOperation(record);
        return Result.success();
    }

    @Operation(summary = "查询溯源链")
    @GetMapping("/chain/{specimenId}")
    public Result<TraceabilityChainVO> getTraceabilityChain(@PathVariable Long specimenId) {
        return Result.success(traceabilityRecordService.getTraceabilityChain(specimenId));
    }

    @Operation(summary = "分页查询溯源记录")
    @PostMapping("/page")
    public Result<IPage<TraceabilityRecordVO>> queryRecords(@RequestBody TraceabilityQueryDTO queryDTO) {
        return Result.success(traceabilityRecordService.queryRecords(queryDTO));
    }

    @Operation(summary = "获取溯源记录详情")
    @GetMapping("/{id}")
    public Result<TraceabilityRecord> getRecordById(@PathVariable Long id) {
        return Result.success(traceabilityRecordService.getById(id));
    }
}
