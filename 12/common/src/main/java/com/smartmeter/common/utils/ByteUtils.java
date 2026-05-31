package com.smartmeter.common.utils;

import cn.hutool.core.util.HexUtil;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;

public class ByteUtils {

    public static String bytesToHex(byte[] bytes) {
        return HexUtil.encodeHexStr(bytes).toUpperCase();
    }

    public static byte[] hexToBytes(String hex) {
        return HexUtil.decodeHex(hex);
    }

    public static String bytesToHex(byte[] bytes, int start, int length) {
        byte[] sub = new byte[length];
        System.arraycopy(bytes, start, sub, 0, length);
        return bytesToHex(sub);
    }

    public static int bytesToInt(byte[] bytes, int start, int length, ByteOrder byteOrder) {
        ByteBuffer buffer = ByteBuffer.wrap(bytes, start, length);
        buffer.order(byteOrder);
        if (length == 1) {
            return buffer.get() & 0xFF;
        } else if (length == 2) {
            return buffer.getShort() & 0xFFFF;
        } else if (length == 4) {
            return buffer.getInt();
        }
        throw new IllegalArgumentException("Unsupported length: " + length);
    }

    public static long bytesToLong(byte[] bytes, int start, int length, ByteOrder byteOrder) {
        ByteBuffer buffer = ByteBuffer.wrap(bytes, start, length);
        buffer.order(byteOrder);
        if (length == 4) {
            return buffer.getInt() & 0xFFFFFFFFL;
        } else if (length == 8) {
            return buffer.getLong();
        }
        throw new IllegalArgumentException("Unsupported length: " + length);
    }

    public static byte[] reverseBytes(byte[] bytes) {
        byte[] reversed = new byte[bytes.length];
        for (int i = 0; i < bytes.length; i++) {
            reversed[i] = bytes[bytes.length - 1 - i];
        }
        return reversed;
    }

    public static String bcdToStr(byte[] bytes) {
        StringBuilder sb = new StringBuilder();
        for (byte b : bytes) {
            int high = (b & 0xF0) >> 4;
            int low = b & 0x0F;
            sb.append(high).append(low);
        }
        return sb.toString();
    }

    public static String bcdToStrReverse(byte[] bytes) {
        byte[] reversed = reverseBytes(bytes);
        return bcdToStr(reversed);
    }

    public static byte calculateCS(byte[] data, int start, int length) {
        int sum = 0;
        for (int i = start; i < start + length; i++) {
            sum += (data[i] & 0xFF);
        }
        return (byte) (sum & 0xFF);
    }

    public static boolean isBitSet(byte b, int bitIndex) {
        return ((b >> bitIndex) & 0x01) == 1;
    }
}
