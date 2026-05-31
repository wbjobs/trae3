package com.ancient.platform.project.controller;

import com.ancient.platform.common.result.Result;
import com.ancient.platform.project.dto.request.AnnotationCreateRequest;
import com.ancient.platform.project.dto.response.AnnotationVO;
import com.ancient.platform.project.service.AnnotationService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/annotations")
@RequiredArgsConstructor
public class AnnotationController {

    private final AnnotationService annotationService;

    @GetMapping("/projects/{projectId}")
    public Result<List<AnnotationVO>> getAnnotationsByProject(@PathVariable Long projectId) {
        return Result.success(annotationService.getAnnotationsByProject(projectId));
    }

    @GetMapping("/pages/{projectId}/{pageId}")
    public Result<List<AnnotationVO>> getAnnotationsByPage(@PathVariable Long projectId,
                                                           @PathVariable Long pageId) {
        return Result.success(annotationService.getAnnotationsByPage(projectId, pageId));
    }

    @PostMapping
    public Result<AnnotationVO> createAnnotation(@Valid @RequestBody AnnotationCreateRequest request) {
        return Result.success(annotationService.createAnnotation(request));
    }

    @PutMapping("/{id}")
    public Result<AnnotationVO> updateAnnotation(@PathVariable String id,
                                                  @RequestBody Map<String, String> body) {
        return Result.success(annotationService.updateAnnotation(id, body.get("content")));
    }

    @DeleteMapping("/{id}")
    public Result<Void> deleteAnnotation(@PathVariable String id) {
        annotationService.deleteAnnotation(id);
        return Result.success();
    }

    @PostMapping("/{id}/replies")
    public Result<AnnotationVO> addReply(@PathVariable String id,
                                          @RequestBody Map<String, Object> body) {
        Long userId = Long.valueOf(body.get("userId").toString());
        String userName = (String) body.get("userName");
        String content = (String) body.get("content");
        return Result.success(annotationService.addReply(id, userId, userName, content));
    }

    @PutMapping("/{id}/status")
    public Result<AnnotationVO> updateStatus(@PathVariable String id,
                                              @RequestBody Map<String, Integer> body) {
        return Result.success(annotationService.updateStatus(id, body.get("status")));
    }

    @GetMapping("/mentioned/{userId}")
    public Result<List<AnnotationVO>> getMentionedAnnotations(@PathVariable Long userId) {
        return Result.success(annotationService.getMentionedAnnotations(userId));
    }
}
