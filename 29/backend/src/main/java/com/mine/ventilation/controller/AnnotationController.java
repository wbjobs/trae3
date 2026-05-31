package com.mine.ventilation.controller;

import com.mine.ventilation.common.Result;
import com.mine.ventilation.entity.Annotation;
import com.mine.ventilation.service.AnnotationService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/annotations")
public class AnnotationController {

    @Autowired
    private AnnotationService annotationService;

    @PostMapping
    public Result<Annotation> create(@RequestBody Annotation annotation) {
        return Result.success(annotationService.save(annotation));
    }

    @PostMapping("/batch")
    public Result<List<Annotation>> createBatch(@RequestBody List<Annotation> annotations) {
        return Result.success(annotationService.saveAll(annotations));
    }

    @GetMapping("/{id}")
    public Result<Annotation> getById(@PathVariable String id) {
        return annotationService.findById(id)
                .map(Result::success)
                .orElse(Result.error("数据不存在"));
    }

    @GetMapping
    public Result<List<Annotation>> getAll() {
        return Result.success(annotationService.findAll());
    }

    @PostMapping("/ids")
    public Result<List<Annotation>> getByIds(@RequestBody Map<String, List<String>> body) {
        List<String> ids = body.get("ids");
        return Result.success(annotationService.findByIds(ids));
    }

    @GetMapping("/tunnel/{tunnelId}")
    public Result<List<Annotation>> getByTunnelId(@PathVariable String tunnelId) {
        return Result.success(annotationService.findByTunnelId(tunnelId));
    }

    @GetMapping("/pipe/{pipeId}")
    public Result<List<Annotation>> getByPipeId(@PathVariable String pipeId) {
        return Result.success(annotationService.findByPipeId(pipeId));
    }

    @GetMapping("/fan/{fanId}")
    public Result<List<Annotation>> getByFanId(@PathVariable String fanId) {
        return Result.success(annotationService.findByFanId(fanId));
    }

    @PostMapping("/tunnels")
    public Result<List<Annotation>> getByTunnelIds(@RequestBody Map<String, List<String>> body) {
        List<String> tunnelIds = body.get("tunnelIds");
        return Result.success(annotationService.findByTunnelIds(tunnelIds));
    }

    @GetMapping("/type/{type}")
    public Result<List<Annotation>> getByType(@PathVariable String type) {
        return Result.success(annotationService.findByType(type));
    }

    @GetMapping("/status/{status}")
    public Result<List<Annotation>> getByStatus(@PathVariable String status) {
        return Result.success(annotationService.findByStatus(status));
    }

    @PutMapping("/{id}")
    public Result<Annotation> update(@PathVariable String id, @RequestBody Annotation annotation) {
        if (!annotationService.existsById(id)) {
            return Result.error("数据不存在");
        }
        annotation.setId(id);
        return Result.success(annotationService.update(annotation));
    }

    @DeleteMapping("/{id}")
    public Result<Void> delete(@PathVariable String id) {
        if (!annotationService.existsById(id)) {
            return Result.error("数据不存在");
        }
        annotationService.deleteById(id);
        return Result.success();
    }

    @DeleteMapping("/batch")
    public Result<Void> deleteBatch(@RequestBody Map<String, List<String>> body) {
        List<String> ids = body.get("ids");
        annotationService.deleteAll(ids);
        return Result.success();
    }

    @GetMapping("/count")
    public Result<Long> count() {
        return Result.success(annotationService.count());
    }
}
