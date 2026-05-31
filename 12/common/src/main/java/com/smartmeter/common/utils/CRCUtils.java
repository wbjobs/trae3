package com.smartmeter.common.utils;

public class CRCUtils {

    public static byte calculateCRC16(byte[] data, int start, int length) {
        int crc = 0;
        for (int i = start; i < start + length; i++) {
            crc += (data[i] & 0xFF);
        }
        return (byte) (crc & 0xFF);
    }

    public static byte calculateDLT645Checksum(byte[] data, int start, int length) {
        int sum = 0;
        for (int i = start; i < start + length; i++) {
            sum += (data[i] & 0xFF);
        }
        return (byte) (sum % 256);
    }

    public static byte calculateCJT188Checksum(byte[] data, int start, int length) {
        int sum = 0;
        for (int i = start; i < start + length; i++) {
            sum += (data[i] & 0xFF);
        }
        return (byte) (sum & 0xFF);
    }

    public static boolean verifyDLT645Checksum(byte[] frame) {
        if (frame.length < 10) {
            return false;
        }
        int dataLength = frame.length - 2;
        byte calculated = calculateDLT645Checksum(frame, 0, dataLength);
        byte received = frame[frame.length - 2];
        return calculated == received;
    }

    public static boolean verifyCJT188Checksum(byte[] frame) {
        if (frame.length < 10) {
            return false;
        }
        int dataLength = frame.length - 2;
        byte calculated = calculateCJT188Checksum(frame, 0, dataLength);
        byte received = frame[frame.length - 2];
        return calculated == received;
    }
}
