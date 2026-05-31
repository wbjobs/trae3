package com.research.sample.validation.rule;

import com.research.sample.validation.dto.ValidationResult;
import com.research.sample.validation.entity.ValidationRule;
import org.springframework.stereotype.Component;

import java.util.Arrays;
import java.util.Set;
import java.util.stream.Collectors;

@Component
public class EnumRuleEngine implements RuleEngine {

    @Override
    public ValidationResult evaluate(ValidationRule rule, Object value) {
        if (value == null) {
            return new ValidationResult(true, rule.getFieldName(), null, null);
        }
        Set<String> allowedValues = Arrays.stream(rule.getRuleExpression().split(","))
                .map(String::trim)
                .collect(Collectors.toSet());
        boolean valid = allowedValues.contains(value.toString().trim());
        return new ValidationResult(
                valid,
                rule.getFieldName(),
                valid ? null : rule.getErrorMessage(),
                valid ? null : rule.getRuleCode()
        );
    }
}
