package com.specimen.data.feign;

import com.specimen.common.result.Result;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;

import java.util.Map;

@FeignClient(name = "specimen-storage", path = "/storage")
public interface StorageClient {

    @GetMapping("/{id}")
    Result<Map<String, Object>> getFileInfo(@PathVariable("id") Long id);

    @GetMapping("/preview")
    Result<String> preview(@RequestParam("objectName") String objectName,
                           @RequestParam(value = "expires", required = false, defaultValue = "3600") Integer expires);
}
