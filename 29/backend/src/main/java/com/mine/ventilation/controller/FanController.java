package com.mine.ventilation.controller;

import com.mine.ventilation.common.Result;
import com.mine.ventilation.entity.Fan;
import com.mine.ventilation.service.FanService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/fans")
public class FanController {

    @Autowired
    private FanService fanService;

    @PostMapping
    public Result<Fan> create(@RequestBody Fan fan) {
        return Result.success(fanService.save(fan));
    }

    @PostMapping("/batch")
    public Result<List<Fan>> createBatch(@RequestBody List<Fan> fans) {
        return Result.success(fanService.saveAll(fans));
    }

    @GetMapping("/{id}")
    public Result<Fan> getById(@PathVariable String id) {
        return fanService.findById(id)
                .map(Result::success)
                .orElse(Result.error("数据不存在"));
    }

    @GetMapping
    public Result<List<Fan>> getAll() {
        return Result.success(fanService.findAll());
    }

    @PostMapping("/ids")
    public Result<List<Fan>> getByIds(@RequestBody Map<String, List<String>> body) {
        List<String> ids = body.get("ids");
        return Result.success(fanService.findByIds(ids));
    }

    @GetMapping("/tunnel/{tunnelId}")
    public Result<List<Fan>> getByTunnelId(@PathVariable String tunnelId) {
        return Result.success(fanService.findByTunnelId(tunnelId));
    }

    @GetMapping("/pipe/{pipeId}")
    public Result<List<Fan>> getByPipeId(@PathVariable String pipeId) {
        return Result.success(fanService.findByPipeId(pipeId));
    }

    @PostMapping("/tunnels")
    public Result<List<Fan>> getByTunnelIds(@RequestBody Map<String, List<String>> body) {
        List<String> tunnelIds = body.get("tunnelIds");
        return Result.success(fanService.findByTunnelIds(tunnelIds));
    }

    @GetMapping("/search")
    public Result<List<Fan>> searchByName(@RequestParam String name) {
        return Result.success(fanService.findByName(name));
    }

    @GetMapping("/status/{status}")
    public Result<List<Fan>> getByStatus(@PathVariable String status) {
        return Result.success(fanService.findByStatus(status));
    }

    @PutMapping("/{id}")
    public Result<Fan> update(@PathVariable String id, @RequestBody Fan fan) {
        if (!fanService.existsById(id)) {
            return Result.error("数据不存在");
        }
        fan.setId(id);
        return Result.success(fanService.update(fan));
    }

    @DeleteMapping("/{id}")
    public Result<Void> delete(@PathVariable String id) {
        if (!fanService.existsById(id)) {
            return Result.error("数据不存在");
        }
        fanService.deleteById(id);
        return Result.success();
    }

    @DeleteMapping("/batch")
    public Result<Void> deleteBatch(@RequestBody Map<String, List<String>> body) {
        List<String> ids = body.get("ids");
        fanService.deleteAll(ids);
        return Result.success();
    }

    @GetMapping("/count")
    public Result<Long> count() {
        return Result.success(fanService.count());
    }
}
