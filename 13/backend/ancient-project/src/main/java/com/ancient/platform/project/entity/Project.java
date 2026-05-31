package com.ancient.platform.project.entity;

import com.baomidou.mybatisplus.annotation.*;
import jakarta.persistence.*;
import lombok.Data;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.io.Serializable;
import java.time.LocalDateTime;

/**
 * 项目实体
 *
 * @author ancient-platform
 * @since 1.0.0
 */
@Data
@Entity
@TableName("t_project")
@Table(name = "t_project")
public class Project implements Serializable {

    private static final long serialVersionUID = 1L;

    /**
     * 主键ID
     */
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @TableId(type = IdType.AUTO)
    private Long id;

    /**
     * 项目名称
     */
    @Column(name = "name", nullable = false, length = 100)
    private String name;

    /**
     * 项目描述
     */
    @Column(name = "description", length = 500)
    private String description;

    /**
     * 项目封面图片URL
     */
    @Column(name = "cover_image", length = 255)
    private String coverImage;

    /**
     * 项目状态：0-待开始，1-进行中，2-已完成，3-已暂停
     */
    @Column(name = "status", nullable = false)
    private Integer status;

    /**
     * 总页数
     */
    @Column(name = "total_pages", nullable = false)
    private Integer totalPages;

    /**
     * 已完成页数
     */
    @Column(name = "completed_pages", nullable = false)
    private Integer completedPages;

    /**
     * 创建人ID
     */
    @Column(name = "creator_id", nullable = false)
    private Long creatorId;

    /**
     * 创建时间
     */
    @CreationTimestamp
    @Column(name = "create_time", nullable = false, updatable = false)
    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createTime;

    /**
     * 更新时间
     */
    @UpdateTimestamp
    @Column(name = "update_time", nullable = false)
    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updateTime;

    /**
     * 逻辑删除：0-未删除，1-已删除
     */
    @TableLogic
    @Column(name = "deleted", nullable = false)
    private Integer deleted;
}
