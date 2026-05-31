package com.ancient.platform.common.annotation;

import lombok.Data;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.index.CompoundIndex;
import org.springframework.data.mongodb.core.index.Indexed;
import org.springframework.data.mongodb.core.mapping.Document;
import org.springframework.data.mongodb.core.mapping.Field;

import java.io.Serializable;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

/**
 * 批注文档实体（MongoDB）
 *
 * @author ancient-platform
 * @since 1.0.0
 */
@Data
@Document(collection = "annotations")
@CompoundIndex(name = "idx_project_page", def = "{'projectId': 1, 'pageId': 1}")
public class AnnotationDoc implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    private String id;

    @Indexed
    @Field("project_id")
    private Long projectId;

    @Indexed
    @Field("page_id")
    private Long pageId;

    @Field("page_number")
    private Integer pageNumber;

    @Field("start_offset")
    private Integer startOffset;

    @Field("end_offset")
    private Integer endOffset;

    @Field("selected_text")
    private String selectedText;

    @Field("content")
    private String content;

    @Field("type")
    private Integer type;

    @Field("status")
    private Integer status;

    @Field("priority")
    private Integer priority;

    @Field("creator_id")
    private Long creatorId;

    @Field("creator_name")
    private String creatorName;

    @Field("creator_avatar")
    private String creatorAvatar;

    @Field("assignee_id")
    private Long assigneeId;

    @Field("assignee_name")
    private String assigneeName;

    @Field("replies")
    private List<AnnotationReply> replies = new ArrayList<>();

    @Field("is_resolved")
    private Boolean resolved = false;

    @Field("resolver_id")
    private Long resolverId;

    @Field("resolve_time")
    private LocalDateTime resolveTime;

    @Field("create_time")
    private LocalDateTime createTime;

    @Field("update_time")
    private LocalDateTime updateTime;

    @Field("deleted")
    private Integer deleted = 0;
}
