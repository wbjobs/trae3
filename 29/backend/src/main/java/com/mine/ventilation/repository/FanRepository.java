package com.mine.ventilation.repository;

import com.mine.ventilation.entity.Fan;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface FanRepository extends MongoRepository<Fan, String> {

    List<Fan> findByIdIn(List<String> ids);

    List<Fan> findByTunnelId(String tunnelId);

    List<Fan> findByPipeId(String pipeId);

    List<Fan> findByTunnelIdIn(List<String> tunnelIds);

    List<Fan> findByNameContaining(String name);

    List<Fan> findByStatus(String status);
}
