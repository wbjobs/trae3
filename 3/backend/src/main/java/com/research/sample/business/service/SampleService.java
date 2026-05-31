package com.research.sample.business.service;

import com.research.sample.auth.context.TenantContext;
import com.research.sample.business.dto.SampleCreateRequest;
import com.research.sample.business.dto.SampleQueryRequest;
import com.research.sample.business.dto.SampleUpdateRequest;
import com.research.sample.business.entity.CrossDeptQueryLog;
import com.research.sample.business.entity.SampleMetadata;
import com.research.sample.business.repository.CrossDeptQueryLogRepository;
import com.research.sample.business.repository.SampleMetadataRepository;
import com.research.sample.common.exception.BusinessException;
import com.research.sample.validation.dto.BatchValidationRequest;
import com.research.sample.validation.dto.BatchValidationResult;
import com.research.sample.validation.dto.ValidationResult;
import com.research.sample.validation.service.ValidationService;
import jakarta.persistence.criteria.Predicate;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Service
@RequiredArgsConstructor
public class SampleService {

    private final SampleMetadataRepository sampleMetadataRepository;
    private final CrossDeptQueryLogRepository crossDeptQueryLogRepository;
    private final ValidationService validationService;

    @Transactional
    public SampleMetadata createSample(SampleCreateRequest request) {
        BatchValidationRequest validationRequest = buildValidationRequest(request);
        BatchValidationResult validationResult = validationService.validateBatch(validationRequest);
        if (!validationResult.isValid()) {
            String errorMsg = buildValidationErrorMessage(validationResult.getResults());
            throw new BusinessException("元数据校验失败: " + errorMsg);
        }

        if (sampleMetadataRepository.findBySampleCode(request.getSampleCode()).isPresent()) {
            throw new BusinessException("样本编号已存在");
        }

        SampleMetadata sample = new SampleMetadata();
        sample.setSampleCode(request.getSampleCode());
        sample.setSampleName(request.getSampleName());
        sample.setSampleType(request.getSampleType());
        sample.setSource(request.getSource());
        sample.setCollectionDate(request.getCollectionDate());
        sample.setStorageLocation(request.getStorageLocation());
        sample.setVolume(request.getVolume());
        sample.setUnit(request.getUnit());
        sample.setDescription(request.getDescription());
        sample.setDepartment(request.getDepartment());
        sample.setTenantId(TenantContext.getTenantId());
        sample.setCreatedBy(TenantContext.getCurrentUserId());
        sample.setStatus("ACTIVE");
        return sampleMetadataRepository.save(sample);
    }

    @Transactional
    public SampleMetadata updateSample(SampleUpdateRequest request) {
        SampleMetadata sample = sampleMetadataRepository.findById(request.getId())
                .orElseThrow(() -> new BusinessException("样本不存在"));
        if (!sample.getTenantId().equals(TenantContext.getTenantId())) {
            throw new BusinessException("无权操作此样本");
        }

        BatchValidationRequest validationRequest = buildValidationRequest(request, sample);
        BatchValidationResult validationResult = validationService.validateBatch(validationRequest);
        if (!validationResult.isValid()) {
            String errorMsg = buildValidationErrorMessage(validationResult.getResults());
            throw new BusinessException("元数据校验失败: " + errorMsg);
        }

        if (request.getSampleCode() != null && !request.getSampleCode().equals(sample.getSampleCode())) {
            if (sampleMetadataRepository.findBySampleCode(request.getSampleCode()).isPresent()) {
                throw new BusinessException("样本编号已存在");
            }
            sample.setSampleCode(request.getSampleCode());
        }
        if (request.getSampleName() != null) {
            sample.setSampleName(request.getSampleName());
        }
        if (request.getSampleType() != null) {
            sample.setSampleType(request.getSampleType());
        }
        if (request.getSource() != null) {
            sample.setSource(request.getSource());
        }
        if (request.getCollectionDate() != null) {
            sample.setCollectionDate(request.getCollectionDate());
        }
        if (request.getStorageLocation() != null) {
            sample.setStorageLocation(request.getStorageLocation());
        }
        if (request.getVolume() != null) {
            sample.setVolume(request.getVolume());
        }
        if (request.getUnit() != null) {
            sample.setUnit(request.getUnit());
        }
        if (request.getDescription() != null) {
            sample.setDescription(request.getDescription());
        }
        if (request.getDepartment() != null) {
            sample.setDepartment(request.getDepartment());
        }
        sample.setUpdatedBy(TenantContext.getCurrentUserId());
        return sampleMetadataRepository.save(sample);
    }

    @Transactional
    public void deleteSample(Long id) {
        SampleMetadata sample = sampleMetadataRepository.findById(id)
                .orElseThrow(() -> new BusinessException("样本不存在"));
        if (!sample.getTenantId().equals(TenantContext.getTenantId())) {
            throw new BusinessException("无权操作此样本");
        }
        sample.setStatus("DELETED");
        sample.setUpdatedBy(TenantContext.getCurrentUserId());
        sampleMetadataRepository.save(sample);
    }

    public SampleMetadata getSampleById(Long id) {
        SampleMetadata sample = sampleMetadataRepository.findById(id)
                .orElseThrow(() -> new BusinessException("样本不存在"));
        if (!sample.getTenantId().equals(TenantContext.getTenantId())) {
            throw new BusinessException("无权查看此样本");
        }
        return sample;
    }

