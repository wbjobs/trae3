package com.ancient.platform.project.entity.mongo;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.annotation.Id;
import org.springframework.data.annotation.LastModifiedDate;
import org.springframework.data.mongodb.core.index.CompoundIndex;
import org.springframework.data.mongodb.core.index.Indexed;
import org.springframework.data.mongodb.core.mapping.Document;

import java.io.Serializable;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

/**
 * 批注MongoDB文档实体
 *
 * @author ancient-platform
 * @since 1.0.0
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Document(collection = "annotations")
@CompoundIndex(name = "idx_project_page", def = "{'projectId': 1, 'pageId': 1}")
public class Annotation implements Serializable {

    private static final long serialVersionUID = 1L;

    /**
     * 主键ID
     */
    @Id
    private String id;

    /**
     * 项目ID
     */
    @Indexed
    private Long projectId;

    /**
     * 书页ID
     */
    @Indexed
    private Long pageId;

    /**
     * 批注内容
     */
    private String content;

    /**
     * 批注类型：0-普通批注，1-问题，2-建议，3-讨论
     */
    @Indexed
    private Integer type;

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
    @Indexed
    private Long userId;

    /**
     * 批注人姓名
     */
    private String userName;

    /**
     * 状态：0-正常，1-已解决，2-已关闭
     */
    @Indexed
    private Integer status;

    /**
     * 回复列表
     */
    @Builder.Default
    private List<AnnotationReply> replies = new ArrayList<>();

    /**
     * 创建时间
     */
    @CreatedDate
    private LocalDateTime createTime;

    /**
     * 更新时间
     */
    @LastModifiedDate
    private LocalDateTime updateTime;
}
