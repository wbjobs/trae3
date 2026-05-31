package com.specimen.data.controller;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.specimen.common.result.Result;
import com.specimen.data.dto.SpecimenCreateDTO;
import com.specimen.data.dto.SpecimenQueryDTO;
import com.specimen.data.dto.SpecimenUpdateDTO;
import com.specimen.data.service.SpecimenService;
import com.specimen.data.vo.SpecimenListVO;
import com.specimen.data.vo.SpecimenStatisticsVO;
import com.specimen.data.vo.SpecimenVO;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/data/specimen")
@RequiredArgsConstructor
public class SpecimenController {
    private final SpecimenService specimenService;

    @PostMapping
    public Result<SpecimenVO> create(@RequestBody SpecimenCreateDTO dto) {
        return Result.success(specimenService.create(dto));
    }

    @PutMapping
    public Result<SpecimenVO> update(@RequestBody SpecimenUpdateDTO dto) {
        return Result.success(specimenService.update(dto));
    }

    @DeleteMapping("/{id}")
    public Result<Void> delete(@PathVariable Long id) {
        specimenService.delete(id);
        return Result.success();
    }

    @GetMapping("/{id}")
    public Result<SpecimenVO> getById(@PathVariable Long id) {
        return Result.success(specimenService.getById(id));
    }

    @PostMapping("/page")
    public Result<Page<SpecimenListVO>> page(@RequestBody SpecimenQueryDTO dto) {
        return Result.success(specimenService.page(dto));
    }

    @GetMapping("/statistics")
    public Result<SpecimenStatisticsVO> statistics() {
        return Result.success(specimenService.statistics());
    }

    @PostMapping("/preview-urls")
    public Result<Map<Long, String>> batchPreviewUrls(@RequestBody List<Long> specimenIds) {
        return Result.success(specimenService.batchPreviewUrls(specimenIds));
    }
}
