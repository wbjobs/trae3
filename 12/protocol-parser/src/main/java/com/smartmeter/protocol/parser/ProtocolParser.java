package com.smartmeter.protocol.parser;

import com.smartmeter.common.dto.MeterDataDTO;

public interface ProtocolParser {

    String getProtocolType();

    boolean validate(byte[] data);

    MeterDataDTO parse(byte[] data);

    String extractMeterId(byte[] data);
}
