package com.specimen.traceability.service.impl;

import co.elastic.clients.elasticsearch.ElasticsearchClient;
import co.elastic.clients.elasticsearch._types.FieldValue;
import co.elastic.clients.elasticsearch._types.query_dsl.*;
import co.elastic.clients.elasticsearch.core.BulkRequest;
import co.elastic.clients.elasticsearch.core.SearchRequest;
import co.elastic.clients.elasticsearch.core.SearchResponse;
import co.elastic.clients.elasticsearch.core.search.Hit;
import co.elastic.clients.elasticsearch.core.search.Highlight;
import co.elastic.clients.elasticsearch.core.search.HighlightField;
import com.specimen.common.enums.SpecimenTypeEnum;
import com.specimen.common.result.Result;
import com.specimen.traceability.doc.SpecimenIndexDoc;
import com.specimen.traceability.dto.TraceabilitySearchDTO;
import com.specimen.traceability.feign.SpecimenClient;
import com.specimen.traceability.service.ElasticsearchService;
import com.specimen.traceability.vo.SearchResultVO;
import org.springframework.beans.BeanUtils;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.stream.Collectors;

@Service
public class ElasticsearchServiceImpl implements ElasticsearchService {

    private static final String INDEX_NAME = "specimen_index";
    private static final DateTimeFormatter FORMATTER = DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss");

    @Autowired
    private ElasticsearchClient elasticsearchClient;

    @Autowired
    private SpecimenClient specimenClient;

    @Override
    public void syncSpecimenIndex(SpecimenIndexDoc doc) {
        try {
            elasticsearchClient.index(i -> i
                    .index(INDEX_NAME)
                    .id(doc.getSpecimenId().toString())
                    .document(doc)
            );
        } catch (IOException e) {
            throw new RuntimeException("同步标本索引失败", e);
        }
    }

    @Override
    public void batchSyncSpecimenIndex(List<SpecimenIndexDoc> docs) {
        try {
            BulkRequest.Builder br = new BulkRequest.Builder();
            for (SpecimenIndexDoc doc : docs) {
                br.operations(op -> op
                        .index(idx -> idx
                                .index(INDEX_NAME)
                                .id(doc.getSpecimenId().toString())
                                .document(doc)
                        )
                );
            }
            elasticsearchClient.bulk(br.build());
        } catch (IOException e) {
            throw new RuntimeException("批量同步标本索引失败", e);
        }
    }

