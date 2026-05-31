package com.specimen.data.service;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.specimen.data.dto.SpecimenCreateDTO;
import com.specimen.data.dto.SpecimenQueryDTO;
import com.specimen.data.dto.SpecimenUpdateDTO;
import com.specimen.data.vo.SpecimenListVO;
import com.specimen.data.vo.SpecimenStatisticsVO;
import com.specimen.data.vo.SpecimenVO;

import java.util.List;
import java.util.Map;

public interface SpecimenService {
    SpecimenVO create(SpecimenCreateDTO dto);
    SpecimenVO update(SpecimenUpdateDTO dto);
    void delete(Long id);
    SpecimenVO getById(Long id);
    Page<SpecimenListVO> page(SpecimenQueryDTO dto);
    SpecimenStatisticsVO statistics();
    Map<Long, String> batchPreviewUrls(List<Long> specimenIds);
}
