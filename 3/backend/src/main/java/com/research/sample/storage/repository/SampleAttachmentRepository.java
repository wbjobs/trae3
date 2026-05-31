package com.research.sample.storage.repository;

import com.research.sample.storage.entity.SampleAttachment;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface SampleAttachmentRepository extends JpaRepository<SampleAttachment, Long> {

    List<SampleAttachment> findBySampleIdAndTenantId(Long sampleId, Long tenantId);

    Optional<SampleAttachment> findByIdAndTenantId(Long id, Long tenantId);

    void deleteByIdAndTenantId(Long id, Long tenantId);
}
