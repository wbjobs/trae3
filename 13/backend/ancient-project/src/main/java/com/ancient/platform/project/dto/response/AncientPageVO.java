package com.ancient.platform.project.dto.response;

import lombok.Data;

import java.io.Serializable;
import java.time.LocalDateTime;

/**
 * 书页视图对象
 *
 * @author ancient-platform
 * @since 1.0.0
 */
@Data
public class AncientPageVO implements Serializable {

    private static final long serialVersionUID = 1L;

    /**
     * 主键ID
     */
    private Long id;

    /**
     * 所属项目ID
     */
    private Long projectId;

    /**
     * 页码
     */
    private Integer pageNumber;

    /**
     * 原始图片URL
     */
    private String originalImageUrl;

    /**
     * 识别文本内容
     */
    private String recognizedText;

    /**
     * 勘校后的文本内容
     */
    private String collatedText;

    /**
     * 页面状态：0-待分配，1-分配中，2-勘校中，3-待审核，4-已完成
     */
    private Integer status;

    /**
     * 状态名称
     */
    private String statusName;

    /**
     * 当前勘校人ID
     */
    private Long currentCollatorId;

    /**
     * 当前勘校人姓名
     */
    private String currentCollatorName;

    /**
     * 当前版本号
     */
    private Integer currentVersion;

    /**
     * 最后编辑时间
     */
    private LocalDateTime lastEditTime;

    /**
     * 最后编辑人ID
     */
    private Long lastEditorId;

    /**
     * 最后编辑人姓名
     */
    private String lastEditorName;

    /**
     * 批注数量
     */
    private Integer annotationCount;

    /**
     * 是否存在冲突
     */
    private Boolean hasConflict;

    /**
     * 创建时间
     */
    private LocalDateTime createTime;

    /**
     * 更新时间
     */
    private LocalDateTime updateTime;
}
