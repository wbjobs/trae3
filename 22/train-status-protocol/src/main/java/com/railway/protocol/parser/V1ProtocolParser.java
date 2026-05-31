package com.railway.protocol.parser;

import com.alibaba.fastjson2.JSON;
import com.railway.common.constant.ProtocolConstants;
import com.railway.common.entity.TrainStatus;
import com.railway.common.util.ByteUtil;
import com.railway.common.util.CrcUtil;
import com.railway.protocol.exception.ProtocolParseException;
import com.railway.protocol.model.ProtocolFrame;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.HashMap;
import java.util.Map;

public class V1ProtocolParser implements ProtocolParser {

    private static final Logger log = LoggerFactory.getLogger(V1ProtocolParser.class);

    private static final int HEADER_OFFSET = 0;
    private static final int VERSION_OFFSET = 1;
    private static final int MSG_TYPE_OFFSET = 2;
    private static final int SEQUENCE_OFFSET = 3;
    private static final int LENGTH_OFFSET = 5;
    private static final int TIMESTAMP_OFFSET = 7;
    private static final int TRAIN_ID_OFFSET = 15;
    private static final int PAYLOAD_OFFSET = 25;
    private static final int MIN_V1_FRAME_LENGTH = 30;

    @Override
    public int getSupportedVersion() {
        return ProtocolConstants.VERSION_V1;
    }

    @Override
    public ProtocolFrame parseFrame(byte[] data) {
        if (data == null || data.length < MIN_V1_FRAME_LENGTH) {
            throw new ProtocolParseException("FRAME_TOO_SHORT",
                    "V1 protocol frame too short, min length: " + MIN_V1_FRAME_LENGTH + ", actual: " + (data != null ? data.length : 0));
        }

        if (data.length > ProtocolConstants.MAX_FRAME_LENGTH) {
            throw new ProtocolParseException("FRAME_TOO_LONG",
                    "Protocol frame too long, max length: " + ProtocolConstants.MAX_FRAME_LENGTH + ", actual: " + data.length);
        }

        if (data[HEADER_OFFSET] != ProtocolConstants.PROTOCOL_HEADER) {
            throw new ProtocolParseException("INVALID_HEADER",
                    "Invalid protocol header, expected: 0x" + Integer.toHexString(ProtocolConstants.PROTOCOL_HEADER & 0xFF)
                    + ", actual: 0x" + Integer.toHexString(data[HEADER_OFFSET] & 0xFF));
        }

        if (data[data.length - 1] != ProtocolConstants.PROTOCOL_TAIL) {
            throw new ProtocolParseException("INVALID_TAIL",
                    "Invalid protocol tail, expected: 0x" + Integer.toHexString(ProtocolConstants.PROTOCOL_TAIL & 0xFF)
                    + ", actual: 0x" + Integer.toHexString(data[data.length - 1] & 0xFF));
        }

        int declaredLength = ByteUtil.bytesToShort(data, LENGTH_OFFSET) & 0xFFFF;
        if (declaredLength != data.length) {
            log.warn("V1 frame length mismatch, declared: {}, actual: {}", declaredLength, data.length);
        }

        ProtocolFrame frame = new ProtocolFrame();
        frame.setHeader(data[HEADER_OFFSET]);
        frame.setVersion(data[VERSION_OFFSET] & 0xFF);
        frame.setMessageType(data[MSG_TYPE_OFFSET] & 0xFF);
        frame.setSequence(ByteUtil.bytesToShort(data, SEQUENCE_OFFSET) & 0xFFFF);
        frame.setFrameLength(data.length);
        frame.setTimestamp(ByteUtil.bytesToLong(data, TIMESTAMP_OFFSET));

        int trainIdEnd = Math.min(TRAIN_ID_OFFSET + 10, data.length - 3);
        int trainIdLen = trainIdEnd - TRAIN_ID_OFFSET;
        if (trainIdLen > 0) {
            frame.setTrainId(ByteUtil.bytesToString(data, TRAIN_ID_OFFSET, trainIdLen).trim());
        } else {
            frame.setTrainId("UNKNOWN");
        }

        int payloadStart = Math.min(PAYLOAD_OFFSET, data.length - 3);
        int payloadLength = data.length - payloadStart - 3;
        if (payloadLength > 0) {
            byte[] payload = new byte[payloadLength];
            System.arraycopy(data, payloadStart, payload, 0, payloadLength);
            frame.setPayload(payload);
        } else {
            frame.setPayload(new byte[0]);
        }

        int crcOffset = data.length - 3;
        frame.setCrc(ByteUtil.bytesToShort(data, crcOffset) & 0xFFFF);
        frame.setTail(data[data.length - 1]);

        if (!validateFrame(frame)) {
            log.warn("V1 CRC verify failed, calculated: {}, received: {}",
                    calculateFrameCrc(frame), frame.getCrc());
            throw new ProtocolParseException("CRC_VERIFY_FAILED",
                    "CRC verification failed, expected: " + calculateFrameCrc(frame) + ", received: " + frame.getCrc());
        }

        return frame;
    }

