package com.ancient.platform.common.search;

import lombok.Data;
import org.springframework.data.annotation.Id;
import org.springframework.data.elasticsearch.annotations.Document;
import org.springframework.data.elasticsearch.annotations.Field;
import org.springframework.data.elasticsearch.annotations.FieldType;
import org.springframework.data.elasticsearch.annotations.Highlight;
import org.springframework.data.elasticsearch.annotations.HighlightField;
import org.springframework.data.elasticsearch.annotations.Setting;

import java.io.Serializable;
import java.time.LocalDateTime;

/**
 * 书页Elasticsearch索引文档
 * 配置：3分片2副本，使用IK中文分词器
 * 增加异体字规范化字段
 *
 * @author ancient-platform
 * @since 1.0.0
 */
@Data
@Document(indexName = "ancient_page")
@Setting(shards = 3, replicas = 2, settingPath = "es/analyzer.json")
@Highlight(fields = {
        @HighlightField(name = "recognizedText"),
        @HighlightField(name = "collatedText"),
        @HighlightField(name = "normalizedText"),
        @HighlightField(name = "projectName")
})
public class AncientPageIndex implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @Field(type = FieldType.Keyword)
    private String id;

    @Field(type = FieldType.Long)
    private Long pageId;

    @Field(type = FieldType.Long)
    private Long projectId;

    @Field(type = FieldType.Text, analyzer = "ik_max_word", searchAnalyzer = "ik_smart")
    private String projectName;

    @Field(type = FieldType.Integer)
    private Integer pageNumber;

    @Field(type = FieldType.Keyword)
    private String dynasty;

    @Field(type = FieldType.Keyword)
    private String author;

    @Field(type = FieldType.Text, analyzer = "ik_max_word", searchAnalyzer = "ik_smart")
    private String recognizedText;

    @Field(type = FieldType.Text, analyzer = "ik_max_word", searchAnalyzer = "ik_smart")
    private String collatedText;

    @Field(type = FieldType.Text, analyzer = "ik_max_word", searchAnalyzer = "ik_smart")
    private String normalizedText;

    @Field(type = FieldType.Integer)
    private Integer status;

    @Field(type = FieldType.Long)
    private Long currentCollatorId;

    @Field(type = FieldType.Keyword)
    private String currentCollatorName;

    @Field(type = FieldType.Integer)
    private Integer currentVersion;

    @Field(type = FieldType.Date, format = {}, pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime lastEditTime;

    @Field(type = FieldType.Date, format = {}, pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime createTime;

    @Field(type = FieldType.Date, format = {}, pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime updateTime;
}
