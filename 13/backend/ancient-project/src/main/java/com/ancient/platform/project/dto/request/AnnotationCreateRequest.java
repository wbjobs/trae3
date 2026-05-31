package com.ancient.platform.project.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.io.Serializable;

/**
 * 批注创建请求DTO
 *
 * @author ancient-platform
 * @since 1.0.0
 */
@Data
public class AnnotationCreateRequest implements Serializable {

    private static final long serialVersionUID = 1L;

    /**
     * 项目ID
     */
    @NotNull(message = "项目ID不能为空")
    private Long projectId;

    /**
     * 书页ID
     */
    @NotNull(message = "书页ID不能为空")
    private Long pageId;

    /**
     * 批注内容
     */
    @NotBlank(message = "批注内容不能为空")
    @Size(max = 2000, message = "批注内容长度不能超过2000个字符")
    private String content;

    /**
     * 批注类型：0-普通批注，1-问题，2-建议，3-讨论
     */
    @NotNull(message = "批注类型不能为空")
    private Integer type;

    /**
     * 批注在文本中的起始位置
     */
    private Integer startPosition;

    /**
     * 批注在文本中的结束位置
     */
    private Integer endPosition;

    /**
     * 选中的文本内容
     */
    @Size(max = 500, message = "选中文本长度不能超过500个字符")
    private String selectedText;

    /**
     * 批注人ID
     */
    @NotNull(message = "批注人ID不能为空")
    private Long userId;

    /**
     * 批注人姓名
     */
    @NotBlank(message = "批注人姓名不能为空")
    private String userName;
}