    @Override
    public TrainStatus parseTrainStatus(ProtocolFrame frame) {
        if (frame.getMessageType() != ProtocolConstants.MSG_TYPE_STATUS_REPORT) {
            log.warn("V1 not a status report message, type: {}, treating as status report", frame.getMessageType());
        }

        byte[] payload = frame.getPayload();
        if (payload == null || payload.length < 15) {
            log.warn("V1 payload too short: {}, using default values", payload != null ? payload.length : 0);
            return createDefaultStatus(frame);
        }

        TrainStatus status = new TrainStatus();
        status.setTrainId(frame.getTrainId());
        status.setProtocolVersion("V" + frame.getVersion());
        try {
            status.setReportTime(LocalDateTime.ofInstant(
                    Instant.ofEpochMilli(frame.getTimestamp()), ZoneId.systemDefault()));
        } catch (Exception e) {
            status.setReportTime(LocalDateTime.now());
        }

        int offset = 0;
        try {
            int lineIdLen = Math.min(5, payload.length - offset);
            if (lineIdLen > 0) {
                status.setLineId(ByteUtil.bytesToString(payload, offset, lineIdLen).trim());
            }
            offset += 5;

            if (offset < payload.length) {
                status.setStatus(payload[offset] & 0xFF);
            }
            offset += 1;

            if (offset + 2 <= payload.length) {
                status.setSpeed((double) ByteUtil.bytesToShort(payload, offset) / 100);
            }
            offset += 2;

            if (offset + 4 <= payload.length) {
                status.setLongitude(ByteUtil.bytesToInt(payload, offset) / 1000000.0);
            }
            offset += 4;

            if (offset + 4 <= payload.length) {
                status.setLatitude(ByteUtil.bytesToInt(payload, offset) / 1000000.0);
            }
            offset += 4;

            if (offset + 2 <= payload.length) {
                status.setNextStationId(ByteUtil.bytesToShort(payload, offset) & 0xFFFF);
            }
            offset += 2;

            if (offset < payload.length) {
                int stationNameLen = Math.min(payload[offset] & 0xFF, payload.length - offset - 1);
                offset += 1;
                if (stationNameLen > 0 && offset + stationNameLen <= payload.length) {
                    status.setNextStationName(ByteUtil.bytesToString(payload, offset, stationNameLen).trim());
                }
                offset += stationNameLen;
            }

            if (offset + 2 <= payload.length) {
                status.setPassengerCount(ByteUtil.bytesToShort(payload, offset) & 0xFFFF);
            }
            offset += 2;

            if (offset < payload.length) {
                status.setDoorStatus((double) (payload[offset] & 0xFF) / 100);
            }
            offset += 1;

            if (offset < payload.length) {
                status.setBrakeStatus(payload[offset] & 0xFF);
            }
            offset += 1;

            if (offset < payload.length) {
                status.setPowerStatus(payload[offset] & 0xFF);
            }
            offset += 1;

            if (offset < payload.length) {
                status.setCommunicationStatus(payload[offset] & 0xFF);
            }
            offset += 1;

            Map<Integer, Integer> deviceStates = new HashMap<>();
            if (offset < payload.length) {
                int deviceCount = Math.min(payload[offset] & 0xFF, 50);
                offset += 1;
                for (int i = 0; i < deviceCount && offset + 2 <= payload.length; i++) {
                    int deviceType = payload[offset] & 0xFF;
                    int deviceStatus = payload[offset + 1] & 0xFF;
                    deviceStates.put(deviceType, deviceStatus);
                    offset += 2;
                }
            }
            status.setDeviceStates(JSON.toJSONString(deviceStates));

            if (offset < payload.length) {
                int alertCount = Math.min(payload[offset] & 0xFF, 30);
                offset += 1;
                if (alertCount > 0) {
                    StringBuilder alertBuilder = new StringBuilder();
                    for (int i = 0; i < alertCount && offset + 2 <= payload.length; i++) {
                        int alertCode = ByteUtil.bytesToShort(payload, offset) & 0xFFFF;
                        alertBuilder.append(alertCode).append(",");
                        offset += 2;
                    }
                    if (alertBuilder.length() > 0) {
                        alertBuilder.setLength(alertBuilder.length() - 1);
                    }
                    status.setAlertCodes(alertBuilder.toString());
                }
            }
        } catch (Exception e) {
            log.warn("V1 partial parse error at offset {}, using parsed data so far: {}", offset, e.getMessage());
        }

        status.setRawData(ByteUtil.bytesToHexString(frame.getPayload()));

        return status;
    }

