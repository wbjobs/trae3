package com.ancient.platform.project.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.io.Serializable;

/**
 * 项目创建请求DTO
 *
 * @author ancient-platform
 * @since 1.0.0
 */
@Data
public class ProjectCreateRequest implements Serializable {

    private static final long serialVersionUID = 1L;

    /**
     * 项目名称
     */
    @NotBlank(message = "项目名称不能为空")
    @Size(max = 100, message = "项目名称长度不能超过100个字符")
    private String name;

    /**
     * 项目描述
     */
    @Size(max = 500, message = "项目描述长度不能超过500个字符")
    private String description;

    /**
     * 项目封面图片URL
     */
    @Size(max = 255, message = "封面图片URL长度不能超过255个字符")
    private String coverImage;

    /**
     * 总页数
     */
    @NotNull(message = "总页数不能为空")
    private Integer totalPages;

    /**
     * 创建人ID
     */
    @NotNull(message = "创建人ID不能为空")
    private Long creatorId;
}
