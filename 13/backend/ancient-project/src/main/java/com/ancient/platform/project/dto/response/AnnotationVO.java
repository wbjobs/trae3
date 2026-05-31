package com.ancient.platform.project.dto.response;

import lombok.Data;

import java.io.Serializable;
import java.time.LocalDateTime;
import java.util.List;

/**
 * 批注视图对象
 *
 * @author ancient-platform
 * @since 1.0.0
 */
@Data
public class AnnotationVO implements Serializable {

    private static final long serialVersionUID = 1L;

    /**
     * 批注ID
     */
    private String id;

    /**
     * 项目ID
     */
    private Long projectId;

    /**
     * 书页ID
     */
    private Long pageId;

    /**
     * 批注内容
     */
    private String content;

    /**
     * 批注类型：0-普通批注，1-问题，2-建议，3-讨论
     */
    private Integer type;

    /**
     * 批注类型名称
     */
    private String typeName;

    /**
     * 批注在文本中的起始位置
     */
    private Integer startPosition;

    /**
     * 批注在文本中的结束位置
     */
    private Integer endPosition;

    /**
     * 选中的文本内容
     */
    private String selectedText;

    /**
     * 批注人ID
     */
    private Long userId;

    /**
     * 批注人姓名
     */
    private String userName;

    /**
     * 状态：0-正常，1-已解决，2-已关闭
     */
    private Integer status;

    /**
     * 回复列表
     */
    private List<AnnotationReplyVO> replies;

    /**
     * 创建时间
     */
    private LocalDateTime createTime;

    /**
     * 更新时间
     */
    private LocalDateTime updateTime;

    /**
     * 批注回复视图对象
     */
    @Data
    public static class AnnotationReplyVO implements Serializable {
        private static final long serialVersionUID = 1L;

        private String id;
        private Long userId;
        private String userName;
        private String content;
        private LocalDateTime createTime;
    }
}
