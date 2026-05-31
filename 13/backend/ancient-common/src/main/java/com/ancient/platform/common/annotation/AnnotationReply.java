package com.ancient.platform.common.annotation;

import lombok.Data;
import org.springframework.data.mongodb.core.mapping.Field;

import java.io.Serializable;
import java.time.LocalDateTime;

/**
 * 批注回复实体（MongoDB内嵌文档）
 *
 * @author ancient-platform
 * @since 1.0.0
 */
@Data
public class AnnotationReply implements Serializable {

    private static final long serialVersionUID = 1L;

    @Field("id")
    private String id;

    @Field("content")
    private String content;

    @Field("creator_id")
    private Long creatorId;

    @Field("creator_name")
    private String creatorName;

    @Field("creator_avatar")
    private String creatorAvatar;

    @Field("create_time")
    private LocalDateTime createTime;

    @Field("update_time")
    private LocalDateTime updateTime;

    @Field("deleted")
    private Integer deleted = 0;
}
