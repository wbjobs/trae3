package com.ancient.platform.search.repository;

import com.ancient.platform.common.search.AncientPageIndex;
import org.springframework.data.elasticsearch.repository.ElasticsearchRepository;

import java.util.List;

public interface AncientPageEsRepository extends ElasticsearchRepository<AncientPageIndex, String> {

    List<AncientPageIndex> findByProjectId(Long projectId);

    List<AncientPageIndex> findByNormalizedTextContaining(String content);
}
