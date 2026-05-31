package com.specimen.data.controller;

import com.specimen.common.result.Result;
import com.specimen.data.entity.SpecimenTag;
import com.specimen.data.service.SpecimenTagService;
import com.specimen.data.vo.SpecimenTagVO;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/data/tag")
@RequiredArgsConstructor
public class TagController {
    private final SpecimenTagService tagService;

    @PostMapping
    public Result<SpecimenTagVO> create(@RequestBody SpecimenTag tag) {
        return Result.success(tagService.create(tag));
    }

    @PutMapping
    public Result<SpecimenTagVO> update(@RequestBody SpecimenTag tag) {
        return Result.success(tagService.update(tag));
    }

    @DeleteMapping("/{id}")
    public Result<Void> delete(@PathVariable Long id) {
        tagService.delete(id);
        return Result.success();
    }

    @GetMapping("/list")
    public Result<List<SpecimenTagVO>> list() {
        return Result.success(tagService.list());
    }
}
