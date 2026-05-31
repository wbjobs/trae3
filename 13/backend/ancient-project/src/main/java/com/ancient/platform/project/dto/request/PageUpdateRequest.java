package com.ancient.platform.project.dto.request;

import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.io.Serializable;

/**
 * 页面更新请求DTO
 *
 * @author ancient-platform
 * @since 1.0.0
 */
@Data
public class PageUpdateRequest implements Serializable {

    private static final long serialVersionUID = 1L;

    /**
     * 页面ID
     */
    @NotNull(message = "页面ID不能为空")
    private Long pageId;

    /**
     * 识别文本内容
     */
    private String recognizedText;

    /**
     * 勘校后的文本内容
     */
    private String collatedText;

    /**
     * 页面状态：0-待分配，1-分配中，2-勘校中，3-待审核，4-已完成
     */
    private Integer status;

    /**
     * 当前勘校人ID
     */
    private Long currentCollatorId;

    /**
     * 操作人ID
     */
    @NotNull(message = "操作人ID不能为空")
    private Long operatorId;
}