    private TrainStatus createDefaultStatus(ProtocolFrame frame) {
        TrainStatus status = new TrainStatus();
        status.setTrainId(frame.getTrainId());
        status.setProtocolVersion("V" + frame.getVersion());
        status.setReportTime(LocalDateTime.now());
        status.setStatus(0);
        status.setSpeed(0.0);
        status.setDeviceStates("{}");
        status.setRawData("INCOMPLETE_FRAME");
        return status;
    }

    @Override
    public boolean validateFrame(ProtocolFrame frame) {
        int calculatedCrc = calculateFrameCrc(frame);
        return calculatedCrc == frame.getCrc();
    }

    private int calculateFrameCrc(ProtocolFrame frame) {
        try {
            int totalLength = frame.getFrameLength();
            if (totalLength < 3) {
                return 0;
            }
            byte[] data = new byte[totalLength - 3];
            data[0] = frame.getHeader();
            data[1] = (byte) frame.getVersion();
            data[2] = (byte) frame.getMessageType();

            byte[] seqBytes = ByteUtil.shortToBytes((short) frame.getSequence());
            System.arraycopy(seqBytes, 0, data, SEQUENCE_OFFSET, Math.min(2, data.length - SEQUENCE_OFFSET));

            byte[] lenBytes = ByteUtil.shortToBytes((short) frame.getFrameLength());
            System.arraycopy(lenBytes, 0, data, LENGTH_OFFSET, Math.min(2, data.length - LENGTH_OFFSET));

            byte[] timestampBytes = ByteUtil.longToBytes(frame.getTimestamp());
            System.arraycopy(timestampBytes, 0, data, TIMESTAMP_OFFSET, Math.min(8, data.length - TIMESTAMP_OFFSET));

            byte[] trainIdBytes = frame.getTrainId().getBytes(StandardCharsets.UTF_8);
            int copyLen = Math.min(trainIdBytes.length, Math.min(10, data.length - TRAIN_ID_OFFSET));
            if (copyLen > 0) {
                System.arraycopy(trainIdBytes, 0, data, TRAIN_ID_OFFSET, copyLen);
            }

            if (frame.getPayload() != null && PAYLOAD_OFFSET < data.length) {
                int payloadCopyLen = Math.min(frame.getPayload().length, data.length - PAYLOAD_OFFSET);
                System.arraycopy(frame.getPayload(), 0, data, PAYLOAD_OFFSET, payloadCopyLen);
            }

            return CrcUtil.calculateCRC16(data);
        } catch (Exception e) {
            log.error("Calculate V1 frame CRC failed: {}", e.getMessage());
            return -1;
        }
    }

    @Override
    public boolean test(TrainStatus trainStatus) {
        return trainStatus != null
                && trainStatus.getTrainId() != null
                && !trainStatus.getTrainId().isEmpty();
    }
}
