package com.ancient.platform.file.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

import java.util.List;

@Data
@Component
@ConfigurationProperties(prefix = "image.compression")
public class ImageCompressionProperties {

    private float defaultQuality = 0.8f;

    private String defaultFormat = "webp";

    private Thumbnail thumbnail = new Thumbnail();

    private Pyramid pyramid = new Pyramid();

    @Data
    public static class Thumbnail {
        private List<Integer> sizes = List.of(200, 400, 800);
    }

    @Data
    public static class Pyramid {
        private int tileSize = 256;
    }
}
