package com.specimen.data.service;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.specimen.data.entity.SpecimenTag;
import com.specimen.data.vo.SpecimenTagVO;
import java.util.List;

public interface SpecimenTagService {
    SpecimenTagVO create(SpecimenTag tag);
    SpecimenTagVO update(SpecimenTag tag);
    void delete(Long id);
    SpecimenTagVO getById(Long id);
    List<SpecimenTagVO> list();
    Page<SpecimenTagVO> page(Integer page, Integer size, String keyword);
}
