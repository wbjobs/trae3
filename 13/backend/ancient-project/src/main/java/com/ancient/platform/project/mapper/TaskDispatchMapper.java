package com.ancient.platform.project.mapper;

import com.ancient.platform.project.entity.TaskDispatch;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

import java.util.List;

@Mapper
public interface TaskDispatchMapper extends BaseMapper<TaskDispatch> {

    @Select("SELECT * FROM t_task_dispatch WHERE project_id = #{projectId} AND deleted = 0 ORDER BY create_time DESC")
    List<TaskDispatch> selectByProjectId(@Param("projectId") Long projectId);

    @Select("SELECT * FROM t_task_dispatch WHERE collator_id = #{collatorId} AND deleted = 0 AND status IN (0, 1) ORDER BY priority DESC, create_time DESC")
    List<TaskDispatch> selectByCollatorId(@Param("collatorId") Long collatorId);

    @Update("UPDATE t_task_dispatch SET status = #{status} WHERE id = #{id} AND deleted = 0")
    Integer updateStatus(@Param("id") Long id, @Param("status") Integer status);

    @Select("SELECT COUNT(*) FROM t_task_dispatch WHERE collator_id = #{collatorId} AND deleted = 0 AND status IN (0, 1)")
    Integer countActiveTasksByCollatorId(@Param("collatorId") Long collatorId);
}
