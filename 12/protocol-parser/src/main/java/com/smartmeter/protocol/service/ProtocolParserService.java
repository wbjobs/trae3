package com.smartmeter.protocol.service;

import com.alibaba.fastjson.JSON;
import com.smartmeter.common.dto.MeterDataDTO;
import com.smartmeter.protocol.factory.ProtocolParserFactory;
import com.smartmeter.protocol.parser.ProtocolParser;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

@Slf4j
@Service
public class ProtocolParserService {

    @Autowired
    private ProtocolParserFactory protocolParserFactory;

    public MeterDataDTO parse(String protocolType, byte[] data) {
        log.debug("Parsing protocol data, type: {}, data length: {}", protocolType, data.length);
        ProtocolParser parser = protocolParserFactory.getParser(protocolType);
        MeterDataDTO result = parser.parse(data);
        log.info("Protocol parse success, meterId: {}, dataItems count: {}",
                result.getMeterId(),
                result.getDataItems() != null ? result.getDataItems().size() : 0);
        return result;
    }

    public MeterDataDTO autoParse(byte[] data) {
        log.debug("Auto detecting and parsing protocol data, length: {}", data.length);
        ProtocolParser parser = protocolParserFactory.detectParser(data);
        log.debug("Detected protocol type: {}", parser.getProtocolType());
        MeterDataDTO result = parser.parse(data);
        log.info("Auto parse success, protocol: {}, meterId: {}, data: {}",
                result.getProtocolType(),
                result.getMeterId(),
                JSON.toJSONString(result.getDataItems()));
        return result;
    }

    public boolean validate(String protocolType, byte[] data) {
        ProtocolParser parser = protocolParserFactory.getParser(protocolType);
        return parser.validate(data);
    }

    public String extractMeterId(String protocolType, byte[] data) {
        ProtocolParser parser = protocolParserFactory.getParser(protocolType);
        return parser.extractMeterId(data);
    }

    public boolean isProtocolSupported(String protocolType) {
        return protocolParserFactory.isSupported(protocolType);
    }
}
