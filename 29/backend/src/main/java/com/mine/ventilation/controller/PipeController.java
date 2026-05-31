package com.mine.ventilation.controller;

import com.mine.ventilation.common.Result;
import com.mine.ventilation.entity.Pipe;
import com.mine.ventilation.service.PipeService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/pipes")
public class PipeController {

    @Autowired
    private PipeService pipeService;

    @PostMapping
    public Result<Pipe> create(@RequestBody Pipe pipe) {
        return Result.success(pipeService.save(pipe));
    }

    @PostMapping("/batch")
    public Result<List<Pipe>> createBatch(@RequestBody List<Pipe> pipes) {
        return Result.success(pipeService.saveAll(pipes));
    }

    @GetMapping("/{id}")
    public Result<Pipe> getById(@PathVariable String id) {
        return pipeService.findById(id)
                .map(Result::success)
                .orElse(Result.error("数据不存在"));
    }

    @GetMapping
    public Result<List<Pipe>> getAll() {
        return Result.success(pipeService.findAll());
    }

    @PostMapping("/ids")
    public Result<List<Pipe>> getByIds(@RequestBody Map<String, List<String>> body) {
        List<String> ids = body.get("ids");
        return Result.success(pipeService.findByIds(ids));
    }

    @GetMapping("/tunnel/{tunnelId}")
    public Result<List<Pipe>> getByTunnelId(@PathVariable String tunnelId) {
        return Result.success(pipeService.findByTunnelId(tunnelId));
    }

    @PostMapping("/tunnels")
    public Result<List<Pipe>> getByTunnelIds(@RequestBody Map<String, List<String>> body) {
        List<String> tunnelIds = body.get("tunnelIds");
        return Result.success(pipeService.findByTunnelIds(tunnelIds));
    }

    @GetMapping("/search")
    public Result<List<Pipe>> searchByName(@RequestParam String name) {
        return Result.success(pipeService.findByName(name));
    }

    @GetMapping("/layer/{layer}")
    public Result<List<Pipe>> getByLayer(@PathVariable String layer) {
        return Result.success(pipeService.findByLayer(layer));
    }

    @PutMapping("/{id}")
    public Result<Pipe> update(@PathVariable String id, @RequestBody Pipe pipe) {
        if (!pipeService.existsById(id)) {
            return Result.error("数据不存在");
        }
        pipe.setId(id);
        return Result.success(pipeService.update(pipe));
    }

    @DeleteMapping("/{id}")
    public Result<Void> delete(@PathVariable String id) {
        if (!pipeService.existsById(id)) {
            return Result.error("数据不存在");
        }
        pipeService.deleteById(id);
        return Result.success();
    }

    @DeleteMapping("/batch")
    public Result<Void> deleteBatch(@RequestBody Map<String, List<String>> body) {
        List<String> ids = body.get("ids");
        pipeService.deleteAll(ids);
        return Result.success();
    }

    @GetMapping("/count")
    public Result<Long> count() {
        return Result.success(pipeService.count());
    }
}
