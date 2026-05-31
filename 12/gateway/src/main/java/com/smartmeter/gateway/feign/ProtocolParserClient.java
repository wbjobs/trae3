package com.smartmeter.gateway.feign;

import com.smartmeter.common.dto.MeterDataDTO;
import com.smartmeter.common.result.Result;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.*;

@FeignClient(name = "protocol-parser-service")
public interface ProtocolParserClient {

    @PostMapping("/api/parser/parse/{protocolType}")
    Result<MeterDataDTO> parse(
            @PathVariable("protocolType") String protocolType,
            @RequestBody String hexData);

    @PostMapping("/api/parser/auto-parse")
    Result<MeterDataDTO> autoParse(@RequestBody String hexData);
}
