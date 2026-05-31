package com.railway.protocol.service;

import com.railway.common.dto.TrainStatusReportDTO;
import com.railway.common.entity.TrainStatus;
import com.railway.common.util.ByteUtil;
import com.railway.protocol.exception.ProtocolParseException;
import com.railway.protocol.factory.ProtocolParserFactory;
import com.railway.protocol.model.ProtocolFrame;
import com.railway.protocol.parser.ProtocolParser;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

@Service
public class ProtocolParseService {

    private static final Logger log = LoggerFactory.getLogger(ProtocolParseService.class);

    public TrainStatus parse(TrainStatusReportDTO reportDTO) {
        if (reportDTO == null || reportDTO.getRawData() == null) {
            throw new ProtocolParseException("NULL_DATA", "Report data or raw data is null");
        }

        byte[] rawData = reportDTO.getRawData();

        log.debug("Start parsing protocol frame, trainId: {}, data length: {}",
                reportDTO.getTrainId(), rawData.length);
        log.debug("Raw data hex: {}", ByteUtil.bytesToHexString(rawData));

        try {
            ProtocolParser parser = ProtocolParserFactory.getParser(rawData);

            ProtocolFrame frame = parser.parseFrame(rawData);

            if (reportDTO.getTrainId() != null && !reportDTO.getTrainId().equals(frame.getTrainId())) {
                log.warn("Train ID mismatch, report: {}, frame: {}", reportDTO.getTrainId(), frame.getTrainId());
            }

            TrainStatus status = parser.parseTrainStatus(frame);

            if (reportDTO.getLineId() != null && status.getLineId() == null) {
                status.setLineId(reportDTO.getLineId());
            }

            if (reportDTO.getSourceIp() != null) {
                status.setRawData(status.getRawData() + "|sourceIp:" + reportDTO.getSourceIp());
            }

            log.info("Successfully parsed train status, trainId: {}, status: {}, speed: {}",
                    status.getTrainId(), status.getStatus(), status.getSpeed());

            return status;

        } catch (ProtocolParseException e) {
            log.error("Protocol parse failed, trainId: {}, errorCode: {}, message: {}",
                    reportDTO.getTrainId(), e.getErrorCode(), e.getMessage());
            throw e;
        } catch (Exception e) {
            log.error("Protocol parse error, trainId: {}", reportDTO.getTrainId(), e);
            throw new ProtocolParseException("PARSE_ERROR", "Parse error: " + e.getMessage(), e);
        }
    }

    public boolean validate(byte[] rawData) {
        if (rawData == null || rawData.length < 2) {
            return false;
        }
        try {
            ProtocolParser parser = ProtocolParserFactory.getParser(rawData);
            ProtocolFrame frame = parser.parseFrame(rawData);
            return parser.validateFrame(frame);
        } catch (Exception e) {
            log.warn("Protocol validate failed: {}", e.getMessage());
            return false;
        }
    }

    public int getProtocolVersion(byte[] rawData) {
        if (rawData == null || rawData.length < 2) {
            return -1;
        }
        return rawData[1] & 0xFF;
    }

    public int getMessageType(byte[] rawData) {
        if (rawData == null || rawData.length < 3) {
            return -1;
        }
        return rawData[2] & 0xFF;
    }
}
