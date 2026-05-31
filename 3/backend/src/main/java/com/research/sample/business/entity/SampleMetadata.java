package com.research.sample.business.entity;

import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import jakarta.persistence.Id;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Column;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import lombok.Getter;
import lombok.Setter;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

@Entity
@Table(name = "sample_metadata")
@Getter
@Setter
@NoArgsConstructor
public class SampleMetadata {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "sample_code", nullable = false, unique = true)
    private String sampleCode;

    @Column(name = "sample_name", nullable = false)
    private String sampleName;

    @Column(name = "sample_type")
    private String sampleType;

    @Column(name = "source")
    private String source;

    @Column(name = "collection_date")
    private LocalDate collectionDate;

    @Column(name = "storage_location")
    private String storageLocation;

    @Column(name = "volume", precision = 18, scale = 4)
    private BigDecimal volume;

    @Column(name = "unit")
    private String unit;

    @Column(name = "description", length = 2000)
    private String description;

    @Column(name = "status")
    private String status;

    @Column(name = "department")
    private String department;

    @Column(name = "tenant_id", nullable = false)
    private Long tenantId;

    @Column(name = "created_by")
    private String createdBy;

    @Column(name = "updated_by")
    private String updatedBy;

    @Column(name = "created_at")
    private LocalDateTime createdAt;

    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    @PrePersist
    protected void onCreate() {
        this.createdAt = LocalDateTime.now();
        this.updatedAt = LocalDateTime.now();
    }

    @PreUpdate
    protected void onUpdate() {
        this.updatedAt = LocalDateTime.now();
    }
}
