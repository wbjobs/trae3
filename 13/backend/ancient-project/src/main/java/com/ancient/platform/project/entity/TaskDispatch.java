package com.ancient.platform.project.entity;

import com.baomidou.mybatisplus.annotation.*;
import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.io.Serializable;
import java.time.LocalDateTime;

@Data
@Entity
@Builder
@NoArgsConstructor
@AllArgsConstructor
@TableName("t_task_dispatch")
@Table(name = "t_task_dispatch")
public class TaskDispatch implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @TableId(type = IdType.AUTO)
    private Long id;

    @Column(name = "project_id", nullable = false)
    private Long projectId;

    @Column(name = "page_ids", columnDefinition = "TEXT")
    private String pageIds;

    @Column(name = "dispatcher_id", nullable = false)
    private Long dispatcherId;

    @Column(name = "dispatcher_name", length = 50)
    private String dispatcherName;

    @Column(name = "collator_id", nullable = false)
    private Long collatorId;

    @Column(name = "collator_name", length = 50)
    private String collatorName;

    @Column(name = "priority", nullable = false)
    private Integer priority;

    @Column(name = "deadline")
    private LocalDateTime deadline;

    @Column(name = "remark", length = 500)
    private String remark;

    @Column(name = "status", nullable = false)
    private Integer status;

    @CreationTimestamp
    @Column(name = "create_time", nullable = false, updatable = false)
    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createTime;

    @UpdateTimestamp
    @Column(name = "update_time", nullable = false)
    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updateTime;

    @TableLogic
    @Column(name = "deleted", nullable = false)
    private Integer deleted;
}
