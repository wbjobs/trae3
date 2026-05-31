package com.ancient.platform.project.entity.mongo;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.annotation.Id;

import java.io.Serializable;
import java.time.LocalDateTime;

/**
 * 批注回复内嵌文档
 *
 * @author ancient-platform
 * @since 1.0.0
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class AnnotationReply implements Serializable {

    private static final long serialVersionUID = 1L;

    /**
     * 回复ID
     */
    @Id
    private String id;

    /**
     * 用户ID
     */
    private Long userId;

    /**
     * 用户姓名
     */
    private String userName;

    /**
     * 回复内容
     */
    private String content;

    /**
     * 创建时间
     */
    @CreatedDate
    private LocalDateTime createTime;
}
