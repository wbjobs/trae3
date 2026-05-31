package com.mine.ventilation.service;

import com.mine.ventilation.entity.Tunnel;
import com.mine.ventilation.repository.TunnelRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

@Service
public class TunnelService {

    @Autowired
    private TunnelRepository tunnelRepository;

    public Tunnel save(Tunnel tunnel) {
        if (tunnel.getCreateTime() == null) {
            tunnel.setCreateTime(LocalDateTime.now());
        }
        tunnel.setUpdateTime(LocalDateTime.now());
        return tunnelRepository.save(tunnel);
    }

    public List<Tunnel> saveAll(List<Tunnel> tunnels) {
        LocalDateTime now = LocalDateTime.now();
        for (Tunnel tunnel : tunnels) {
            if (tunnel.getCreateTime() == null) {
                tunnel.setCreateTime(now);
            }
            tunnel.setUpdateTime(now);
        }
        return tunnelRepository.saveAll(tunnels);
    }

    public Optional<Tunnel> findById(String id) {
        return tunnelRepository.findById(id);
    }

    public List<Tunnel> findAll() {
        return tunnelRepository.findAll();
    }

    public List<Tunnel> findByIds(List<String> ids) {
        return tunnelRepository.findByIdIn(ids);
    }

    public List<Tunnel> findByName(String name) {
        return tunnelRepository.findByNameContaining(name);
    }

    public List<Tunnel> findByLevel(Integer level) {
        return tunnelRepository.findByLevel(level);
    }

    public Tunnel update(Tunnel tunnel) {
        tunnel.setUpdateTime(LocalDateTime.now());
        return tunnelRepository.save(tunnel);
    }

    public void deleteById(String id) {
        tunnelRepository.deleteById(id);
    }

    public void deleteAll(List<String> ids) {
        tunnelRepository.deleteAll(tunnelRepository.findAllById(ids));
    }

    public boolean existsById(String id) {
        return tunnelRepository.existsById(id);
    }

    public long count() {
        return tunnelRepository.count();
    }

    public void deleteAll() {
        tunnelRepository.deleteAll();
    }
}
