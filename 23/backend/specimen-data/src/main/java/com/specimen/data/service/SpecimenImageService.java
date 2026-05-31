package com.specimen.data.service;

import com.specimen.data.entity.SpecimenImage;
import com.specimen.data.vo.SpecimenImageVO;
import java.util.List;

public interface SpecimenImageService {
    List<SpecimenImageVO> listBySpecimenId(Long specimenId);
    List<SpecimenImageVO> listBySpecimenIds(List<Long> specimenIds);
    SpecimenImageVO add(SpecimenImage image);
    void delete(Long id);
    void deleteBySpecimenId(Long specimenId);
}
