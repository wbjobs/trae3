package com.research.sample.validation.controller;

import com.research.sample.validation.dto.BatchValidationRequest;
import com.research.sample.validation.dto.BatchValidationResult;
import com.research.sample.validation.dto.ValidationRequest;
import com.research.sample.validation.dto.ValidationResult;
import com.research.sample.validation.entity.ValidationRule;
import com.research.sample.validation.service.ValidationService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/validation")
@RequiredArgsConstructor
public class ValidationController {

    private final ValidationService validationService;

    @PostMapping("/field")
    public List<ValidationResult> validateField(@RequestBody ValidationRequest request) {
        return validationService.validateField(request);
    }

    @PostMapping("/batch")
    public BatchValidationResult validateBatch(@RequestBody BatchValidationRequest request) {
        return validationService.validateBatch(request);
    }

    @PostMapping("/rule")
    public ValidationRule createRule(@RequestBody ValidationRule rule) {
        return validationService.createRule(rule);
    }

    @PutMapping("/rule")
    public ValidationRule updateRule(@RequestBody ValidationRule rule) {
        return validationService.updateRule(rule);
    }

    @GetMapping("/rules")
    public List<ValidationRule> getRules() {
        return validationService.getRulesByTenant();
    }
}
