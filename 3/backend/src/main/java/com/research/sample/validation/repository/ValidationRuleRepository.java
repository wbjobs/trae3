package com.research.sample.validation.repository;

import com.research.sample.validation.entity.ValidationRule;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface ValidationRuleRepository extends JpaRepository<ValidationRule, Long> {

    List<ValidationRule> findByTenantIdAndIsEnabled(Long tenantId, Boolean isEnabled);

    List<ValidationRule> findByFieldNameAndTenantIdAndIsEnabled(String fieldName, Long tenantId, Boolean isEnabled);

    Optional<ValidationRule> findByRuleCode(String ruleCode);
}
