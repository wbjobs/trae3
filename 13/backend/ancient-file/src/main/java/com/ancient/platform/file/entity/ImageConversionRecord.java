package com.ancient.platform.file.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

import java.io.Serializable;
import java.time.LocalDateTime;

@Data
@TableName("t_image_conversion_record")
public class ImageConversionRecord implements Serializable {

    private static final long serialVersionUID = 1L;

    @TableId(type = IdType.ASSIGN_ID)
    private Long id;

    private Long projectId;

    private String sourceFileId;

    private String targetFileId;

    private String sourceFormat;

    private String targetFormat;

    private Long sourceSize;

    private Long targetSize;

    private Float quality;

    private Integer width;

    private Integer height;

    private LocalDateTime conversionTime;

    private Integer status;

    @TableLogic
    private Integer deleted;
}
