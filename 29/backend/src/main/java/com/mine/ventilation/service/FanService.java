package com.mine.ventilation.service;

import com.mine.ventilation.entity.Fan;
import com.mine.ventilation.repository.FanRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

@Service
public class FanService {

    @Autowired
    private FanRepository fanRepository;

    public Fan save(Fan fan) {
        if (fan.getCreateTime() == null) {
            fan.setCreateTime(LocalDateTime.now());
        }
        fan.setUpdateTime(LocalDateTime.now());
        return fanRepository.save(fan);
    }

    public List<Fan> saveAll(List<Fan> fans) {
        LocalDateTime now = LocalDateTime.now();
        for (Fan fan : fans) {
            if (fan.getCreateTime() == null) {
                fan.setCreateTime(now);
            }
            fan.setUpdateTime(now);
        }
        return fanRepository.saveAll(fans);
    }

    public Optional<Fan> findById(String id) {
        return fanRepository.findById(id);
    }

    public List<Fan> findAll() {
        return fanRepository.findAll();
    }

    public List<Fan> findByIds(List<String> ids) {
        return fanRepository.findByIdIn(ids);
    }

    public List<Fan> findByTunnelId(String tunnelId) {
        return fanRepository.findByTunnelId(tunnelId);
    }

    public List<Fan> findByPipeId(String pipeId) {
        return fanRepository.findByPipeId(pipeId);
    }

    public List<Fan> findByTunnelIds(List<String> tunnelIds) {
        return fanRepository.findByTunnelIdIn(tunnelIds);
    }

    public List<Fan> findByName(String name) {
        return fanRepository.findByNameContaining(name);
    }

    public List<Fan> findByStatus(String status) {
        return fanRepository.findByStatus(status);
    }

    public void deleteAll() {
        fanRepository.deleteAll();
    }

    public Fan update(Fan fan) {
        fan.setUpdateTime(LocalDateTime.now());
        return fanRepository.save(fan);
    }

    public void deleteById(String id) {
        fanRepository.deleteById(id);
    }

    public void deleteAll(List<String> ids) {
        fanRepository.deleteAll(fanRepository.findAllById(ids));
    }

    public boolean existsById(String id) {
        return fanRepository.existsById(id);
    }

    public long count() {
        return fanRepository.count();
    }
}
