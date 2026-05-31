package com.specimen.traceability.controller;

import com.specimen.common.result.Result;
import com.specimen.traceability.doc.SpecimenIndexDoc;
import com.specimen.traceability.dto.TraceabilitySearchDTO;
import com.specimen.traceability.service.ElasticsearchService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@Tag(name = "全文检索管理", description = "ES全文检索、索引同步")
@RestController
@RequestMapping("/traceability/search")
@RequiredArgsConstructor
public class SearchController {

    private final ElasticsearchService elasticsearchService;

    @Operation(summary = "全文检索")
    @PostMapping
    public Result<Map<String, Object>> search(@RequestBody TraceabilitySearchDTO searchDTO) {
        return Result.success(elasticsearchService.search(searchDTO));
    }

    @Operation(summary = "同步标本索引（支持单条/批量）")
    @PostMapping("/sync")
    public Result<Void> syncSpecimenIndex(@RequestBody Object body) {
        if (body instanceof List) {
            @SuppressWarnings("unchecked")
            List<SpecimenIndexDoc> docs = (List<SpecimenIndexDoc>) body;
            elasticsearchService.batchSyncSpecimenIndex(docs);
        } else if (body instanceof SpecimenIndexDoc) {
            elasticsearchService.syncSpecimenIndex((SpecimenIndexDoc) body);
        }
        return Result.success();
    }

    @Operation(summary = "全量同步标本索引")
    @PostMapping("/sync/all")
    public Result<Void> syncAllSpecimenIndex() {
        elasticsearchService.syncAllSpecimenIndex();
        return Result.success();
    }

    @Operation(summary = "删除标本索引")
    @DeleteMapping("/{specimenId}")
    public Result<Void> deleteIndex(@PathVariable Long specimenId) {
        elasticsearchService.deleteIndex(specimenId);
        return Result.success();
    }
}