    @Override
    public Map<String, Object> search(TraceabilitySearchDTO searchDTO) {
        try {
            List<Query> queries = new ArrayList<>();

            if (searchDTO.getKeyword() != null && !searchDTO.getKeyword().isEmpty()) {
                queries.add(Query.of(q -> q.multiMatch(m -> m
                        .fields("name^3", "description^2", "specimenNo^2", "classification", "location", "collector", "tags", "annotations")
                        .query(searchDTO.getKeyword())
                        .type(TextQueryType.BestFields)
                )));
            }

            if (searchDTO.getSpecimenType() != null) {
                queries.add(Query.of(q -> q.term(t -> t
                        .field("type")
                        .value(FieldValue.of(searchDTO.getSpecimenType()))
                )));
            }

            if (searchDTO.getStartTime() != null || searchDTO.getEndTime() != null) {
                RangeQuery.Builder rangeBuilder = new RangeQuery.Builder().field("createTime");
                if (searchDTO.getStartTime() != null) {
                    rangeBuilder.gte(JsonData.of(searchDTO.getStartTime().format(FORMATTER)));
                }
                if (searchDTO.getEndTime() != null) {
                    rangeBuilder.lte(JsonData.of(searchDTO.getEndTime().format(FORMATTER)));
                }
                queries.add(Query.of(q -> q.range(rangeBuilder.build())));
            }

            if (searchDTO.getMinLongitude() != null && searchDTO.getMaxLongitude() != null
                    && searchDTO.getMinLatitude() != null && searchDTO.getMaxLatitude() != null) {
                List<Query> geoQueries = new ArrayList<>();
                geoQueries.add(Query.of(q -> q.range(r -> r
                        .field("longitude")
                        .gte(JsonData.of(searchDTO.getMinLongitude()))
                        .lte(JsonData.of(searchDTO.getMaxLongitude()))
                )));
                geoQueries.add(Query.of(q -> q.range(r -> r
                        .field("latitude")
                        .gte(JsonData.of(searchDTO.getMinLatitude()))
                        .lte(JsonData.of(searchDTO.getMaxLatitude()))
                )));
                queries.add(Query.of(q -> q.bool(b -> b.must(geoQueries))));
            }

            if (searchDTO.getTags() != null && !searchDTO.getTags().isEmpty()) {
                List<FieldValue> tagValues = searchDTO.getTags().stream()
                        .map(FieldValue::of)
                        .collect(Collectors.toList());
                queries.add(Query.of(q -> q.terms(t -> t
                        .field("tags")
                        .terms(ts -> ts.value(tagValues))
                )));
            }

            Highlight highlight = Highlight.of(h -> h
                    .fields("name", HighlightField.of(f -> f.preTags("<em>").postTags("</em>")))
                    .fields("description", HighlightField.of(f -> f.preTags("<em>").postTags("</em>")))
                    .fields("specimenNo", HighlightField.of(f -> f.preTags("<em>").postTags("</em>")))
                    .requireFieldMatch(false)
            );

            SearchRequest request = SearchRequest.of(s -> s
                    .index(INDEX_NAME)
                    .query(q -> q.bool(b -> b.must(queries)))
                    .from((searchDTO.getPageNum() - 1) * searchDTO.getPageSize())
                    .size(searchDTO.getPageSize())
                    .highlight(highlight)
            );

            SearchResponse<SpecimenIndexDoc> response = elasticsearchClient.search(request, SpecimenIndexDoc.class);

            List<SearchResultVO> results = new ArrayList<>();
            for (Hit<SpecimenIndexDoc> hit : response.hits().hits()) {
                if (hit.source() != null) {
                    SearchResultVO vo = convertToVO(hit.source(), hit);
                    results.add(vo);
                }
            }

            Map<String, Object> result = new HashMap<>();
            result.put("total", response.hits().total() != null ? response.hits().total().value() : 0);
            result.put("list", results);
            result.put("pageNum", searchDTO.getPageNum());
            result.put("pageSize", searchDTO.getPageSize());

            return result;
        } catch (IOException e) {
            throw new RuntimeException("全文检索失败", e);
        }
    }

    @Override
    public void deleteIndex(Long specimenId) {
        try {
            elasticsearchClient.delete(d -> d
                    .index(INDEX_NAME)
                    .id(specimenId.toString())
            );
        } catch (IOException e) {
            throw new RuntimeException("删除索引失败", e);
        }
    }

    @Override
    public void syncAllSpecimenIndex() {
        int pageNum = 1;
        int pageSize = 100;
        while (true) {
            try {
                Result<Map<String, Object>> result = specimenClient.getSpecimenList(pageNum, pageSize);
                if (result == null || result.getData() == null) {
                    break;
                }
                Map<String, Object> data = result.getData();
                Object listObj = data.get("records");
                if (listObj == null) {
                    listObj = data.get("list");
                }
                if (listObj == null) {
                    break;
                }
                List<SpecimenIndexDoc> docs = com.alibaba.fastjson2.JSON.parseArray(
                        com.alibaba.fastjson2.JSON.toJSONString(listObj),
                        SpecimenIndexDoc.class
                );
                if (docs == null || docs.isEmpty()) {
                    break;
                }
                batchSyncSpecimenIndex(docs);
                if (docs.size() < pageSize) {
                    break;
                }
                pageNum++;
            } catch (Exception e) {
                throw new RuntimeException("全量同步标本索引失败: " + e.getMessage(), e);
            }
        }
    }

    private SearchResultVO convertToVO(SpecimenIndexDoc doc, Hit<SpecimenIndexDoc> hit) {
        SearchResultVO vo = new SearchResultVO();
        BeanUtils.copyProperties(doc, vo);
        vo.setSpecimenId(doc.getSpecimenId());
        vo.setTypeName(SpecimenTypeEnum.getByCode(doc.getType()).getDesc());

        Map<String, List<String>> highlightMap = hit.highlight();
        if (highlightMap != null && !highlightMap.isEmpty()) {
            Map<String, String> highlightFields = new HashMap<>();
            for (Map.Entry<String, List<String>> entry : highlightMap.entrySet()) {
                highlightFields.put(entry.getKey(), String.join(" ", entry.getValue()));
            }
            vo.setHighlightFields(highlightFields);
        }

        vo.setScore(hit.score() != null ? hit.score() : 0f);
        return vo;
    }
}
