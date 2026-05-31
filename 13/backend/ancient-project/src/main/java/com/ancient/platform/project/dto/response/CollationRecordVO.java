package com.ancient.platform.project.dto.response;

import lombok.Data;

import java.io.Serializable;
import java.time.LocalDateTime;

/**
 * 勘校记录视图对象
 *
 * @author ancient-platform
 * @since 1.0.0
 */
@Data
public class CollationRecordVO implements Serializable {

    private static final long serialVersionUID = 1L;

    /**
     * 主键ID
     */
    private Long id;

    /**
     * 书页ID
     */
    private Long pageId;

    /**
     * 页码
     */
    private Integer pageNumber;

    /**
     * 版本号
     */
    private Integer version;

    /**
     * 勘校前文本内容
     */
    private String beforeText;

    /**
     * 勘校后文本内容
     */
    private String afterText;

    /**
     * 变更说明
     */
    private String changeDescription;

    /**
     * 勘校人ID
     */
    private Long collatorId;

    /**
     * 勘校人姓名
     */
    private String collatorName;

    /**
     * 勘校类型：0-普通勘校，1-审核，2-冲突解决
     */
    private Integer collationType;

    /**
     * 勘校类型名称
     */
    private String collationTypeName;

    /**
     * 状态：0-待审核，1-已通过，2-已驳回
     */
    private Integer status;

    /**
     * 状态名称
     */
    private String statusName;

    /**
     * 审核人ID
     */
    private Long reviewerId;

    /**
     * 审核人姓名
     */
    private String reviewerName;

    /**
     * 审核意见
     */
    private String reviewComment;

    /**
     * 审核时间
     */
    private LocalDateTime reviewTime;

    /**
     * 是否存在冲突：0-无冲突，1-有冲突
     */
    private Integer hasConflict;

    /**
     * 冲突描述
     */
    private String conflictDescription;

    /**
     * 变更字数
     */
    private Integer changedChars;

    /**
     * 创建时间
     */
    private LocalDateTime createTime;
}
