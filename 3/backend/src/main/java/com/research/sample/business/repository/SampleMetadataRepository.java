package com.research.sample.business.repository;

import com.research.sample.business.entity.SampleMetadata;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;

import java.util.List;
import java.util.Optional;

public interface SampleMetadataRepository extends JpaRepository<SampleMetadata, Long>, JpaSpecificationExecutor<SampleMetadata> {

    List<SampleMetadata> findByTenantId(Long tenantId);

    Optional<SampleMetadata> findBySampleCode(String sampleCode);

    List<SampleMetadata> findByDepartmentAndTenantId(String department, Long tenantId);

    List<SampleMetadata> findByTenantIdAndStatus(Long tenantId, String status);
}
