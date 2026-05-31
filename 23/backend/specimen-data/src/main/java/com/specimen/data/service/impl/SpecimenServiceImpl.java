package com.specimen.data.service.impl;

import com.alibaba.fastjson2.JSON;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.specimen.common.context.TenantContext;
import com.specimen.common.enums.SpecimenTypeEnum;
import com.specimen.common.exception.BusinessException;
import com.specimen.common.result.Result;
import com.specimen.data.dto.SpecimenCreateDTO;
import com.specimen.data.dto.SpecimenQueryDTO;
import com.specimen.data.dto.SpecimenUpdateDTO;
import com.specimen.data.entity.Specimen;
import com.specimen.data.entity.SpecimenImage;
import com.specimen.data.feign.StorageClient;
import com.specimen.data.mapper.SpecimenMapper;
import com.specimen.data.service.SpecimenImageService;
import com.specimen.data.service.SpecimenService;
import com.specimen.data.vo.SpecimenImageVO;
import com.specimen.data.vo.SpecimenListVO;
import com.specimen.data.vo.SpecimenStatisticsVO;
import com.specimen.data.vo.SpecimenVO;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.BeanUtils;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class SpecimenServiceImpl implements SpecimenService {
    private final SpecimenMapper specimenMapper;
    private final SpecimenImageService specimenImageService;
    private final StorageClient storageClient;

    @Override
    @Transactional(rollbackFor = Exception.class)
    public SpecimenVO create(SpecimenCreateDTO dto) {
        Specimen specimen = new Specimen();
        BeanUtils.copyProperties(dto, specimen);
        specimen.setTenantId(TenantContext.getTenantId());
        if (dto.getTags() != null) {
            specimen.setTags(JSON.toJSONString(dto.getTags()));
        }
        specimenMapper.insert(specimen);

        if (dto.getImageFileIds() != null && !dto.getImageFileIds().isEmpty()) {
            for (int i = 0; i < dto.getImageFileIds().size(); i++) {
                SpecimenImage image = new SpecimenImage();
                image.setSpecimenId(specimen.getId());
                image.setFileId(dto.getImageFileIds().get(i));
                image.setImageType(1);
                image.setSort(i + 1);
                image.setTenantId(TenantContext.getTenantId());
                specimenImageService.add(image);
            }
        }

        return getById(specimen.getId());
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public SpecimenVO update(SpecimenUpdateDTO dto) {
        Specimen specimen = specimenMapper.selectById(dto.getId());
        if (specimen == null) {
            throw new BusinessException("标本不存在");
        }
        BeanUtils.copyProperties(dto, specimen);
        if (dto.getTags() != null) {
            specimen.setTags(JSON.toJSONString(dto.getTags()));
        }
        specimenMapper.updateById(specimen);

        if (dto.getImageFileIds() != null) {
            specimenImageService.deleteBySpecimenId(dto.getId());
            for (int i = 0; i < dto.getImageFileIds().size(); i++) {
                SpecimenImage image = new SpecimenImage();
                image.setSpecimenId(dto.getId());
                image.setFileId(dto.getImageFileIds().get(i));
                image.setImageType(1);
                image.setSort(i + 1);
                image.setTenantId(TenantContext.getTenantId());
                specimenImageService.add(image);
            }
        }

        return getById(dto.getId());
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void delete(Long id) {
        Specimen specimen = specimenMapper.selectById(id);
        if (specimen == null) {
            throw new BusinessException("标本不存在");
        }
        specimenMapper.deleteById(id);
        specimenImageService.deleteBySpecimenId(id);
    }

    @Override
    public SpecimenVO getById(Long id) {
        Specimen specimen = specimenMapper.selectById(id);
        if (specimen == null) {
            throw new BusinessException("标本不存在");
        }
        SpecimenVO vo = new SpecimenVO();
        BeanUtils.copyProperties(specimen, vo);
        vo.setTypeName(SpecimenTypeEnum.getNameByCode(specimen.getType()));

        if (specimen.getFileId() != null) {
            try {
                Result<Map<String, Object>> fileResult = storageClient.getFileInfo(specimen.getFileId());
                if (fileResult != null && fileResult.getData() != null) {
                    Map<String, Object> fileInfo = fileResult.getData();
                    String objectName = (String) fileInfo.get("objectName");
                    if (objectName != null) {
                        Result<String> previewResult = storageClient.preview(objectName, 3600);
                        if (previewResult != null && previewResult.getData() != null) {
                            vo.setFileUrl(previewResult.getData());
                        }
                    }
                }
            } catch (Exception e) {
                // ignore
            }
        }

        List<SpecimenImageVO> images = specimenImageService.listBySpecimenId(id);
        vo.setImages(images);

        return vo;
    }

    @Override
    public Page<SpecimenListVO> page(SpecimenQueryDTO dto) {
        Page<Specimen> pageParam = new Page<>(dto.getPage(), dto.getSize());
        LambdaQueryWrapper<Specimen> wrapper = new LambdaQueryWrapper<>();

        if (dto.getType() != null) {
            wrapper.eq(Specimen::getType, dto.getType());
        }
        if (dto.getKeyword() != null && !dto.getKeyword().isEmpty()) {
            wrapper.and(w -> w.like(Specimen::getName, dto.getKeyword())
                    .or().like(Specimen::getSpecimenNo, dto.getKeyword())
                    .or().like(Specimen::getClassification, dto.getKeyword()));
        }
        if (dto.getStartTime() != null) {
            wrapper.ge(Specimen::getCreateTime, dto.getStartTime());
        }
        if (dto.getEndTime() != null) {
            wrapper.le(Specimen::getCreateTime, dto.getEndTime());
        }
        if (dto.getMinLongitude() != null && dto.getMaxLongitude() != null) {
            wrapper.between(Specimen::getLongitude, dto.getMinLongitude(), dto.getMaxLongitude());
        }
        if (dto.getMinLatitude() != null && dto.getMaxLatitude() != null) {
            wrapper.between(Specimen::getLatitude, dto.getMinLatitude(), dto.getMaxLatitude());
        }
        if (dto.getStatus() != null) {
            wrapper.eq(Specimen::getStatus, dto.getStatus());
        }
        if (dto.getTag() != null && !dto.getTag().isEmpty()) {
            wrapper.like(Specimen::getTags, dto.getTag());
        }
        if (dto.getCollector() != null && !dto.getCollector().isEmpty()) {
            wrapper.like(Specimen::getCollector, dto.getCollector());
        }

        wrapper.orderByDesc(Specimen::getCreateTime);
        Page<Specimen> specimenPage = specimenMapper.selectPage(pageParam, wrapper);

        Page<SpecimenListVO> result = new Page<>(specimenPage.getCurrent(), specimenPage.getSize(), specimenPage.getTotal());
        result.setRecords(specimenPage.getRecords().stream()
                .map(this::convertToListVO)
                .collect(Collectors.toList()));
        return result;
    }

    @Override
    public SpecimenStatisticsVO statistics() {
        SpecimenStatisticsVO vo = new SpecimenStatisticsVO();

        Long totalCount = specimenMapper.selectCount(new LambdaQueryWrapper<>());
        vo.setTotalCount(totalCount);

        LocalDateTime todayStart = LocalDateTime.of(LocalDate.now(), LocalTime.MIN);
        Long todayCount = specimenMapper.selectCount(new LambdaQueryWrapper<Specimen>().ge(Specimen::getCreateTime, todayStart));
        vo.setTodayNewCount(todayCount);

        LocalDateTime weekStart = LocalDateTime.of(LocalDate.now().minusDays(7), LocalTime.MIN);
        Long weekCount = specimenMapper.selectCount(new LambdaQueryWrapper<Specimen>().ge(Specimen::getCreateTime, weekStart));
        vo.setWeekNewCount(weekCount);

        LocalDateTime monthStart = LocalDateTime.of(LocalDate.now().withDayOfMonth(1), LocalTime.MIN);
        Long monthCount = specimenMapper.selectCount(new LambdaQueryWrapper<Specimen>().ge(Specimen::getCreateTime, monthStart));
        vo.setMonthNewCount(monthCount);

        Map<String, Long> typeCount = new HashMap<>();
        for (SpecimenTypeEnum type : SpecimenTypeEnum.values()) {
            Long count = specimenMapper.selectCount(new LambdaQueryWrapper<Specimen>().eq(Specimen::getType, type.getCode()));
            typeCount.put(type.getName(), count);
        }
        vo.setTypeCount(typeCount);

        Map<String, Long> statusCount = new HashMap<>();
        statusCount.put("正常", specimenMapper.selectCount(new LambdaQueryWrapper<Specimen>().eq(Specimen::getStatus, 1)));
        statusCount.put("停用", specimenMapper.selectCount(new LambdaQueryWrapper<Specimen>().eq(Specimen::getStatus, 0)));
        vo.setStatusCount(statusCount);

        vo.setAnnotationCount(0L);
        vo.setUnAnnotatedCount(totalCount);

        return vo;
    }

    private SpecimenListVO convertToListVO(Specimen specimen) {
        SpecimenListVO vo = new SpecimenListVO();
        BeanUtils.copyProperties(specimen, vo);
        vo.setTypeName(SpecimenTypeEnum.getNameByCode(specimen.getType()));
        return vo;
    }

    @Override
    public Map<Long, String> batchPreviewUrls(List<Long> specimenIds) {
        Map<Long, String> result = new HashMap<>();
        if (specimenIds == null || specimenIds.isEmpty()) {
            return result;
        }

        List<SpecimenImageVO> images = specimenImageService.listBySpecimenIds(specimenIds);
        for (SpecimenImageVO img : images) {
            if (img.getSort() != null && img.getSort() == 1 && img.getPreviewUrl() != null) {
                result.put(img.getSpecimenId(), img.getPreviewUrl());
            }
        }

        return result;
    }
}
