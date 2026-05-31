package com.research.sample.business.entity;

import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import jakarta.persistence.Id;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Column;
import lombok.Getter;
import lombok.Setter;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Entity
@Table(name = "cross_dept_query_log")
@Getter
@Setter
@NoArgsConstructor
public class CrossDeptQueryLog {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "requester_id")
    private String requesterId;

    @Column(name = "target_tenant_id")
    private Long targetTenantId;

    @Column(name = "query_condition", length = 2000)
    private String queryCondition;

    @Column(name = "result_count")
    private Long resultCount;

    @Column(name = "queried_at")
    private LocalDateTime queriedAt;

    @jakarta.persistence.PrePersist
    protected void onCreate() {
        this.queriedAt = LocalDateTime.now();
    }
}
