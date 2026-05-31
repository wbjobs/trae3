package com.ancient.platform.project.mapper;

import com.ancient.platform.project.entity.CollationRecord;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.util.List;

/**
 * 勘校记录Mapper接口
 *
 * @author ancient-platform
 * @since 1.0.0
 */
@Mapper
public interface CollationRecordMapper extends BaseMapper<CollationRecord> {

    /**
     * 根据页面ID查询勘校记录列表（按版本降序）
     *
     * @param pageId 页面ID
     * @return 勘校记录列表
     */
    @Select("SELECT * FROM t_collation_record WHERE page_id = #{pageId} AND deleted = 0 ORDER BY version DESC")
    List<CollationRecord> selectRecordsByPageId(@Param("pageId") Long pageId);

    /**
     * 获取页面的最新版本号
     *
     * @param pageId 页面ID
     * @return 最新版本号
     */
    @Select("SELECT COALESCE(MAX(version), 0) FROM t_collation_record WHERE page_id = #{pageId} AND deleted = 0")
    Integer getLatestVersion(@Param("pageId") Long pageId);

    /**
     * 根据页面ID和版本号查询勘校记录
     *
     * @param pageId  页面ID
     * @param version 版本号
     * @return 勘校记录
     */
    @Select("SELECT * FROM t_collation_record WHERE page_id = #{pageId} AND version = #{version} AND deleted = 0")
    CollationRecord selectByPageIdAndVersion(@Param("pageId") Long pageId, @Param("version") Integer version);

    /**
     * 查询用户的勘校记录列表
     *
     * @param collatorId 勘校人ID
     * @param startIndex 起始索引
     * @param pageSize   每页数量
     * @return 勘校记录列表
     */
    @Select("SELECT * FROM t_collation_record WHERE collator_id = #{collatorId} AND deleted = 0 " +
            "ORDER BY create_time DESC LIMIT #{startIndex}, #{pageSize}")
    List<CollationRecord> selectRecordsByCollatorId(@Param("collatorId") Long collatorId,
                                                    @Param("startIndex") Integer startIndex,
                                                    @Param("pageSize") Integer pageSize);

    /**
     * 统计页面的冲突记录数量
     *
     * @param pageId 页面ID
     * @return 冲突记录数量
     */
    @Select("SELECT COUNT(*) FROM t_collation_record WHERE page_id = #{pageId} AND has_conflict = 1 AND deleted = 0")
    Integer countConflictRecords(@Param("pageId") Long pageId);
}
