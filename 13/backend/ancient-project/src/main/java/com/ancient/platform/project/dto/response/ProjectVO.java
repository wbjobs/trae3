package com.ancient.platform.project.dto.response;

import lombok.Data;

import java.io.Serializable;
import java.time.LocalDateTime;

/**
 * 项目视图对象
 *
 * @author ancient-platform
 * @since 1.0.0
 */
@Data
public class ProjectVO implements Serializable {

    private static final long serialVersionUID = 1L;

    /**
     * 主键ID
     */
    private Long id;

    /**
     * 项目名称
     */
    private String name;

    /**
     * 项目描述
     */
    private String description;

    /**
     * 项目封面图片URL
     */
    private String coverImage;

    /**
     * 项目状态：0-待开始，1-进行中，2-已完成，3-已暂停
     */
    private Integer status;

    /**
     * 状态名称
     */
    private String statusName;

    /**
     * 总页数
     */
    private Integer totalPages;

    /**
     * 已完成页数
     */
    private Integer completedPages;

    /**
     * 完成进度（百分比）
     */
    private Double progress;

    /**
     * 创建人ID
     */
    private Long creatorId;

    /**
     * 创建人姓名
     */
    private String creatorName;

    /**
     * 成员数量
     */
    private Integer memberCount;

    /**
     * 创建时间
     */
    private LocalDateTime createTime;

    /**
     * 更新时间
     */
    private LocalDateTime updateTime;
}
