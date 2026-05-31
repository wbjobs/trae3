package com.ancient.platform.search.service;

import cn.hutool.core.util.StrUtil;
import com.ancient.platform.common.cache.CacheNames;
import com.ancient.platform.common.cache.SearchCacheService;
import com.ancient.platform.common.search.AncientPageIndex;
import com.ancient.platform.common.utils.AncientVariantCharUtils;
import com.ancient.platform.project.entity.AncientPage;
import com.ancient.platform.search.dto.SearchRequest;
import com.ancient.platform.search.dto.SearchResponse;
import com.ancient.platform.search.dto.SearchResponse.AggregationItem;
import com.ancient.platform.search.dto.SearchResponse.SearchHit;
import com.ancient.platform.search.repository.AncientPageEsRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.elasticsearch.client.elc.NativeQuery;
import org.springframework.data.elasticsearch.core.ElasticsearchOperations;
import org.springframework.data.elasticsearch.core.SearchHits;
import org.springframework.data.elasticsearch.core.query.HighlightQuery;
import org.springframework.data.elasticsearch.core.query.highlight.Highlight;
import org.springframework.data.elasticsearch.core.query.highlight.HighlightField;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.CompletableFuture;

@Slf4j
@Service
@RequiredArgsConstructor
public class SearchService {

    private final ElasticsearchOperations elasticsearchOperations;
    private final AncientPageEsRepository ancientPageEsRepository;
    private final SearchCacheService searchCacheService;

    @Cacheable(cacheNames = CacheNames.SEARCH_RESULT, key = "#request.keyword + '_' + #request.pageNum + '_' + #request.pageSize + '_' + #request.projectId + '_' + #request.dynasty + '_' + #request.author")
    public SearchResponse search(SearchRequest request) {
        String keyword = request.getKeyword();
        searchCacheService.recordSearchHotkey(keyword);
        Long projectId = request.getProjectId();
        String dynasty = request.getDynasty();
        String author = request.getAuthor();
        int pageNum = Math.max(request.getPageNum() - 1, 0);
        int pageSize = request.getPageSize();

        var boolBuilder = new co.elastic.clients.elasticsearch._types.query_dsl.BoolQuery.Builder();

        if (StrUtil.isNotBlank(keyword)) {
            String normalizedKeyword = AncientVariantCharUtils.normalize(keyword);
            boolBuilder.must(m -> m.multiMatch(mm -> mm
                    .fields("recognizedText^1.0", "collatedText^1.2", "normalizedText^1.5", "projectName^2.0", "dynasty^1.0", "author^1.0")
                    .query(normalizedKeyword)
                    .type(co.elastic.clients.elasticsearch._types.query_dsl.TextQueryType.BestFields)
                    .fuzziness("AUTO")
            ));
        } else {
            boolBuilder.must(m -> m.matchAll(ma -> ma));
        }

        if (projectId != null) {
            boolBuilder.filter(f -> f.term(t -> t.field("projectId").value(projectId)));
        }
        if (StrUtil.isNotBlank(dynasty)) {
            boolBuilder.filter(f -> f.term(t -> t.field("dynasty").value(dynasty)));
        }
        if (StrUtil.isNotBlank(author)) {
            boolBuilder.filter(f -> f.term(t -> t.field("author").value(author)));
        }

        Highlight highlight = new Highlight(List.of(
                new HighlightField("recognizedText"),
                new HighlightField("collatedText"),
                new HighlightField("normalizedText"),
                new HighlightField("projectName")
        ));

        NativeQuery query = NativeQuery.builder()
                .withQuery(boolBuilder.build()._toQuery())
                .withHighlightQuery(new HighlightQuery(highlight, AncientPageIndex.class))
                .withPageable(PageRequest.of(pageNum, pageSize))
                .withAggregation("dynasty_agg",
                        co.elastic.clients.elasticsearch._types.aggregations.Aggregation.of(
                                a -> a.terms(t -> t.field("dynasty").size(50))))
                .withAggregation("author_agg",
                        co.elastic.clients.elasticsearch._types.aggregations.Aggregation.of(
                                a -> a.terms(t -> t.field("author").size(50))))
                .build();

        SearchHits<AncientPageIndex> hits = elasticsearchOperations.search(query, AncientPageIndex.class);

        SearchResponse response = new SearchResponse();
        response.setTotalHits(hits.getTotalHits());
        response.setPageNum(request.getPageNum());
        response.setPageSize(pageSize);

        List<SearchHit> records = new ArrayList<>();
        hits.forEach(hit -> {
            SearchHit searchHit = new SearchHit();
            AncientPageIndex index = hit.getContent();
            searchHit.setId(index.getId());
            searchHit.setPageId(index.getPageId());
            searchHit.setProjectId(index.getProjectId());
            searchHit.setProjectName(index.getProjectName());
            searchHit.setPageNumber(index.getPageNumber());
            searchHit.setRecognizedText(index.getRecognizedText());
            searchHit.setCollatedText(index.getCollatedText());
            searchHit.setNormalizedText(index.getNormalizedText());
            searchHit.setDynasty(index.getDynasty());
            searchHit.setAuthor(index.getAuthor());
            searchHit.setStatus(index.getStatus());
            searchHit.setCurrentVersion(index.getCurrentVersion());
            searchHit.setLastEditTime(index.getLastEditTime());

            Map<String, List<String>> highlightFields = new HashMap<>();
            hit.getHighlightFields().forEach((field, values) ->
                    highlightFields.put(field, values)
            );
            searchHit.setHighlights(highlightFields);

            records.add(searchHit);
        });
        response.setRecords(records);

        Map<String, List<AggregationItem>> aggregations = new HashMap<>();
        hits.getAggregations().forEach(aggregation -> {
            if (aggregation.aggregation() instanceof co.elastic.clients.elasticsearch._types.aggregations.StringTermsAggregate termsAgg) {
                List<AggregationItem> items = new ArrayList<>();
                termsAgg.buckets().array().forEach(bucket -> {
                    AggregationItem item = new AggregationItem();
                    item.setKey(bucket.key().stringValue());
                    item.setCount(bucket.docCount());
                    items.add(item);
                });
                String aggName = aggregation.aggregation().getName();
                if ("dynasty_agg".equals(aggName)) {
                    aggregations.put("dynasty", items);
                } else if ("author_agg".equals(aggName)) {
                    aggregations.put("author", items);
                }
            }
        });
        response.setAggregations(aggregations);

        return response;
    }

