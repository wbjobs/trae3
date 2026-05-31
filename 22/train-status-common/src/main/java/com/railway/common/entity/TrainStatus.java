package com.railway.common.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;

import java.io.Serializable;
import java.time.LocalDateTime;

@TableName("train_status")
public class TrainStatus implements Serializable {

    private static final long serialVersionUID = 1L;

    @TableId(type = IdType.AUTO)
    private Long id;

    private String trainId;

    private String lineId;

    private Integer status;

    private Double speed;

    private Double longitude;

    private Double latitude;

    private Integer nextStationId;

    private String nextStationName;

    private Integer passengerCount;

    private Double doorStatus;

    private Integer brakeStatus;

    private Integer powerStatus;

    private Integer communicationStatus;

    private String deviceStates;

    private String alertCodes;

    private String rawData;

    private String protocolVersion;

    private LocalDateTime reportTime;

    private LocalDateTime createTime;

    private String nodeId;

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public String getTrainId() {
        return trainId;
    }

    public void setTrainId(String trainId) {
        this.trainId = trainId;
    }

    public String getLineId() {
        return lineId;
    }

    public void setLineId(String lineId) {
        this.lineId = lineId;
    }

    public Integer getStatus() {
        return status;
    }

    public void setStatus(Integer status) {
        this.status = status;
    }

    public Double getSpeed() {
        return speed;
    }

    public void setSpeed(Double speed) {
        this.speed = speed;
    }

    public Double getLongitude() {
        return longitude;
    }

    public void setLongitude(Double longitude) {
        this.longitude = longitude;
    }

    public Double getLatitude() {
        return latitude;
    }

    public void setLatitude(Double latitude) {
        this.latitude = latitude;
    }

    public Integer getNextStationId() {
        return nextStationId;
    }

    public void setNextStationId(Integer nextStationId) {
        this.nextStationId = nextStationId;
    }

    public String getNextStationName() {
        return nextStationName;
    }

    public void setNextStationName(String nextStationName) {
        this.nextStationName = nextStationName;
    }

    public Integer getPassengerCount() {
        return passengerCount;
    }

    public void setPassengerCount(Integer passengerCount) {
        this.passengerCount = passengerCount;
    }

    public Double getDoorStatus() {
        return doorStatus;
    }

    public void setDoorStatus(Double doorStatus) {
        this.doorStatus = doorStatus;
    }

    public Integer getBrakeStatus() {
        return brakeStatus;
    }

    public void setBrakeStatus(Integer brakeStatus) {
        this.brakeStatus = brakeStatus;
    }

    public Integer getPowerStatus() {
        return powerStatus;
    }

    public void setPowerStatus(Integer powerStatus) {
        this.powerStatus = powerStatus;
    }

    public Integer getCommunicationStatus() {
        return communicationStatus;
    }

    public void setCommunicationStatus(Integer communicationStatus) {
        this.communicationStatus = communicationStatus;
    }

    public String getDeviceStates() {
        return deviceStates;
    }

    public void setDeviceStates(String deviceStates) {
        this.deviceStates = deviceStates;
    }

    public String getAlertCodes() {
        return alertCodes;
    }

    public void setAlertCodes(String alertCodes) {
        this.alertCodes = alertCodes;
    }

    public String getRawData() {
        return rawData;
    }

    public void setRawData(String rawData) {
        this.rawData = rawData;
    }

    public String getProtocolVersion() {
        return protocolVersion;
    }

    public void setProtocolVersion(String protocolVersion) {
        this.protocolVersion = protocolVersion;
    }

    public LocalDateTime getReportTime() {
        return reportTime;
    }

    public void setReportTime(LocalDateTime reportTime) {
        this.reportTime = reportTime;
    }

    public LocalDateTime getCreateTime() {
        return createTime;
    }

    public void setCreateTime(LocalDateTime createTime) {
        this.createTime = createTime;
    }

    public String getNodeId() {
        return nodeId;
    }

    public void setNodeId(String nodeId) {
        this.nodeId = nodeId;
    }
}
