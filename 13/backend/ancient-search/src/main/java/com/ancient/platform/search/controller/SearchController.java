package com.ancient.platform.search.controller;

import com.ancient.platform.common.cache.CacheNames;
import com.ancient.platform.common.result.Result;
import com.ancient.platform.common.search.AncientPageIndex;
import com.ancient.platform.search.dto.AsyncIndexRequest;
import com.ancient.platform.search.dto.SearchRequest;
import com.ancient.platform.search.dto.SearchResponse;
import com.ancient.platform.search.dto.SearchResponse.AggregationItem;
import com.ancient.platform.search.service.SearchService;
import lombok.RequiredArgsConstructor;
import org.springframework.cache.Cache;
import org.springframework.cache.CacheManager;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.CompletableFuture;

@RestController
@RequestMapping("/api/search")
@RequiredArgsConstructor
public class SearchController {

    private final SearchService searchService;
    private final CacheManager cacheManager;

    @PostMapping
    public Result<SearchResponse> search(@RequestBody SearchRequest request) {
        SearchResponse response = searchService.search(request);
        return Result.success(response);
    }

    @GetMapping("/suggest")
    public Result<List<String>> suggest(@RequestParam String keyword) {
        List<String> suggestions = searchService.suggest(keyword);
        return Result.success(suggestions);
    }

    @GetMapping("/advanced/filters")
    public Result<Map<String, List<AggregationItem>>> getAdvancedFilters() {
        Map<String, List<AggregationItem>> filters = searchService.getAdvancedFilters();
        return Result.success(filters);
    }

    @GetMapping("/hot-keywords")
    public Result<Set<String>> getHotKeywords(@RequestParam(defaultValue = "10") int topN) {
        Set<String> hotKeywords = searchService.getHotKeywords(topN);
        return Result.success(hotKeywords);
    }

    @PostMapping("/index/async")
    public Result<String> asyncIndexPage(@RequestBody AsyncIndexRequest request) {
        if (request.getPage() == null || request.getProjectName() == null) {
            return Result.error("页面信息和项目名称不能为空");
        }
        CompletableFuture<Void> future = searchService.asyncIndexPage(request.getPage(), request.getProjectName());
        future.whenComplete((result, ex) -> {
            if (ex != null) {
                log.error("异步索引页面失败", ex);
            }
        });
        return Result.success("异步索引任务已提交");
    }

    @PostMapping("/index/batch-async")
    public Result<String> asyncBatchIndex(@RequestBody AsyncIndexRequest request) {
        if (request.getPages() == null || request.getPages().isEmpty() || request.getProjectName() == null) {
            return Result.error("页面列表和项目名称不能为空");
        }
        CompletableFuture<Void> future = searchService.asyncBatchIndex(request.getPages(), request.getProjectName());
        future.whenComplete((result, ex) -> {
            if (ex != null) {
                log.error("异步批量索引失败", ex);
            }
        });
        return Result.success("异步批量索引任务已提交");
    }

    @DeleteMapping("/cache")
    public Result<String> clearSearchCache() {
        String[] cacheNames = {
            CacheNames.SEARCH_RESULT,
            CacheNames.SEARCH_SUGGEST,
            CacheNames.SEARCH_FILTERS,
            CacheNames.PAGE_INDEX
        };
        for (String cacheName : cacheNames) {
            Cache cache = cacheManager.getCache(cacheName);
            if (cache != null) {
                cache.clear();
            }
        }
        return Result.success("搜索缓存已清除");
    }

    private static final org.slf4j.Logger log = org.slf4j.LoggerFactory.getLogger(SearchController.class);
}