    public Page<SampleMetadata> querySamples(SampleQueryRequest request) {
        Specification<SampleMetadata> spec = buildSpecification(request, TenantContext.getTenantId());
        PageRequest pageRequest = PageRequest.of(request.getPage(), request.getSize(), Sort.by(Sort.Direction.DESC, "createdAt"));
        return sampleMetadataRepository.findAll(spec, pageRequest);
    }

    @Transactional
    public Page<SampleMetadata> crossDeptQuery(SampleQueryRequest request, Long targetTenantId) {
        Specification<SampleMetadata> spec = buildSpecification(request, targetTenantId);
        PageRequest pageRequest = PageRequest.of(request.getPage(), request.getSize(), Sort.by(Sort.Direction.DESC, "createdAt"));
        Page<SampleMetadata> result = sampleMetadataRepository.findAll(spec, pageRequest);

        CrossDeptQueryLog log = new CrossDeptQueryLog();
        log.setRequesterId(TenantContext.getCurrentUserId());
        log.setTargetTenantId(targetTenantId);
        log.setQueryCondition(buildQueryCondition(request));
        log.setResultCount(result.getTotalElements());
        crossDeptQueryLogRepository.save(log);

        return result;
    }

    private Specification<SampleMetadata> buildSpecification(SampleQueryRequest request, Long tenantId) {
        return (root, query, cb) -> {
            List<Predicate> predicates = new ArrayList<>();
            predicates.add(cb.equal(root.get("tenantId"), tenantId));
            predicates.add(cb.notEqual(root.get("status"), "DELETED"));
            if (request.getSampleCode() != null && !request.getSampleCode().isEmpty()) {
                predicates.add(cb.like(root.get("sampleCode"), "%" + request.getSampleCode() + "%"));
            }
            if (request.getSampleName() != null && !request.getSampleName().isEmpty()) {
                predicates.add(cb.like(root.get("sampleName"), "%" + request.getSampleName() + "%"));
            }
            if (request.getSampleType() != null && !request.getSampleType().isEmpty()) {
                predicates.add(cb.equal(root.get("sampleType"), request.getSampleType()));
            }
            if (request.getStatus() != null && !request.getStatus().isEmpty()) {
                predicates.add(cb.equal(root.get("status"), request.getStatus()));
            }
            if (request.getDepartment() != null && !request.getDepartment().isEmpty()) {
                predicates.add(cb.equal(root.get("department"), request.getDepartment()));
            }
            if (request.getCollectionDateStart() != null) {
                predicates.add(cb.greaterThanOrEqualTo(root.get("collectionDate"), request.getCollectionDateStart()));
            }
            if (request.getCollectionDateEnd() != null) {
                predicates.add(cb.lessThanOrEqualTo(root.get("collectionDate"), request.getCollectionDateEnd()));
            }
            query.distinct(true);
            return cb.and(predicates.toArray(new Predicate[0]));
        };
    }

    private BatchValidationRequest buildValidationRequest(SampleCreateRequest request) {
        Map<String, Object> fields = new HashMap<>();
        fields.put("sampleCode", request.getSampleCode());
        fields.put("sampleName", request.getSampleName());
        if (request.getVolume() != null) {
            fields.put("volume", request.getVolume());
        }
        BatchValidationRequest validationRequest = new BatchValidationRequest();
        validationRequest.setSampleCode(request.getSampleCode());
        validationRequest.setFields(fields);
        return validationRequest;
    }

    private BatchValidationRequest buildValidationRequest(SampleUpdateRequest request, SampleMetadata sample) {
        Map<String, Object> fields = new HashMap<>();
        if (request.getSampleCode() != null) {
            fields.put("sampleCode", request.getSampleCode());
        } else {
            fields.put("sampleCode", sample.getSampleCode());
        }
        if (request.getSampleName() != null) {
            fields.put("sampleName", request.getSampleName());
        } else {
            fields.put("sampleName", sample.getSampleName());
        }
        if (request.getVolume() != null) {
            fields.put("volume", request.getVolume());
        } else if (sample.getVolume() != null) {
            fields.put("volume", sample.getVolume());
        }
        BatchValidationRequest validationRequest = new BatchValidationRequest();
        validationRequest.setSampleCode((String) fields.get("sampleCode"));
        validationRequest.setFields(fields);
        return validationRequest;
    }

    private String buildValidationErrorMessage(List<ValidationResult> results) {
        List<String> errors = new ArrayList<>();
        for (ValidationResult result : results) {
            if (!result.isValid()) {
                errors.add(result.getFieldName() + ": " + result.getErrorMessage());
            }
        }
        return String.join("; ", errors);
    }

    private String buildQueryCondition(SampleQueryRequest request) {
        StringBuilder sb = new StringBuilder();
        if (request.getSampleCode() != null) sb.append("sampleCode=").append(request.getSampleCode()).append(";");
        if (request.getSampleName() != null) sb.append("sampleName=").append(request.getSampleName()).append(";");
        if (request.getSampleType() != null) sb.append("sampleType=").append(request.getSampleType()).append(";");
        if (request.getStatus() != null) sb.append("status=").append(request.getStatus()).append(";");
        if (request.getDepartment() != null) sb.append("department=").append(request.getDepartment()).append(";");
        if (request.getCollectionDateStart() != null) sb.append("collectionDateStart=").append(request.getCollectionDateStart()).append(";");
        if (request.getCollectionDateEnd() != null) sb.append("collectionDateEnd=").append(request.getCollectionDateEnd()).append(";");
        return sb.toString();
    }
}
