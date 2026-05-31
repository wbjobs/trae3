package com.smartmeter.protocol.parser;

import com.smartmeter.common.constant.ErrorConstants;
import com.smartmeter.common.constant.ProtocolConstants;
import com.smartmeter.common.exception.BusinessException;
import com.smartmeter.common.dto.MeterDataDTO;
import com.smartmeter.common.utils.ByteUtils;
import com.smartmeter.common.utils.CRCUtils;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.nio.ByteOrder;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Slf4j
@Component
public class CJT188ProtocolParser implements ProtocolParser {

    private static final int CJT188_SERIAL_NUM_LEN = 7;
    private static final byte CJT188_TYPE_HEAT_METER = (byte) 0x10;
    private static final byte CJT188_TYPE_WATER_METER = (byte) 0x11;
    private static final byte CJT188_TYPE_GAS_METER = (byte) 0x12;

    private static final byte[] DATA_ID_ACCUMULATED_HEAT = {(byte) 0x90, (byte) 0x01};
    private static final byte[] DATA_ID_INSTANT_FLOW = {(byte) 0x90, (byte) 0x02};
    private static final byte[] DATA_ID_FORWARD_TEMP = {(byte) 0x90, (byte) 0x03};
    private static final byte[] DATA_ID_RETURN_TEMP = {(byte) 0x90, (byte) 0x04};
    private static final byte[] DATA_ID_TEMP_DIFF = {(byte) 0x90, (byte) 0x05};
    private static final byte[] DATA_ID_ACCUMULATED_FLOW = {(byte) 0x90, (byte) 0x06};

    @Override
    public String getProtocolType() {
        return ProtocolConstants.PROTOCOL_CJT188;
    }

    @Override
    public boolean validate(byte[] data) {
        if (data == null || data.length < 13) {
            log.warn("CJ/T188 data length invalid: {}", data == null ? "null" : data.length);
            return false;
        }
        if (data[0] != ProtocolConstants.CJT188_START_FRAME) {
            log.warn("CJ/T188 start frame invalid");
            return false;
        }
        if (data[data.length - 1] != ProtocolConstants.CJT188_END_FRAME) {
            log.warn("CJ/T188 end frame invalid");
            return false;
        }
        if (!CRCUtils.verifyCJT188Checksum(data)) {
            log.warn("CJ/T188 checksum verification failed");
            return false;
        }
        return true;
    }

    @Override
    public MeterDataDTO parse(byte[] data) {
        if (!validate(data)) {
            throw new BusinessException(ErrorConstants.ERROR_TYPE_PROTOCOL_PARSE, "Invalid CJ/T188 protocol data");
        }

        MeterDataDTO dto = new MeterDataDTO();
        dto.setProtocolType(ProtocolConstants.PROTOCOL_CJT188);
        dto.setRawData(ByteUtils.bytesToHex(data));
        dto.setCollectTime(LocalDateTime.now());
        dto.setMeterId(extractMeterId(data));

        List<MeterDataDTO.DataItem> dataItems = new ArrayList<>();

        int dataFieldStart = 11;
        int dataFieldLen = data.length - 13;

        if (dataFieldLen >= 2) {
            int pos = dataFieldStart;
            while (pos < dataFieldStart + dataFieldLen - 1) {
                byte[] dataId = new byte[2];
                System.arraycopy(data, pos, dataId, 0, 2);
                pos += 2;

                int valueLen = getDataValueLength(dataId);
                if (pos + valueLen <= data.length - 2) {
                    byte[] valueBytes = new byte[valueLen];
                    System.arraycopy(data, pos, valueBytes, 0, valueLen);
                    pos += valueLen;

                    MeterDataDTO.DataItem item = parseDataItem(dataId, valueBytes);
                    if (item != null) {
                        dataItems.add(item);
                    }
                } else {
                    break;
                }
            }
        }

        dto.setDataItems(dataItems);
        return dto;
    }

    @Override
    public String extractMeterId(byte[] data) {
        if (data.length < 9) {
            return null;
        }
        byte[] addrBytes = new byte[CJT188_SERIAL_NUM_LEN];
        System.arraycopy(data, 1, addrBytes, 0, CJT188_SERIAL_NUM_LEN);
        byte[] reversedAddr = ByteUtils.reverseBytes(addrBytes);
        return ByteUtils.bcdToStr(reversedAddr);
    }

