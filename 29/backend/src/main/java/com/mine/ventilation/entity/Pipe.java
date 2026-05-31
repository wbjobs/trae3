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
@Document(collection = "pipes")
@JsonInclude(JsonInclude.Include.NON_NULL)
public class Pipe {

    @Id
    private String id;

    private String tunnelId;

    private String name;

    private String type;

    private String layer;

    private Double diameter;

    private Double length;

    private Double thickness;

    private String material;

    private String status;

    private Double flowRate;

    private Double pressure;

    private Double windSpeed;

    private Double temperature;

    private List<Point3D> points;

    private Point3D startPoint;

    private Point3D endPoint;

    private Double roughness;

    private Double airResistance;

    private Double leakageRate;

    private Map<String, Object> valveConfig;

    @JsonProperty("createTime")
    private LocalDateTime createTime;

    @JsonProperty("updateTime")
    private LocalDateTime updateTime;
}
