package com.smartmeter.protocol.controller;

import com.smartmeter.common.dto.MeterDataDTO;
import com.smartmeter.common.result.Result;
import com.smartmeter.common.utils.ByteUtils;
import com.smartmeter.protocol.service.ProtocolParserService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

@Slf4j
@RestController
@RequestMapping("/api/parser")
public class ProtocolParserController {

    @Autowired
    private ProtocolParserService protocolParserService;

    @PostMapping("/parse/{protocolType}")
    public Result<MeterDataDTO> parse(
            @PathVariable String protocolType,
            @RequestBody String hexData) {
        try {
            log.info("Received parse request, protocol: {}, hex data length: {}", protocolType, hexData.length());
            byte[] data = ByteUtils.hexToBytes(hexData.trim());
            MeterDataDTO result = protocolParserService.parse(protocolType, data);
            return Result.success(result);
        } catch (Exception e) {
            log.error("Parse protocol data failed, protocol: {}, error: {}", protocolType, e.getMessage(), e);
            return Result.fail("Parse failed: " + e.getMessage());
        }
    }

    @PostMapping("/auto-parse")
    public Result<MeterDataDTO> autoParse(@RequestBody String hexData) {
        try {
            log.info("Received auto parse request, hex data length: {}", hexData.length());
            byte[] data = ByteUtils.hexToBytes(hexData.trim());
            MeterDataDTO result = protocolParserService.autoParse(data);
            return Result.success(result);
        } catch (Exception e) {
            log.error("Auto parse protocol data failed, error: {}", e.getMessage(), e);
            return Result.fail("Auto parse failed: " + e.getMessage());
        }
    }

    @PostMapping("/validate/{protocolType}")
    public Result<Boolean> validate(
            @PathVariable String protocolType,
            @RequestBody String hexData) {
        try {
            byte[] data = ByteUtils.hexToBytes(hexData.trim());
            boolean valid = protocolParserService.validate(protocolType, data);
            return Result.success(valid);
        } catch (Exception e) {
            log.error("Validate protocol data failed, error: {}", e.getMessage(), e);
            return Result.fail("Validate failed: " + e.getMessage());
        }
    }

    @PostMapping("/extract-meter-id/{protocolType}")
    public Result<String> extractMeterId(
            @PathVariable String protocolType,
            @RequestBody String hexData) {
        try {
            byte[] data = ByteUtils.hexToBytes(hexData.trim());
            String meterId = protocolParserService.extractMeterId(protocolType, data);
            return Result.success(meterId);
        } catch (Exception e) {
            log.error("Extract meter id failed, error: {}", e.getMessage(), e);
            return Result.fail("Extract meter id failed: " + e.getMessage());
        }
    }

    @GetMapping("/supported")
    public Result<Boolean> isSupported(@RequestParam String protocolType) {
        boolean supported = protocolParserService.isProtocolSupported(protocolType);
        return Result.success(supported);
    }
}
