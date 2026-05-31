package com.specimen.data.service;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.specimen.data.dto.AnnotationCreateDTO;
import com.specimen.data.dto.AnnotationBatchCreateDTO;
import com.specimen.data.dto.AnnotationQueryDTO;
import com.specimen.data.vo.AnnotationVO;
import java.util.List;

public interface SpecimenAnnotationService {
    AnnotationVO create(AnnotationCreateDTO dto);
    List<AnnotationVO> batchCreate(AnnotationBatchCreateDTO dto);
    void delete(Long id);
    AnnotationVO getById(Long id);
    Page<AnnotationVO> page(AnnotationQueryDTO dto);
    List<AnnotationVO> listByImageId(Long imageId);
    List<AnnotationVO> listBySpecimenIds(List<Long> specimenIds);
}
