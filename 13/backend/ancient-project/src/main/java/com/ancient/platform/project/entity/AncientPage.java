package com.ancient.platform.project.entity;

import com.baomidou.mybatisplus.annotation.*;
import jakarta.persistence.*;
import lombok.Data;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.io.Serializable;
import java.time.LocalDateTime;

/**
 * 书页实体
 *
 * @author ancient-platform
 * @since 1.0.0
 */
@Data
@Entity
@TableName("t_ancient_page")
@Table(name = "t_ancient_page")
public class AncientPage implements Serializable {

    private static final long serialVersionUID = 1L;

    /**
     * 主键ID
     */
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @TableId(type = IdType.AUTO)
    private Long id;

    /**
     * 所属项目ID
     */
    @Column(name = "project_id", nullable = false)
    private Long projectId;

    /**
     * 页码
     */
    @Column(name = "page_number", nullable = false)
    private Integer pageNumber;

    /**
     * 原始图片URL
     */
    @Column(name = "original_image_url", nullable = false, length = 255)
    private String originalImageUrl;

    /**
     * 识别文本内容
     */
    @Column(name = "recognized_text", columnDefinition = "TEXT")
    private String recognizedText;

    /**
     * 勘校后的文本内容
     */
    @Column(name = "collated_text", columnDefinition = "TEXT")
    private String collatedText;

    /**
     * 页面状态：0-待分配，1-分配中，2-勘校中，3-待审核，4-已完成
     */
    @Column(name = "status", nullable = false)
    private Integer status;

    /**
     * 当前勘校人ID
     */
    @Column(name = "current_collator_id")
    private Long currentCollatorId;

    /**
     * 当前版本号（乐观锁）
     */
    @Version
    @Column(name = "current_version", nullable = false)
    private Integer currentVersion;

    /**
     * 最后编辑时间
     */
    @Column(name = "last_edit_time")
    private LocalDateTime lastEditTime;

    /**
     * 最后编辑人ID
     */
    @Column(name = "last_editor_id")
    private Long lastEditorId;

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
