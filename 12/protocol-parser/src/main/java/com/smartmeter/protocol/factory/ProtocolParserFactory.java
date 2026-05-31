package com.smartmeter.protocol.factory;

import com.smartmeter.common.constant.ErrorConstants;
import com.smartmeter.common.constant.ProtocolConstants;
import com.smartmeter.common.exception.BusinessException;
import com.smartmeter.common.enums.ProtocolType;
import com.smartmeter.protocol.parser.CJT188ProtocolParser;
import com.smartmeter.protocol.parser.DLT645ProtocolParser;
import com.smartmeter.protocol.parser.ProtocolParser;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import javax.annotation.PostConstruct;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Slf4j
@Component
public class ProtocolParserFactory {

    private final Map<String, ProtocolParser> parserMap = new ConcurrentHashMap<>();

    @Autowired
    private DLT645ProtocolParser dlt645ProtocolParser;

    @Autowired
    private CJT188ProtocolParser cjt188ProtocolParser;

    @PostConstruct
    public void init() {
        registerParser(dlt645ProtocolParser);
        registerParser(cjt188ProtocolParser);
        log.info("Protocol parser factory initialized, supported protocols: {}", parserMap.keySet());
    }

    public void registerParser(ProtocolParser parser) {
        parserMap.put(parser.getProtocolType(), parser);
    }

    public ProtocolParser getParser(String protocolType) {
        ProtocolParser parser = parserMap.get(protocolType);
        if (parser == null) {
            throw new BusinessException(ErrorConstants.ERROR_TYPE_PROTOCOL_PARSE,"Unsupported protocol type: " + protocolType);
        }
        return parser;
    }

    public ProtocolParser detectParser(byte[] data) {
        if (data == null || data.length < 1) {
            throw new BusinessException(ErrorConstants.ERROR_TYPE_PROTOCOL_PARSE,"Empty data cannot be detected");
        }

        if (data[0] != ProtocolConstants.DLT645_START_FRAME) {
            throw new BusinessException(ErrorConstants.ERROR_TYPE_PROTOCOL_PARSE,"Invalid start frame, expected 0x68 but got 0x" 
                + String.format("%02X", data[0]));
        }

        ProtocolType detectedType = detectProtocolType(data);
        if (detectedType == ProtocolType.DLT645) {
            ProtocolParser parser = parserMap.get(ProtocolConstants.PROTOCOL_DLT645);
            if (parser != null) {
                log.debug("Auto-detected protocol: DL/T645");
                return parser;
            }
        } else if (detectedType == ProtocolType.CJT188) {
            ProtocolParser parser = parserMap.get(ProtocolConstants.PROTOCOL_CJT188);
            if (parser != null) {
                log.debug("Auto-detected protocol: CJ/T188");
                return parser;
            }
        }

        throw new BusinessException(ErrorConstants.ERROR_TYPE_PROTOCOL_PARSE,"Cannot detect protocol type from data, length: " + data.length);
    }

    private ProtocolType detectProtocolType(byte[] data) {
        int len = data.length;

        if (len >= 12) {
            if (data[7] == ProtocolConstants.DLT645_START_FRAME) {
                int dataLen = data[9] & 0xFF;
                int expectedLen = 12 + dataLen;
                if (len == expectedLen && data[len - 1] == ProtocolConstants.DLT645_END_FRAME) {
                    return ProtocolType.DLT645;
                }
            }
        }

        if (len >= 13) {
            byte controlCode = data[7];
            int dataLen = data[8] & 0xFF;
            int expectedLen = 11 + dataLen + 2;
            if (len == expectedLen && data[len - 1] == ProtocolConstants.CJT188_END_FRAME) {
                byte meterType = data[1];
                if ((meterType & 0x10) == 0x10 || (meterType & 0x11) == 0x11) {
                    return ProtocolType.CJT188;
                }
            }
        }

        if (len >= 12 && data[7] == ProtocolConstants.DLT645_START_FRAME) {
            return ProtocolType.DLT645;
        }

        if (len >= 13 && data[7] != ProtocolConstants.DLT645_START_FRAME) {
            return ProtocolType.CJT188;
        }

        if (len >= 12) {
            return ProtocolType.DLT645;
        }

        throw new BusinessException(ErrorConstants.ERROR_TYPE_PROTOCOL_PARSE,"Cannot detect protocol, data length: " + len);
    }

    public boolean isSupported(String protocolType) {
        return parserMap.containsKey(protocolType);
    }
}
