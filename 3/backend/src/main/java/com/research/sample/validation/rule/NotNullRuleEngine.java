package com.research.sample.validation.rule;

import com.research.sample.validation.dto.ValidationResult;
import com.research.sample.validation.entity.ValidationRule;
import org.springframework.stereotype.Component;

@Component
public class NotNullRuleEngine implements RuleEngine {

    @Override
    public ValidationResult evaluate(ValidationRule rule, Object value) {
        boolean valid = value != null && !value.toString().trim().isEmpty();
        return new ValidationResult(
                valid,
                rule.getFieldName(),
                valid ? null : rule.getErrorMessage(),
                valid ? null : rule.getRuleCode()
        );
    }
}
