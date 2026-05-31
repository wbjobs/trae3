package com.specimen.traceability.feign;

import com.specimen.common.result.Result;
import com.specimen.traceability.doc.SpecimenIndexDoc;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;

import java.util.Map;

@FeignClient(name = "specimen-data", path = "/data")
public interface SpecimenClient {

    @GetMapping("/specimen/{id}")
    Result<SpecimenIndexDoc> getSpecimenById(@PathVariable("id") Long id);

    @PostMapping("/specimen/page")
    Result<Map<String, Object>> getSpecimenList(
            @RequestParam(value = "page", defaultValue = "1") Integer page,
            @RequestParam(value = "size", defaultValue = "100") Integer size);
}
