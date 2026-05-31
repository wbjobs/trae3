package com.specimen.traceability.service;

import com.specimen.traceability.doc.SpecimenIndexDoc;
import com.specimen.traceability.dto.TraceabilitySearchDTO;
import com.specimen.traceability.vo.SearchResultVO;

import java.util.List;
import java.util.Map;

public interface ElasticsearchService {
    void syncSpecimenIndex(SpecimenIndexDoc doc);
    void batchSyncSpecimenIndex(List<SpecimenIndexDoc> docs);
    Map<String, Object> search(TraceabilitySearchDTO searchDTO);
    void deleteIndex(Long specimenId);
    void syncAllSpecimenIndex();
}
