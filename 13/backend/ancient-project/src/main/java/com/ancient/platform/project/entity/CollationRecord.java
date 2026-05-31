package com.ancient.platform.project.entity;

import com.baomidou.mybatisplus.annotation.*;
import jakarta.persistence.*;
import lombok.Data;
import org.hibernate.annotations.CreationTimestamp;

import java.io.Serializable;
import java.time.LocalDateTime;

/**
 * 勘校记录实体
 *
 * @author ancient-platform
 * @since 1.0.0
 */
@Data
@Entity
@TableName("t_collation_record")
@Table(name = "t_collation_record")
public class CollationRecord implements Serializable {

    private static final long serialVersionUID = 1L;

    /**
     * 主键ID
     */
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @TableId(type = IdType.AUTO)
    private Long id;

    /**
     * 书页ID
     */
    @Column(name = "page_id", nullable = false)
    private Long pageId;

    /**
     * 项目ID
     */
    @Column(name = "project_id", nullable = false)
    private Long projectId;

    /**
     * 版本号
     */
    @Column(name = "version", nullable = false)
    private Integer version;

    /**
     * 勘校前文本内容
     */
    @Column(name = "before_text", columnDefinition = "TEXT")
    private String beforeText;

    /**
     * 勘校后文本内容
     */
    @Column(name = "after_text", columnDefinition = "TEXT", nullable = false)
    private String afterText;

    /**
     * 变更说明
     */
    @Column(name = "change_description", length = 500)
    private String changeDescription;

    /**
     * 勘校人ID
     */
    @Column(name = "collator_id", nullable = false)
    private Long collatorId;

    /**
     * 勘校类型：0-普通勘校，1-审核，2-冲突解决
     */
    @Column(name = "collation_type", nullable = false)
    private Integer collationType;

    /**
     * 状态：0-待审核，1-已通过，2-已驳回
     */
    @Column(name = "status", nullable = false)
    private Integer status;

    /**
     * 审核人ID
     */
    @Column(name = "reviewer_id")
    private Long reviewerId;

    /**
     * 审核意见
     */
    @Column(name = "review_comment", length = 500)
    private String reviewComment;

    /**
     * 审核时间
     */
    @Column(name = "review_time")
    private LocalDateTime reviewTime;

    /**
     * MongoDB中的版本快照ID
     */
    @Column(name = "snapshot_id", length = 50)
    private String snapshotId;

    /**
     * 是否存在冲突：0-无冲突，1-有冲突
     */
    @Column(name = "has_conflict", nullable = false)
    private Integer hasConflict;

    /**
     * 冲突描述
     */
    @Column(name = "conflict_description", length = 1000)
    private String conflictDescription;

    /**
     * 创建时间
     */
    @CreationTimestamp
    @Column(name = "create_time", nullable = false, updatable = false)
    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createTime;

    /**
     * 逻辑删除：0-未删除，1-已删除
     */
    @TableLogic
    @Column(name = "deleted", nullable = false)
    private Integer deleted;
}
