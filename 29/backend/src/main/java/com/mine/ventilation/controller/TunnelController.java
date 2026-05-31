package com.mine.ventilation.controller;

import com.mine.ventilation.common.Result;
import com.mine.ventilation.entity.Tunnel;
import com.mine.ventilation.service.TunnelService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/tunnels")
public class TunnelController {

    @Autowired
    private TunnelService tunnelService;

    @PostMapping
    public Result<Tunnel> create(@RequestBody Tunnel tunnel) {
        return Result.success(tunnelService.save(tunnel));
    }

    @PostMapping("/batch")
    public Result<List<Tunnel>> createBatch(@RequestBody List<Tunnel> tunnels) {
        return Result.success(tunnelService.saveAll(tunnels));
    }

    @GetMapping("/{id}")
    public Result<Tunnel> getById(@PathVariable String id) {
        return tunnelService.findById(id)
                .map(Result::success)
                .orElse(Result.error("数据不存在"));
    }

    @GetMapping
    public Result<List<Tunnel>> getAll() {
        return Result.success(tunnelService.findAll());
    }

    @PostMapping("/ids")
    public Result<List<Tunnel>> getByIds(@RequestBody Map<String, List<String>> body) {
        List<String> ids = body.get("ids");
        return Result.success(tunnelService.findByIds(ids));
    }

    @GetMapping("/search")
    public Result<List<Tunnel>> searchByName(@RequestParam String name) {
        return Result.success(tunnelService.findByName(name));
    }

    @GetMapping("/layer/{layer}")
    public Result<List<Tunnel>> getByLayer(@PathVariable Integer layer) {
        return Result.success(tunnelService.findByLevel(layer));
    }

    @PutMapping("/{id}")
    public Result<Tunnel> update(@PathVariable String id, @RequestBody Tunnel tunnel) {
        if (!tunnelService.existsById(id)) {
            return Result.error("数据不存在");
        }
        tunnel.setId(id);
        return Result.success(tunnelService.update(tunnel));
    }

    @DeleteMapping("/{id}")
    public Result<Void> delete(@PathVariable String id) {
        if (!tunnelService.existsById(id)) {
            return Result.error("数据不存在");
        }
        tunnelService.deleteById(id);
        return Result.success();
    }

    @DeleteMapping("/batch")
    public Result<Void> deleteBatch(@RequestBody Map<String, List<String>> body) {
        List<String> ids = body.get("ids");
        tunnelService.deleteAll(ids);
        return Result.success();
    }

    @GetMapping("/count")
    public Result<Long> count() {
        return Result.success(tunnelService.count());
    }
}
