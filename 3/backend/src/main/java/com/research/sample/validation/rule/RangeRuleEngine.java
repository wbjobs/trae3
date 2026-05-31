package com.research.sample.validation.rule;

import com.research.sample.validation.dto.ValidationResult;
import com.research.sample.validation.entity.ValidationRule;
import org.springframework.stereotype.Component;

@Component
public class RangeRuleEngine implements RuleEngine {

    @Override
    public ValidationResult evaluate(ValidationRule rule, Object value) {
        if (value == null) {
            return new ValidationResult(true, rule.getFieldName(), null, null);
        }
        try {
            String[] parts = rule.getRuleExpression().split(",");
            double min = Double.parseDouble(parts[0].trim());
            double max = Double.parseDouble(parts[1].trim());
            double numValue = Double.parseDouble(value.toString());
            boolean valid = numValue >= min && numValue <= max;
            return new ValidationResult(
                    valid,
                    rule.getFieldName(),
                    valid ? null : rule.getErrorMessage(),
                    valid ? null : rule.getRuleCode()
            );
        } catch (Exception e) {
            return new ValidationResult(false, rule.getFieldName(), rule.getErrorMessage(), rule.getRuleCode());
        }
    }
}
