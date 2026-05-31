package com.mine.ventilation.entity;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Data;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

@Data
@Document(collection = "annotations")
@JsonInclude(JsonInclude.Include.NON_NULL)
public class Annotation {

    @Id
    private String id;

    private String type;

    private String subtype;

    private Point3D position;

    private String title;

    private String content;

    private String color;

    private Double size;

    private Double opacity;

    private Double rotation;

    private Integer priority;

    private Integer severity;

    private String status;

    private List<String> tags;

    private Map<String, Object> customFields;

    private List<Map<String, Object>> attachments;

    private List<Map<String, Object>> comments;

    @JsonProperty("createTime")
    private LocalDateTime createTime;

    @JsonProperty("updateTime")
    private LocalDateTime updateTime;
}
