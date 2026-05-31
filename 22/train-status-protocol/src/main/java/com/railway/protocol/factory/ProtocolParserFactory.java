package com.railway.protocol.factory;

import com.railway.common.constant.ProtocolConstants;
import com.railway.protocol.exception.ProtocolParseException;
import com.railway.protocol.parser.ProtocolParser;
import com.railway.protocol.parser.V1ProtocolParser;
import com.railway.protocol.parser.V2ProtocolParser;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

public class ProtocolParserFactory {

    private static final Map<Integer, ProtocolParser> PARSER_MAP = new ConcurrentHashMap<>();

    static {
        registerParser(new V1ProtocolParser());
        registerParser(new V2ProtocolParser());
    }

    private ProtocolParserFactory() {
    }

    public static void registerParser(ProtocolParser parser) {
        PARSER_MAP.put(parser.getSupportedVersion(), parser);
    }

    public static ProtocolParser getParser(int version) {
        ProtocolParser parser = PARSER_MAP.get(version);
        if (parser == null) {
            throw new ProtocolParseException("UNSUPPORTED_VERSION",
                    "Unsupported protocol version: " + version +
                    ". Supported versions: V" + ProtocolConstants.VERSION_V1 + ", V" + ProtocolConstants.VERSION_V2);
        }
        return parser;
    }

    public static ProtocolParser getParser(byte[] data) {
        if (data == null || data.length < 2) {
            throw new ProtocolParseException("INVALID_DATA", "Cannot determine protocol version from data");
        }
        int version = data[1] & 0xFF;
        return getParser(version);
    }

    public static boolean isVersionSupported(int version) {
        return PARSER_MAP.containsKey(version);
    }
}
