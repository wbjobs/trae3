package com.ancient.platform.project.repository;

import com.ancient.platform.project.entity.mongo.PageSnapshot;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

/**
 * 页面版本快照Repository接口
 *
 * @author ancient-platform
 * @since 1.0.0
 */
@Repository
public interface PageSnapshotRepository extends MongoRepository<PageSnapshot, String> {

    /**
     * 根据页面ID查询所有快照（按版本降序）
     *
     * @param pageId 页面ID
     * @return 快照列表
     */
    List<PageSnapshot> findByPageIdOrderByVersionDesc(Long pageId);

    /**
     * 根据页面ID和版本号查询快照
     *
     * @param pageId  页面ID
     * @param version 版本号
     * @return 快照
     */
    Optional<PageSnapshot> findByPageIdAndVersion(Long pageId, Integer version);

    /**
     * 获取页面的最新版本快照
     *
     * @param pageId 页面ID
     * @return 最新版本快照
     */
    Optional<PageSnapshot> findFirstByPageIdOrderByVersionDesc(Long pageId);

    /**
     * 根据项目ID查询所有快照
     *
     * @param projectId 项目ID
     * @return 快照列表
     */
    List<PageSnapshot> findByProjectIdOrderByCreateTimeDesc(Long projectId);

    /**
     * 统计页面的快照数量
     *
     * @param pageId 页面ID
     * @return 快照数量
     */
    long countByPageId(Long pageId);
}
