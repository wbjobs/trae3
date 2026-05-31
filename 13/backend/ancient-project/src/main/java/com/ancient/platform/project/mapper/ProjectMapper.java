package com.ancient.platform.project.mapper;

import com.ancient.platform.project.entity.Project;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.util.List;

/**
 * 项目Mapper接口
 *
 * @author ancient-platform
 * @since 1.0.0
 */
@Mapper
public interface ProjectMapper extends BaseMapper<Project> {

    /**
     * 根据用户ID查询参与的项目列表
     *
     * @param userId 用户ID
     * @return 项目列表
     */
    @Select("SELECT p.* FROM t_project p INNER JOIN t_project_member pm ON p.id = pm.project_id " +
            "WHERE pm.user_id = #{userId} AND pm.status = 0 AND p.deleted = 0 AND pm.deleted = 0 " +
            "ORDER BY p.update_time DESC")
    List<Project> selectProjectsByUserId(@Param("userId") Long userId);

    /**
     * 统计用户创建的项目数量
     *
     * @param userId 用户ID
     * @return 项目数量
     */
    @Select("SELECT COUNT(*) FROM t_project WHERE creator_id = #{userId} AND deleted = 0")
    Integer countCreatedProjects(@Param("userId") Long userId);
}
