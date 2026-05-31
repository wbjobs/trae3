package com.mine.ventilation.repository;

import com.mine.ventilation.entity.Pipe;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface PipeRepository extends MongoRepository<Pipe, String> {

    List<Pipe> findByIdIn(List<String> ids);

    List<Pipe> findByTunnelId(String tunnelId);

    List<Pipe> findByTunnelIdIn(List<String> tunnelIds);

    List<Pipe> findByNameContaining(String name);

    List<Pipe> findByLayer(String layer);
}
