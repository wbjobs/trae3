package com.mine.ventilation.service;

import com.mine.ventilation.entity.Annotation;
import com.mine.ventilation.repository.AnnotationRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

@Service
public class AnnotationService {

    @Autowired
    private AnnotationRepository annotationRepository;

    public Annotation save(Annotation annotation) {
        if (annotation.getCreateTime() == null) {
            annotation.setCreateTime(LocalDateTime.now());
        }
        annotation.setUpdateTime(LocalDateTime.now());
        return annotationRepository.save(annotation);
    }

    public List<Annotation> saveAll(List<Annotation> annotations) {
        LocalDateTime now = LocalDateTime.now();
        for (Annotation annotation : annotations) {
            if (annotation.getCreateTime() == null) {
                annotation.setCreateTime(now);
            }
            annotation.setUpdateTime(now);
        }
        return annotationRepository.saveAll(annotations);
    }

    public Optional<Annotation> findById(String id) {
        return annotationRepository.findById(id);
    }

    public List<Annotation> findAll() {
        return annotationRepository.findAll();
    }

    public List<Annotation> findByIds(List<String> ids) {
        return annotationRepository.findByIdIn(ids);
    }

    public List<Annotation> findByTunnelId(String tunnelId) {
        return annotationRepository.findByTunnelId(tunnelId);
    }

    public List<Annotation> findByPipeId(String pipeId) {
        return annotationRepository.findByPipeId(pipeId);
    }

    public List<Annotation> findByFanId(String fanId) {
        return annotationRepository.findByFanId(fanId);
    }

    public List<Annotation> findByTunnelIds(List<String> tunnelIds) {
        return annotationRepository.findByTunnelIdIn(tunnelIds);
    }

    public List<Annotation> findByType(String type) {
        return annotationRepository.findByType(type);
    }

    public List<Annotation> findByStatus(String status) {
        return annotationRepository.findByStatus(status);
    }

    public Annotation update(Annotation annotation) {
        annotation.setUpdateTime(LocalDateTime.now());
        return annotationRepository.save(annotation);
    }

    public void deleteById(String id) {
        annotationRepository.deleteById(id);
    }

    public void deleteAll(List<String> ids) {
        annotationRepository.deleteAll(annotationRepository.findAllById(ids));
    }

    public boolean existsById(String id) {
        return annotationRepository.existsById(id);
    }

    public long count() {
        return annotationRepository.count();
    }

    public void deleteAll() {
        annotationRepository.deleteAll();
    }
}
