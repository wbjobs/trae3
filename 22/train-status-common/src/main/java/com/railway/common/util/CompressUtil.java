package com.railway.common.util;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.zip.Deflater;
import java.util.zip.DeflaterOutputStream;
import java.util.zip.InflaterInputStream;

public final class CompressUtil {

    private static final Logger log = LoggerFactory.getLogger(CompressUtil.class);

    private static final int BUFFER_SIZE = 4096;
    private static final int COMPRESS_LEVEL = Deflater.BEST_SPEED;

    private CompressUtil() {
    }

    public static byte[] compress(byte[] data) {
        if (data == null || data.length == 0) {
            return data;
        }

        ByteArrayOutputStream baos = new ByteArrayOutputStream(data.length);
        Deflater deflater = new Deflater(COMPRESS_LEVEL);

        try {
            DeflaterOutputStream dos = new DeflaterOutputStream(baos, deflater);
            dos.write(data);
            dos.finish();
            dos.close();

            byte[] compressed = baos.toByteArray();

            if (log.isDebugEnabled()) {
                log.debug("Compressed {} bytes to {} bytes, ratio: {}",
                        data.length, compressed.length,
                        String.format("%.2f%%", (1.0 - (double) compressed.length / data.length) * 100));
            }

            return compressed;
        } catch (IOException e) {
            log.error("Compress data failed", e);
            return data;
        } finally {
            deflater.end();
            try {
                baos.close();
            } catch (IOException e) {
                log.warn("Close stream failed", e);
            }
        }
    }

    public static byte[] decompress(byte[] compressedData) {
        if (compressedData == null || compressedData.length == 0) {
            return compressedData;
        }

        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        ByteArrayInputStream bais = new ByteArrayInputStream(compressedData);

        try {
            InflaterInputStream iis = new InflaterInputStream(bais);
            byte[] buffer = new byte[BUFFER_SIZE];
            int len;
            while ((len = iis.read(buffer)) > 0) {
                baos.write(buffer, 0, len);
            }
            iis.close();

            byte[] decompressed = baos.toByteArray();

            if (log.isDebugEnabled()) {
                log.debug("Decompressed {} bytes to {} bytes",
                        compressedData.length, decompressed.length);
            }

            return decompressed;
        } catch (IOException e) {
            log.error("Decompress data failed", e);
            return compressedData;
        } finally {
            try {
                baos.close();
                bais.close();
            } catch (IOException e) {
                log.warn("Close stream failed", e);
            }
        }
    }

    public static boolean isCompressed(byte[] data) {
        if (data == null || data.length < 2) {
            return false;
        }
        return (data[0] & 0xFF) == 0x78;
    }

    public static byte[] compressIfNeeded(byte[] data, int threshold) {
        if (data == null || data.length < threshold) {
            return data;
        }
        byte[] compressed = compress(data);
        return compressed.length < data.length ? compressed : data;
    }
}
