package com.ancient.platform.project.controller;

import com.ancient.platform.common.result.Result;
import com.ancient.platform.project.dto.request.TaskBatchAssignRequest;
import com.ancient.platform.project.dto.request.TaskCancelRequest;
import com.ancient.platform.project.dto.request.TaskReassignRequest;
import com.ancient.platform.project.dto.response.TaskDispatchDetailVO;
import com.ancient.platform.project.dto.response.TaskDispatchVO;
import com.ancient.platform.project.service.TaskDispatchService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/tasks")
@RequiredArgsConstructor
public class TaskDispatchController {

    private final TaskDispatchService taskDispatchService;

    @PostMapping("/assign")
    public Result<TaskDispatchVO> batchAssign(@Valid @RequestBody TaskBatchAssignRequest request) {
        return Result.success(taskDispatchService.batchAssign(request));
    }

    @PutMapping("/{id}/reassign")
    public Result<TaskDispatchVO> reassign(@PathVariable Long id,
                                           @Valid @RequestBody TaskReassignRequest request) {
        return Result.success(taskDispatchService.reassign(id, request));
    }

    @PutMapping("/{id}/cancel")
    public Result<Void> cancel(@PathVariable Long id,
                               @RequestBody(required = false) TaskCancelRequest request) {
        taskDispatchService.cancel(id, request);
        return Result.success();
    }

    @GetMapping("/projects/{projectId}")
    public Result<List<TaskDispatchVO>> getProjectDispatches(@PathVariable Long projectId) {
        return Result.success(taskDispatchService.getProjectDispatches(projectId));
    }

    @GetMapping("/{id}")
    public Result<TaskDispatchDetailVO> getDispatchDetail(@PathVariable Long id) {
        return Result.success(taskDispatchService.getDispatchDetail(id));
    }

    @GetMapping("/my")
    public Result<List<TaskDispatchVO>> getMyTasks() {
        return Result.success(taskDispatchService.getMyTasks());
    }

    @PostMapping("/auto-assign")
    public Result<List<TaskDispatchVO>> autoAssign(@RequestParam Long projectId) {
        return Result.success(taskDispatchService.autoAssign(projectId));
    }

    @GetMapping("/statistics/{projectId}")
    public Result<Map<String, Object>> getDispatchStatistics(@PathVariable Long projectId) {
        return Result.success(taskDispatchService.getDispatchStatistics(projectId));
    }
}
