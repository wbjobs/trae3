package com.ancient.platform.project.repository;

import com.ancient.platform.project.entity.mongo.Annotation;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

/**
 * 批注Repository接口
 *
 * @author ancient-platform
 * @since 1.0.0
 */
@Repository
public interface AnnotationRepository extends MongoRepository<Annotation, String> {

    /**
     * 根据项目ID和书页ID查询批注列表
     *
     * @param projectId 项目ID
     * @param pageId    书页ID
     * @return 批注列表
     */
    List<Annotation> findByProjectIdAndPageIdOrderByCreateTimeDesc(Long projectId, Long pageId);

    /**
     * 根据项目ID查询批注列表
     *
     * @param projectId 项目ID
     * @return 批注列表
     */
    List<Annotation> findByProjectIdOrderByCreateTimeDesc(Long projectId);

    /**
     * 根据书页ID查询批注数量
     *
     * @param pageId 书页ID
     * @return 批注数量
     */
    long countByPageId(Long pageId);

    /**
     * 根据项目ID和状态查询批注数量
     *
     * @param projectId 项目ID
     * @param status    状态
     * @return 批注数量
     */
    long countByProjectIdAndStatus(Long projectId, Integer status);

    /**
     * 根据用户ID查询批注列表
     *
     * @param userId 用户ID
     * @return 批注列表
     */
    List<Annotation> findByUserIdOrderByCreateTimeDesc(Long userId);

    /**
     * 根据项目ID和类型查询批注列表
     *
     * @param projectId 项目ID
     * @param type      批注类型
     * @return 批注列表
     */
    List<Annotation> findByProjectIdAndTypeOrderByCreateTimeDesc(Long projectId, Integer type);
}
