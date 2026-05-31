package com.ancient.platform.project.entity;

import com.baomidou.mybatisplus.annotation.*;
import jakarta.persistence.*;
import lombok.Data;
import org.hibernate.annotations.CreationTimestamp;

import java.io.Serializable;
import java.time.LocalDateTime;

/**
 * 项目成员实体
 *
 * @author ancient-platform
 * @since 1.0.0
 */
@Data
@Entity
@TableName("t_project_member")
@Table(name = "t_project_member")
public class ProjectMember implements Serializable {

    private static final long serialVersionUID = 1L;

    /**
     * 主键ID
     */
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @TableId(type = IdType.AUTO)
    private Long id;

    /**
     * 项目ID
     */
    @Column(name = "project_id", nullable = false)
    private Long projectId;

    /**
     * 用户ID
     */
    @Column(name = "user_id", nullable = false)
    private Long userId;

    /**
     * 成员角色：0-创建者，1-管理员，2-勘校员，3-审核员，4-观察员
     */
    @Column(name = "role", nullable = false)
    private Integer role;

    /**
     * 状态：0-正常，1-已退出，2-已移除
     */
    @Column(name = "status", nullable = false)
    private Integer status;

    /**
     * 加入时间
     */
    @CreationTimestamp
    @Column(name = "join_time", nullable = false, updatable = false)
    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime joinTime;

    /**
     * 退出/移除时间
     */
    @Column(name = "leave_time")
    private LocalDateTime leaveTime;

    /**
     * 已完成勘校页数
     */
    @Column(name = "completed_pages", nullable = false)
    private Integer completedPages;

    /**
     * 总勘校字数
     */
    @Column(name = "total_collated_chars", nullable = false)
    private Long totalCollatedChars;

    /**
     * 逻辑删除：0-未删除，1-已删除
     */
    @TableLogic
    @Column(name = "deleted", nullable = false)
    private Integer deleted;
}
