package com.mine.ventilation.entity;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Data;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;

import java.time.LocalDateTime;
import java.util.List;

@Data
@Document(collection = "tunnels")
@JsonInclude(JsonInclude.Include.NON_NULL)
public class Tunnel {

    @Id
    private String id;

    private String name;

    private String code;

    private Integer level;

    private String type;

    private Double width;

    private Double height;

    private Double length;

    private Double crossSectionArea;

    private String airflowDirection;

    private Double designAirVolume;

    private Double actualAirVolume;

    private Double windSpeed;

    private Double airResistance;

    private String status;

    private String description;

    private List<Point3D> pathPoints;

    private Point3D startPoint;

    private Point3D endPoint;

    private List<String> connectedTunnels;

    private List<String> connectedPipes;

    @JsonProperty("createTime")
    private LocalDateTime createTime;

    @JsonProperty("updateTime")
    private LocalDateTime updateTime;
}