    @Cacheable(cacheNames = CacheNames.SEARCH_SUGGEST, key = "#keyword")
    public List<String> suggest(String keyword) {
        if (StrUtil.isBlank(keyword)) {
            return List.of();
        }

        String normalizedKeyword = AncientVariantCharUtils.normalize(keyword);

        NativeQuery query = NativeQuery.builder()
                .withQuery(q -> q.multiMatch(mm -> mm
                        .fields("recognizedText", "collatedText", "normalizedText", "projectName", "dynasty", "author")
                        .query(normalizedKeyword)
                        .type(co.elastic.clients.elasticsearch._types.query_dsl.TextQueryType.PhrasePrefix)
                ))
                .withPageable(PageRequest.of(0, 20))
                .build();

        SearchHits<AncientPageIndex> hits = elasticsearchOperations.search(query, AncientPageIndex.class);

        List<String> suggestions = new ArrayList<>();
        hits.forEach(hit -> {
            AncientPageIndex index = hit.getContent();
            if (StrUtil.isNotBlank(index.getProjectName())) {
                suggestions.add(index.getProjectName());
            }
            if (StrUtil.isNotBlank(index.getDynasty())) {
                suggestions.add(index.getDynasty());
            }
            if (StrUtil.isNotBlank(index.getAuthor())) {
                suggestions.add(index.getAuthor());
            }
            if (StrUtil.isNotBlank(index.getNormalizedText()) && index.getNormalizedText().length() > 0) {
                int idx = index.getNormalizedText().indexOf(normalizedKeyword);
                if (idx >= 0) {
                    int start = Math.max(0, idx - 10);
                    int end = Math.min(index.getNormalizedText().length(), idx + normalizedKeyword.length() + 10);
                    suggestions.add(index.getNormalizedText().substring(start, end));
                }
            }
        });

        return suggestions.stream().distinct().limit(10).toList();
    }

    @CacheEvict(cacheNames = {CacheNames.SEARCH_RESULT, CacheNames.SEARCH_SUGGEST, CacheNames.SEARCH_FILTERS}, allEntries = true)
    @Transactional(rollbackFor = Exception.class)
    public void indexPage(AncientPage page, String projectName) {
        AncientPageIndex index = buildIndex(page, projectName);
        ancientPageEsRepository.save(index);
        log.info("索引页面成功: id={}, pageId={}, projectId={}", index.getId(), page.getId(), page.getProjectId());
    }

    @Transactional(rollbackFor = Exception.class)
    public void batchIndex(List<AncientPage> pages, String projectName) {
        List<AncientPageIndex> indices = pages.stream()
                .map(page -> buildIndex(page, projectName))
                .toList();
        ancientPageEsRepository.saveAll(indices);
        log.info("批量索引页面成功: count={}", indices.size());
    }