    private int getDataValueLength(byte[] dataId) {
        if (matchDataId(dataId, DATA_ID_ACCUMULATED_HEAT) ||
            matchDataId(dataId, DATA_ID_ACCUMULATED_FLOW)) {
            return 4;
        } else if (matchDataId(dataId, DATA_ID_INSTANT_FLOW)) {
            return 3;
        } else if (matchDataId(dataId, DATA_ID_FORWARD_TEMP) ||
                   matchDataId(dataId, DATA_ID_RETURN_TEMP) ||
                   matchDataId(dataId, DATA_ID_TEMP_DIFF)) {
            return 2;
        }
        return 2;
    }

    private MeterDataDTO.DataItem parseDataItem(byte[] dataId, byte[] valueBytes) {
        MeterDataDTO.DataItem item = new MeterDataDTO.DataItem();
        Map<String, Object> extra = new HashMap<>();
        extra.put("dataId", ByteUtils.bytesToHex(dataId));

        if (matchDataId(dataId, DATA_ID_ACCUMULATED_HEAT)) {
            item.setDataType("ACCUMULATED_HEAT");
            item.setUnit("kWh");
            long rawValue = ByteUtils.bytesToLong(valueBytes, 0, valueBytes.length, ByteOrder.LITTLE_ENDIAN);
            item.setValue(new BigDecimal(rawValue).divide(new BigDecimal(100), 2, BigDecimal.ROUND_HALF_UP));
        } else if (matchDataId(dataId, DATA_ID_INSTANT_FLOW)) {
            item.setDataType("INSTANT_FLOW");
            item.setUnit("m³/h");
            long rawValue = ByteUtils.bytesToLong(valueBytes, 0, valueBytes.length, ByteOrder.LITTLE_ENDIAN);
            item.setValue(new BigDecimal(rawValue).divide(new BigDecimal(1000), 3, BigDecimal.ROUND_HALF_UP));
        } else if (matchDataId(dataId, DATA_ID_FORWARD_TEMP)) {
            item.setDataType("FORWARD_TEMP");
            item.setUnit("℃");
            int rawValue = ByteUtils.bytesToInt(valueBytes, 0, valueBytes.length, ByteOrder.LITTLE_ENDIAN);
            item.setValue(new BigDecimal(rawValue).divide(new BigDecimal(10), 1, BigDecimal.ROUND_HALF_UP));
        } else if (matchDataId(dataId, DATA_ID_RETURN_TEMP)) {
            item.setDataType("RETURN_TEMP");
            item.setUnit("℃");
            int rawValue = ByteUtils.bytesToInt(valueBytes, 0, valueBytes.length, ByteOrder.LITTLE_ENDIAN);
            item.setValue(new BigDecimal(rawValue).divide(new BigDecimal(10), 1, BigDecimal.ROUND_HALF_UP));
        } else if (matchDataId(dataId, DATA_ID_TEMP_DIFF)) {
            item.setDataType("TEMP_DIFF");
            item.setUnit("K");
            int rawValue = ByteUtils.bytesToInt(valueBytes, 0, valueBytes.length, ByteOrder.LITTLE_ENDIAN);
            item.setValue(new BigDecimal(rawValue).divide(new BigDecimal(10), 1, BigDecimal.ROUND_HALF_UP));
        } else if (matchDataId(dataId, DATA_ID_ACCUMULATED_FLOW)) {
            item.setDataType("ACCUMULATED_FLOW");
            item.setUnit("m³");
            long rawValue = ByteUtils.bytesToLong(valueBytes, 0, valueBytes.length, ByteOrder.LITTLE_ENDIAN);
            item.setValue(new BigDecimal(rawValue).divide(new BigDecimal(100), 2, BigDecimal.ROUND_HALF_UP));
        } else {
            item.setDataType("UNKNOWN_" + ByteUtils.bytesToHex(dataId));
            item.setUnit("");
            long rawValue = ByteUtils.bytesToLong(valueBytes, 0, valueBytes.length, ByteOrder.LITTLE_ENDIAN);
            item.setValue(new BigDecimal(rawValue));
        }

        item.setExtra(extra);
        return item;
    }

    private boolean matchDataId(byte[] id1, byte[] id2) {
        if (id1.length != id2.length) {
            return false;
        }
        for (int i = 0; i < id1.length; i++) {
            if (id1[i] != id2[i]) {
                return false;
            }
        }
        return true;
    }
}
