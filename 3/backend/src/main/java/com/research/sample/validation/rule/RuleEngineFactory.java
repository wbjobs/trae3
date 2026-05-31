package com.research.sample.validation.rule;

import com.research.sample.validation.entity.RuleType;
import jakarta.annotation.PostConstruct;
import org.springframework.stereotype.Component;

import java.util.HashMap;
import java.util.Map;

@Component
public class RuleEngineFactory {

    private final NotNullRuleEngine notNullRuleEngine;
    private final RangeRuleEngine rangeRuleEngine;
    private final RegexRuleEngine regexRuleEngine;
    private final EnumRuleEngine enumRuleEngine;

    private Map<RuleType, RuleEngine> engineMap;

    public RuleEngineFactory(NotNullRuleEngine notNullRuleEngine,
                             RangeRuleEngine rangeRuleEngine,
                             RegexRuleEngine regexRuleEngine,
                             EnumRuleEngine enumRuleEngine) {
        this.notNullRuleEngine = notNullRuleEngine;
        this.rangeRuleEngine = rangeRuleEngine;
        this.regexRuleEngine = regexRuleEngine;
        this.enumRuleEngine = enumRuleEngine;
    }

    @PostConstruct
    public void init() {
        engineMap = new HashMap<>();
        engineMap.put(RuleType.NOT_NULL, notNullRuleEngine);
        engineMap.put(RuleType.RANGE, rangeRuleEngine);
        engineMap.put(RuleType.REGEX, regexRuleEngine);
        engineMap.put(RuleType.ENUM, enumRuleEngine);
    }

    public RuleEngine getEngine(RuleType ruleType) {
        return engineMap.get(ruleType);
    }
}