    private AncientPageIndex buildIndex(AncientPage page, String projectName) {
        AncientPageIndex index = new AncientPageIndex();
        index.setId(String.valueOf(page.getId()));
        index.setPageId(page.getId());
        index.setProjectId(page.getProjectId());
        index.setProjectName(projectName);
        index.setPageNumber(page.getPageNumber());
        index.setDynasty(page.getDynasty());
        index.setAuthor(page.getAuthor());
        index.setRecognizedText(page.getRecognizedText());
        index.setCollatedText(page.getCollatedText());

        String recognizedNormalized = AncientVariantCharUtils.normalize(page.getRecognizedText());
        String collatedNormalized = AncientVariantCharUtils.normalize(page.getCollatedText());
        String normalizedText = recognizedNormalized;
        if (StrUtil.isNotBlank(collatedNormalized)) {
            normalizedText = collatedNormalized;
        }
        index.setNormalizedText(normalizedText);

        index.setStatus(page.getStatus());
        index.setCurrentCollatorId(page.getCurrentCollatorId());
        index.setCurrentCollatorName(page.getCurrentCollatorName());
        index.setCurrentVersion(page.getCurrentVersion());
        index.setLastEditTime(page.getLastEditTime());
        index.setCreateTime(page.getCreateTime());
        index.setUpdateTime(page.getUpdateTime());

        return index;
    }

    public void deleteIndex(String id) {
        ancientPageEsRepository.deleteById(id);
        log.info("删除索引成功: id={}", id);
    }

    public void deleteIndexByPageId(Long pageId) {
        ancientPageEsRepository.deleteById(String.valueOf(pageId));
        log.info("根据页面ID删除索引成功: pageId={}", pageId);
    }

    @CacheEvict(cacheNames = {CacheNames.SEARCH_RESULT, CacheNames.SEARCH_SUGGEST, CacheNames.SEARCH_FILTERS}, allEntries = true)
    @Transactional(rollbackFor = Exception.class)
    public void rebuildIndex(List<AncientPage> pages, String projectName) {
        ancientPageEsRepository.deleteAll();
        log.info("清空索引完成");

        if (pages != null && !pages.isEmpty()) {
            List<AncientPageIndex> indices = pages.stream()
                    .map(page -> buildIndex(page, projectName))
                    .toList();
            ancientPageEsRepository.saveAll(indices);
            log.info("重建索引完成: count={}", indices.size());
        }
    }

    @Cacheable(cacheNames = CacheNames.SEARCH_FILTERS)
    public Map<String, List<AggregationItem>> getAdvancedFilters() {
        NativeQuery query = NativeQuery.builder()
                .withQuery(q -> q.matchAll(ma -> ma))
                .withAggregation("dynasty_agg",
                        co.elastic.clients.elasticsearch._types.aggregations.Aggregation.of(
                                a -> a.terms(t -> t.field("dynasty").size(100))))
                .withAggregation("author_agg",
                        co.elastic.clients.elasticsearch._types.aggregations.Aggregation.of(
                                a -> a.terms(t -> t.field("author").size(100))))
                .withMaxResults(0)
                .build();

        SearchHits<AncientPageIndex> hits = elasticsearchOperations.search(query, AncientPageIndex.class);

        Map<String, List<AggregationItem>> filters = new HashMap<>();
        hits.getAggregations().forEach(aggregation -> {
            if (aggregation.aggregation() instanceof co.elastic.clients.elasticsearch._types.aggregations.StringTermsAggregate termsAgg) {
                List<AggregationItem> items = new ArrayList<>();
                termsAgg.buckets().array().forEach(bucket -> {
                    AggregationItem item = new AggregationItem();
                    item.setKey(bucket.key().stringValue());
                    item.setCount(bucket.docCount());
                    items.add(item);
                });
                String aggName = aggregation.aggregation().getName();
                if ("dynasty_agg".equals(aggName)) {
                    filters.put("dynasty", items);
                } else if ("author_agg".equals(aggName)) {
                    filters.put("author", items);
                }
            }
        });

        return filters;
    }

    public boolean indexExists() {
        return elasticsearchOperations.indexOps(AncientPageIndex.class).exists();
    }

    public boolean createIndex() {
        boolean created = elasticsearchOperations.indexOps(AncientPageIndex.class).createWithMapping();
        if (created) {
            log.info("创建索引成功: ancient_page");
        }
        return created;
    }

    public boolean deleteIndexAll() {
        boolean deleted = elasticsearchOperations.indexOps(AncientPageIndex.class).delete();
        if (deleted) {
            log.info("删除索引成功: ancient_page");
        }
        return deleted;
    }

    @Async
    public CompletableFuture<Void> asyncIndexPage(AncientPage page, String projectName) {
        try {
            indexPage(page, projectName);
            return CompletableFuture.completedFuture(null);
        } catch (Exception e) {
            log.error("异步索引页面失败: pageId={}", page.getId(), e);
            return CompletableFuture.failedFuture(e);
        }
    }

    @Async
    public CompletableFuture<Void> asyncBatchIndex(List<AncientPage> pages, String projectName) {
        try {
            batchIndex(pages, projectName);
            return CompletableFuture.completedFuture(null);
        } catch (Exception e) {
            log.error("异步批量索引失败: count={}", pages != null ? pages.size() : 0, e);
            return CompletableFuture.failedFuture(e);
        }
    }

    public void recordSearchHotkey(String keyword) {
        searchCacheService.recordSearchHotkey(keyword);
    }

    public Set<String> getHotKeywords(int topN) {
        return searchCacheService.getHotKeywords(topN);
    }
}
