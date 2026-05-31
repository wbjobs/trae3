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
@Document(collection = "fans")
@JsonInclude(JsonInclude.Include.NON_NULL)
public class Fan {

    @Id
    private String id;

    private String tunnelId;

    private String pipeId;

    private String name;

    private String code;

    private Point3D position;

    private String type;

    private String model;

    private String status;

    private Double power;

    private Double rotationSpeed;

    private Double airflow;

    private Double efficiency;

    private Map<String, Object> ratedParameters;

    private Map<String, Object> realTimeData;

    private List<Map<String, Object>> monitoringPoints;

    private Map<String, Object> maintenance;

    @JsonProperty("createTime")
    private LocalDateTime createTime;

    @JsonProperty("updateTime")
    private LocalDateTime updateTime;
}
