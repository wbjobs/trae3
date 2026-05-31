package com.mine.ventilation.repository;

import com.mine.ventilation.entity.Tunnel;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface TunnelRepository extends MongoRepository<Tunnel, String> {

    List<Tunnel> findByIdIn(List<String> ids);

    List<Tunnel> findByNameContaining(String name);

    List<Tunnel> findByLevel(Integer level);
}
