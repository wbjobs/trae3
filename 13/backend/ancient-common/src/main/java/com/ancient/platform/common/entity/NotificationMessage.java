package com.ancient.platform.common.entity;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.io.Serializable;
import java.time.LocalDateTime;

/**
 * WebSocket通知消息实体
 *
 * @author ancient-platform
 * @since 1.0.0
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class NotificationMessage implements Serializable {

    private static final long serialVersionUID = 1L;

    /**
     * 消息ID
     */
    private String id;

    /**
     * 消息类型：
     * 1-新批注 2-批注回复 3-勘校提交 4-勘校冲突 5-页面状态变更 6-成员加入 7-系统通知
     */
    private Integer type;

    /**
     * 消息类型名称
     */
    private String typeName;

    /**
     * 项目ID
     */
    private Long projectId;

    /**
     * 书页ID
     */
    private Long pageId;

    /**
     * 关联的业务ID（批注ID、勘校记录ID等）
     */
    private String businessId;

    /**
     * 消息标题
     */
    private String title;

    /**
     * 消息内容
     */
    private String content;

    /**
     * 发送人ID
     */
    private Long senderId;

    /**
     * 发送人姓名
     */
    private String senderName;

    /**
     * 接收人ID列表
     */
    private Long[] receiverIds;

    /**
     * 发送时间
     */
    private LocalDateTime sendTime;

    /**
     * 额外数据（JSON格式）
     */
    private String extraData;
}
