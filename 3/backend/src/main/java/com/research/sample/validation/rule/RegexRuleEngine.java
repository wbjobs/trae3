package com.research.sample.validation.rule;

import com.research.sample.validation.dto.ValidationResult;
import com.research.sample.validation.entity.ValidationRule;
import org.springframework.stereotype.Component;

import java.util.regex.Pattern;

@Component
public class RegexRuleEngine implements RuleEngine {

    @Override
    public ValidationResult evaluate(ValidationRule rule, Object value) {
        if (value == null) {
            return new ValidationResult(true, rule.getFieldName(), null, null);
        }
        boolean valid = Pattern.matches(rule.getRuleExpression(), value.toString());
        return new ValidationResult(
                valid,
                rule.getFieldName(),
                valid ? null : rule.getErrorMessage(),
                valid ? null : rule.getRuleCode()
        );
    }
}
