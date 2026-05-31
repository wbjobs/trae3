package com.ancient.platform.project.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.io.Serializable;

/**
 * 勘校提交请求DTO
 *
 * @author ancient-platform
 * @since 1.0.0
 */
@Data
public class CollationSubmitRequest implements Serializable {

    private static final long serialVersionUID = 1L;

    /**
     * 书页ID
     */
    @NotNull(message = "书页ID不能为空")
    private Long pageId;

    /**
     * 项目ID
     */
    @NotNull(message = "项目ID不能为空")
    private Long projectId;

    /**
     * 勘校后文本内容
     */
    @NotBlank(message = "勘校后文本内容不能为空")
    private String afterText;

    /**
     * 变更说明
     */
    @Size(max = 500, message = "变更说明长度不能超过500个字符")
    private String changeDescription;

    /**
     * 勘校人ID
     */
    @NotNull(message = "勘校人ID不能为空")
    private Long collatorId;

    /**
     * 勘校类型：0-普通勘校，1-审核，2-冲突解决
     */
    @NotNull(message = "勘校类型不能为空")
    private Integer collationType;

    /**
     * 基于的版本号（用于冲突检测）
     */
    @NotNull(message = "基于的版本号不能为空")
    private Integer baseVersion;
}
