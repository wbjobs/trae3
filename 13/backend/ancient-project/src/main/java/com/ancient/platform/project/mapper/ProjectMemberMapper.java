package com.ancient.platform.project.mapper;

import com.ancient.platform.project.entity.ProjectMember;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

import java.util.List;

/**
 * 项目成员Mapper接口
 *
 * @author ancient-platform
 * @since 1.0.0
 */
@Mapper
public interface ProjectMemberMapper extends BaseMapper<ProjectMember> {

    /**
     * 根据项目ID查询成员列表
     *
     * @param projectId 项目ID
     * @return 成员列表
     */
    @Select("SELECT * FROM t_project_member WHERE project_id = #{projectId} AND status = 0 AND deleted = 0 ORDER BY role, join_time")
    List<ProjectMember> selectMembersByProjectId(@Param("projectId") Long projectId);

    /**
     * 根据项目ID和用户ID查询成员
     *
     * @param projectId 项目ID
     * @param userId    用户ID
     * @return 成员信息
     */
    @Select("SELECT * FROM t_project_member WHERE project_id = #{projectId} AND user_id = #{userId} AND status = 0 AND deleted = 0")
    ProjectMember selectByProjectIdAndUserId(@Param("projectId") Long projectId, @Param("userId") Long userId);

    /**
     * 更新成员角色
     *
     * @param projectId 项目ID
     * @param userId    用户ID
     * @param role      新角色
     * @return 影响行数
     */
    @Update("UPDATE t_project_member SET role = #{role} WHERE project_id = #{projectId} AND user_id = #{userId} AND deleted = 0")
    Integer updateMemberRole(@Param("projectId") Long projectId, @Param("userId") Long userId, @Param("role") Integer role);

    /**
     * 移除成员
     *
     * @param projectId 项目ID
     * @param userId    用户ID
     * @return 影响行数
     */
    @Update("UPDATE t_project_member SET status = 2, leave_time = NOW() WHERE project_id = #{projectId} AND user_id = #{userId} AND deleted = 0")
    Integer removeMember(@Param("projectId") Long projectId, @Param("userId") Long userId);

    /**
     * 统计项目成员数量
     *
     * @param projectId 项目ID
     * @return 成员数量
     */
    @Select("SELECT COUNT(*) FROM t_project_member WHERE project_id = #{projectId} AND status = 0 AND deleted = 0")
    Integer countMembers(@Param("projectId") Long projectId);

    /**
     * 更新成员勘校统计信息
     *
     * @param projectId       项目ID
     * @param userId          用户ID
     * @param completedPages  新增完成页数
     * @param collatedChars   新增勘校字数
     * @return 影响行数
     */
    @Update("UPDATE t_project_member SET completed_pages = completed_pages + #{completedPages}, " +
            "total_collated_chars = total_collated_chars + #{collatedChars} " +
            "WHERE project_id = #{projectId} AND user_id = #{userId} AND deleted = 0")
    Integer updateMemberStats(@Param("projectId") Long projectId, @Param("userId") Long userId,
                              @Param("completedPages") Integer completedPages, @Param("collatedChars") Long collatedChars);
}
