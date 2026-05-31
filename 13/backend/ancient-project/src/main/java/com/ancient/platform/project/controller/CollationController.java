package com.ancient.platform.project.controller;

import com.ancient.platform.common.result.Result;
import com.ancient.platform.project.dto.request.CollationSubmitRequest;
import com.ancient.platform.project.dto.request.PageUpdateRequest;
import com.ancient.platform.project.dto.response.AncientPageVO;
import com.ancient.platform.project.dto.response.CollationRecordVO;
import com.ancient.platform.project.service.CollationService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/collation")
@RequiredArgsConstructor
public class CollationController {

    private final CollationService collationService;

    @GetMapping("/projects/{projectId}/pages")
    public Result<List<AncientPageVO>> listPages(@PathVariable Long projectId) {
        return Result.success(collationService.listPages(projectId));
    }

    @GetMapping("/pages/{id}")
    public Result<AncientPageVO> getPage(@PathVariable Long id) {
        return Result.success(collationService.getPage(id));
    }

    @PutMapping("/pages/{id}")
    public Result<AncientPageVO> updatePageText(@PathVariable Long id,
                                                @Valid @RequestBody PageUpdateRequest request) {
        request.setPageId(id);
        return Result.success(collationService.updatePageText(request));
    }

    @PostMapping("/pages/{id}/submit")
    public Result<CollationRecordVO> submitCollation(@PathVariable Long id,
                                                     @Valid @RequestBody CollationSubmitRequest request) {
        request.setPageId(id);
        return Result.success(collationService.submitCollation(request));
    }

    @GetMapping("/pages/{id}/history")
    public Result<List<CollationRecordVO>> getPageHistory(@PathVariable Long id) {
        return Result.success(collationService.getPageHistory(id));
    }

    @GetMapping("/pages/{id}/compare")
    public Result<Map<String, Object>> compareVersions(@PathVariable Long id,
                                                       @RequestParam Integer version1,
                                                       @RequestParam Integer version2) {
        return Result.success(collationService.compareVersions(id, version1, version2));
    }

    @PutMapping("/batch/status")
    public Result<Void> batchUpdateStatus(@RequestBody List<Long> pageIds,
                                          @RequestParam Integer status) {
        collationService.batchUpdateStatus(pageIds, status);
        return Result.success();
    }
}
