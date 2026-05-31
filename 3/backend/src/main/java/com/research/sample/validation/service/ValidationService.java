package com.research.sample.validation.service;

import com.research.sample.auth.context.TenantContext;
import com.research.sample.validation.dto.BatchValidationRequest;
import com.research.sample.validation.dto.BatchValidationResult;
import com.research.sample.validation.dto.ValidationRequest;
import com.research.sample.validation.dto.ValidationResult;
import com.research.sample.validation.entity.ValidationRule;
import com.research.sample.validation.repository.ValidationRuleRepository;
import com.research.sample.validation.rule.RuleEngine;
import com.research.sample.validation.rule.RuleEngineFactory;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

@Service
@RequiredArgsConstructor
public class ValidationService {

    private final ValidationRuleRepository validationRuleRepository;
    private final RuleEngineFactory ruleEngineFactory;

    public List<ValidationResult> validateField(ValidationRequest request) {
        Long tenantId = TenantContext.getTenantId();
        List<ValidationRule> rules = validationRuleRepository
                .findByFieldNameAndTenantIdAndIsEnabled(request.getFieldName(), tenantId, true);
        List<ValidationResult> results = new ArrayList<>();
        for (ValidationRule rule : rules) {
            RuleEngine engine = ruleEngineFactory.getEngine(rule.getRuleType());
            if (engine != null) {
                results.add(engine.evaluate(rule, request.getFieldValue()));
            }
        }
        return results;
    }

    public BatchValidationResult validateBatch(BatchValidationRequest request) {
        Long tenantId = TenantContext.getTenantId();
        List<ValidationResult> allResults = new ArrayList<>();
        for (Map.Entry<String, Object> entry : request.getFields().entrySet()) {
            List<ValidationRule> rules = validationRuleRepository
                    .findByFieldNameAndTenantIdAndIsEnabled(entry.getKey(), tenantId, true);
            for (ValidationRule rule : rules) {
                RuleEngine engine = ruleEngineFactory.getEngine(rule.getRuleType());
                if (engine != null) {
                    allResults.add(engine.evaluate(rule, entry.getValue()));
                }
            }
        }
        int totalErrors = (int) allResults.stream().filter(r -> !r.isValid()).count();
        boolean valid = totalErrors == 0;
        return new BatchValidationResult(request.getSampleCode(), valid, allResults, totalErrors);
    }

    public ValidationRule createRule(ValidationRule rule) {
        rule.setTenantId(TenantContext.getTenantId());
        return validationRuleRepository.save(rule);
    }

    public ValidationRule updateRule(ValidationRule rule) {
        return validationRuleRepository.save(rule);
    }

    public List<ValidationRule> getRulesByTenant() {
        Long tenantId = TenantContext.getTenantId();
        return validationRuleRepository.findByTenantIdAndIsEnabled(tenantId, true);
    }
}
