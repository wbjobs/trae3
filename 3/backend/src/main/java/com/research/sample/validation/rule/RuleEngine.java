package com.research.sample.validation.rule;

import com.research.sample.validation.dto.ValidationResult;
import com.research.sample.validation.entity.ValidationRule;

public interface RuleEngine {

    ValidationResult evaluate(ValidationRule rule, Object value);
}
