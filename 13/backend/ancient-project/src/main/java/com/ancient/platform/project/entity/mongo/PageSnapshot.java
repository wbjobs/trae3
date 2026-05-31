package com.ancient.platform.project.entity.mongo;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.index.CompoundIndex;
import org.springframework.data.mongodb.core.index.Indexed;
import org.springframework.data.mongodb.core.mapping.Document;

import java.io.Serializable;
import java.time.LocalDateTime;

/**
 * 页面版本快照MongoDB文档实体
 *
 * @author ancient-platform
 * @since 1.0.0
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Document(collection = "page_snapshots")
@CompoundIndex(name = "idx_page_version", def = "{'pageId': 1, 'version': -1}")
public class PageSnapshot implements Serializable {

    private static final long serialVersionUID = 1L;

    /**
     * 主键ID
     */
    @Id
    private String id;

    /**
     * 书页ID
     */
    @Indexed
    private Long pageId;

    /**
     * 项目ID
     */
    @Indexed
    private Long projectId;

    /**
     * 版本号
     */
    @Indexed
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
     * 识别文本内容
     */
    private String recognizedText;

    /**
     * 勘校人ID
     */
    private Long collatorId;

    /**
     * 勘校人姓名
     */
    private String collatorName;

    /**
     * 变更说明
     */
    private String changeDescription;

    /**
     * 差异内容（JSON格式存储diff结果）
     */
    private String diffContent;

    /**
     * 创建时间
     */
    @CreatedDate
    private LocalDateTime createTime;
}
