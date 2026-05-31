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
public class DLT645ProtocolParser implements ProtocolParser {

    private static final byte[] DLT645_DATA_ID_VOLTAGE = {(byte) 0x02, (byte) 0x01, (byte) 0x01, (byte) 0x00};
    private static final byte[] DLT645_DATA_ID_CURRENT = {(byte) 0x02, (byte) 0x02, (byte) 0x01, (byte) 0x00};
    private static final byte[] DLT645_DATA_ID_ACTIVE_POWER = {(byte) 0x02, (byte) 0x03, (byte) 0x00, (byte) 0x00};
    private static final byte[] DLT645_DATA_ID_TOTAL_ENERGY = {(byte) 0x00, (byte) 0x00, (byte) 0x00, (byte) 0x00};

    @Override
    public String getProtocolType() {
        return ProtocolConstants.PROTOCOL_DLT645;
    }

    @Override
    public boolean validate(byte[] data) {
        if (data == null || data.length < 12) {
            log.warn("DL/T645 data length invalid: {}", data == null ? "null" : data.length);
            return false;
        }
        if (data[0] != ProtocolConstants.DLT645_START_FRAME) {
            log.warn("DL/T645 start frame invalid: {}", ByteUtils.bytesToHex(new byte[]{data[0]}));
            return false;
        }
        if (data[data.length - 1] != ProtocolConstants.DLT645_END_FRAME) {
            log.warn("DL/T645 end frame invalid");
            return false;
        }
        if (!CRCUtils.verifyDLT645Checksum(data)) {
            log.warn("DL/T645 checksum verification failed");
            return false;
        }
        return true;
    }

    @Override
    public MeterDataDTO parse(byte[] data) {
        if (!validate(data)) {
            throw new BusinessException(ErrorConstants.ERROR_TYPE_PROTOCOL_PARSE, "Invalid DL/T645 protocol data");
        }

        MeterDataDTO dto = new MeterDataDTO();
        dto.setProtocolType(ProtocolConstants.PROTOCOL_DLT645);
        dto.setRawData(ByteUtils.bytesToHex(data));
        dto.setCollectTime(LocalDateTime.now());
        dto.setMeterId(extractMeterId(data));

        List<MeterDataDTO.DataItem> dataItems = new ArrayList<>();
        int dataLen = data.length;
        int dataFieldStart = 10;
        int dataFieldLen = dataLen - 12;

        if (dataFieldLen > 0 && dataFieldLen >= 4) {
            byte[] dataId = new byte[4];
            System.arraycopy(data, dataFieldStart, dataId, 0, 4);

            if (dataFieldLen > 4) {
                int valueLen = dataFieldLen - 4;
                byte[] valueBytes = new byte[valueLen];
                System.arraycopy(data, dataFieldStart + 4, valueBytes, 0, valueLen);

                MeterDataDTO.DataItem item = parseDataItem(dataId, valueBytes);
                if (item != null) {
                    dataItems.add(item);
                }
            }
        }

        dto.setDataItems(dataItems);
        return dto;
    }

    @Override
    public String extractMeterId(byte[] data) {
        if (data.length < 8) {
            return null;
        }
        byte[] addrBytes = new byte[ProtocolConstants.DLT645_ADDR_LENGTH];
        System.arraycopy(data, 1, addrBytes, 0, ProtocolConstants.DLT645_ADDR_LENGTH);
        byte[] reversedAddr = ByteUtils.reverseBytes(addrBytes);
        return ByteUtils.bcdToStr(reversedAddr);
    }

    private MeterDataDTO.DataItem parseDataItem(byte[] dataId, byte[] valueBytes) {
        MeterDataDTO.DataItem item = new MeterDataDTO.DataItem();
        Map<String, Object> extra = new HashMap<>();
        extra.put("dataId", ByteUtils.bytesToHex(dataId));

        if (matchDataId(dataId, DLT645_DATA_ID_VOLTAGE)) {
            item.setDataType("VOLTAGE");
            item.setUnit("V");
            long rawValue = ByteUtils.bytesToLong(valueBytes, 0, valueBytes.length, ByteOrder.LITTLE_ENDIAN);
            item.setValue(new BigDecimal(rawValue).divide(new BigDecimal(10), 1, BigDecimal.ROUND_HALF_UP));
        } else if (matchDataId(dataId, DLT645_DATA_ID_CURRENT)) {
            item.setDataType("CURRENT");
            item.setUnit("A");
            long rawValue = ByteUtils.bytesToLong(valueBytes, 0, valueBytes.length, ByteOrder.LITTLE_ENDIAN);
            item.setValue(new BigDecimal(rawValue).divide(new BigDecimal(100), 2, BigDecimal.ROUND_HALF_UP));
        } else if (matchDataId(dataId, DLT645_DATA_ID_ACTIVE_POWER)) {
            item.setDataType("ACTIVE_POWER");
            item.setUnit("kW");
            long rawValue = ByteUtils.bytesToLong(valueBytes, 0, valueBytes.length, ByteOrder.LITTLE_ENDIAN);
            item.setValue(new BigDecimal(rawValue).divide(new BigDecimal(100), 2, BigDecimal.ROUND_HALF_UP));
        } else if (matchDataId(dataId, DLT645_DATA_ID_TOTAL_ENERGY)) {
            item.setDataType("TOTAL_ENERGY");
            item.setUnit("kWh");
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
