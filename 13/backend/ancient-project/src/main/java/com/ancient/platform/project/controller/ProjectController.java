package com.ancient.platform.project.controller;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.ancient.platform.common.result.Result;
import com.ancient.platform.project.dto.request.ProjectCreateRequest;
import com.ancient.platform.project.dto.response.ProjectVO;
import com.ancient.platform.project.service.ProjectService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/projects")
@RequiredArgsConstructor
public class ProjectController {

    private final ProjectService projectService;

    @GetMapping
    public Result<Page<ProjectVO>> listProjects(
            @RequestParam(defaultValue = "1") Integer pageNum,
            @RequestParam(defaultValue = "10") Integer pageSize,
            @RequestParam(required = false) Long userId,
            @RequestParam(required = false) Integer status) {
        return Result.success(projectService.listProjects(pageNum, pageSize, userId, status));
    }

    @GetMapping("/{id}")
    public Result<ProjectVO> getProject(@PathVariable Long id) {
        return Result.success(projectService.getProjectById(id));
    }

    @PostMapping
    public Result<ProjectVO> createProject(@Valid @RequestBody ProjectCreateRequest request) {
        return Result.success(projectService.createProject(request));
    }

    @PutMapping("/{id}")
    public Result<ProjectVO> updateProject(@PathVariable Long id,
                                           @Valid @RequestBody ProjectCreateRequest request) {
        return Result.success(projectService.updateProject(id, request));
    }

    @DeleteMapping("/{id}")
    public Result<Void> deleteProject(@PathVariable Long id) {
        projectService.deleteProject(id);
        return Result.success();
    }

    @PostMapping("/{id}/members")
    public Result<Void> addMember(@PathVariable Long id,
                                  @RequestParam Long userId,
                                  @RequestParam Integer role) {
        projectService.addMember(id, userId, role);
        return Result.success();
    }

    @DeleteMapping("/{id}/members/{userId}")
    public Result<Void> removeMember(@PathVariable Long id,
                                     @PathVariable Long userId) {
        projectService.removeMember(id, userId);
        return Result.success();
    }

    @PutMapping("/{id}/members/{userId}/role")
    public Result<Void> updateMemberRole(@PathVariable Long id,
                                         @PathVariable Long userId,
                                         @RequestParam Integer role) {
        projectService.updateMemberRole(id, userId, role);
        return Result.success();
    }

    @GetMapping("/{id}/progress")
    public Result<Map<String, Object>> getProjectProgress(@PathVariable Long id) {
        return Result.success(projectService.getProjectProgress(id));
    }
}
