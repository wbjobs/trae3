package com.railway.common.util;

public final class CrcUtil {

    private CrcUtil() {
    }

    public static int calculateCRC16(byte[] data, int offset, int length) {
        int crc = 0xFFFF;
        int polynomial = 0x1021;

        for (int i = offset; i < offset + length; i++) {
            crc ^= (data[i] & 0xFF) << 8;
            for (int j = 0; j < 8; j++) {
                if ((crc & 0x8000) != 0) {
                    crc = (crc << 1) ^ polynomial;
                } else {
                    crc <<= 1;
                }
            }
            crc &= 0xFFFF;
        }

        return crc & 0xFFFF;
    }

    public static int calculateCRC16(byte[] data) {
        return calculateCRC16(data, 0, data.length);
    }

    public static boolean verifyCRC16(byte[] data, int offset, int length, int expectedCrc) {
        return calculateCRC16(data, offset, length) == expectedCrc;
    }

    public static int calculateChecksum(byte[] data, int offset, int length) {
        int sum = 0;
        for (int i = offset; i < offset + length; i++) {
            sum += data[i] & 0xFF;
        }
        return sum & 0xFF;
    }

    public static int calculateChecksum(byte[] data) {
        return calculateChecksum(data, 0, data.length);
    }

    public static boolean verifyChecksum(byte[] data, int offset, int length, int expectedChecksum) {
        return calculateChecksum(data, offset, length) == expectedChecksum;
    }
}
