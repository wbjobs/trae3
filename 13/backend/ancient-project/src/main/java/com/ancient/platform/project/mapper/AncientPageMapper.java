package com.ancient.platform.project.mapper;

import com.ancient.platform.project.entity.AncientPage;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

import java.util.List;

/**
 * 书页Mapper接口
 *
 * @author ancient-platform
 * @since 1.0.0
 */
@Mapper
public interface AncientPageMapper extends BaseMapper<AncientPage> {

    /**
     * 根据项目ID查询书页列表
     *
     * @param projectId 项目ID
     * @return 书页列表
     */
    @Select("SELECT * FROM t_ancient_page WHERE project_id = #{projectId} AND deleted = 0 ORDER BY page_number")
    List<AncientPage> selectPagesByProjectId(@Param("projectId") Long projectId);

    /**
     * 根据项目ID和状态查询书页数量
     *
     * @param projectId 项目ID
     * @param status    状态
     * @return 书页数量
     */
    @Select("SELECT COUNT(*) FROM t_ancient_page WHERE project_id = #{projectId} AND status = #{status} AND deleted = 0")
    Integer countPagesByStatus(@Param("projectId") Long projectId, @Param("status") Integer status);

    /**
     * 更新页面状态
     *
     * @param pageId 页面ID
     * @param status 状态
     * @return 影响行数
     */
    @Update("UPDATE t_ancient_page SET status = #{status} WHERE id = #{pageId} AND deleted = 0")
    Integer updatePageStatus(@Param("pageId") Long pageId, @Param("status") Integer status);

    /**
     * 批量分配页面给用户
     *
     * @param pageIds  页面ID列表
     * @param collatorId 勘校人ID
     * @return 影响行数
     */
    @Update("<script>UPDATE t_ancient_page SET status = 2, current_collator_id = #{collatorId} " +
            "WHERE id IN <foreach collection='pageIds' item='id' open='(' separator=',' close=')'>#{id}</foreach> " +
            "AND deleted = 0</script>")
    Integer batchAssignPages(@Param("pageIds") List<Long> pageIds, @Param("collatorId") Long collatorId);

    /**
     * 带乐观锁更新页面
     *
     * @param page 页面实体
     * @return 影响行数
     */
    @Update("UPDATE t_ancient_page SET " +
            "recognized_text = #{page.recognizedText}, " +
            "collated_text = #{page.collatedText}, " +
            "status = #{page.status}, " +
            "current_collator_id = #{page.currentCollatorId}, " +
            "current_version = current_version + 1, " +
            "last_edit_time = #{page.lastEditTime}, " +
            "last_editor_id = #{page.lastEditorId} " +
            "WHERE id = #{page.id} AND current_version = #{page.currentVersion} AND deleted = 0")
    Integer updatePageWithVersion(@Param("page") AncientPage page);

    /**
     * 批量更新页面状态
     *
     * @param pageIds 页面ID列表
     * @param status 状态
     * @return 影响行数
     */
    @Update("<script>UPDATE t_ancient_page SET status = #{status}, update_time = NOW() " +
            "WHERE id IN <foreach collection='pageIds' item='id' open='(' separator=',' close=')'>#{id}</foreach> " +
            "AND deleted = 0</script>")
    Integer batchUpdatePageStatus(@Param("pageIds") List<Long> pageIds, @Param("status") Integer status);
}
