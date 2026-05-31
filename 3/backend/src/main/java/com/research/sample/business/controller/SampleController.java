package com.research.sample.business.controller;

import com.research.sample.business.dto.SampleCreateRequest;
import com.research.sample.business.dto.SampleQueryRequest;
import com.research.sample.business.dto.SampleUpdateRequest;
import com.research.sample.business.entity.SampleMetadata;
import com.research.sample.business.service.SampleService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/samples")
@RequiredArgsConstructor
public class SampleController {

    private final SampleService sampleService;

    @PostMapping
    public SampleMetadata createSample(@Valid @RequestBody SampleCreateRequest request) {
        return sampleService.createSample(request);
    }

    @PutMapping("/{id}")
    public SampleMetadata updateSample(@Valid @RequestBody SampleUpdateRequest request) {
        return sampleService.updateSample(request);
    }

    @DeleteMapping("/{id}")
    public void deleteSample(@PathVariable Long id) {
        sampleService.deleteSample(id);
    }

    @GetMapping("/{id}")
    public SampleMetadata getSampleById(@PathVariable Long id) {
        return sampleService.getSampleById(id);
    }

    @GetMapping("/query")
    public Page<SampleMetadata> querySamples(SampleQueryRequest request) {
        return sampleService.querySamples(request);
    }

    @GetMapping("/cross-dept")
    public Page<SampleMetadata> crossDeptQuery(SampleQueryRequest request,
                                               @RequestParam Long targetTenantId) {
        return sampleService.crossDeptQuery(request, targetTenantId);
    }
}
