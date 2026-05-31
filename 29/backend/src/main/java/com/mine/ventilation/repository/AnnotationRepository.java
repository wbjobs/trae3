package com.mine.ventilation.repository;

import com.mine.ventilation.entity.Annotation;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface AnnotationRepository extends MongoRepository<Annotation, String> {

    List<Annotation> findByIdIn(List<String> ids);

    List<Annotation> findByTunnelId(String tunnelId);

    List<Annotation> findByPipeId(String pipeId);

    List<Annotation> findByFanId(String fanId);

    List<Annotation> findByTunnelIdIn(List<String> tunnelIds);

    List<Annotation> findByType(String type);

    List<Annotation> findByStatus(String status);
}
