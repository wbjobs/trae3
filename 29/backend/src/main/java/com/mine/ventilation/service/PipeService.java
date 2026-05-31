package com.mine.ventilation.service;

import com.mine.ventilation.entity.Pipe;
import com.mine.ventilation.repository.PipeRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

@Service
public class PipeService {

    @Autowired
    private PipeRepository pipeRepository;

    public Pipe save(Pipe pipe) {
        if (pipe.getCreateTime() == null) {
            pipe.setCreateTime(LocalDateTime.now());
        }
        pipe.setUpdateTime(LocalDateTime.now());
        return pipeRepository.save(pipe);
    }

    public List<Pipe> saveAll(List<Pipe> pipes) {
        LocalDateTime now = LocalDateTime.now();
        for (Pipe pipe : pipes) {
            if (pipe.getCreateTime() == null) {
                pipe.setCreateTime(now);
            }
            pipe.setUpdateTime(now);
        }
        return pipeRepository.saveAll(pipes);
    }

    public Optional<Pipe> findById(String id) {
        return pipeRepository.findById(id);
    }

    public List<Pipe> findAll() {
        return pipeRepository.findAll();
    }

    public List<Pipe> findByIds(List<String> ids) {
        return pipeRepository.findByIdIn(ids);
    }

    public List<Pipe> findByTunnelId(String tunnelId) {
        return pipeRepository.findByTunnelId(tunnelId);
    }

    public List<Pipe> findByTunnelIds(List<String> tunnelIds) {
        return pipeRepository.findByTunnelIdIn(tunnelIds);
    }

    public List<Pipe> findByName(String name) {
        return pipeRepository.findByNameContaining(name);
    }

    public List<Pipe> findByLayer(String layer) {
        return pipeRepository.findByLayer(layer);
    }

    public Pipe update(Pipe pipe) {
        pipe.setUpdateTime(LocalDateTime.now());
        return pipeRepository.save(pipe);
    }

    public void deleteById(String id) {
        pipeRepository.deleteById(id);
    }

    public void deleteAll(List<String> ids) {
        pipeRepository.deleteAll(pipeRepository.findAllById(ids));
    }

    public boolean existsById(String id) {
        return pipeRepository.existsById(id);
    }

    public long count() {
        return pipeRepository.count();
    }

    public void deleteAll() {
        pipeRepository.deleteAll();
    }
}
